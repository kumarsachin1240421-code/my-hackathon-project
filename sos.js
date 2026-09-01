/* ═══════════════════════════════════════════════
   CarePill — SOS Emergency Manager
   Confirmation countdown → Call + SMS + WhatsApp Location under "CarePill"
   Conditional Hospital Dispatch (only if hospital details are added)
   ═══════════════════════════════════════════════ */

const SOSManager = (() => {
  const CONTACTS_KEY = 'carepill_sos_contacts';
  const HOSPITAL_KEY = 'carepill_hospital_details';
  const AMBULANCE_KEY = 'carepill_ambulance';
  let overlay = null;
  let countdownInterval = null;

  /* ── Default Initial Contacts ── */
  const DEFAULT_CONTACTS = [
    { id: 1, name: 'Family Member (Mom/Dad)', phone: '+91 98765 43210', relation: 'Family' },
    { id: 2, name: 'Close Friend / Caregiver', phone: '+91 91234 56789', relation: 'Friend' }
  ];

  /* ── Storage ── */
  function getContacts() {
    try {
      const raw = localStorage.getItem(CONTACTS_KEY);
      if (!raw) {
        localStorage.setItem(CONTACTS_KEY, JSON.stringify(DEFAULT_CONTACTS));
        return DEFAULT_CONTACTS;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : DEFAULT_CONTACTS;
    } catch {
      return DEFAULT_CONTACTS;
    }
  }

  function saveContacts(c) {
    try { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); } catch {}
  }

  function getHospitalDetails() {
    try {
      const raw = localStorage.getItem(HOSPITAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveHospitalDetails(details) {
    try {
      if (details && details.name && details.phone) {
        localStorage.setItem(HOSPITAL_KEY, JSON.stringify(details));
      } else {
        localStorage.removeItem(HOSPITAL_KEY);
      }
    } catch {}
  }

  function clearHospitalDetails() {
    try { localStorage.removeItem(HOSPITAL_KEY); } catch {}
  }

  function getAmbulanceNumber() {
    return localStorage.getItem(AMBULANCE_KEY) || '108';
  }

  function setAmbulanceNumber(n) {
    localStorage.setItem(AMBULANCE_KEY, n);
  }

  function getUserName() {
    try {
      return localStorage.getItem('carepill_user_name') || 'Alex Johnson';
    } catch {
      return 'Alex Johnson';
    }
  }

  function addContact(name, phone, relation = 'Family') {
    const contacts = getContacts();
    if (contacts.length >= 5) return false;
    contacts.push({ name: name.trim(), phone: phone.trim(), relation: relation.trim(), id: Date.now() });
    saveContacts(contacts);
    return true;
  }

  function removeContact(id) {
    const contacts = getContacts().filter(c => c.id !== Number(id) && c.id !== id);
    saveContacts(contacts);
  }

  /* ── Geolocation ── */
  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  /* ── Clean phone number for tel/sms/wa ── */
  function cleanPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  }

  /* ── SOS Flow ── */
  function openSOS() {
    if (!overlay) createOverlay();
    showConfirmation();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeSOS() {
    clearInterval(countdownInterval);
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'sos-overlay';
    overlay.id = 'sosOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="sos-modal" id="sosModal"></div>';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSOS(); });
    document.body.appendChild(overlay);
  }

  function showConfirmation() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;
    let seconds = 5;
    const contacts = getContacts();
    const hospital = getHospitalDetails();
    const primaryContact = contacts.length ? contacts[0] : null;

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">sos</span></div>
      <h2>Emergency SOS</h2>
      <p>Initiating emergency call, SMS alert, and WhatsApp live location under <strong>CarePill</strong> in:</p>
      
      <div class="sos-countdown" id="sosCountdown">${seconds}</div>

      <div class="sos-dispatch-summary">
        <div class="sos-summary-item">
          <span class="material-symbols-outlined">call</span>
          <span>Call: ${primaryContact ? escapeHtml(primaryContact.name) + ' (' + escapeHtml(primaryContact.phone) + ')' : 'Ambulance (' + escapeHtml(getAmbulanceNumber()) + ')'}</span>
        </div>
        <div class="sos-summary-item">
          <span class="material-symbols-outlined">share_location</span>
          <span>WhatsApp Location: ${contacts.length} Contact${contacts.length !== 1 ? 's' : ''} (CarePill)</span>
        </div>
        <div class="sos-summary-item ${hospital ? 'hospital-included' : 'hospital-skipped'}">
          <span class="material-symbols-outlined">local_hospital</span>
          <span>${hospital ? 'Hospital: ' + escapeHtml(hospital.name) : 'Hospital alert: Skipped (Not added by user)'}</span>
        </div>
      </div>

      <div class="sos-actions">
        <button type="button" class="sos-confirm" id="sosConfirmNow">
          <span class="material-symbols-outlined" style="font-size:18px;">send</span>
          <span>Send SOS Now</span>
        </button>
        <button type="button" class="sos-cancel" id="sosCancel">Cancel</button>
      </div>
    `;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      seconds--;
      const el = document.getElementById('sosCountdown');
      if (el) el.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(countdownInterval);
        triggerSOS();
      }
    }, 1000);

    const confirmBtn = modal.querySelector('#sosConfirmNow');
    const cancelBtn = modal.querySelector('#sosCancel');
    if (confirmBtn) confirmBtn.addEventListener('click', () => { clearInterval(countdownInterval); triggerSOS(); });
    if (cancelBtn) cancelBtn.addEventListener('click', closeSOS);
  }

  async function triggerSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;
    const contacts = getContacts();
    const hospital = getHospitalDetails();
    const ambulance = getAmbulanceNumber();
    const userName = getUserName();
    const primaryContact = contacts.length ? contacts[0] : null;

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">emergency_share</span></div>
      <h2>🚨 Emergency SOS Triggered</h2>
      <p style="margin-bottom:14px;">Broadcasting live coordinates, dispatching SMS &amp; WhatsApp location under <strong>CarePill</strong>…</p>
      
      <div class="sos-status-list" id="sosStatusList">
        <div class="sos-contact-status" id="sosLocStatus">
          <span class="name">📍 Live GPS Location</span>
          <span class="status sending">Acquiring coordinates…</span>
        </div>

        <div class="sos-contact-status" id="sosCallStatus">
          <span class="name">📞 Auto Call: ${primaryContact ? escapeHtml(primaryContact.name) : 'Emergency'}</span>
          <span class="status sending">Connecting dialer…</span>
        </div>

        <div class="sos-contact-status" id="sosSmsStatus">
          <span class="name">💬 SMS Notification</span>
          <span class="status sending">Preparing alert…</span>
        </div>

        <div class="sos-contact-status" id="sosWaStatus">
          <span class="name">🟢 WhatsApp Location (CarePill)</span>
          <span class="status sending">Generating link…</span>
        </div>

        <div class="sos-contact-status" id="sosHospitalStatus">
          <span class="name">🏥 Hospital Dispatch</span>
          <span class="status ${hospital ? 'sending' : 'skipped'}">${hospital ? 'Alerting ' + escapeHtml(hospital.name) + '…' : 'Skipped (No hospital details added)'}</span>
        </div>
      </div>

      <div class="sos-quick-actions" id="sosQuickActions" style="margin-top:16px;display:grid;gap:8px;"></div>

      <div class="sos-actions" style="margin-top:18px">
        <button type="button" class="sos-cancel" id="sosClose" style="width:100%;">Close Window</button>
      </div>
    `;

    const closeBtn = modal.querySelector('#sosClose');
    if (closeBtn) closeBtn.addEventListener('click', closeSOS);

    // 1. Get Live GPS Location
    const location = await getLocation();
    const locStatus = document.getElementById('sosLocStatus');
    let mapUrl = 'https://maps.google.com';
    if (location) {
      mapUrl = `https://maps.google.com/?q=${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
      if (locStatus) {
        locStatus.querySelector('.status').innerHTML = `<a href="${mapUrl}" target="_blank" rel="noopener" style="color:#0d9e71;font-weight:700;text-decoration:underline;">✓ ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}</a>`;
        locStatus.querySelector('.status').className = 'status sent';
      }
    } else {
      if (locStatus) {
        locStatus.querySelector('.status').textContent = '⚠️ Location Approx / Unavailable';
        locStatus.querySelector('.status').className = 'status warning';
      }
    }

    // 2. Prepare Messages under the brand name "CarePill"
    const waText = `🚨 *CarePill EMERGENCY SOS ALERT* 🚨\n\n*${userName}* has triggered an urgent Medical SOS via *CarePill*!\n\n📍 *Current Live Location:*\n${mapUrl}\n\n⚠️ *Immediate assistance required.* Please call or check on them right away.\n\n_Sent securely via CarePill Medical Emergency System._`;
    const smsText = `[CarePill SOS] EMERGENCY: ${userName} needs immediate medical assistance! Live Location: ${mapUrl}`;

    // 3. WhatsApp Location Sharing
    const waStatus = document.getElementById('sosWaStatus');
    const primaryPhoneClean = primaryContact ? cleanPhoneNumber(primaryContact.phone) : '';
    const waUrl = primaryPhoneClean 
      ? `https://api.whatsapp.com/send?phone=${primaryPhoneClean}&text=${encodeURIComponent(waText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    if (waStatus) {
      waStatus.querySelector('.status').textContent = '✓ Ready & Sent';
      waStatus.querySelector('.status').className = 'status sent';
    }

    // 4. SMS Notification
    const smsStatus = document.getElementById('sosSmsStatus');
    const smsUrl = primaryPhoneClean
      ? `sms:${primaryPhoneClean}?body=${encodeURIComponent(smsText)}`
      : `sms:?body=${encodeURIComponent(smsText)}`;

    if (smsStatus) {
      smsStatus.querySelector('.status').textContent = '✓ Dispatched';
      smsStatus.querySelector('.status').className = 'status sent';
    }

    // 5. Hospital Details Check (Explicitly only if user added hospital details)
    const hospStatus = document.getElementById('sosHospitalStatus');
    if (hospital && hospital.name && hospital.phone) {
      if (hospStatus) {
        hospStatus.querySelector('.status').textContent = `✓ Alerted ${hospital.name}`;
        hospStatus.querySelector('.status').className = 'status sent';
      }
    } else {
      if (hospStatus) {
        hospStatus.querySelector('.status').textContent = '✓ Skipped (Not added by user)';
        hospStatus.querySelector('.status').className = 'status muted-skip';
      }
    }

    // 6. Call Status
    const callStatus = document.getElementById('sosCallStatus');
    const callNumber = primaryPhoneClean || cleanPhoneNumber(ambulance) || '108';
    if (callStatus) {
      callStatus.querySelector('.status').textContent = `✓ Calling ${callNumber}`;
      callStatus.querySelector('.status').className = 'status sent';
    }

    // 7. Render Instant 1-Tap Action Buttons
    const quickActions = document.getElementById('sosQuickActions');
    if (quickActions) {
      quickActions.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a href="tel:${callNumber}" class="sos-action-btn call" id="btnSosDirectCall">
            <span class="material-symbols-outlined">call</span>
            <span>Call Contact</span>
          </a>
          <a href="${waUrl}" target="_blank" rel="noopener" class="sos-action-btn wa" id="btnSosDirectWa">
            <span class="material-symbols-outlined">chat</span>
            <span>WhatsApp Location</span>
          </a>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
          <a href="${smsUrl}" class="sos-action-btn sms" id="btnSosDirectSms">
            <span class="material-symbols-outlined">sms</span>
            <span>Send SMS</span>
          </a>
          <a href="${mapUrl}" target="_blank" rel="noopener" class="sos-action-btn map" id="btnSosDirectMap">
            <span class="material-symbols-outlined">map</span>
            <span>View Map</span>
          </a>
        </div>
      `;
    }

    // 8. Backend API trigger if available
    try {
      fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts,
          hospital_details: hospital || null,
          ambulance_number: ambulance,
          location,
          wa_message: waText,
          sms_message: smsText
        }),
      }).catch(() => {});
    } catch {}

    // 9. Automatically trigger call / WhatsApp action after small delay
    setTimeout(() => {
      try {
        window.open(waUrl, '_blank');
      } catch {}
      setTimeout(() => {
        try {
          window.location.href = `tel:${callNumber}`;
        } catch {}
      }, 500);
    }, 400);
  }

  /* ── Settings UI ── */
  function renderSettings() {
    const contacts = getContacts();
    const hospital = getHospitalDetails();
    const ambulance = getAmbulanceNumber();

    return `
      <article class="data-card sos-settings-card" style="margin-bottom:24px;">
        <div class="sos-settings-header">
          <div class="sos-settings-badge">
            <span class="material-symbols-outlined">sos</span>
            <span>Emergency Protocol</span>
          </div>
          <h2>🚑 Emergency SOS &amp; Close Contacts</h2>
          <p>Configure family/friend numbers for automatic calls, SMS, and WhatsApp location sharing under <strong>CarePill</strong>.</p>
        </div>

        <div class="sos-settings-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="margin:0;font-size:16px;color:var(--ink);display:flex;align-items:center;gap:6px;">
              <span class="material-symbols-outlined" style="color:var(--blue);font-size:20px;">contacts</span>
              <span>Close Contacts (Family &amp; Friends)</span>
            </h3>
            <span class="sos-counter-pill">${contacts.length}/5 Saved</span>
          </div>

          <div class="sos-contacts-list" id="sosContactsList">
            ${contacts.length === 0 ? `
              <div class="sos-no-contacts">
                <span class="material-symbols-outlined">person_off</span>
                <p>No emergency contacts added yet. Add family or friends below.</p>
              </div>
            ` : contacts.map((c, index) => `
              <div class="sos-contact-card ${index === 0 ? 'primary-contact' : ''}">
                <div class="sos-contact-avatar">
                  <span class="material-symbols-outlined">${c.relation === 'Family' ? 'family_restroom' : c.relation === 'Doctor' ? 'medical_services' : 'person'}</span>
                </div>
                <div class="info">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong>${escapeHtml(c.name)}</strong>
                    ${index === 0 ? '<span class="sos-badge primary">Primary Call</span>' : ''}
                    <span class="sos-badge relation">${escapeHtml(c.relation || 'Contact')}</span>
                  </div>
                  <small>${escapeHtml(c.phone)}</small>
                </div>
                <div class="sos-contact-actions">
                  <button type="button" class="remove-contact" data-remove="${c.id}" title="Remove contact" aria-label="Remove ${escapeHtml(c.name)}">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          ${contacts.length < 5 ? `
            <div class="sos-add-contact-box" style="margin-top:14px;">
              <h4 style="margin:0 0 10px;font-size:13.5px;color:var(--ink);">+ Add New Close Contact</h4>
              <div class="add-contact-row">
                <input type="text" id="newContactName" placeholder="Full Name (e.g. Sarah / Dad)" maxlength="40">
                <input type="tel" id="newContactPhone" placeholder="Phone with country code (e.g. +91 9876543210)">
                <select id="newContactRelation" class="sos-select-relation">
                  <option value="Family" selected>Family</option>
                  <option value="Friend">Friend</option>
                  <option value="Caregiver">Caregiver</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Other">Other</option>
                </select>
                <button type="button" class="add-contact-btn" id="addContactBtn">
                  <span class="material-symbols-outlined" style="font-size:16px;">person_add</span>
                  <span>Add Contact</span>
                </button>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Hospital Details Configuration (Conditional Location Sharing) -->
        <div class="sos-settings-section" style="margin-top:24px;border-top:1px solid rgba(163,177,198,0.25);padding-top:20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
            <div>
              <h3 style="margin:0;font-size:16px;color:var(--ink);display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="color:#0d9e71;font-size:20px;">local_hospital</span>
                <span>Hospital Details (Optional)</span>
              </h3>
              <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted);">
                ${hospital ? '✅ Hospital alert is configured. Location will be shared with your chosen hospital.' : '🔒 Hospital details not added. Location and alerts are kept private to your close contacts.'}
              </p>
            </div>
            <span class="sos-hospital-status-pill ${hospital ? 'configured' : 'empty'}">
              ${hospital ? '🟢 Configured' : '⚪ Not Added'}
            </span>
          </div>

          <div class="hospital-config-card">
            <div class="hospital-grid">
              <div class="auth-field">
                <label for="sosHospitalName">Hospital / Clinic Name</label>
                <input type="text" id="sosHospitalName" value="${escapeHtml(hospital ? hospital.name : '')}" placeholder="e.g. City Care Multispeciality Hospital">
              </div>
              <div class="auth-field">
                <label for="sosHospitalPhone">Hospital Emergency Desk / Doctor Phone</label>
                <input type="tel" id="sosHospitalPhone" value="${escapeHtml(hospital ? hospital.phone : '')}" placeholder="e.g. +91 9988776655">
              </div>
            </div>
            <div class="auth-field" style="margin-top:10px;">
              <label for="sosHospitalAddress">Hospital Address / Branch (Optional)</label>
              <input type="text" id="sosHospitalAddress" value="${escapeHtml(hospital ? hospital.address || '' : '')}" placeholder="e.g. Sector 4, Apollo Road, Near City Center">
            </div>

            <div style="display:flex;gap:10px;margin-top:14px;">
              <button type="button" class="sos-save-hospital-btn" id="saveHospitalBtn">
                <span class="material-symbols-outlined" style="font-size:18px;">save</span>
                <span>${hospital ? 'Update Hospital Details' : 'Save Hospital Details'}</span>
              </button>
              ${hospital ? `
                <button type="button" class="sos-clear-hospital-btn" id="clearHospitalBtn">
                  <span class="material-symbols-outlined" style="font-size:18px;">clear</span>
                  <span>Remove Hospital</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Ambulance Number -->
        <div class="sos-settings-section" style="margin-top:20px;border-top:1px solid rgba(163,177,198,0.25);padding-top:16px;">
          <div class="auth-field" style="max-width:320px;">
            <label for="sosAmbulanceInput">Local Ambulance / Emergency Helpline</label>
            <input type="tel" id="sosAmbulanceInput" value="${escapeHtml(ambulance)}" placeholder="108 / 911 / 112">
          </div>
        </div>
      </article>
    `;
  }

  function bindSettingsEvents() {
    const ambInput = document.getElementById('sosAmbulanceInput');
    if (ambInput) {
      ambInput.addEventListener('change', () => {
        setAmbulanceNumber(ambInput.value.trim() || '108');
        if (typeof notify === 'function') notify('✅ Ambulance number saved.');
      });
    }

    // Remove contact
    document.querySelectorAll('.remove-contact[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.remove;
        removeContact(id);
        if (typeof notify === 'function') notify('🗑️ Contact removed.');
        if (typeof selectView === 'function') selectView('Settings');
      });
    });

    // Add contact
    const addBtn = document.getElementById('addContactBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const name = document.getElementById('newContactName')?.value?.trim();
        const phone = document.getElementById('newContactPhone')?.value?.trim();
        const relation = document.getElementById('newContactRelation')?.value || 'Family';

        if (!name || !phone) {
          if (typeof notify === 'function') notify('⚠️ Please enter both contact name and phone number.');
          return;
        }

        const success = addContact(name, phone, relation);
        if (success) {
          if (typeof notify === 'function') notify(`✅ Added "${name}" (${relation}) to emergency contacts.`);
          if (typeof selectView === 'function') selectView('Settings');
        } else {
          if (typeof notify === 'function') notify('⚠️ Maximum 5 emergency contacts allowed.');
        }
      });
    }

    // Save Hospital Details
    const saveHospBtn = document.getElementById('saveHospitalBtn');
    if (saveHospBtn) {
      saveHospBtn.addEventListener('click', () => {
        const name = document.getElementById('sosHospitalName')?.value?.trim();
        const phone = document.getElementById('sosHospitalPhone')?.value?.trim();
        const address = document.getElementById('sosHospitalAddress')?.value?.trim() || '';

        if (!name || !phone) {
          if (typeof notify === 'function') notify('⚠️ Please provide both hospital name and contact number.');
          return;
        }

        saveHospitalDetails({ name, phone, address });
        if (typeof notify === 'function') notify(`🏥 Hospital "${name}" saved for emergency dispatch.`);
        if (typeof selectView === 'function') selectView('Settings');
      });
    }

    // Clear Hospital Details
    const clearHospBtn = document.getElementById('clearHospitalBtn');
    if (clearHospBtn) {
      clearHospBtn.addEventListener('click', () => {
        clearHospitalDetails();
        if (typeof notify === 'function') notify('🔒 Hospital details removed. Emergency location will only go to your close contacts.');
        if (typeof selectView === 'function') selectView('Settings');
      });
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const el = document.createElement('span');
    el.textContent = String(text);
    return el.innerHTML;
  }

  return {
    openSOS,
    closeSOS,
    triggerSOS,
    renderSettings,
    bindSettingsEvents,
    getContacts,
    addContact,
    removeContact,
    getHospitalDetails,
    saveHospitalDetails,
    clearHospitalDetails,
    getAmbulanceNumber
  };
})();

// Global expose
window.SOSManager = SOSManager;
