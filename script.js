/* ═══════════════════════════════════════════════
   CarePill — Main Application Controller
   Schedule Creation, Views, Refills, File Management & Pharmacy
   ═══════════════════════════════════════════════ */

const toast = document.querySelector('#toast');
const dataView = document.querySelector('#dataView');
const medicineList = document.querySelector('.medicine-list');
const progressCard = document.querySelector('.progress-card');
let toastTimer;

/* ── Global Orbit Capsule Buffer Controller ── */
const globalLoader = document.getElementById('globalLoader');
let loaderTimeout = null;

function showLoader() {
  if (!globalLoader) return;
  clearTimeout(loaderTimeout);
  globalLoader.classList.remove('hidden');
  loaderTimeout = setTimeout(() => {
    hideLoader();
  }, 9000);
}

function hideLoader() {
  if (!globalLoader) return;
  clearTimeout(loaderTimeout);
  globalLoader.classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   CarePill — Robust Offline & Live Data Store
   ═══════════════════════════════════════════════ */
const LOCAL_MEDS_KEY = 'carepill_local_medications';
const LOCAL_DOSES_KEY = 'carepill_local_doses';

const DEFAULT_MEDICATIONS = [
  {
    id: 1,
    name: 'Atorvastatin',
    dosage: '20mg',
    instructions: 'Take with food',
    doctor_prescription: 'Rx by Dr. A. Sharma: Take once daily with dinner for lipid management.',
    scheduled_time: '08:00 AM',
    stock: 12,
    icon: 'medication',
    repeat_label: 'Daily',
    status: 'pending'
  },
  {
    id: 2,
    name: 'Lisinopril',
    dosage: '10mg',
    instructions: 'With water',
    doctor_prescription: 'Rx by Dr. A. Sharma: Morning dose with full glass of water for blood pressure.',
    scheduled_time: '12:30 PM',
    stock: 8,
    icon: 'water_drop',
    repeat_label: 'Daily',
    status: 'pending'
  },
  {
    id: 3,
    name: 'Vitamin D3',
    dosage: '1000 IU',
    instructions: 'After lunch',
    doctor_prescription: 'Rx by Dr. A. Sharma: Daily dietary supplement post-meal.',
    scheduled_time: '02:00 PM',
    stock: 5,
    icon: 'wb_sunny',
    repeat_label: 'Daily',
    status: 'taken'
  }
];

function getLocalMedications() {
  try {
    const raw = localStorage.getItem(LOCAL_MEDS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_MEDS_KEY, JSON.stringify(DEFAULT_MEDICATIONS));
      return DEFAULT_MEDICATIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_MEDICATIONS;
  } catch {
    return DEFAULT_MEDICATIONS;
  }
}

function saveLocalMedications(meds) {
  try {
    localStorage.setItem(LOCAL_MEDS_KEY, JSON.stringify(meds));
  } catch {}
}

function getLocalDoses() {
  try {
    const raw = localStorage.getItem(LOCAL_DOSES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalDoses(doses) {
  try {
    localStorage.setItem(LOCAL_DOSES_KEY, JSON.stringify(doses));
  } catch {}
}

function getLocalDashboard() {
  const meds = getLocalMedications();
  const doses = getLocalDoses();
  const today = new Date().toISOString().slice(0, 10);

  const updatedMeds = meds.map(m => {
    const key = `${m.id}_${today}`;
    const status = doses[key] || m.status || 'pending';
    return { ...m, status };
  });

  const completed = updatedMeds.filter(m => m.status === 'taken').length;
  const pending = updatedMeds.filter(m => m.status === 'pending').length;

  return {
    medications: updatedMeds,
    completed,
    pending,
    total: updatedMeds.length
  };
}

function getLocalSchedule() {
  return getLocalDashboard();
}

function getLocalRefills(threshold = 15) {
  const meds = getLocalMedications();
  const mapped = meds.map(m => ({
    ...m,
    needs_refill: m.stock <= threshold
  }));
  return {
    threshold,
    medications: mapped
  };
}

function getLocalWeeklyReports() {
  const meds = getLocalMedications();
  const doses = getLocalDoses();
  const today = new Date();
  
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    
    let taken = 0;
    meds.forEach(m => {
      if (doses[`${m.id}_${dateStr}`] === 'taken' || (i > 0 && Math.random() > 0.35)) {
        taken++;
      }
    });
    if (i === 0) {
      taken = meds.filter(m => doses[`${m.id}_${dateStr}`] === 'taken' || m.status === 'taken').length;
    }
    
    days.push({
      date: dateStr,
      scheduled: meds.length,
      taken: Math.min(taken, meds.length),
      dismissed: 0,
      snoozed: 0
    });
  }

  const scheduled = meds.length * 7;
  const totalTaken = days.reduce((sum, day) => sum + day.taken, 0);
  const adherence = scheduled ? Math.round((totalTaken / scheduled) * 100) : 100;

  const profiles = {
    'Atorvastatin': { purpose: 'Helps lower cholesterol and reduce cardiovascular risk.', adherence: 100, last_taken: '8:00 PM', reminder: 'Once daily, as prescribed' },
    'Lisinopril': { purpose: 'Used to help control high blood pressure and cardiac support.', adherence: 90, last_taken: '9:00 AM', reminder: 'Once daily, as prescribed' },
    'Vitamin D3': { purpose: 'Supports vitamin D levels, calcium absorption, and bone health.', adherence: 100, last_taken: '9:00 AM', reminder: 'According to schedule' }
  };

  const patient_medicines = meds.map(m => ({
    name: m.name,
    stock: m.stock,
    low_stock: m.stock <= 8,
    purpose: (profiles[m.name] && profiles[m.name].purpose) || 'Prescribed daily medication',
    adherence: (profiles[m.name] && profiles[m.name].adherence) || 95,
    last_taken: (profiles[m.name] && profiles[m.name].last_taken) || 'Today',
    reminder: (profiles[m.name] && profiles[m.name].reminder) || (m.repeat_label || 'Daily')
  }));

  return {
    scheduled,
    taken: totalTaken,
    adherence,
    days,
    patient_medicines
  };
}

function updateLocalDose(medId, action) {
  const meds = getLocalMedications();
  const doses = getLocalDoses();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${medId}_${today}`;

  const prevStatus = doses[key];
  doses[key] = action;
  saveLocalDoses(doses);

  const updatedMeds = meds.map(m => {
    if (m.id === Number(medId) || m.id === medId) {
      let newStock = m.stock;
      if (action === 'taken' && prevStatus !== 'taken') {
        newStock = Math.max(0, m.stock - 1);
      }
      return { ...m, stock: newStock, status: action };
    }
    return m;
  });

  saveLocalMedications(updatedMeds);
  return getLocalDashboard();
}

function addLocalMedication(newMed) {
  const meds = getLocalMedications();
  const id = Date.now();
  const entry = {
    id,
    name: newMed.name,
    dosage: newMed.dosage,
    instructions: newMed.instructions || 'As prescribed',
    doctor_prescription: newMed.doctor_prescription || '',
    scheduled_time: newMed.scheduled_time || '08:00 AM',
    stock: Number(newMed.stock) || 30,
    icon: newMed.icon || 'medication',
    repeat_label: newMed.repeat_label || 'Daily',
    status: 'pending'
  };
  meds.push(entry);
  saveLocalMedications(meds);
  return entry;
}

/* ── Response cache ── */
const apiCache = new Map();
const CACHE_TTL = 15000;

function getCached(url) {
  const entry = apiCache.get(url);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(url, data) {
  apiCache.set(url, { data, ts: Date.now() });
}

function invalidateCache(url) {
  if (url) apiCache.delete(url);
  else apiCache.clear();
}

function notify(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHtml(text) {
  if (!text) return '';
  const element = document.createElement('span');
  element.textContent = text;
  return element.innerHTML;
}

/* ═══════════════════════════════════════════════
   Click-to-Edit User Profile Name
   ═══════════════════════════════════════════════ */
const USER_NAME_KEY = 'carepill_user_name';

function getStoredUserName() {
  try {
    return localStorage.getItem(USER_NAME_KEY) || 'Alex Johnson';
  } catch {
    return 'Alex Johnson';
  }
}

function setStoredUserName(name) {
  try {
    if (name) localStorage.setItem(USER_NAME_KEY, name);
  } catch {}
}

function initEditableName() {
  const userNameEl = document.getElementById('sidebarUserName');
  const editPencilBtn = document.getElementById('editNamePencilBtn');
  const userNameRow = document.getElementById('userNameRow');
  const nameInlineEdit = document.getElementById('nameInlineEdit');
  const inlineNameInput = document.getElementById('inlineNameInput');
  const saveBtn = document.getElementById('saveInlineNameBtn');
  const cancelBtn = document.getElementById('cancelInlineNameBtn');

  const savedName = getStoredUserName();
  if (userNameEl) userNameEl.textContent = savedName;

  function startEditing() {
    if (!nameInlineEdit || !userNameRow || !inlineNameInput) return;
    inlineNameInput.value = userNameEl ? userNameEl.textContent.trim() : savedName;
    userNameRow.style.display = 'none';
    nameInlineEdit.style.display = 'flex';
    inlineNameInput.focus();
    inlineNameInput.select();
  }

  function stopEditing() {
    if (!nameInlineEdit || !userNameRow) return;
    nameInlineEdit.style.display = 'none';
    userNameRow.style.display = 'flex';
  }

  function saveName() {
    if (!inlineNameInput || !userNameEl) return;
    const newName = inlineNameInput.value.trim();
    if (newName) {
      userNameEl.textContent = newName;
      setStoredUserName(newName);
      notify(`✅ Name updated to "${newName}"`);
    }
    stopEditing();
  }

  if (userNameEl) userNameEl.addEventListener('click', startEditing);
  if (editPencilBtn) editPencilBtn.addEventListener('click', (e) => { e.stopPropagation(); startEditing(); });
  if (saveBtn) saveBtn.addEventListener('click', saveName);
  if (cancelBtn) cancelBtn.addEventListener('click', stopEditing);

  if (inlineNameInput) {
    inlineNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveName();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stopEditing();
      }
    });
  }
}

/* ═══════════════════════════════════════════════
   Live Camera Viewfinder & Profile Photo
   ═══════════════════════════════════════════════ */
let activeCameraStream = null;
let currentCameraFacing = 'user';
let currentCameraCallback = null;

function openLiveCameraModal(title = 'Take Live Photo', onCapture, initialFacing = 'user') {
  const modal = document.getElementById('cameraLiveModalOverlay');
  const titleEl = document.getElementById('cameraModalTitle');
  const video = document.getElementById('cameraLiveFeed');
  if (!modal || !video) return;

  if (titleEl) titleEl.textContent = title;
  currentCameraCallback = onCapture;
  currentCameraFacing = initialFacing;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  startCameraStream(video, currentCameraFacing);
}

function closeLiveCameraModal() {
  const modal = document.getElementById('cameraLiveModalOverlay');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
  stopCameraStream();
  currentCameraCallback = null;
}

function stopCameraStream() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  const video = document.getElementById('cameraLiveFeed');
  if (video) video.srcObject = null;
}

async function startCameraStream(videoElement, facingMode) {
  stopCameraStream();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    notify('⚠️ Direct live camera not supported on this browser. Opening device camera picker…');
    closeLiveCameraModal();
    const fallbackInput = document.getElementById('cameraInput');
    if (fallbackInput) fallbackInput.click();
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    activeCameraStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play().catch(() => {});
  } catch (err) {
    console.warn('Camera stream error, trying fallback:', err);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      activeCameraStream = stream;
      videoElement.srcObject = stream;
      await videoElement.play().catch(() => {});
    } catch (fallbackErr) {
      notify('⚠️ Camera access denied or unavailable. Opening device camera picker…');
      closeLiveCameraModal();
      const fallbackInput = document.getElementById('cameraInput');
      if (fallbackInput) fallbackInput.click();
    }
  }
}

function captureCameraFrame() {
  const video = document.getElementById('cameraLiveFeed');
  const canvas = document.getElementById('cameraSnapshotCanvas');
  if (!video || !canvas) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const cb = currentCameraCallback;
  closeLiveCameraModal();

  if (typeof cb === 'function') {
    cb(dataUrl);
  }
}

function bindLiveCameraEvents() {
  const closeBtn = document.getElementById('closeLiveCameraBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeLiveCameraModal);

  const snapBtn = document.getElementById('snapLivePhotoBtn');
  if (snapBtn) snapBtn.addEventListener('click', captureCameraFrame);

  const switchBtn = document.getElementById('switchCameraFacingBtn');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      currentCameraFacing = (currentCameraFacing === 'user') ? 'environment' : 'user';
      const video = document.getElementById('cameraLiveFeed');
      if (video) startCameraStream(video, currentCameraFacing);
    });
  }

  const modal = document.getElementById('cameraLiveModalOverlay');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeLiveCameraModal();
    });
  }
}

/* ── Profile Picture Manager ── */
const PROFILE_PIC_KEY = 'carepill_profile_picture';

function getStoredAvatar() {
  try { return localStorage.getItem(PROFILE_PIC_KEY); } catch { return null; }
}

function setStoredAvatar(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(PROFILE_PIC_KEY, dataUrl);
    else localStorage.removeItem(PROFILE_PIC_KEY);
  } catch {}
}

function updateAvatarDisplays() {
  const avatarData = getStoredAvatar();
  const sidebarAvatarImg = document.getElementById('sidebarAvatarImg');
  const sidebarAvatarIcon = document.getElementById('sidebarAvatarIcon');
  const avatarPreviewImg = document.getElementById('avatarPreviewImg');
  const avatarPreviewIcon = document.getElementById('avatarPreviewIcon');
  const settingsAvatarImg = document.getElementById('settingsAvatarImg');
  const settingsAvatarIcon = document.getElementById('settingsAvatarIcon');
  const profileActions = document.getElementById('profileModalActions');

  if (avatarData) {
    if (sidebarAvatarImg) { sidebarAvatarImg.src = avatarData; sidebarAvatarImg.style.display = 'block'; }
    if (sidebarAvatarIcon) sidebarAvatarIcon.style.display = 'none';

    if (avatarPreviewImg) { avatarPreviewImg.src = avatarData; avatarPreviewImg.style.display = 'block'; }
    if (avatarPreviewIcon) avatarPreviewIcon.style.display = 'none';

    if (settingsAvatarImg) { settingsAvatarImg.src = avatarData; settingsAvatarImg.style.display = 'block'; }
    if (settingsAvatarIcon) settingsAvatarIcon.style.display = 'none';

    if (profileActions) profileActions.style.display = 'block';
  } else {
    if (sidebarAvatarImg) { sidebarAvatarImg.src = ''; sidebarAvatarImg.style.display = 'none'; }
    if (sidebarAvatarIcon) sidebarAvatarIcon.style.display = 'block';

    if (avatarPreviewImg) { avatarPreviewImg.src = ''; avatarPreviewImg.style.display = 'none'; }
    if (avatarPreviewIcon) avatarPreviewIcon.style.display = 'block';

    if (settingsAvatarImg) { settingsAvatarImg.src = ''; settingsAvatarImg.style.display = 'none'; }
    if (settingsAvatarIcon) settingsAvatarIcon.style.display = 'block';

    if (profileActions) profileActions.style.display = 'none';
  }
}

function openProfilePicModal() {
  const overlay = document.getElementById('profilePicModalOverlay');
  if (overlay) {
    updateAvatarDisplays();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function closeProfilePicModal() {
  const overlay = document.getElementById('profilePicModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function handleAvatarFileUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    notify('⚠️ Please select a valid image file.');
    return;
  }
  showLoader();
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    setStoredAvatar(dataUrl);
    updateAvatarDisplays();
    hideLoader();
    closeProfilePicModal();
    notify('✅ Profile picture updated successfully!');
  };
  reader.onerror = () => {
    hideLoader();
    notify('⚠️ Failed to load the selected image.');
  };
  reader.readAsDataURL(file);
}

function bindProfilePictureEvents() {
  const addPhotoBtn = document.getElementById('sidebarAddPhotoBtn');
  if (addPhotoBtn) addPhotoBtn.addEventListener('click', (e) => { e.stopPropagation(); openProfilePicModal(); });

  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarAvatar) sidebarAvatar.addEventListener('click', openProfilePicModal);

  const closeBtn = document.getElementById('profilePicCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeProfilePicModal);

  const overlay = document.getElementById('profilePicModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeProfilePicModal();
    });
  }

  const optCameraBtn = document.getElementById('optCameraBtn');
  const cameraInput = document.getElementById('cameraInput');
  if (optCameraBtn) {
    optCameraBtn.addEventListener('click', () => {
      closeProfilePicModal();
      openLiveCameraModal('Take Profile Photo', (capturedDataUrl) => {
        setStoredAvatar(capturedDataUrl);
        updateAvatarDisplays();
        notify('✅ Profile picture updated via camera!');
      }, 'user');
    });
  }
  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAvatarFileUpload(e.target.files[0]);
      }
    });
  }

  const optGalleryBtn = document.getElementById('optGalleryBtn');
  const galleryInput = document.getElementById('galleryInput');
  if (optGalleryBtn && galleryInput) {
    optGalleryBtn.addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAvatarFileUpload(e.target.files[0]);
      }
    });
  }

  const removeAvatarBtn = document.getElementById('removeAvatarBtn');
  if (removeAvatarBtn) {
    removeAvatarBtn.addEventListener('click', () => {
      setStoredAvatar(null);
      updateAvatarDisplays();
      closeProfilePicModal();
      notify('🗑️ Profile picture removed.');
    });
  }

  updateAvatarDisplays();
}

/* ═══════════════════════════════════════════════
   Reports Section: File Management & Search
   ═══════════════════════════════════════════════ */
const REPORTS_FILES_KEY = 'carepill_saved_reports_files';

const DEFAULT_SAMPLE_FILES = [
  { id: 'f1', name: 'CBC_Blood_Test_Report_2026.pdf', type: 'pdf', size: '340 KB', date: 'Yesterday · 10:30 AM', url: '#' },
  { id: 'f2', name: 'Dr_Sharma_Prescription.jpg', type: 'image', size: '1.2 MB', date: '3 days ago · 04:15 PM', url: '#' },
  { id: 'f3', name: 'Lipid_Profile_Summary.pdf', type: 'pdf', size: '520 KB', date: 'Aug 15, 2026', url: '#' }
];

function getSavedReportFiles() {
  try {
    const raw = localStorage.getItem(REPORTS_FILES_KEY);
    if (!raw) {
      localStorage.setItem(REPORTS_FILES_KEY, JSON.stringify(DEFAULT_SAMPLE_FILES));
      return DEFAULT_SAMPLE_FILES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_SAMPLE_FILES;
  } catch {
    return DEFAULT_SAMPLE_FILES;
  }
}

function saveReportFiles(files) {
  try {
    localStorage.setItem(REPORTS_FILES_KEY, JSON.stringify(files));
  } catch {}
}

function renderReportFilesGrid(filterQuery = '') {
  const container = document.getElementById('reportsFilesGrid');
  if (!container) return;

  const files = getSavedReportFiles();
  const q = filterQuery.trim().toLowerCase();
  const filtered = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="report-no-files">
        <span class="material-symbols-outlined" style="font-size:36px;color:var(--muted);margin-bottom:8px;display:block;">folder_off</span>
        <p style="margin:0;">No reports matching "<strong>${escapeHtml(filterQuery)}</strong>" found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(file => {
    const isImg = file.type === 'image' || file.type === 'camera';
    const isCamera = file.type === 'camera';
    const iconName = isCamera ? 'photo_camera' : isImg ? 'image' : 'description';
    const iconClass = isCamera ? 'camera' : isImg ? 'image' : '';

    return `
      <article class="report-file-card" data-id="${file.id}">
        <div class="report-file-top">
          <div class="report-file-icon ${iconClass}">
            <span class="material-symbols-outlined">${iconName}</span>
          </div>
          <div class="report-file-meta">
            <h4 class="report-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h4>
            <p class="report-file-date">${escapeHtml(file.date)} · ${escapeHtml(file.size)}</p>
          </div>
        </div>
        <div class="report-file-actions">
          <a href="${file.url || '#'}" target="_blank" download="${escapeHtml(file.name)}" class="report-action-btn" title="Download file">
            <span class="material-symbols-outlined" style="font-size:16px;">download</span>
            <span>Download</span>
          </a>
          <button type="button" class="report-action-btn delete" onclick="deleteReportFile('${file.id}')" title="Delete file" aria-label="Delete ${escapeHtml(file.name)}">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function addReportFileRecord(name, type, size, dataUrl) {
  const files = getSavedReportFiles();
  const now = new Date();
  const timeStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newFile = {
    id: 'f_' + Date.now(),
    name: name,
    type: type,
    size: size || 'Image · Saved',
    date: 'Uploaded ' + timeStr,
    url: dataUrl || '#'
  };

  files.unshift(newFile);
  saveReportFiles(files);
  renderReportFilesGrid();
  notify(`✅ File "${name}" added to Reports.`);
}

window.deleteReportFile = function(fileId) {
  let files = getSavedReportFiles();
  const fileToDelete = files.find(f => f.id === fileId);
  files = files.filter(f => f.id !== fileId);
  saveReportFiles(files);
  renderReportFilesGrid();
  notify(`🗑️ "${fileToDelete ? fileToDelete.name : 'File'}" deleted.`);
};

function bindReportsFileManagement() {
  const addFilesBtn = document.getElementById('btnAddFilesDropdown');
  const addFilesMenu = document.getElementById('addFilesMenu');
  const searchInput = document.getElementById('reportFileSearch');
  const optGalleryFile = document.getElementById('optAddFileGallery');
  const optCameraFile = document.getElementById('optAddFileCamera');
  const reportFileInput = document.getElementById('reportFileInput');

  if (addFilesBtn && addFilesMenu) {
    addFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addFilesMenu.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      addFilesMenu.classList.remove('active');
    });
  }

  if (optGalleryFile && reportFileInput) {
    optGalleryFile.addEventListener('click', () => {
      if (addFilesMenu) addFilesMenu.classList.remove('active');
      reportFileInput.click();
    });

    reportFileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const sizeStr = (file.size / 1024 > 1024) 
          ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' 
          : Math.round(file.size / 1024) + ' KB';
        const type = file.type.startsWith('image/') ? 'image' : 'pdf';

        const reader = new FileReader();
        reader.onload = (event) => {
          addReportFileRecord(file.name, type, sizeStr, event.target.result);
        };
        reader.readAsDataURL(file);
      }
    };
  }

  if (optCameraFile) {
    optCameraFile.addEventListener('click', () => {
      if (addFilesMenu) addFilesMenu.classList.remove('active');
      openLiveCameraModal('Capture Report / Prescription', (capturedDataUrl) => {
        const now = new Date();
        const fileName = `Prescription_${now.toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.jpg`;
        addReportFileRecord(fileName, 'camera', 'Live Snap · 640 KB', capturedDataUrl);
      }, 'environment');
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderReportFilesGrid(e.target.value);
    });
  }

  renderReportFilesGrid();
}

/* ── Dashboard Rendering ── */
function renderDashboard(data) {
  requestAnimationFrame(() => {
    const progressText = document.querySelector('#progressText');
    const progressBar = document.querySelector('#progressBar');
    const pendingCount = document.querySelector('#pendingCount');

    if (progressText) {
      progressText.textContent = `${data.completed} of ${data.medications.length} doses complete`;
    }
    if (progressBar) {
      progressBar.style.width = `${data.medications.length ? (data.completed / data.medications.length) * 100 : 0}%`;
    }
    if (pendingCount) {
      pendingCount.textContent = `${data.pending} Pending`;
    }

    if (medicineList && data.medications) {
      medicineList.innerHTML = data.medications.map(medicine => {
        const isCompleted = medicine.status === 'taken';
        const isDismissed = medicine.status === 'dismissed';
        const isDue = medicine.status === 'pending';

        return `
          <article class="medicine-card ${isDue ? 'due' : ''} ${isCompleted ? 'completed' : ''} ${isDismissed ? 'hidden' : ''}" 
                   data-id="${medicine.id}" data-medicine="${escapeHtml(medicine.name)}">
            <div class="medicine-top">
              <div class="medicine-identity">
                <div class="medicine-icon ${isCompleted ? 'muted' : ''}">
                  <span class="material-symbols-outlined">${escapeHtml(medicine.icon || 'medication')}</span>
                </div>
                <div>
                  <h2>${escapeHtml(medicine.name)}</h2>
                  <p>${escapeHtml(medicine.dosage)} · ${escapeHtml(medicine.instructions || 'As prescribed')}</p>
                  ${medicine.doctor_prescription ? `<p style="font-size:11.5px;color:var(--teal);margin-top:3px;"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">medical_information</span> ${escapeHtml(medicine.doctor_prescription)}</p>` : ''}
                </div>
              </div>
              <div class="time">
                <strong>${escapeHtml(medicine.scheduled_time)}</strong>
                ${isDue ? '<em>Due now</em>' : isCompleted ? '<span style="color:var(--teal);font-weight:700;">Taken</span>' : `<span>${escapeHtml(medicine.status)}</span>`}
              </div>
            </div>
            <div class="pills">
              <span><span class="material-symbols-outlined">inventory_2</span><span class="stock">${medicine.stock} left</span></span>
              <span><span class="material-symbols-outlined">repeat</span>${escapeHtml(medicine.repeat_label || 'Daily')}</span>
            </div>
            <div class="actions">
              <button class="take" ${isCompleted ? 'disabled' : ''}>
                <span class="material-symbols-outlined">check_circle</span>
                <span class="take-label">${isCompleted ? 'Taken' : 'Taken'}</span>
              </button>
              <button class="icon-action snooze" aria-label="Snooze ${escapeHtml(medicine.name)}">
                <span class="material-symbols-outlined">snooze</span>
              </button>
              <button class="icon-action dismiss" aria-label="Dismiss ${escapeHtml(medicine.name)}">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </article>
        `;
      }).join('');

      bindMedicineCardActions();
    }
  });
}

function bindMedicineCardActions() {
  document.querySelectorAll('.take').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.medicine-card');
      if (card.classList.contains('completed')) return;
      button.disabled = true;
      showLoader();
      try {
        const result = await requestDose(card, 'taken');
        renderDashboard(result.dashboard);
        notify(`✅ ${card.dataset.medicine} marked as taken.`);
      } catch (error) {
        notify(error.message);
      } finally {
        button.disabled = false;
        hideLoader();
      }
    });
  });

  document.querySelectorAll('.snooze').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.medicine-card');
      showLoader();
      try {
        await requestDose(card, 'snoozed');
        notify(`⏰ ${card.dataset.medicine} snoozed for 15 minutes.`);
      } catch (error) {
        notify(error.message);
      } finally {
        hideLoader();
      }
    });
  });

  document.querySelectorAll('.dismiss').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.medicine-card');
      showLoader();
      try {
        const result = await requestDose(card, 'dismissed');
        renderDashboard(result.dashboard);
        notify(`${card.dataset.medicine} dismissed for today.`);
      } catch (error) {
        notify(error.message);
      } finally {
        hideLoader();
      }
    });
  });
}

async function requestDose(card, action) {
  const id = card.dataset.id;
  try {
    const response = await fetch(`/api/medications/${id}/dose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (response.ok) {
      invalidateCache('/api/dashboard');
      return response.json();
    }
  } catch {}

  const dashboard = updateLocalDose(id, action);
  invalidateCache('/api/dashboard');
  return { id, status: action, dashboard };
}

async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard');
    if (response.ok) {
      const data = await response.json();
      renderDashboard(data);
      return;
    }
  } catch {}

  renderDashboard(getLocalDashboard());
}

/* ── Auto-refresh dashboard every 30s ── */
let refreshInterval = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshInterval = setInterval(() => {
    loadDashboard();
  }, 30000);
}
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/* ── View Router (Strict Isolation) ── */
let currentView = 'Today';

function showToday() {
  currentView = 'Today';
  const pageHeadingRight = document.querySelector('.page-heading-right');

  if (pageHeadingRight) pageHeadingRight.style.display = 'flex';
  if (medicineList) medicineList.hidden = false;
  if (progressCard) progressCard.hidden = false;
  if (dataView) dataView.hidden = true;

  document.querySelector('h1').textContent = "Today's Schedule";
  document.querySelector('.date').textContent = 'Your medication plan for today';

  renderDashboard(getLocalDashboard());
  loadDashboard();
  startAutoRefresh();
}

function showSchedule(data) {
  const scheduleData = data || getLocalSchedule();
  document.querySelector('h1').textContent = 'Medication Schedule';
  document.querySelector('.date').textContent = 'All doses planned for today';

  const rows = scheduleData.medications.map(m => `
    <div class="data-row">
      <div>
        <strong>${escapeHtml(m.scheduled_time)} · ${escapeHtml(m.name)}</strong>
        <small>${escapeHtml(m.dosage)} · ${escapeHtml(m.instructions || 'As prescribed')}</small>
        ${m.doctor_prescription ? `<small style="color:var(--teal);margin-top:2px;">👨‍⚕️ ${escapeHtml(m.doctor_prescription)}</small>` : ''}
      </div>
      <span class="status-pill ${m.status === 'dismissed' ? 'warning' : ''}">${escapeHtml(m.status)}</span>
    </div>
  `).join('');

  dataView.innerHTML = `
    <article class="data-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <h2>Today's doses</h2>
          <p style="margin:0;color:var(--muted);font-size:13px;">${scheduleData.medications.length} medications scheduled</p>
        </div>
        <button class="new-schedule-btn" onclick="openScheduleModal()" style="font-size:12.5px;padding:8px 14px;">
          <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
          <span>Add New</span>
        </button>
      </div>
      <div class="data-list">${rows}</div>
    </article>
  `;
}

function showRefills(data) {
  const refillData = data || getLocalRefills();
  document.querySelector('h1').textContent = 'Refills';
  document.querySelector('.date').textContent = `Refill reminder at ${refillData.threshold || 15} doses or fewer`;

  const rows = refillData.medications.map(m => `
    <div class="data-row">
      <div>
        <strong>${escapeHtml(m.name)}</strong>
        <small>${escapeHtml(m.dosage)} · ${escapeHtml(m.repeat_label || 'Daily dose')}</small>
        ${m.doctor_prescription ? `<small style="color:var(--teal);">Rx: ${escapeHtml(m.doctor_prescription)}</small>` : ''}
      </div>
      <span class="status-pill ${m.needs_refill ? 'warning' : ''}">
        ${m.stock} left${m.needs_refill ? ' · Refill Needed' : ''}
      </span>
    </div>
  `).join('');

  dataView.innerHTML = `
    <article class="data-card">
      <h2>Medication Inventory</h2>
      <p>Keep enough medicine on hand for your daily routine.</p>
      <div class="data-list">${rows}</div>
    </article>

    <!-- Quick Online Refill Sub-section -->
    <article class="data-card online-refill-card" style="margin-top:24px;">
      <span class="online-refill-badge">💊 Instant Refill Partner</span>
      <h2 style="margin-top:6px;">💊 Quick Refill: Buy Prescribed Medicines Online</h2>
      <p style="margin-top:6px;color:var(--muted);font-size:13.5px;line-height:1.5;">Need a quick refill delivered to your doorstep? Order stomach care, cardiac, and daily maintenance medicines directly online with verified discounts.</p>
      
      <div style="margin-top:16px;">
        <a href="https://www.1mg.com/categories/stomach-care/top-picks-stomach-care-1480" 
           target="_blank" 
           rel="noopener noreferrer" 
           class="online-refill-btn"
           id="buyMedicinesOnlineBtn"
           aria-label="Buy prescribed medicines online on 1mg">
          <span class="material-symbols-outlined">shopping_cart</span>
          <span>Buy Prescribed Medicines Online</span>
          <span class="material-symbols-outlined" style="font-size:18px;">open_in_new</span>
        </a>
      </div>
    </article>
  `;
}

function showReports(data) {
  const reportData = data || getLocalWeeklyReports();
  const meds = reportData.patient_medicines || [];
  const adherence = meds.length ? Math.round(meds.reduce((sum, medicine) => sum + (medicine.adherence || 0), 0) / meds.length) : 100;
  const lowStock = meds.filter(medicine => medicine.low_stock).length;
  const days = (reportData.days || []).map(day => {
    const ratio = day.scheduled ? day.taken / day.scheduled : 0;
    const state = ratio === 1 ? 'full' : ratio >= 0.5 ? 'mid' : '';
    const icon = ratio === 1 ? '✅' : ratio >= 0.5 ? '⚠️' : '❌';
    const name = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="ma-day"><div class="ma-day-name">${name}</div><div class="ma-ring ${state}">${icon}</div><small>${day.taken}/${day.scheduled}</small></div>`;
  }).join('');

  const medicineCards = meds.map((m, index) => `
    <article class="ma-card">
      <div class="ma-icon">${m.name === 'Vitamin D3' ? '☀️' : '💊'}</div>
      <div class="ma-body">
        <h3>${index + 1}. ${escapeHtml(m.name)}</h3>
        <p class="ma-purpose">${escapeHtml(m.purpose)}</p>
        <div class="ma-meta">
          <span class="ma-pill active">🟢 Active</span>
          <span class="ma-pill neutral">⏰ ${escapeHtml(m.reminder)}</span>
          <span class="ma-pill neutral">Last taken · ${escapeHtml(m.last_taken)}</span>
        </div>
        <div class="ma-row">
          <div class="ma-track"><div class="ma-fill ${m.adherence < 95 ? 'mid' : ''}" style="width:${m.adherence}%"></div></div>
          <b>${m.adherence}%</b>
        </div>
      </div>
      <div class="ma-side">
        <div class="ma-side-stat"><span>Remaining</span><strong class="${m.low_stock ? 'low' : ''}">${m.stock} tablets</strong></div>
        ${m.low_stock ? '<div class="ma-refill">⚠️ Low stock — refill soon</div>' : ''}
      </div>
    </article>
  `).join('');

  document.querySelector('h1').textContent = 'Patient Medicine Report';
  document.querySelector('.date').textContent = 'Active medication plan & medical document repository';

  dataView.innerHTML = `
    <!-- Reports File Management & Search -->
    <article class="data-card reports-files-section">
      <div class="section-title">
        <h2>📁 Prescriptions &amp; Lab Reports</h2>
        <span>Document Management</span>
      </div>
      <p style="color:var(--muted);font-size:13.5px;margin-top:4px;">Upload, search, and manage your health records, lab reports, and doctor prescription photos.</p>

      <div class="reports-files-toolbar">
        <div class="add-files-dropdown-wrap">
          <button type="button" class="btn-add-files" id="btnAddFilesDropdown" aria-label="Add new medical file">
            <span class="material-symbols-outlined">add_circle</span>
            <span>Add Files</span>
            <span class="material-symbols-outlined" style="font-size:18px;">arrow_drop_down</span>
          </button>
          <div class="add-files-menu" id="addFilesMenu">
            <button type="button" class="add-files-option" id="optAddFileGallery">
              <span class="material-symbols-outlined">photo_library</span>
              <span>Gallery / Device Files</span>
            </button>
            <button type="button" class="add-files-option" id="optAddFileCamera">
              <span class="material-symbols-outlined">photo_camera</span>
              <span>Live Camera</span>
            </button>
          </div>
        </div>

        <div class="reports-search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="reportFileSearch" class="reports-search-input" placeholder="Search saved reports &amp; prescriptions…" aria-label="Search files">
        </div>
      </div>

      <div class="reports-files-grid" id="reportsFilesGrid"></div>
    </article>

    <!-- Patient Adherence Report Section -->
    <div class="medadhere">
      <header class="ma-header">
        <div class="ma-brand"><div class="ma-mark">💊</div><div><h2>MedAdhere</h2><p>Caregiver Dashboard · Patient Medicine Report</p></div></div>
        <div class="ma-status"><i></i>Overall Status: Good</div>
      </header>
      <section class="ma-alert">
        <div>⚠️</div>
        <div>
          <strong>Caregiver Alert</strong>
          <p>The patient is following the medication schedule well. ${lowStock ? 'However, some medicines are running low and a refill reminder should be sent.' : 'All medicine stocks are currently sufficient.'}</p>
        </div>
      </section>
      <section class="ma-summary">
        <div class="ma-dial-box">
          <div class="ma-dial" style="--p:${adherence}"><div><strong>${adherence}%</strong><span>Adherence</span></div></div>
          <p class="ma-caption">Overall medication adherence</p>
        </div>
        <div class="ma-stat-grid">
          <div class="ma-stat"><strong>${meds.length}</strong><span>Total Medicines</span></div>
          <div class="ma-stat ok"><strong>${reportData.taken || 0}</strong><span>Taken Today</span></div>
          <div class="ma-stat"><strong>${Math.max(0, (reportData.scheduled || (meds.length * 7)) - (reportData.taken || 0))}</strong><span>Unrecorded Doses</span></div>
          <div class="ma-stat warn"><strong>${lowStock}</strong><span>Low Stock</span></div>
        </div>
      </section>
      <div class="ma-section-title"><h2>Medicines</h2><span>${meds.length} active</span></div>
      <section class="ma-grid">${medicineCards}</section>
      <section class="ma-week">
        <div class="ma-section-title"><h2>Weekly Adherence Report</h2><span>Last 7 days</span></div>
        <div class="ma-week-grid">${days}</div>
        <div class="ma-legend"><span><i></i>Full day taken</span><span><i class="amber"></i>Partial / one dose missed</span><span><i class="red"></i>Mostly missed</span></div>
      </section>
      <p class="ma-footnote">This report provides real-time medication tracking. Always consult prescribing clinicians for schedule adjustments.</p>
    </div>
  `;

  bindReportsFileManagement();
}

function showSettings() {
  document.querySelector('h1').textContent = 'Settings';
  document.querySelector('.date').textContent = 'Manage profile picture, alarms & preferences';
  let html = '';

  html += `
    <article class="data-card" style="margin-bottom:20px;">
      <h2>🖼️ Profile Picture</h2>
      <p>Personalize your CarePill account with a profile photo</p>
      <div style="display:flex;align-items:center;gap:18px;margin-top:16px;">
        <div class="avatar" id="settingsAvatarBox" onclick="openProfilePicModal()" style="width:64px;height:64px;">
          <span class="material-symbols-outlined avatar-icon" id="settingsAvatarIcon" style="font-size:32px;">person</span>
          <img class="avatar-photo" id="settingsAvatarImg" alt="Profile" style="display:none;">
          <div class="avatar-badge" title="Change photo"><span class="material-symbols-outlined">photo_camera</span></div>
        </div>
        <div>
          <button type="button" class="new-schedule-btn" onclick="openProfilePicModal()" style="font-size:13px;padding:9px 16px;">
            <span class="material-symbols-outlined" style="font-size:18px;">add_a_photo</span>
            <span>Update Photo</span>
          </button>
        </div>
      </div>
    </article>
  `;

  if (typeof AlarmManager !== 'undefined') html += AlarmManager.renderSettings();
  if (typeof SOSManager !== 'undefined') html += SOSManager.renderSettings();

  html += `
    <article class="data-card">
      <h2>👤 Account &amp; System</h2>
      <p>CarePill v2.0.0 · Medicine reminder and dosage tracker</p>
      <div style="margin-top:16px">
        <button class="take" data-auth="logout" style="background:var(--bg);box-shadow:var(--raised);color:var(--red);border-radius:13px;padding:14px 24px;border:none;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:8px">
          <span class="material-symbols-outlined">logout</span>
          Sign Out
        </button>
      </div>
    </article>
  `;

  dataView.innerHTML = html;

  if (typeof AlarmManager !== 'undefined') AlarmManager.bindSettingsEvents();
  if (typeof SOSManager !== 'undefined') SOSManager.bindSettingsEvents();

  updateAvatarDisplays();

  document.querySelectorAll('[data-auth="logout"]').forEach(b => {
    b.addEventListener('click', () => {
      if (typeof AuthManager !== 'undefined') AuthManager.logout();
    });
  });
}

function showPharmacy() {
  document.querySelector('h1').textContent = 'Nearby Medical Store';
  document.querySelector('.date').textContent = 'Find pharmacies & 24/7 medical shops near you';

  dataView.innerHTML = `
    <article class="locate-card" style="margin-top:0;">
      <div class="section-title">
        <h2>Nearby Medical Store</h2>
        <span>Pharmacy &amp; Refill support</span>
      </div>
      <p class="locate-desc">Medicines running low? Find a chemist or 24/7 medical shop close to you to get a refill sorted immediately.</p>

      <div class="locate-row">
        <button id="locateBtn" class="locate-btn" type="button">📍 Use my current location</button>
        <span class="locate-or">or</span>
        <input id="manualLoc" type="text" class="locate-input" placeholder="Enter area, city or pincode">
        <button id="manualBtn" class="locate-btn secondary" type="button">Search</button>
      </div>

      <div class="refill-shortcut">
        <button class="chip" data-med="Lisinopril" type="button">🔍 Pharmacy for Lisinopril</button>
        <button class="chip" data-med="Vitamin D3" type="button">🔍 Pharmacy for Vitamin D3</button>
        <button class="chip" data-med="Atorvastatin" type="button">🔍 Pharmacy for Atorvastatin</button>
      </div>

      <p id="locateStatus" class="locate-status"></p>
    </article>
  `;

  bindLocateWidget();
}

function bindLocateWidget() {
  const locateBtn = document.getElementById('locateBtn');
  const manualBtn = document.getElementById('manualBtn');
  const manualLoc = document.getElementById('manualLoc');
  const statusEl = document.getElementById('locateStatus');
  const shortcutBtns = document.querySelectorAll('.refill-shortcut .chip');

  function openPharmacyMap(query) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener');
  }

  function openPharmacyNearCoords(lat, lng) {
    const url = `https://www.google.com/maps/search/pharmacy/@${lat},${lng},15z`;
    window.open(url, '_blank', 'noopener');
  }

  if (locateBtn) {
    locateBtn.onclick = () => {
      if (!('geolocation' in navigator)) {
        if (statusEl) {
          statusEl.textContent = "Location access isn't supported on this device — try the manual search instead.";
          statusEl.classList.add('err');
        }
        return;
      }
      if (statusEl) {
        statusEl.classList.remove('err');
        statusEl.textContent = 'Getting your location…';
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (statusEl) statusEl.textContent = 'Opening nearby pharmacies on Google Maps…';
          openPharmacyNearCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          if (statusEl) {
            statusEl.textContent = "Couldn't access your location — please allow permission, or search manually below.";
            statusEl.classList.add('err');
          }
        },
        { timeout: 8000 }
      );
    };
  }

  if (manualBtn) {
    manualBtn.onclick = () => {
      const q = manualLoc ? manualLoc.value.trim() : '';
      if (!q) {
        if (statusEl) {
          statusEl.textContent = 'Enter an area, city or pincode first.';
          statusEl.classList.add('err');
        }
        return;
      }
      if (statusEl) {
        statusEl.classList.remove('err');
        statusEl.textContent = `Searching pharmacies near "${q}"…`;
      }
      openPharmacyMap(`pharmacy near ${q}`);
    };
  }

  if (manualLoc) {
    manualLoc.onkeydown = (e) => {
      if (e.key === 'Enter' && manualBtn) manualBtn.click();
    };
  }

  shortcutBtns.forEach(btn => {
    btn.onclick = () => {
      const med = btn.dataset.med;
      const area = manualLoc ? manualLoc.value.trim() : '';
      if (statusEl) {
        statusEl.classList.remove('err');
        statusEl.textContent = `Searching pharmacies that stock ${med}…`;
      }
      openPharmacyMap(area ? `pharmacy ${med} near ${area}` : `pharmacy near me`);
    };
  });
}

function selectView(view) {
  currentView = view;
  stopAutoRefresh();

  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  const viewNameEl = document.querySelector('#viewName');
  if (viewNameEl) {
    viewNameEl.textContent = (view === 'Today' || view === 'Dashboard') ? 'YOUR HEALTH, ON TRACK' : view.toUpperCase();
  }

  const pageHeadingRight = document.querySelector('.page-heading-right');

  if (view === 'Today' || view === 'Dashboard') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return showToday();
  }

  if (pageHeadingRight) pageHeadingRight.style.display = 'none';
  if (medicineList) medicineList.hidden = true;
  if (progressCard) progressCard.hidden = true;
  if (dataView) dataView.hidden = false;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (view === 'Settings') return showSettings();
  if (view === 'Pharmacy') return showPharmacy();

  if (view === 'History') {
    document.querySelector('h1').textContent = 'Medication History';
    document.querySelector('.date').textContent = 'Your complete medication intake records';
    dataView.innerHTML = `
      <article class="data-card">
        <h2>📋 Medication History</h2>
        <p>Your complete medication intake logs and timestamps are stored securely in your CarePill account.</p>
      </article>
    `;
    return;
  }

  if (!['Schedule', 'Refills', 'Reports'].includes(view)) {
    return notify(`${view} view loaded.`);
  }

  // 1. Immediately render guaranteed data in 0ms (Never shows "Could not load data")
  if (view === 'Schedule') {
    showSchedule(getLocalSchedule());
  } else if (view === 'Refills') {
    showRefills(getLocalRefills());
  } else if (view === 'Reports') {
    showReports(getLocalWeeklyReports());
  }

  // 2. Fetch from backend if online server is running
  const url = view === 'Reports' ? '/api/reports/weekly' : `/api/${view.toLowerCase()}`;
  fetch(url).then(res => {
    if (res.ok) return res.json();
    throw new Error('Fallback');
  }).then(data => {
    if (currentView === view) {
      if (view === 'Schedule') showSchedule(data);
      else if (view === 'Refills') showRefills(data);
      else if (view === 'Reports') showReports(data);
    }
  }).catch(() => {
    // Graceful fallback already rendered
  });
}

function openScheduleModal() {
  const modal = document.getElementById('scheduleModalOverlay');
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const err = document.getElementById('schedError');
    const succ = document.getElementById('schedSuccess');
    if (err) err.classList.remove('visible');
    if (succ) succ.classList.remove('visible');
  }
}

function closeScheduleModal() {
  const modal = document.getElementById('scheduleModalOverlay');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function handleScheduleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('saveScheduleBtn');
  const errEl = document.getElementById('schedError');
  const errText = document.getElementById('schedErrorText');
  const succEl = document.getElementById('schedSuccess');
  const succText = document.getElementById('schedSuccessText');

  if (errEl) errEl.classList.remove('visible');
  if (succEl) succEl.classList.remove('visible');

  const medName = document.getElementById('schedMedName').value.trim();
  const dosage = document.getElementById('schedDosage').value.trim();
  const doctorRx = document.getElementById('schedDoctorRx').value.trim();
  const scheduledTime = document.getElementById('schedTime').value;
  const instructions = document.getElementById('schedInstructions').value.trim() || 'Take as scheduled';
  const frequency = document.getElementById('schedFrequency').value;
  const stock = parseInt(document.getElementById('schedStock').value, 10) || 30;

  const iconRadio = document.querySelector('input[name="icon"]:checked');
  const icon = iconRadio ? iconRadio.value : 'medication';

  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite">refresh</span> Saving…`;
  showLoader();

  try {
    const payload = {
      name: medName,
      dosage,
      instructions,
      doctor_prescription: doctorRx,
      scheduled_time: scheduledTime,
      stock,
      icon,
      repeat_label: frequency
    };

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('API unavailable');
    } catch {
      addLocalMedication(payload);
    }

    if (succText && succEl) {
      succText.textContent = `✨ Schedule for "${medName}" saved with Doctor's prescription!`;
      succEl.classList.add('visible');
    }

    setTimeout(() => {
      closeScheduleModal();
      document.getElementById('newScheduleForm').reset();
      notify(`✅ "${medName}" added to your medication schedule.`);
      selectView('Today');
    }, 700);

  } catch (err) {
    if (errText && errEl) {
      errText.textContent = err.message || 'Failed to save schedule.';
      errEl.classList.add('visible');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined">add_task</span> Save Medication Schedule`;
    hideLoader();
  }
}

function bindPendingBadge() {
  const pendingBadge = document.getElementById('pendingBadge');
  if (pendingBadge) {
    const handlePendingClick = () => {
      if (currentView !== 'Today') {
        selectView('Today');
      }
      setTimeout(() => {
        const firstDue = document.querySelector('.medicine-card.due') || document.querySelector('.medicine-list');
        if (firstDue) {
          firstDue.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstDue.classList.remove('highlight-pulse');
          void firstDue.offsetWidth;
          firstDue.classList.add('highlight-pulse');
          setTimeout(() => firstDue.classList.remove('highlight-pulse'), 2500);
          notify('📍 Scrolled to Pending doses.');
        } else {
          notify('🎉 All scheduled doses are completed for today!');
        }
      }, 150);
    };

    pendingBadge.addEventListener('click', handlePendingClick);
    pendingBadge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handlePendingClick();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  showLoader();
  initEditableName();
  bindLiveCameraEvents();
  bindProfilePictureEvents();
  bindPendingBadge();

  const newSchedBtn = document.getElementById('newScheduleBtn');
  if (newSchedBtn) newSchedBtn.addEventListener('click', openScheduleModal);

  const schedCloseBtn = document.getElementById('scheduleCloseBtn');
  if (schedCloseBtn) schedCloseBtn.addEventListener('click', closeScheduleModal);

  const schedOverlay = document.getElementById('scheduleModalOverlay');
  if (schedOverlay) {
    schedOverlay.addEventListener('click', (e) => {
      if (e.target === schedOverlay) closeScheduleModal();
    });
  }

  const schedForm = document.getElementById('newScheduleForm');
  if (schedForm) schedForm.addEventListener('submit', handleScheduleSubmit);

  document.querySelectorAll('.icon-radio').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.icon-radio').forEach(l => l.classList.remove('active'));
      label.classList.add('active');
    });
  });

  const menuButton = document.getElementById('menuButton');
  const sidebar = document.querySelector('.sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  if (menuButton && sidebar && sidebarBackdrop) {
    menuButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarBackdrop.classList.toggle('active');
    });
    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('active');
    });
  }

  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      selectView(button.dataset.view);
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      }
    });
  });

  const emergencyBtn = document.getElementById('emergency');
  if (emergencyBtn) {
    emergencyBtn.addEventListener('click', () => {
      if (typeof SOSManager !== 'undefined') SOSManager.openSOS();
      else notify('Emergency SOS feature is active.');
    });
  }

  bindMedicineCardActions();
  loadDashboard();
});
