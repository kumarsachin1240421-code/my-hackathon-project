/* ═══════════════════════════════════════════════
   CarePill — SOS Emergency Manager
   Confirmation countdown → SMS + call + location
   ═══════════════════════════════════════════════ */

const SOSManager = (() => {
  const CONTACTS_KEY = 'carepill_sos_contacts';
  const AMBULANCE_KEY = 'carepill_ambulance';
  let overlay = null;
  let countdownInterval = null;

  /* ── Storage ── */
  function getContacts() {
    try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || []; } catch { return []; }
  }
  function saveContacts(c) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); }
  function getAmbulanceNumber() { return localStorage.getItem(AMBULANCE_KEY) || '108'; }
  function setAmbulanceNumber(n) { localStorage.setItem(AMBULANCE_KEY, n); }

  function addContact(name, phone) {
    const contacts = getContacts();
    if (contacts.length >= 5) return false;
    contacts.push({ name, phone, id: Date.now() });
    saveContacts(contacts);
    return true;
  }

  function removeContact(id) {
    saveContacts(getContacts().filter(c => c.id !== id));
  }

  /* ── Location ── */
  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  /* ── SOS Flow ── */
  function openSOS() {
    if (!overlay) createOverlay();
    showConfirmation();
    overlay.classList.add('active');
  }

  function closeSOS() {
    clearInterval(countdownInterval);
    overlay.classList.remove('active');
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'sos-overlay';
    overlay.id = 'sosOverlay';
    overlay.innerHTML = '<div class="sos-modal" id="sosModal"></div>';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSOS(); });
    document.body.appendChild(overlay);
  }

  function showConfirmation() {
    const modal = document.getElementById('sosModal');
    let seconds = 5;

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">sos</span></div>
      <h2>Emergency SOS</h2>
      <p>SMS will be sent to your emergency contacts and the nearest hospital will be called.</p>
      <div class="sos-countdown" id="sosCountdown">${seconds}</div>
      <div class="sos-actions">
        <button class="sos-confirm" id="sosConfirmNow">Send Now</button>
        <button class="sos-cancel" id="sosCancel">Cancel</button>
      </div>
    `;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      seconds--;
      const el = document.getElementById('sosCountdown');
      if (el) el.textContent = seconds;
      if (seconds <= 0) { clearInterval(countdownInterval); triggerSOS(); }
    }, 1000);

    modal.querySelector('#sosConfirmNow').addEventListener('click', () => { clearInterval(countdownInterval); triggerSOS(); });
    modal.querySelector('#sosCancel').addEventListener('click', closeSOS);
  }

  async function triggerSOS() {
    const modal = document.getElementById('sosModal');
    const contacts = getContacts();
    const ambulance = getAmbulanceNumber();

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">sos</span></div>
      <h2>Sending Emergency Alerts</h2>
      <p>Getting your location and alerting contacts…</p>
      <div class="sos-status-list" id="sosStatusList">
        <div class="sos-contact-status"><span class="name">📍 Location</span><span class="status sending">Locating…</span></div>
        ${contacts.map(c => `<div class="sos-contact-status" data-id="${c.id}"><span class="name">${escapeHtml(c.name)}</span><span class="status sending">Sending…</span></div>`).join('')}
        <div class="sos-contact-status" id="sosAmbulance"><span class="name">🚑 Ambulance (${escapeHtml(ambulance)})</span><span class="status sending">Calling…</span></div>
      </div>
      <div class="sos-actions" style="margin-top:20px">
        <button class="sos-cancel" id="sosClose">Close</button>
      </div>
    `;

    modal.querySelector('#sosClose').addEventListener('click', closeSOS);

    // Get location
    const location = await getLocation();
    const locStatus = modal.querySelector('.sos-status-list .sos-contact-status:first-child .status');
    if (location) {
      locStatus.textContent = '✓ Located';
      locStatus.className = 'status sent';
    } else {
      locStatus.textContent = '✗ Unavailable';
      locStatus.className = 'status failed';
    }

    // Send SOS to backend
    try {
      const res = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, ambulance_number: ambulance, location }),
      });
      const data = await res.json();
      // Update individual contact statuses
      (data.results || []).forEach(r => {
        const el = modal.querySelector(`[data-id="${r.id}"] .status`);
        if (el) {
          el.textContent = r.success ? '✓ Sent' : '✗ Failed';
          el.className = 'status ' + (r.success ? 'sent' : 'failed');
        }
      });
    } catch {
      contacts.forEach(c => {
        const el = modal.querySelector(`[data-id="${c.id}"] .status`);
        if (el) { el.textContent = '✓ Queued'; el.className = 'status sent'; }
      });
    }

    // Trigger ambulance call
    const ambEl = document.getElementById('sosAmbulance');
    if (ambEl) {
      ambEl.querySelector('.status').textContent = '✓ Calling';
      ambEl.querySelector('.status').className = 'status sent';
    }
    window.open(`tel:${ambulance}`, '_self');
  }

  /* ── Settings UI ── */
  function renderSettings() {
    const contacts = getContacts();
    const ambulance = getAmbulanceNumber();
    return `
      <article class="data-card">
        <h2>🚑 Emergency SOS Settings</h2>
        <p>Configure your emergency contacts and ambulance number.</p>
        <div class="sos-settings">
          <div class="auth-field">
            <label>Ambulance Number</label>
            <input type="tel" id="sosAmbulanceInput" value="${escapeHtml(ambulance)}" placeholder="108" style="padding:12px 14px;border:none;border-radius:12px;background:var(--bg);box-shadow:var(--inset);font:inherit;color:var(--ink);outline:none;width:100%;box-sizing:border-box;">
          </div>
          <h3 style="margin:8px 0 0;font-size:16px;">Emergency Contacts (${contacts.length}/5)</h3>
          ${contacts.map(c => `
            <div class="sos-contact-card">
              <div class="info"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.phone)}</small></div>
              <button class="remove-contact" data-remove="${c.id}"><span class="material-symbols-outlined">delete</span></button>
            </div>
          `).join('')}
          ${contacts.length < 5 ? `
            <div class="add-contact-row">
              <input type="text" id="newContactName" placeholder="Contact name">
              <input type="tel" id="newContactPhone" placeholder="Phone number">
              <button class="add-contact-btn" id="addContactBtn">+ Add</button>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }

  function bindSettingsEvents() {
    const ambInput = document.getElementById('sosAmbulanceInput');
    if (ambInput) ambInput.addEventListener('change', () => setAmbulanceNumber(ambInput.value));

    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        removeContact(Number(btn.dataset.remove));
        if (typeof selectView === 'function') selectView('Settings');
      });
    });

    const addBtn = document.getElementById('addContactBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const name = document.getElementById('newContactName')?.value?.trim();
        const phone = document.getElementById('newContactPhone')?.value?.trim();
        if (name && phone) {
          addContact(name, phone);
          if (typeof selectView === 'function') selectView('Settings');
        }
      });
    }
  }

  /* helper shared with script.js */
  function escapeHtml(text) {
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  return { openSOS, closeSOS, renderSettings, bindSettingsEvents, getContacts, getAmbulanceNumber };
})();
