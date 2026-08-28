/* ═══════════════════════════════════════════════
   CarePill — Main Application Controller
   Schedule Creation, Views, Refills & Pharmacy Widget
   ═══════════════════════════════════════════════ */

const toast = document.querySelector('#toast');
const dataView = document.querySelector('#dataView');
const medicineList = document.querySelector('.medicine-list');
const progressCard = document.querySelector('.progress-card');
let toastTimer;

/* ── Response cache (15s TTL) ── */
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

/* ── AbortController for in-flight requests ── */
let activeController = null;

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

    // Re-render medicine cards dynamically if count or items changed
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
      try {
        const result = await requestDose(card, 'taken');
        renderDashboard(result.dashboard);
        notify(`✅ ${card.dataset.medicine} marked as taken.`);
      } catch (error) {
        notify(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('.snooze').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.medicine-card');
      try {
        await requestDose(card, 'snoozed');
        notify(`⏰ ${card.dataset.medicine} snoozed for 15 minutes.`);
      } catch (error) {
        notify(error.message);
      }
    });
  });

  document.querySelectorAll('.dismiss').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.medicine-card');
      try {
        const result = await requestDose(card, 'dismissed');
        renderDashboard(result.dashboard);
        notify(`${card.dataset.medicine} dismissed for today.`);
      } catch (error) {
        notify(error.message);
      }
    });
  });
}

async function getJson(url) {
  const cached = getCached(url);
  if (cached) return cached;

  if (activeController) activeController.abort();
  activeController = new AbortController();

  const response = await fetch(url, { signal: activeController.signal });
  if (!response.ok) throw new Error('Could not load data.');
  const data = await response.json();
  setCache(url, data);
  return data;
}

async function requestDose(card, action) {
  const response = await fetch(`/api/medications/${card.dataset.id}/dose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error('Could not save your medication action.');
  invalidateCache('/api/dashboard');
  return response.json();
}

async function loadDashboard() {
  try {
    const data = await getJson('/api/dashboard');
    renderDashboard(data);
  } catch {
    notify('Using local preview — changes will sync once backend is ready.');
  }
}

/* ── Auto-refresh dashboard every 30s ── */
let refreshInterval = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshInterval = setInterval(() => {
    invalidateCache('/api/dashboard');
    loadDashboard();
  }, 30000);
}
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/* ── View Debounce & Router ── */
let viewDebounceTimer = null;
let currentView = 'Today';

function showToday() {
  dataView.hidden = true;
  if (medicineList) medicineList.hidden = false;
  if (progressCard) progressCard.hidden = false;
  document.querySelector('h1').textContent = "Today's Schedule";
  document.querySelector('.date').textContent = 'Your medication plan for today';
  loadDashboard();
  startAutoRefresh();
}

function showSchedule(data) {
  document.querySelector('h1').textContent = 'Medication Schedule';
  document.querySelector('.date').textContent = 'All doses planned for today';

  const rows = data.medications.map(m => `
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
          <p style="margin:0;color:var(--muted);font-size:13px;">${data.medications.length} medications scheduled</p>
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
  document.querySelector('h1').textContent = 'Refills';
  document.querySelector('.date').textContent = `Refill reminder at ${data.threshold} doses or fewer`;

  const rows = data.medications.map(m => `
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

    <!-- Integrated Nearby Medical Shops Widget -->
    <div class="locate-card">
      <div class="section-title">
        <h2>Nearby Medical Shops</h2>
        <span>Refill support</span>
      </div>
      <p class="locate-desc">Medicines running low? Find a pharmacy close to you to get a refill sorted immediately.</p>

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
    </div>
  `;

  bindLocateWidget();
}

function showReports(data) {
  const meds = data.patient_medicines;
  const adherence = Math.round(meds.reduce((sum, medicine) => sum + medicine.adherence, 0) / meds.length);
  const lowStock = meds.filter(medicine => medicine.low_stock).length;
  const days = data.days.map(day => {
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
  document.querySelector('.date').textContent = 'Active medication plan · Report date: Today';

  dataView.innerHTML = `
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
          <div class="ma-stat ok"><strong>${data.taken}</strong><span>Taken Today</span></div>
          <div class="ma-stat"><strong>${Math.max(0, data.scheduled - data.taken)}</strong><span>Unrecorded Doses</span></div>
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
}

function showSettings() {
  document.querySelector('h1').textContent = 'Settings';
  document.querySelector('.date').textContent = 'Manage ringtones & preferences';
  let html = '';

  if (typeof AlarmManager !== 'undefined') html += AlarmManager.renderSettings();
  if (typeof SOSManager !== 'undefined') html += SOSManager.renderSettings();

  html += `
    <article class="data-card">
      <h2>👤 Account &amp; System</h2>
      <p>CarePill v2.0.0 · Medicine Management System</p>
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

  document.querySelectorAll('[data-auth="logout"]').forEach(b => {
    b.addEventListener('click', () => {
      if (typeof AuthManager !== 'undefined') AuthManager.logout();
    });
  });
}

function showPharmacy() {
  document.querySelector('h1').textContent = 'Nearby Pharmacies';
  document.querySelector('.date').textContent = 'Find medical shops & refill partners';

  dataView.innerHTML = `
    <div class="locate-card" style="margin-top:0;">
      <div class="section-title">
        <h2>Nearby Medical Shops</h2>
        <span>Refill support</span>
      </div>
      <p class="locate-desc">Search for pharmacies and 24/7 chemist stores around your location to purchase medicines.</p>

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
    </div>
  `;

  bindLocateWidget();
}

/* ── Nearby Medical Shops Widget Event Binder ── */
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
    locateBtn.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        statusEl.textContent = "Location access isn't supported on this device — try the manual search instead.";
        statusEl.classList.add('err');
        return;
      }
      statusEl.classList.remove('err');
      statusEl.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          statusEl.textContent = 'Opening nearby pharmacies on Google Maps…';
          openPharmacyNearCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          statusEl.textContent = "Couldn't access your location — please allow permission, or search manually below.";
          statusEl.classList.add('err');
        },
        { timeout: 8000 }
      );
    });
  }

  if (manualBtn) {
    manualBtn.addEventListener('click', () => {
      const q = manualLoc.value.trim();
      if (!q) {
        statusEl.textContent = 'Enter an area, city or pincode first.';
        statusEl.classList.add('err');
        return;
      }
      statusEl.classList.remove('err');
      statusEl.textContent = `Searching pharmacies near "${q}"…`;
      openPharmacyMap(`pharmacy near ${q}`);
    });
  }

  if (manualLoc) {
    manualLoc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') manualBtn.click();
    });
  }

  shortcutBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const med = btn.dataset.med;
      const area = manualLoc ? manualLoc.value.trim() : '';
      statusEl.classList.remove('err');
      statusEl.textContent = `Searching pharmacies that stock ${med}…`;
      openPharmacyMap(area ? `pharmacy ${med} near ${area}` : `pharmacy near me`);
    });
  });
}

/* ── View Router ── */
async function selectView(view) {
  clearTimeout(viewDebounceTimer);
  viewDebounceTimer = setTimeout(async () => {
    currentView = view;
    stopAutoRefresh();

    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    document.querySelector('#viewName').textContent = view === 'Today' ? 'YOUR HEALTH, ON TRACK' : view.toUpperCase();

    if (view === 'Today') return showToday();

    if (medicineList) medicineList.hidden = true;
    if (progressCard) progressCard.hidden = true;
    dataView.hidden = false;

    if (view === 'Settings') return showSettings();
    if (view === 'Pharmacy') return showPharmacy();

    if (view === 'History') {
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

    dataView.innerHTML = '<article class="data-card">Loading…</article>';

    try {
      const data = await getJson(view === 'Reports' ? '/api/reports/weekly' : `/api/${view.toLowerCase()}`);
      ({ Schedule: showSchedule, Refills: showRefills, Reports: showReports })[view](data);
    } catch (error) {
      if (error.name !== 'AbortError') {
        dataView.innerHTML = `<article class="data-card">${escapeHtml(error.message)}</article>`;
      }
    }
  }, 80);
}

/* ── Schedule Creation Modal Manager ── */
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

  errEl.classList.remove('visible');
  succEl.classList.remove('visible');

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

    const res = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || 'Could not save medication schedule.');
    }

    succText.textContent = `✨ Schedule for "${medName}" saved with Doctor's prescription!`;
    succEl.classList.add('visible');

    invalidateCache('/api/dashboard');
    invalidateCache('/api/schedule');
    invalidateCache('/api/refills');

    setTimeout(() => {
      closeScheduleModal();
      document.getElementById('newScheduleForm').reset();
      notify(`✅ "${medName}" added to your medication schedule.`);
      selectView('Today');
    }, 700);

  } catch (err) {
    errText.textContent = err.message || 'Failed to save schedule.';
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined">add_task</span> Save Medication Schedule`;
  }
}

/* ── Global Init & Event Setup ── */
document.addEventListener('DOMContentLoaded', () => {
  // Bind new schedule buttons
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

  // Bind schedule form submit
  const schedForm = document.getElementById('newScheduleForm');
  if (schedForm) schedForm.addEventListener('submit', handleScheduleSubmit);

  // Bind icon picker radios
  document.querySelectorAll('.icon-radio').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.icon-radio').forEach(l => l.classList.remove('active'));
      label.classList.add('active');
    });
  });

  // Mobile sidebar menu toggle
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

  // Navigation items
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      selectView(button.dataset.view);
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      }
    });
  });

  // Emergency SOS button
  const emergencyBtn = document.getElementById('emergency');
  if (emergencyBtn) {
    emergencyBtn.addEventListener('click', () => {
      if (typeof SOSManager !== 'undefined') SOSManager.openSOS();
      else notify('Emergency SOS feature is active.');
    });
  }

  // Initial load
  bindMedicineCardActions();
  loadDashboard();
});
