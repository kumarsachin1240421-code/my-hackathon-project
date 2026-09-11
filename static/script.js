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
    if (raw === null) {
      localStorage.setItem(LOCAL_MEDS_KEY, JSON.stringify(DEFAULT_MEDICATIONS));
      return DEFAULT_MEDICATIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
  const pending = Math.max(0, updatedMeds.length - completed);

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
  let streak = 0;
  let streakActive = true;

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    
    let taken = 0;
    if (i === 0) {
      taken = meds.filter(m => doses[`${m.id}_${dateStr}`] === 'taken' || m.status === 'taken').length;
    } else {
      meds.forEach(m => {
        if (doses[`${m.id}_${dateStr}`] === 'taken') {
          taken++;
        } else if (doses[`${m.id}_${dateStr}`] === undefined) {
          // Default historical simulated adherence for baseline consistency
          taken++;
        }
      });
    }
    
    const dayScheduled = meds.length;
    const dayTaken = Math.min(taken, dayScheduled);

    days.push({
      date: dateStr,
      scheduled: dayScheduled,
      taken: dayTaken,
      dismissed: 0,
      snoozed: 0
    });
  }

  // Calculate active streak count (consecutive 100% adherence days backwards from today)
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.scheduled > 0 && day.taken >= day.scheduled) {
      if (streakActive) streak++;
    } else if (i === days.length - 1 && day.taken > 0) {
      // In-progress today counts as active streak start
      if (streakActive) streak++;
    } else {
      streakActive = false;
    }
  }

  const totalScheduled = days.reduce((sum, day) => sum + day.scheduled, 0);
  const totalTaken = days.reduce((sum, day) => sum + day.taken, 0);
  const adherence = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100;

  const profiles = {
    'Atorvastatin': { purpose: 'Helps lower cholesterol and reduce cardiovascular risk.', adherence: 100, last_taken: '8:00 PM', reminder: 'Once daily, as prescribed' },
    'Lisinopril': { purpose: 'Used to help control high blood pressure and cardiac support.', adherence: 90, last_taken: '9:00 AM', reminder: 'Once daily, as prescribed' },
    'Vitamin D3': { purpose: 'Supports vitamin D levels, calcium absorption, and bone health.', adherence: 100, last_taken: '9:00 AM', reminder: 'According to schedule' }
  };

  const patient_medicines = meds.map(m => {
    const isTakenToday = doses[`${m.id}_${today.toISOString().slice(0, 10)}`] === 'taken' || m.status === 'taken';
    const medAdherence = isTakenToday ? 100 : (m.status === 'pending' ? 85 : 95);
    return {
      name: m.name,
      stock: m.stock,
      low_stock: m.stock <= 8,
      purpose: (profiles[m.name] && profiles[m.name].purpose) || 'Prescribed daily medication',
      adherence: medAdherence,
      last_taken: isTakenToday ? 'Today · Recorded' : ((profiles[m.name] && profiles[m.name].last_taken) || 'Scheduled today'),
      reminder: (profiles[m.name] && profiles[m.name].reminder) || (m.repeat_label || 'Daily')
    };
  });

  return {
    scheduled: totalScheduled,
    taken: totalTaken,
    adherence,
    streak: Math.max(1, streak),
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
  const id = newMed.id || Date.now();
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

function deleteLocalMedication(medId) {
  const numId = Number(medId);
  const meds = getLocalMedications();
  const deletedMed = meds.find(m => m.id === numId || m.id === medId || String(m.id) === String(medId));
  const updatedMeds = meds.filter(m => m.id !== numId && m.id !== medId && String(m.id) !== String(medId));
  saveLocalMedications(updatedMeds);

  try {
    const doses = getLocalDoses();
    Object.keys(doses).forEach(key => {
      if (key.startsWith(`${medId}_`) || key.startsWith(`${numId}_`)) {
        delete doses[key];
      }
    });
    saveLocalDoses(doses);
  } catch {}

  invalidateCache('/api/dashboard');
  invalidateCache('/api/schedule');
  invalidateCache('/api/refills');
  invalidateCache('/api/reports/weekly');

  return deletedMed;
}

async function deleteScheduleItem(medId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const row = event && event.target ? event.target.closest('.data-row') : document.querySelector(`.data-row[data-id="${medId}"]`);
  
  if (row) {
    row.classList.add('collapsing');
  }

  // Smooth transition duration (320ms) so lower schedules smoothly move up to fill empty space
  await new Promise(resolve => setTimeout(resolve, 320));

  let serverDashboard = null;
  try {
    const res = await fetch(`/api/medications/${medId}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.dashboard) {
        serverDashboard = data.dashboard;
      }
    }
  } catch {}

  const deletedMed = deleteLocalMedication(medId);
  const medName = deletedMed ? deletedMed.name : 'Medication';

  notify(`🗑️ "${medName}" removed from schedule.`);

  const authoritativeDashboard = serverDashboard || getLocalDashboard();
  if (currentView === 'Schedule') {
    showSchedule(authoritativeDashboard);
  } else {
    renderDashboard(authoritativeDashboard);
  }
}
window.deleteScheduleItem = deleteScheduleItem;

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

function showToast(message) {
  notify(message);
}
window.showToast = showToast;
window.notify = notify;

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

/* ── Dashboard Rendering (Requirement 1: Daily Progress Counter Logic) ── */
function renderDashboard(data) {
  requestAnimationFrame(() => {
    const progressText = document.querySelector('#progressText');
    const progressBar = document.querySelector('#progressBar');
    const pendingCount = document.querySelector('#pendingCount');

    const meds = data && data.medications ? data.medications : getLocalMedications();
    const totalActiveDoses = meds.length;
    const takenDoses = meds.filter(m => m.status === 'taken').length;
    const pending = Math.max(0, totalActiveDoses - takenDoses);
    const progressPercent = totalActiveDoses > 0 ? Math.round((takenDoses / totalActiveDoses) * 100) : 0;

    if (progressText) {
      progressText.textContent = `${takenDoses} of ${totalActiveDoses} taken`;
    }
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }
    if (pendingCount) {
      pendingCount.textContent = `${pending} Pending`;
    }

    if (medicineList) {
      if (totalActiveDoses === 0) {
        medicineList.innerHTML = `
          <div class="schedule-empty-state">
            <span class="material-symbols-outlined">event_busy</span>
            <h3>No medications scheduled for today</h3>
            <p>Your medicine cabinet is empty. Add a schedule to get automated dosage reminders and tracking.</p>
            <button class="new-schedule-btn" onclick="openScheduleModal()" style="display:inline-flex;">
              <span class="material-symbols-outlined">add_circle</span>
              <span>Add New Schedule</span>
            </button>
          </div>
        `;
      } else {
        medicineList.innerHTML = meds.map(medicine => {
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
        if (result && result.dashboard) {
          renderDashboard(result.dashboard);
        } else {
          renderDashboard(getLocalDashboard());
        }
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
        const result = await requestDose(card, 'snoozed');
        if (result && result.dashboard) {
          renderDashboard(result.dashboard);
        } else {
          renderDashboard(getLocalDashboard());
        }
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
      const medName = card.dataset.medicine || 'Medicine';
      
      // Trigger smooth upward collapse so lower cards glide up
      card.classList.add('collapsing');
      showLoader();

      setTimeout(async () => {
        try {
          const result = await requestDose(card, 'dismissed');
          if (result && result.dashboard) {
            renderDashboard(result.dashboard);
          } else {
            renderDashboard(getLocalDashboard());
          }
          notify(`ℹ️ ${medName} dismissed for today.`);
        } catch (error) {
          notify(error.message);
        } finally {
          hideLoader();
        }
      }, 320);
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
      const data = await response.json();
      invalidateCache('/api/dashboard');
      updateLocalDose(id, action);
      return data;
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
      if (data && Array.isArray(data.medications)) {
        saveLocalMedications(data.medications);
      }
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

/* ── Schedule Modal Controllers ── */
function openScheduleModal() {
  const overlay = document.getElementById('scheduleModalOverlay');
  if (!overlay) return;
  const errEl = document.getElementById('schedError');
  const succEl = document.getElementById('schedSuccess');
  if (errEl) errEl.classList.remove('visible');
  if (succEl) succEl.classList.remove('visible');
  
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  const firstInput = document.getElementById('schedMedName');
  if (firstInput) firstInput.focus();
}
window.openScheduleModal = openScheduleModal;

function closeScheduleModal() {
  const overlay = document.getElementById('scheduleModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
}
window.closeScheduleModal = closeScheduleModal;

async function handleScheduleSubmit(e) {
  e.preventDefault();
  const medName = document.getElementById('schedMedName').value.trim();
  const dosage = document.getElementById('schedDosage').value.trim();
  const doctorRx = document.getElementById('schedDoctorRx').value.trim();
  const schedTime = document.getElementById('schedTime').value;
  const instructions = document.getElementById('schedInstructions').value.trim() || 'As prescribed';
  const frequency = document.getElementById('schedFrequency').value || 'Daily';
  const stock = parseInt(document.getElementById('schedStock').value, 10) || 30;
  const iconRadio = document.querySelector('input[name="icon"]:checked');
  const icon = iconRadio ? iconRadio.value : 'medication';

  if (!medName || !dosage) {
    const errEl = document.getElementById('schedError');
    const errText = document.getElementById('schedErrorText');
    if (errText) errText.textContent = 'Please fill out medicine name and dosage.';
    if (errEl) errEl.classList.add('visible');
    return;
  }

  const newMed = {
    name: medName,
    dosage: dosage,
    instructions: instructions,
    doctor_prescription: doctorRx,
    scheduled_time: schedTime,
    stock: stock,
    icon: icon,
    repeat_label: frequency,
    status: 'pending'
  };

  try {
    const res = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMed)
    });
    if (res.ok) {
      const created = await res.json();
      if (created && created.id) {
        newMed.id = created.id;
      }
    }
  } catch {}

  addLocalMedication(newMed);
  invalidateCache('/api/dashboard');
  invalidateCache('/api/schedule');
  invalidateCache('/api/refills');
  invalidateCache('/api/reports/weekly');

  const succEl = document.getElementById('schedSuccess');
  const succText = document.getElementById('schedSuccessText');
  if (succText) succText.textContent = `"${medName}" added to schedule!`;
  if (succEl) succEl.classList.add('visible');

  notify(`✅ "${medName}" added to daily schedule!`);

  setTimeout(() => {
    closeScheduleModal();
    const schedForm = document.getElementById('newScheduleForm');
    if (schedForm) schedForm.reset();
    if (currentView === 'Schedule') {
      showSchedule(getLocalSchedule());
    } else {
      renderDashboard(getLocalDashboard());
    }
  }, 400);
}
window.handleScheduleSubmit = handleScheduleSubmit;

function bindPendingBadge() {
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.addEventListener('click', () => {
      selectView('Today');
      const dueCards = document.querySelectorAll('.medicine-card.due');
      if (dueCards.length > 0) {
        dueCards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}

/* ── View Router (Strict Isolation) ── */
let currentView = 'Today';

function showToday() {
  currentView = 'Today';
  const pageHeadingRight = document.querySelector('.page-heading-right');
  const medicineList = document.querySelector('.medicine-list');
  const progressCard = document.querySelector('.progress-card');
  const dataView = document.querySelector('#dataView');

  if (pageHeadingRight) pageHeadingRight.style.display = 'flex';
  if (medicineList) {
    medicineList.removeAttribute('hidden');
    medicineList.style.display = '';
  }
  if (progressCard) {
    progressCard.removeAttribute('hidden');
    progressCard.style.display = '';
  }
  if (dataView) {
    dataView.setAttribute('hidden', '');
    dataView.style.display = 'none';
  }

  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = "Today's Schedule";
  const dateEl = document.querySelector('.date');
  if (dateEl) dateEl.textContent = 'Your medication plan for today';

  renderDashboard(getLocalDashboard());
  loadDashboard();
  startAutoRefresh();
}

function showSchedule(data) {
  const scheduleData = data || getLocalSchedule();
  document.querySelector('h1').textContent = 'Medication Schedule';
  document.querySelector('.date').textContent = 'All doses planned for today';

  const hasMeds = scheduleData.medications && scheduleData.medications.length > 0;
  const completed = scheduleData.completed || (scheduleData.medications ? scheduleData.medications.filter(m => m.status === 'taken').length : 0);
  const total = scheduleData.medications ? scheduleData.medications.length : 0;

  const rows = hasMeds ? scheduleData.medications.map(m => `
    <div class="data-row" data-id="${m.id}">
      <div>
        <strong>${escapeHtml(m.scheduled_time)} · ${escapeHtml(m.name)}</strong>
        <small>${escapeHtml(m.dosage)} · ${escapeHtml(m.instructions || 'As prescribed')}</small>
        ${m.doctor_prescription ? `<small style="color:var(--teal);margin-top:2px;">👨‍⚕️ ${escapeHtml(m.doctor_prescription)}</small>` : ''}
      </div>
      <div class="schedule-row-actions">
        <span class="status-pill ${m.status === 'dismissed' ? 'warning' : ''}">${escapeHtml(m.status)}</span>
        <button type="button" class="delete-schedule-btn" onclick="deleteScheduleItem(${m.id}, event)" title="Remove from schedule" aria-label="Delete schedule ${escapeHtml(m.name)}">
          <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
        </button>
      </div>
    </div>
  `).join('') : `
    <div class="schedule-empty-state">
      <span class="material-symbols-outlined" style="font-size:36px;color:var(--teal);margin-bottom:8px;display:block;">event_available</span>
      <strong style="color:var(--ink);display:block;margin-bottom:4px;">No medications scheduled</strong>
      <p style="margin:0 0 14px;color:var(--muted);font-size:13px;">Add your first medication schedule to get automated dosage reminders.</p>
      <button class="new-schedule-btn" onclick="openScheduleModal()" style="font-size:12.5px;padding:8px 16px;display:inline-flex;">
        <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
        <span>Add Schedule</span>
      </button>
    </div>
  `;

  dataView.innerHTML = `
    <article class="data-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <h2>Today's doses</h2>
          <p style="margin:0;color:var(--muted);font-size:13px;">${completed} of ${total} taken (${total} medication${total === 1 ? '' : 's'} scheduled)</p>
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

  const hasMeds = refillData.medications && refillData.medications.length > 0;
  const rows = hasMeds ? refillData.medications.map(m => `
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
  `).join('') : `
    <div class="schedule-empty-state">
      <span class="material-symbols-outlined">inventory_2</span>
      <strong>No medicines in inventory</strong>
      <p>Add medication schedules to track remaining stock and get automated refill reminders.</p>
      <button class="new-schedule-btn" onclick="openScheduleModal()" style="display:inline-flex;">
        <span class="material-symbols-outlined">add_circle</span>
        <span>Add Schedule</span>
      </button>
    </div>
  `;

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

/* ═══════════════════════════════════════════════
   Requirement 3: Mental Health Doctor Consultation Section
   ═══════════════════════════════════════════════ */
const MENTAL_HEALTH_DOCTORS = [
  {
    id: 'doc_1',
    name: 'Dr. Radhika Sen',
    qualification: 'Ph.D. Clinical Psychology · NIMHANS',
    specialization: 'Anxiety, Depression, CBT & Trauma Specialist',
    experience: '12+ Years Exp',
    rating: '4.9 ★',
    reviews: '340+ reviews',
    fee: '₹799',
    session_length: '45 mins',
    img: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=400&q=80',
    badge: 'Top Rated',
    languages: 'English, Hindi'
  },
  {
    id: 'doc_2',
    name: 'Dr. Vikram Malhotra',
    qualification: 'MD Psychiatry · AIIMS New Delhi',
    specialization: 'Adult Psychiatry, ADHD, Mood Disorders & Stress',
    experience: '15+ Years Exp',
    rating: '4.95 ★',
    reviews: '520+ reviews',
    fee: '₹1,499',
    session_length: '50 mins',
    img: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80',
    badge: 'Senior Psychiatrist',
    languages: 'English, Hindi, Punjabi'
  },
  {
    id: 'doc_3',
    name: 'Dr. Ananya Mehta',
    qualification: 'M.Phil Clinical Psychology · RCI Licensed',
    specialization: 'Relationship Counseling, Mindfulness & Burnout',
    experience: '8+ Years Exp',
    rating: '4.88 ★',
    reviews: '280+ reviews',
    fee: '₹999',
    session_length: '45 mins',
    img: 'https://images.unsplash.com/photo-1594824813590-78965a39626e?auto=format&fit=crop&w=400&q=80',
    badge: 'Mindfulness Expert',
    languages: 'English, Hindi, Gujarati'
  },
  {
    id: 'doc_4',
    name: 'Dr. Sarah Khan',
    qualification: 'Licensed Psychotherapist & Somatic Fellow',
    specialization: 'Sleep Therapy, Somatic Healing & Panic Management',
    experience: '10+ Years Exp',
    rating: '4.92 ★',
    reviews: '410+ reviews',
    fee: '₹1,199',
    session_length: '45 mins',
    img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    badge: 'Sleep & Stress',
    languages: 'English, Hindi, Urdu'
  }
];

const COUNSELLING_BOOKINGS_KEY = 'carewell_counselling_bookings';
const MENTAL_HEALTH_BOOKINGS_KEY = 'carewell_mental_health_bookings';

function getStoredDoctorBookings() {
  try {
    const raw = localStorage.getItem(COUNSELLING_BOOKINGS_KEY) || localStorage.getItem(MENTAL_HEALTH_BOOKINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDoctorBooking(booking) {
  try {
    const bookings = getStoredDoctorBookings();
    bookings.unshift(booking);
    localStorage.setItem(COUNSELLING_BOOKINGS_KEY, JSON.stringify(bookings));
    localStorage.setItem(MENTAL_HEALTH_BOOKINGS_KEY, JSON.stringify(bookings));
  } catch {}
}

function cancelDoctorBooking(bookingId) {
  let bookings = getStoredDoctorBookings();
  const booking = bookings.find(b => b.id === bookingId);
  const docName = booking ? booking.doctor_name : 'Doctor';
  bookings = bookings.filter(b => b.id !== bookingId);
  localStorage.setItem(COUNSELLING_BOOKINGS_KEY, JSON.stringify(bookings));
  localStorage.setItem(MENTAL_HEALTH_BOOKINGS_KEY, JSON.stringify(bookings));
  notify(`🗑️ Booking with ${docName} has been cancelled.`);
  showCounsellingSession();
}
window.cancelDoctorBooking = cancelDoctorBooking;

function simulateDoctorApproval(bookingId) {
  let bookings = getStoredDoctorBookings();
  const booking = bookings.find(b => b.id === bookingId);
  if (booking) {
    booking.status = 'confirmed';
    localStorage.setItem(COUNSELLING_BOOKINGS_KEY, JSON.stringify(bookings));
    localStorage.setItem(MENTAL_HEALTH_BOOKINGS_KEY, JSON.stringify(bookings));
    notify(`🎉 Session with ${booking.doctor_name} is now CONFIRMED by the doctor!`);
    showCounsellingSession();
  }
}
window.simulateDoctorApproval = simulateDoctorApproval;

function showCounsellingSession() {
  document.querySelector('h1').textContent = 'Counselling Session';
  document.querySelector('.date').textContent = 'Consult certified psychologists & psychiatrists 1-on-1';

  const bookings = getStoredDoctorBookings();

  const bookedSessionsHtml = bookings.length > 0 ? `
    <article class="data-card" style="margin-bottom:24px;border:1px solid rgba(16, 185, 129, 0.4);">
      <div class="section-title">
        <h2>🗓️ Your Booked Consultations</h2>
        <span style="color:#059669;background:#ecfdf5;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">${bookings.length} ${bookings.length === 1 ? 'Booking' : 'Bookings'}</span>
      </div>
      <div class="data-list" style="margin-top:14px;">
        ${bookings.map(b => {
          const isWaitlist = b.status === 'waitlist' || !b.status;
          return `
            <div class="data-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;flex-wrap:wrap;gap:8px;">
                <div>
                  <strong>${escapeHtml(b.doctor_name)} · <span style="color:var(--blue);">${escapeHtml(b.session_mode || 'Video Call')}</span></strong>
                  <small>📅 ${escapeHtml(b.date)} at ⏰ ${escapeHtml(b.time_slot)} · Fee: ${escapeHtml(b.fee)}</small>
                  ${b.notes ? `<small style="color:var(--muted);margin-top:2px;">📝 Topic: ${escapeHtml(b.notes)}</small>` : ''}
                </div>
                <span class="status-pill ${isWaitlist ? 'waitlist' : 'confirmed'}">
                  ${isWaitlist ? '⏳ In Waitlist (Waiting for Doctor Confirmation)' : '✓ Confirmed by Doctor'}
                </span>
              </div>
              <div class="booking-actions-row">
                <button type="button" class="btn-cancel-session" onclick="cancelDoctorBooking('${b.id}')" title="Cancel this appointment">
                  <span class="material-symbols-outlined" style="font-size:15px;">close</span>
                  <span>Cancel Session</span>
                </button>
                ${isWaitlist ? `
                  <button type="button" class="btn-simulate-approve" onclick="simulateDoctorApproval('${b.id}')" title="Simulate doctor accepting the session">
                    <span class="material-symbols-outlined" style="font-size:15px;">check_circle</span>
                    <span>Simulate Doctor Approval</span>
                  </button>
                ` : `
                  <span style="font-size:11.5px;color:var(--teal);font-weight:600;display:inline-flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">videocam</span> Meeting link will activate at scheduled time
                  </span>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </article>
  ` : '';

  const doctorCardsHtml = MENTAL_HEALTH_DOCTORS.map(doc => `
    <article class="doctor-card" data-doc-id="${doc.id}">
      <div>
        <div class="doctor-card-top">
          <div class="doctor-avatar-wrap">
            <img src="${doc.img}" alt="${escapeHtml(doc.name)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<span class=\\'material-symbols-outlined\\'>psychology</span>'">
          </div>
          <div class="doctor-info">
            <div style="display:flex;align-items:center;gap:6px;">
              <h3>${escapeHtml(doc.name)}</h3>
              <span style="font-size:10px;font-weight:800;background:#eff6ff;color:var(--blue);padding:2px 8px;border-radius:999px;">${escapeHtml(doc.badge)}</span>
            </div>
            <p style="color:var(--teal);font-weight:600;">${escapeHtml(doc.qualification)}</p>
            <p style="margin-top:4px;">${escapeHtml(doc.specialization)}</p>
          </div>
        </div>

        <div class="doctor-meta-tags">
          <span class="doctor-tag">⭐ ${escapeHtml(doc.rating)} (${escapeHtml(doc.reviews)})</span>
          <span class="doctor-tag">💼 ${escapeHtml(doc.experience)}</span>
          <span class="doctor-tag">🗣️ ${escapeHtml(doc.languages)}</span>
        </div>
      </div>

      <div class="doctor-card-footer">
        <div class="doctor-fee">
          <strong>${escapeHtml(doc.fee)} <small style="font-size:11px;font-weight:500;color:var(--muted);">/ ${escapeHtml(doc.session_length)}</small></strong>
          <small>Verified Professional</small>
        </div>
        <button type="button" class="btn-book-session" onclick="openDoctorBookingModal('${doc.id}')">
          <span class="material-symbols-outlined" style="font-size:16px;">calendar_month</span>
          <span>Book Session</span>
        </button>
      </div>
    </article>
  `).join('');

  dataView.innerHTML = `
    ${bookedSessionsHtml}

    <article class="data-card">
      <div class="section-title">
        <h2>🧠 Licensed Counselors &amp; Psychiatrists</h2>
        <span>Confidential 1-on-1 Support</span>
      </div>
      <p style="margin-top:4px;">Speak with compassionate mental health professionals via Audio, HD Video, or Private Live Chat.</p>

      <div class="mental-health-grid">
        ${doctorCardsHtml}
      </div>
    </article>
  `;
}
const showMentalHealth = showCounsellingSession;
window.showCounsellingSession = showCounsellingSession;
window.showMentalHealth = showMentalHealth;

function openDoctorBookingModal(docId) {
  const doc = MENTAL_HEALTH_DOCTORS.find(d => d.id === docId) || MENTAL_HEALTH_DOCTORS[0];
  const overlay = document.getElementById('doctorBookingModalOverlay');
  if (!overlay) return;

  const docNameEl = document.getElementById('bookingDoctorName');
  const docTitleEl = document.getElementById('bookingDoctorTitle');
  const docFeeEl = document.getElementById('bookingFeeSummary');
  const docIdInput = document.getElementById('bookingDoctorId');
  const dateInput = document.getElementById('bookingDate');

  if (docNameEl) docNameEl.textContent = `Book with ${doc.name}`;
  if (docTitleEl) docTitleEl.textContent = `${doc.qualification} · ${doc.specialization}`;
  if (docFeeEl) docFeeEl.textContent = `${doc.fee} (${doc.session_length})`;
  if (docIdInput) docIdInput.value = doc.id;

  // Set default tomorrow date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateInput) {
    dateInput.value = tomorrow.toISOString().slice(0, 10);
    dateInput.min = new Date().toISOString().slice(0, 10);
  }

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeDoctorBookingModal() {
  const overlay = document.getElementById('doctorBookingModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function handleDoctorBookingSubmit(e) {
  e.preventDefault();
  const docId = document.getElementById('bookingDoctorId').value;
  const doc = MENTAL_HEALTH_DOCTORS.find(d => d.id === docId) || MENTAL_HEALTH_DOCTORS[0];
  const modeRadio = document.querySelector('input[name="sessionMode"]:checked');
  const sessionMode = modeRadio ? modeRadio.value : 'Video Call';
  const date = document.getElementById('bookingDate').value;
  const timeSlot = document.getElementById('bookingTimeSlot').value;
  const notes = document.getElementById('bookingNotes').value.trim();

  const newBooking = {
    id: 'b_' + Date.now(),
    doctor_id: doc.id,
    doctor_name: doc.name,
    doctor_qualification: doc.qualification,
    fee: doc.fee,
    session_mode: sessionMode,
    date,
    time_slot: timeSlot,
    notes,
    status: 'waitlist',
    booked_at: new Date().toISOString()
  };

  saveDoctorBooking(newBooking);
  closeDoctorBookingModal();
  notify(`⏳ Session with ${doc.name} requested! Status: In Waitlist (Waiting for Doctor Confirmation)`);

  if (currentView === 'CounsellingSession' || currentView === 'Counselling' || currentView === 'MentalHealth') {
    showCounsellingSession();
  }
}

/* ═══════════════════════════════════════════════
   Requirement 8: Live Real-Time Weekly Adherence Report
   ═══════════════════════════════════════════════ */
function showReports(data) {
  const reportData = data || getLocalWeeklyReports();
  const meds = reportData.patient_medicines || [];
  const adherence = reportData.adherence !== undefined ? reportData.adherence : (meds.length ? Math.round(meds.reduce((sum, medicine) => sum + (medicine.adherence || 0), 0) / meds.length) : 100);
  const lowStock = meds.filter(medicine => medicine.low_stock).length;
  const streak = reportData.streak || 1;

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
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="adherence-streak-badge">
            <span class="material-symbols-outlined" style="font-size:16px;">local_fire_department</span>
            <span>${streak}-Day Active Streak 🔥</span>
          </div>
          <div class="ma-status"><i></i>Overall Status: Good</div>
        </div>
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
          <p class="ma-caption">Real-Time 7-Day Adherence</p>
        </div>
        <div class="ma-stat-grid">
          <div class="ma-stat"><strong>${meds.length}</strong><span>Total Medicines</span></div>
          <div class="ma-stat ok"><strong>${reportData.taken || 0}</strong><span>Taken (7 Days)</span></div>
          <div class="ma-stat"><strong>${reportData.scheduled || (meds.length * 7)}</strong><span>Scheduled Doses</span></div>
          <div class="ma-stat warn"><strong>${lowStock}</strong><span>Low Stock</span></div>
        </div>
      </section>
      <div class="ma-section-title"><h2>Medicines</h2><span>${meds.length} active</span></div>
      <section class="ma-grid">${medicineCards}</section>
      <section class="ma-week">
        <div class="ma-section-title"><h2>Weekly Adherence Report</h2><span>Past 7 days live tracking</span></div>
        <div class="ma-week-grid">${days}</div>
        <div class="ma-legend"><span><i></i>Full day taken</span><span><i class="amber"></i>Partial / one dose missed</span><span><i class="red"></i>Mostly missed</span></div>
      </section>
      <p class="ma-footnote">This report provides real-time medication tracking. Any dose recorded instantly recalculates compliance percentage.</p>
    </div>
  `;

  bindReportsFileManagement();
}

/* ═══════════════════════════════════════════════
   CareWell Public Testimonials & Reviews System
   ═══════════════════════════════════════════════ */
const LOCAL_REVIEWS_KEY = 'carewell_public_reviews';
const LOCAL_MY_REVIEW_KEY = 'carewell_my_review';

const DEFAULT_SEED_REVIEWS = [
  {
    id: 'seed-1',
    user_name: 'Dr. Ananya Sharma',
    rating: 5,
    comment: 'CareWell has completely transformed how my senior patients adhere to their daily medication routines. The reminders are clear, timely, and easy to use.',
    created_at: '2026-09-08T10:30:00Z',
    theme: 'teal'
  },
  {
    id: 'seed-2',
    user_name: 'Rajesh Malhotra',
    rating: 5,
    comment: 'I manage multiple prescriptions for hypertension and diabetes. The dynamic progress ring and real-time alarms mean I never miss a single dose.',
    created_at: '2026-09-09T14:15:00Z',
    theme: 'blue'
  },
  {
    id: 'seed-3',
    user_name: 'Sunita Patel (Caregiver)',
    rating: 5,
    comment: 'As a caregiver for my elderly parents, the 1-click SOS and emergency support give our whole family immense peace of mind.',
    created_at: '2026-09-10T09:45:00Z',
    theme: 'amber'
  },
  {
    id: 'seed-4',
    user_name: 'Vikram Sen',
    rating: 5,
    comment: 'The AI companion and instant pharmacy locator made refilling critical medicines seamless. Truly a modern healthcare companion!',
    created_at: '2026-09-11T18:20:00Z',
    theme: 'purple'
  }
];

function getStoredReviews() {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEWS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(DEFAULT_SEED_REVIEWS));
      return DEFAULT_SEED_REVIEWS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SEED_REVIEWS;
  } catch {
    return DEFAULT_SEED_REVIEWS;
  }
}

function saveStoredReviews(reviews) {
  try {
    localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(reviews));
  } catch {}
}

function getMyStoredReview() {
  let myRev = null;
  try {
    const raw = localStorage.getItem(LOCAL_MY_REVIEW_KEY);
    if (raw) myRev = JSON.parse(raw);
  } catch {}

  const allReviews = getStoredReviews();
  let currentUserName = null;
  let currentUserId = null;
  if (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser) {
    const u = AuthManager.getCurrentUser();
    if (u) {
      currentUserName = u.name;
      currentUserId = u.id;
    }
  }

  if (myRev) {
    const exists = allReviews.some(r => r.id === myRev.id || (currentUserId && r.user_id === currentUserId) || (currentUserName && r.user_name && r.user_name.toLowerCase() === currentUserName.toLowerCase()));
    if (exists) return myRev;
  }

  if (currentUserId || currentUserName) {
    const matched = allReviews.find(r => (currentUserId && r.user_id === currentUserId) || (currentUserName && r.user_name && r.user_name.toLowerCase() === currentUserName.toLowerCase()));
    if (matched) {
      try {
        localStorage.setItem(LOCAL_MY_REVIEW_KEY, JSON.stringify(matched));
      } catch {}
      return matched;
    }
  }

  return null;
}

function formatReviewDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function renderLandingTestimonials() {
  const grid = document.getElementById('landingTestimonialsGrid');
  if (!grid) return;

  const reviews = getStoredReviews();
  const themeClasses = ['teal', 'blue', 'amber', 'purple'];

  grid.innerHTML = reviews.map((rev, idx) => {
    const theme = rev.theme || themeClasses[idx % themeClasses.length];
    const initial = rev.user_name ? rev.user_name.trim().charAt(0).toUpperCase() : 'U';
    const stars = '★'.repeat(Math.max(1, Math.min(5, rev.rating || 5)));
    const dateFormatted = formatReviewDate(rev.created_at);

    return `
      <article class="testimonial-card">
        <div>
          <div class="testimonial-card-top">
            <div class="testimonial-avatar ${theme}">${initial}</div>
            <div class="testimonial-user-info">
              <div class="testimonial-author-name">
                <span>${escapeHtml(rev.user_name || 'CareWell User')}</span>
                <span class="material-symbols-outlined testimonial-verified-badge" title="Verified User">verified</span>
              </div>
              <span class="testimonial-date">${escapeHtml(dateFormatted)}</span>
            </div>
          </div>
          <div class="testimonial-stars" aria-label="${rev.rating || 5} out of 5 stars">${stars}</div>
          <p class="testimonial-body">“${escapeHtml(rev.comment || '')}”</p>
        </div>
      </article>
    `;
  }).join('');
}

async function fetchLiveReviews() {
  try {
    const res = await fetch('/api/reviews');
    if (res.ok) {
      const liveReviews = await res.json();
      if (Array.isArray(liveReviews) && liveReviews.length > 0) {
        saveStoredReviews(liveReviews);
        renderLandingTestimonials();
      }
    }
  } catch (err) {
    renderLandingTestimonials();
  }
}

function submitUserReview(rating, comment) {
  if (!comment || !comment.trim()) {
    showToast('Please write a brief feedback message before submitting.');
    return;
  }

  let userName = 'CareWell Member';
  let userId = null;
  if (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser) {
    const u = AuthManager.getCurrentUser();
    if (u && u.name) {
      userName = u.name;
      userId = u.id;
    }
  }
  if (userName === 'CareWell Member') {
    const storedName = localStorage.getItem('carepill_user_name') || localStorage.getItem('carepill_auth_user');
    if (storedName) {
      try {
        const parsed = JSON.parse(storedName);
        if (parsed && parsed.name) userName = parsed.name;
      } catch {
        userName = storedName;
      }
    }
  }

  const newReview = {
    id: 'rev_' + Date.now(),
    user_id: userId,
    user_name: userName,
    rating: Number(rating) || 5,
    comment: comment.trim(),
    created_at: new Date().toISOString(),
    theme: 'teal'
  };

  // 1. Update localStorage: replace any older review by same user & prepend new
  const currentReviews = getStoredReviews();
  const filtered = currentReviews.filter(r => {
    if (userId && r.user_id && r.user_id === userId) return false;
    if (userName && r.user_name && r.user_name.toLowerCase() === userName.toLowerCase()) return false;
    return true;
  });
  const updatedReviews = [newReview, ...filtered];
  saveStoredReviews(updatedReviews);
  localStorage.setItem(LOCAL_MY_REVIEW_KEY, JSON.stringify(newReview));

  // 2. Sync with backend API asynchronously
  fetch('/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof AuthManager !== 'undefined' && AuthManager.getToken && AuthManager.getToken() ? { 'Authorization': `Bearer ${AuthManager.getToken()}` } : {})
    },
    body: JSON.stringify({
      user_name: userName,
      rating: Number(rating) || 5,
      comment: comment.trim(),
      user_id: userId
    })
  }).then(res => {
    if (res.ok) return res.json();
  }).then(savedRow => {
    if (savedRow && savedRow.id) {
      newReview.id = savedRow.id;
      localStorage.setItem(LOCAL_MY_REVIEW_KEY, JSON.stringify(newReview));
    }
  }).catch(() => {});

  // 3. Update UI
  renderLandingTestimonials();
  renderSettingsReviewCard();
  showToast('🌟 Thank you! Your review is now live on the public landing page.');
}

function deleteUserReview() {
  const myReview = getMyStoredReview();
  const currentReviews = getStoredReviews();

  let targetId = myReview ? myReview.id : null;
  let userName = myReview ? myReview.user_name : null;
  let userId = myReview ? myReview.user_id : null;

  if (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser) {
    const u = AuthManager.getCurrentUser();
    if (u) {
      if (u.name) userName = u.name;
      if (u.id) userId = u.id;
    }
  }

  const updatedReviews = currentReviews.filter(r => {
    if (targetId && (r.id === targetId || String(r.id) === String(targetId))) return false;
    if (userId && r.user_id && r.user_id === userId) return false;
    if (userName && r.user_name && r.user_name.toLowerCase() === userName.toLowerCase()) return false;
    return true;
  });

  saveStoredReviews(updatedReviews);
  localStorage.removeItem(LOCAL_MY_REVIEW_KEY);

  // Sync delete with backend
  fetch('/api/reviews/user/mine', {
    method: 'DELETE',
    headers: {
      ...(typeof AuthManager !== 'undefined' && AuthManager.getToken && AuthManager.getToken() ? { 'Authorization': `Bearer ${AuthManager.getToken()}` } : {})
    }
  }).catch(() => {});

  // Update UI immediately
  renderLandingTestimonials();
  renderSettingsReviewCard();
  showToast('Your review has been successfully removed.');
}

function renderSettingsReviewCard() {
  const container = document.getElementById('userReviewSettingsContent');
  if (!container) return;

  const myReview = getMyStoredReview();

  if (myReview) {
    // Render Active Review Display with prominent "Delete My Review" button
    const stars = '★'.repeat(Math.max(1, Math.min(5, myReview.rating || 5)));
    const dateFormatted = formatReviewDate(myReview.created_at);

    container.innerHTML = `
      <div class="active-user-review-box">
        <div class="active-review-meta">
          <div class="active-review-stars" aria-label="${myReview.rating} stars">${stars}</div>
          <span class="active-review-status-pill">
            <span class="material-symbols-outlined" style="font-size:15px;">check_circle</span>
            Active Public Review
          </span>
        </div>
        <p class="active-review-text">“${escapeHtml(myReview.comment || '')}”</p>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <span style="font-size:12px;color:var(--muted);">Posted on ${escapeHtml(dateFormatted)}</span>
          <button type="button" class="btn-delete-review" id="deleteMyReviewBtn" aria-label="Delete my review">
            <span class="material-symbols-outlined">delete</span>
            <span>Delete My Review</span>
          </button>
        </div>
      </div>
    `;

    const deleteBtn = document.getElementById('deleteMyReviewBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteUserReview();
      });
    }
  } else {
    // Render Review Form
    let selectedRating = 5;

    container.innerHTML = `
      <form id="writeReviewForm" autocomplete="off" onsubmit="return false;">
        <label style="display:block;font-size:12px;font-weight:700;color:var(--ink);margin-bottom:6px;">Your Overall Rating</label>
        <div class="review-star-picker" id="reviewStarPicker" role="radiogroup" aria-label="Rate your experience from 1 to 5 stars">
          <button type="button" class="star-btn selected" data-rating="1" aria-label="1 star">★</button>
          <button type="button" class="star-btn selected" data-rating="2" aria-label="2 stars">★</button>
          <button type="button" class="star-btn selected" data-rating="3" aria-label="3 stars">★</button>
          <button type="button" class="star-btn selected" data-rating="4" aria-label="4 stars">★</button>
          <button type="button" class="star-btn selected" data-rating="5" aria-label="5 stars">★</button>
        </div>

        <label for="userReviewCommentInput" style="display:block;font-size:12px;font-weight:700;color:var(--ink);margin-bottom:6px;">Feedback &amp; Testimonial</label>
        <textarea id="userReviewCommentInput" class="review-textarea" rows="3" placeholder="How has CareWell helped you or your family manage daily medications and health routines?" required></textarea>

        <div style="display:flex;justify-content:flex-end;margin-top:6px;">
          <button type="button" class="btn-submit-review" id="submitUserReviewBtn">
            <span class="material-symbols-outlined">send</span>
            <span>Publish Review</span>
          </button>
        </div>
      </form>
    `;

    const picker = document.getElementById('reviewStarPicker');
    if (picker) {
      const starBtns = picker.querySelectorAll('.star-btn');
      
      const updateStarDisplay = (val) => {
        starBtns.forEach(btn => {
          const r = Number(btn.getAttribute('data-rating'));
          if (r <= val) {
            btn.classList.add('selected');
          } else {
            btn.classList.remove('selected');
          }
        });
      };

      starBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedRating = Number(btn.getAttribute('data-rating')) || 5;
          updateStarDisplay(selectedRating);
        });
        btn.addEventListener('mouseenter', () => {
          const hoverVal = Number(btn.getAttribute('data-rating')) || 5;
          starBtns.forEach(b => {
            const r = Number(b.getAttribute('data-rating'));
            b.classList.toggle('hovered', r <= hoverVal);
          });
        });
        btn.addEventListener('mouseleave', () => {
          starBtns.forEach(b => b.classList.remove('hovered'));
        });
      });
    }

    const submitBtn = document.getElementById('submitUserReviewBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const commentInput = document.getElementById('userReviewCommentInput');
        const text = commentInput ? commentInput.value.trim() : '';
        submitUserReview(selectedRating, text);
      });
    }
  }
}

/* ═══════════════════════════════════════════════
   Contact Our Team Modal & Clipboard Utility
   ═══════════════════════════════════════════════ */
function initContactTeamModal() {
  const openBtn = document.getElementById('openContactTeamBtn');
  const closeBtn = document.getElementById('closeContactTeamBtn');
  const overlay = document.getElementById('contactTeamModalOverlay');

  if (!overlay) return;

  function openContactModal() {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeContactModal() {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (openBtn) openBtn.addEventListener('click', openContactModal);
  if (closeBtn) closeBtn.addEventListener('click', closeContactModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeContactModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      closeContactModal();
    }
  });

  window.openContactTeamModal = openContactModal;
  window.closeContactTeamModal = closeContactModal;
}

window.copyContactValue = function(text, btnElement) {
  if (!text) return;
  
  const finishCopy = () => {
    if (btnElement) {
      const originalHTML = btnElement.innerHTML;
      btnElement.classList.add('copied');
      btnElement.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">check</span><span>Copied!</span>`;
      setTimeout(() => {
        btnElement.classList.remove('copied');
        btnElement.innerHTML = originalHTML;
      }, 2000);
    }
    showToast(`Copied to clipboard: ${text}`);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finishCopy).catch(() => {
      fallbackCopy(text);
      finishCopy();
    });
  } else {
    fallbackCopy(text);
    finishCopy();
  }
};

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch {}
  document.body.removeChild(ta);
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
    <article class="data-card user-review-settings-card" id="userReviewSettingsCard">
      <h2>⭐ Write Your Review &amp; Feedback</h2>
      <p>Share your experience with CareWell to inspire our healthcare community</p>
      <div id="userReviewSettingsContent" style="margin-top:16px;"></div>
    </article>
  `;

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

  renderSettingsReviewCard();
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

  document.querySelectorAll('[data-view]').forEach(item => {
    const dv = item.dataset.view || item.getAttribute('data-view');
    const isMatch = dv === view || 
      ((view === 'CounsellingSession' || view === 'Counselling' || view === 'MentalHealth' || view === 'Mental Health') && 
       (dv === 'CounsellingSession' || dv === 'Counselling' || dv === 'MentalHealth' || dv === 'Mental Health')) ||
      ((view === 'Today' || view === 'Dashboard') && (dv === 'Today' || dv === 'Dashboard'));
    item.classList.toggle('active', isMatch);
  });

  const viewNameEl = document.querySelector('#viewName');
  if (viewNameEl) {
    if (view === 'Today' || view === 'Dashboard') {
      viewNameEl.textContent = 'YOUR HEALTH, ON TRACK';
    } else if (view === 'CounsellingSession' || view === 'Counselling' || view === 'MentalHealth' || view === 'Mental Health') {
      viewNameEl.textContent = 'COUNSELLING SESSIONS';
    } else {
      viewNameEl.textContent = view.toUpperCase();
    }
  }

  const pageHeadingRight = document.querySelector('.page-heading-right');

  if (view === 'Today' || view === 'Dashboard') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return showToday();
  }

  if (pageHeadingRight) pageHeadingRight.style.display = 'none';
  if (medicineList) {
    medicineList.setAttribute('hidden', '');
    medicineList.style.display = 'none';
  }
  if (progressCard) {
    progressCard.setAttribute('hidden', '');
    progressCard.style.display = 'none';
  }
  if (dataView) {
    dataView.removeAttribute('hidden');
    dataView.style.display = 'grid';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (view === 'Settings') return showSettings();
  if (view === 'Pharmacy') return showPharmacy();
  if (view === 'CounsellingSession' || view === 'Counselling' || view === 'MentalHealth' || view === 'Mental Health') return showCounsellingSession();

  if (view === 'History') {
    document.querySelector('h1').textContent = 'Medication History';
    document.querySelector('.date').textContent = 'Your complete medication intake records';
    dataView.innerHTML = `
      <article class="data-card">
        <h2>📋 Medication History</h2>
        <p>Your complete medication intake logs and timestamps are stored securely in your CareWell account.</p>
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

/* ═══════════════════════════════════════════════
   Requirement 7: Dark Mode Toggle Manager
   ═══════════════════════════════════════════════ */
const THEME_KEY = 'carewell_theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);

  // Update toggle button icons
  const landingToggle = document.getElementById('themeToggleBtn');
  const appToggle = document.getElementById('appThemeToggleBtn');

  if (landingToggle) {
    const icon = landingToggle.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  }

  if (appToggle) {
    const icon = appToggle.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

function toggleTheme() {
  const current = getStoredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  notify(`🌓 Switched to ${next.toUpperCase()} mode.`);
}

function initThemeManager() {
  const savedTheme = getStoredTheme();
  applyTheme(savedTheme);

  const landingToggle = document.getElementById('themeToggleBtn');
  if (landingToggle) {
    landingToggle.addEventListener('click', toggleTheme);
  }

  const appToggle = document.getElementById('appThemeToggleBtn');
  if (appToggle) {
    appToggle.addEventListener('click', toggleTheme);
  }
}

/* ═══════════════════════════════════════════════
   Requirement 4: Floating 3D "CareWell AI" Bot & Web Speech Navigation
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   CareWell AI Assistant — Gemini API & Dual-Role Conversational Agent
   Role 1: Website Site Operator (Function Calling & Intent Triggering)
   Role 2: Healthcare & Human Body Knowledge Assistant
   ═══════════════════════════════════════════════ */
const GEMINI_CONFIG = {
  apiKey: (typeof process !== 'undefined' && process.env && (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)) || 
          (typeof window !== 'undefined' && (window.GEMINI_API_KEY || window.VITE_GEMINI_API_KEY)) || 
          '',
  models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest']
};

function initCareWellBotAndVoice() {
  const botContainer = document.getElementById('carewellBotContainer');
  const botAvatar = document.getElementById('botCharacterAvatar');
  const speechBubble = document.getElementById('botSpeechBubble');
  const chatDrawer = document.getElementById('carewellChatDrawer');
  const closeChatBtn = document.getElementById('closeChatBtn');
  const minimizeChatBtn = document.getElementById('minimizeChatBtn');
  const sendBtn = document.getElementById('chatDrawerSendBtn');
  const chatInput = document.getElementById('chatDrawerInput');
  const micBtn = document.getElementById('chatVoiceMicBtn');
  const micIcon = document.getElementById('chatMicIcon');
  const chatBody = document.getElementById('chatDrawerBody');

  if (!chatDrawer) return;

  // ── Authentication State Guard ──
  function isUserAuthenticated() {
    return document.body.classList.contains('user-authenticated') || 
           (typeof AuthManager !== 'undefined' && AuthManager.getToken && Boolean(AuthManager.getToken()));
  }

  function syncBotVisibility() {
    const bot = document.getElementById('carewellBotContainer');
    if (!bot) return;
    if (isUserAuthenticated()) {
      bot.style.setProperty('display', 'flex', 'important');
      bot.style.setProperty('visibility', 'visible', 'important');
      bot.style.setProperty('opacity', '1', 'important');
      bot.style.setProperty('position', 'fixed', 'important');
      bot.style.setProperty('bottom', '24px', 'important');
      bot.style.setProperty('right', '24px', 'important');
      bot.style.setProperty('z-index', '99999', 'important');
    } else {
      bot.style.setProperty('display', 'none', 'important');
      bot.style.setProperty('visibility', 'hidden', 'important');
      bot.style.setProperty('opacity', '0', 'important');
      closeDrawer();
    }
  }

  window.syncCareWellBotVisibility = syncBotVisibility;
  syncBotVisibility();

  function openDrawer() {
    if (!isUserAuthenticated()) return;
    chatDrawer.classList.add('active', 'open');
    chatDrawer.setAttribute('aria-hidden', 'false');
    if (chatInput) chatInput.focus();
  }

  function closeDrawer() {
    chatDrawer.classList.remove('active', 'open');
    chatDrawer.setAttribute('aria-hidden', 'true');
  }

  if (botAvatar) botAvatar.addEventListener('click', () => {
    (chatDrawer.classList.contains('active') || chatDrawer.classList.contains('open')) ? closeDrawer() : openDrawer();
  });

  if (speechBubble) speechBubble.addEventListener('click', openDrawer);
  if (closeChatBtn) closeChatBtn.addEventListener('click', closeDrawer);
  if (minimizeChatBtn) minimizeChatBtn.addEventListener('click', closeDrawer);

  // Quick Action Pills
  document.querySelectorAll('.chat-action-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const cmd = pill.getAttribute('data-command');
      handleBotAction(cmd);
    });
  });

  function handleBotAction(command) {
    switch (command) {
      case 'medication':
        addUserMessage('Show today’s medication schedule');
        addBotMessage('Opening your medication schedule for today. You can mark doses as taken or add new medicines here.');
        selectView('Today');
        break;
      case 'reports':
        addUserMessage('Track my progress & adherence report');
        addBotMessage('Here is your live real-time Weekly Adherence & Patient Compliance report.');
        selectView('Reports');
        break;
      case 'counselling':
      case 'mental_health':
        addUserMessage('I want to speak with a counselling specialist');
        addBotMessage('Opening our certified Counselling Session section. You can book an Audio, Video, or Private Chat session with top specialists.');
        selectView('CounsellingSession');
        break;
      case 'caregiver':
        addUserMessage('Open caregiver adherence overview');
        addBotMessage('Navigating to your Patient Medicine Report & Caregiver Adherence Dial.');
        selectView('Reports');
        break;
      case 'health_question':
        addUserMessage('I have a health question');
        addBotMessage('I am here to help! Please type or speak your symptoms, nutrition queries, medication details, or ask me to perform actions across the website.');
        break;
      default:
        break;
    }
  }

  function addUserMessage(text) {
    if (!chatBody) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg-bubble user';
    msg.textContent = text;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function addBotMessage(text, isHtml = false) {
    if (!chatBody) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg-bubble bot';
    if (isHtml) {
      msg.innerHTML = text;
    } else {
      msg.textContent = text;
    }
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function showTypingIndicator() {
    if (!chatBody) return null;
    const indicator = document.createElement('div');
    indicator.className = 'chat-typing-bubble';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    chatBody.appendChild(indicator);
    chatBody.scrollTop = chatBody.scrollHeight;
    return indicator;
  }

  // ── Dual-Role Gemini AI Integration ──
  async function queryGeminiAI(userQuery) {
    const systemPrompt = `You are CareWell AI, an empathetic, intelligent dual-role healthcare and wellness companion and site operator for the CarePill health platform.

You seamlessly perform TWO core roles:

1. WEBSITE SITE OPERATOR (Intent Triggering & Guidance):
- When the user asks to operate the website or view features, guide them warmly and clearly.
- Detect intents for:
  * Navigating to Counselling Sessions, Reports, Today's Schedule, Refills, Pharmacy, Settings, or Medication History.
  * Triggering Emergency SOS countdown protocol.
  * Adding a new medication schedule or dosage.
  * Marking medications as taken.
  * Querying live medication schedule, progress fraction, pending doses, inventory stock, or adherence score.
  * Toggling dark/light theme.

2. HEALTHCARE & HUMAN BODY KNOWLEDGE ASSISTANT:
- Answer general health, wellness, nutrition, anatomy, biology, and lifestyle queries clearly, accurately, and empathetically.
- Provide practical explanations for common symptoms, medical terms, anatomical functions, and healthy routines.
- ALWAYS append this polite standard medical disclaimer at the end of your response:
"\\n\\n*Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.*"

Keep responses concise (2 to 4 paragraphs maximum), clean, well formatted, and supportive.`;

    // 1. Try direct Google Gemini API call with fallback model list
    if (GEMINI_CONFIG.apiKey) {
      for (const model of GEMINI_CONFIG.models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
          const body = {
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userQuery }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 800
            }
          };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.ok) {
            const data = await res.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
              return data.candidates[0].content.parts[0].text;
            }
          }
        } catch {}
      }
    }

    // 2. Try backend endpoint proxy /api/ai/chat
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userQuery })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reply || data.response) {
          return data.reply || data.response;
        }
      }
    } catch {}

    return null;
  }

  function formatAIResponse(rawText) {
    if (!rawText) return '';
    // Format bold markdown and line breaks safely
    let formatted = escapeHtml(rawText)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');

    // Add disclaimer styling if present
    if (formatted.includes('Disclaimer:')) {
      formatted = formatted.replace(
        /(\*?Disclaimer:.*?\*?)$/i,
        '<span class="chat-disclaimer">⚠️ $1</span>'
      );
    }
    return formatted;
  }

  async function handleSendMessage() {
    if (!chatInput) return;
    const query = chatInput.value.trim();
    if (!query) return;

    addUserMessage(query);
    chatInput.value = '';

    const qLower = query.toLowerCase();

    // ── ROLE 1: Operator Site Commands Execution ──
    // Navigation Triggers
    if (qLower.includes('counselling') || qLower.includes('counsel') || qLower.includes('therapy') || qLower.includes('therapist') || qLower.includes('mental health') || qLower.includes('psychiatrist') || qLower.includes('book doctor') || qLower.includes('consult doctor')) {
      addBotMessage('🧠 Navigating to <strong>Counselling Session</strong> consultations and doctor appointments.', true);
      selectView('CounsellingSession');
      return;
    }
    if (qLower.includes('report') || qLower.includes('adherence') || qLower.includes('streak') || qLower.includes('compliance') || qLower.includes('caregiver')) {
      addBotMessage('📊 Opening your <strong>Patient Medicine Report &amp; Weekly Adherence Dial</strong>.', true);
      selectView('Reports');
      return;
    }
    if (qLower.includes('dashboard') || qLower.includes('today') || qLower.includes('home') || qLower.includes('main page')) {
      addBotMessage('🏠 Navigating to <strong>Today\'s Schedule &amp; Dashboard</strong>.', true);
      selectView('Today');
      return;
    }
    if (qLower.includes('schedule') && !qLower.includes('add') && !qLower.includes('new')) {
      addBotMessage('📅 Opening full <strong>Medication Schedule</strong> view.', true);
      selectView('Schedule');
      return;
    }
    if (qLower.includes('refill') || qLower.includes('order med') || qLower.includes('buy med') || qLower.includes('inventory')) {
      addBotMessage('💊 Opening <strong>Medication Refills &amp; Online Pharmacy</strong>.', true);
      selectView('Refills');
      return;
    }
    if (qLower.includes('pharmacy') || qLower.includes('chemist') || qLower.includes('near me') || qLower.includes('medical store')) {
      addBotMessage('📍 Opening <strong>Nearby Pharmacies &amp; Medical Stores</strong>.', true);
      selectView('Pharmacy');
      return;
    }
    if (qLower.includes('setting') || qLower.includes('profile') || qLower.includes('preference')) {
      addBotMessage('⚙️ Opening <strong>Settings &amp; Profile Preferences</strong>.', true);
      selectView('Settings');
      return;
    }
    if (qLower.includes('history') || qLower.includes('logs') || qLower.includes('past dose')) {
      addBotMessage('📋 Opening <strong>Medication History</strong> records.', true);
      selectView('History');
      return;
    }

    // Action Triggers
    if (qLower.includes('sos') || qLower.includes('emergency') || qLower.includes('ambulance') || qLower.includes('help me') || qLower.includes('panic')) {
      addBotMessage('🚨 <strong>Activating Emergency SOS countdown protocol!</strong>', true);
      if (typeof SOSManager !== 'undefined') SOSManager.openSOS();
      return;
    }
    if (qLower.includes('add med') || qLower.includes('new med') || qLower.includes('add schedule') || qLower.includes('new schedule') || qLower.includes('create schedule')) {
      addBotMessage('💊 Opening the <strong>New Medication Schedule</strong> dialog.', true);
      openScheduleModal();
      return;
    }
    if (qLower.includes('mark taken') || qLower.includes('mark as taken') || qLower.includes('took my medicine') || qLower.includes('taken morning')) {
      const meds = getLocalMedications();
      const pending = meds.find(m => m.status !== 'taken');
      if (pending) {
        updateLocalDose(pending.id, 'taken');
        renderDashboard(getLocalDashboard());
        addBotMessage(`✅ Marked <strong>${escapeHtml(pending.name)}</strong> as taken for today.`, true);
      } else {
        addBotMessage('All your scheduled doses for today are already marked as taken! 🌟');
      }
      return;
    }
    if (qLower.includes('dark mode') || qLower.includes('light mode') || qLower.includes('toggle theme') || qLower.includes('change theme')) {
      toggleTheme();
      addBotMessage('🌓 Theme toggled successfully.');
      return;
    }

    // Live Site Data Queries
    if (qLower.includes('what med') || qLower.includes('medicines scheduled') || qLower.includes('what is scheduled') || qLower.includes('scheduled today') || qLower.includes('today\'s med') || qLower.includes('my medications')) {
      const meds = getLocalMedications();
      if (!meds.length) {
        addBotMessage('You currently have <strong>0 medications scheduled for today</strong>. Would you like to add one by clicking <a href="javascript:openScheduleModal()" style="color:var(--teal);text-decoration:underline;">+ New Schedule</a>?', true);
      } else {
        const medListStr = meds.map((m, i) => `${i + 1}. <strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.dosage)}) at ⏰ <em>${escapeHtml(m.scheduled_time)}</em> — ${m.status === 'taken' ? '✅ Taken' : '⏳ Pending'}`).join('<br>');
        addBotMessage(`Here are your scheduled medications for today:<br><br>${medListStr}`, true);
      }
      return;
    }

    if (qLower.includes('progress') || qLower.includes('how many taken') || qLower.includes('doses taken') || qLower.includes('daily progress') || qLower.includes('how much taken')) {
      const meds = getLocalMedications();
      const total = meds.length;
      const taken = meds.filter(m => m.status === 'taken').length;
      const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
      addBotMessage(`Your daily medication progress is strictly <strong>${taken} of ${total} taken</strong> (${pct}% completed). ${total === 0 ? 'No active schedules added yet.' : pct === 100 ? 'All doses taken for today! Wonderful job! 🎉' : `You have ${total - taken} pending dose(s) remaining.`}`, true);
      return;
    }

    if (qLower.includes('pending') || qLower.includes('how many pending') || qLower.includes('what is pending') || qLower.includes('remaining doses')) {
      const meds = getLocalMedications();
      const pending = meds.filter(m => m.status !== 'taken');
      if (pending.length === 0) {
        addBotMessage('You currently have <strong>0 pending doses</strong> for today! Everything is complete or no schedules are active.', true);
      } else {
        const pStr = pending.map((m, i) => `${i + 1}. <strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.dosage)}) scheduled at ⏰ ${escapeHtml(m.scheduled_time)}`).join('<br>');
        addBotMessage(`You have <strong>${pending.length} pending dose(s)</strong> remaining for today:<br><br>${pStr}`, true);
      }
      return;
    }

    if (qLower.includes('stock') || qLower.includes('refill status') || qLower.includes('low stock') || qLower.includes('inventory status')) {
      const meds = getLocalMedications();
      if (!meds.length) {
        addBotMessage('No medications currently registered in your inventory.');
      } else {
        const lowMeds = meds.filter(m => Number(m.stock) <= 8);
        if (lowMeds.length > 0) {
          const lowStr = lowMeds.map(m => `⚠️ <strong>${escapeHtml(m.name)}</strong>: ${m.stock} doses remaining (Refill recommended)`).join('<br>');
          addBotMessage(`<strong>Inventory Stock Alert:</strong><br><br>${lowStr}<br><br><a href="javascript:selectView('Refills')" style="color:var(--teal);text-decoration:underline;">Click here to view Refills &amp; Buy Online</a>.`, true);
        } else {
          addBotMessage(`✅ All your medication stocks are currently sufficient (> 8 doses remaining for all ${meds.length} medicines).`);
        }
      }
      return;
    }

    if (qLower.includes('adherence') || qLower.includes('compliance rate') || qLower.includes('my score') || qLower.includes('my streak')) {
      const reportData = getLocalWeeklyReports();
      const meds = getLocalMedications();
      const adherence = reportData.adherence !== undefined ? reportData.adherence : (meds.length ? Math.round(meds.reduce((sum, m) => sum + (m.adherence || 95), 0) / meds.length) : 100);
      const streak = reportData.streak || 1;
      addBotMessage(`Your real-time 7-day adherence score is <strong>${adherence}%</strong> with an active streak of <strong>${streak} days</strong>! 🔥`, true);
      return;
    }

    // ── ROLE 2: Healthcare & Human Body Knowledge Assistant (Gemini API) ──
    const typingIndicator = showTypingIndicator();

    const aiReply = await queryGeminiAI(query);
    if (typingIndicator) typingIndicator.remove();

    if (aiReply) {
      addBotMessage(formatAIResponse(aiReply), true);
      return;
    }

    // Smart empathetic local fallback
    let smartReply = 'I understand your health query. For your current routine, ensure you stay hydrated, maintain balanced nutrition, and keep consistent sleep cycles.\n\n⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.';
    if (qLower.includes('headache') || qLower.includes('pain') || qLower.includes('fever')) {
      smartReply = 'If you are experiencing mild pain or fever, ensure adequate hydration and rest in a quiet, dark room. If symptoms persist or worsen, please consult a healthcare professional immediately in Counselling Sessions or trigger Emergency SOS.\n\n⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.';
    } else if (qLower.includes('anxiety') || qLower.includes('stress') || qLower.includes('sad') || qLower.includes('sleep') || qLower.includes('heart')) {
      smartReply = 'For stress or elevated anxiety, try the 4-7-8 breathing technique: inhale for 4 seconds, hold for 7 seconds, and exhale slowly for 8 seconds. You can also book a confidential 1-on-1 session with our licensed therapists in the Counselling Session section.\n\n⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.';
    } else if (qLower.includes('nutrition') || qLower.includes('diet') || qLower.includes('food') || qLower.includes('vitamin')) {
      smartReply = 'A balanced diet rich in leafy greens, whole grains, healthy fats, and adequate protein supports optimal cognitive and immune performance. Always take fat-soluble vitamins (like Vitamin D) alongside healthy meals.\n\n⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.';
    }
    addBotMessage(formatAIResponse(smartReply), true);
  }

  if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  // Web Speech API Voice Navigation
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec && micBtn) {
    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let isListening = false;

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('listening');
      if (micIcon) micIcon.textContent = 'settings_voice';
      notify('🎙️ Listening… Speak command (e.g., "Book doctor", "Show reports", "Add medicine", "Trigger SOS")');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (chatInput) chatInput.value = transcript;
      openDrawer();
      handleSendMessage();
    };

    recognition.onerror = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      if (micIcon) micIcon.textContent = 'mic';
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      if (micIcon) micIcon.textContent = 'mic';
    };

    micBtn.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch {
          recognition.stop();
        }
      }
    });
  } else if (micBtn) {
    micBtn.addEventListener('click', () => {
      notify('ℹ️ Voice recognition is supported in Chrome, Edge, and Safari.');
    });
  }
}

function bindDoctorBookingEvents() {
  const closeBtn = document.getElementById('closeDoctorBookingBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeDoctorBookingModal);

  const overlay = document.getElementById('doctorBookingModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDoctorBookingModal();
    });
  }

  const form = document.getElementById('doctorBookingForm');
  if (form) form.addEventListener('submit', handleDoctorBookingSubmit);
}

function bindLandingGetStartedButtons() {
  const heroBtn = document.getElementById('getStartedHeroBtn');
  if (heroBtn) {
    heroBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof AuthManager !== 'undefined') AuthManager.openAuthModal(false);
    });
  }

  document.querySelectorAll('.carewell-card-widget').forEach(card => {
    card.addEventListener('click', () => {
      if (typeof AuthManager !== 'undefined') AuthManager.openAuthModal(false);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  showLoader();
  initThemeManager();
  initEditableName();
  bindLiveCameraEvents();
  bindProfilePictureEvents();
  bindPendingBadge();
  bindDoctorBookingEvents();
  bindLandingGetStartedButtons();
  initCareWellBotAndVoice();

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
      const parent = label.closest('.sched-icons-picker') || label.parentElement;
      if (parent) {
        parent.querySelectorAll('.icon-radio').forEach(l => l.classList.remove('active'));
      }
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

  // Global delegated click listener for navigation & SOS
  document.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      const viewName = viewBtn.dataset.view || viewBtn.getAttribute('data-view');
      if (viewName) {
        selectView(viewName);
        if (sidebar && sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
          if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        }
      }
    }

    const sosBtn = e.target.closest('#emergency') || e.target.closest('.emergency');
    if (sosBtn && !e.target.closest('#sosModalOverlay') && !e.target.closest('.sos-modal')) {
      if (typeof SOSManager !== 'undefined') SOSManager.openSOS();
    }
  });

  bindMedicineCardActions();
  initContactTeamModal();
  renderLandingTestimonials();
  fetchLiveReviews();
  loadDashboard();
});

// Window exposure for inline onclick attributes
window.selectView = selectView;
window.openDoctorBookingModal = openDoctorBookingModal;
window.closeDoctorBookingModal = closeDoctorBookingModal;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.openProfilePicModal = openProfilePicModal;
window.closeProfilePicModal = closeProfilePicModal;
window.deleteScheduleItem = deleteScheduleItem;
window.renderDashboard = renderDashboard;
window.renderLandingTestimonials = renderLandingTestimonials;
window.submitUserReview = submitUserReview;
window.deleteUserReview = deleteUserReview;

