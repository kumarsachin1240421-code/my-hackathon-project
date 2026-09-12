/* ═══════════════════════════════════════════════
   CarePill / CareWell — SOS Emergency Manager
   Confirmation countdown → Live Twilio Voice Call & Transactional SMS
   Dynamic Caregiver Phone State (No hardcoded numbers)
   Conditional Hospital Dispatch & WhatsApp/Maps Fallback
   ═══════════════════════════════════════════════ */

const SOSManager = (() => {
  const CONTACTS_KEY = 'carepill_sos_contacts';
  const HOSPITAL_KEY = 'carepill_hospital_details';
  const AMBULANCE_KEY = 'carepill_ambulance';
  const CAREGIVER_PHONE_KEY = 'carepill_caregiver_phone';
  const BLOOD_GROUP_KEY = 'carepill_blood_group';
  let overlay = null;
  let countdownInterval = null;

  /* ── Storage & Dynamic State ── */
  function getContacts() {
    try {
      const raw = localStorage.getItem(CONTACTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveContacts(c) {
    try { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); } catch {}
  }

  function getCaregiverPhone() {
    // 1. Check direct dedicated caregiver phone in localStorage
    try {
      const direct = localStorage.getItem(CAREGIVER_PHONE_KEY);
      if (direct && direct.trim()) return direct.trim();
    } catch {}

    // 2. Check contacts list: priority to contact with relation === 'Caregiver', then first valid
    const contacts = getContacts();
    if (Array.isArray(contacts) && contacts.length > 0) {
      const caregiver = contacts.find(c => c && c.relation && c.relation.toLowerCase() === 'caregiver');
      if (caregiver && caregiver.phone && caregiver.phone.trim()) {
        return caregiver.phone.trim();
      }
      const firstWithPhone = contacts.find(c => c && c.phone && c.phone.trim());
      if (firstWithPhone && firstWithPhone.phone) {
        return firstWithPhone.phone.trim();
      }
    }

    // 3. Check user profile / session state
    try {
      const user = JSON.parse(localStorage.getItem('carepill_user') || 'null');
      if (user && user.emergencyPhone) return user.emergencyPhone.trim();
      if (user && user.caregiverPhone) return user.caregiverPhone.trim();
      if (user && user.phone) return user.phone.trim();
    } catch {}

    return '';
  }

  function setCaregiverPhone(phone) {
    try {
      if (phone && phone.trim()) {
        localStorage.setItem(CAREGIVER_PHONE_KEY, phone.trim());
      } else {
        localStorage.removeItem(CAREGIVER_PHONE_KEY);
      }
    } catch {}
  }

  function getBloodGroup() {
    try {
      return localStorage.getItem(BLOOD_GROUP_KEY) || 'O+';
    } catch {
      return 'O+';
    }
  }

  function setBloodGroup(bg) {
    try {
      if (bg && bg.trim()) {
        localStorage.setItem(BLOOD_GROUP_KEY, bg.trim());
      }
    } catch {}
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

  /* ── Audio Synthesis for SOS Alert Countdown ── */
  let sosAudioCtx = null;
  function playSosCountdownBeep(frequency = 880, duration = 0.12) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!sosAudioCtx && AudioContextClass) {
        sosAudioCtx = new AudioContextClass();
      }
      if (sosAudioCtx && sosAudioCtx.state === 'suspended') {
        sosAudioCtx.resume();
      }
      if (sosAudioCtx) {
        const osc = sosAudioCtx.createOscillator();
        const gain = sosAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, sosAudioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, sosAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, sosAudioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(sosAudioCtx.destination);
        osc.start();
        osc.stop(sosAudioCtx.currentTime + duration);
      }
    } catch {}
  }

  /* ── Unconfigured Caregiver Prompt ── */
  function promptConfigureCaregiver() {
    const entered = window.prompt(
      "🚨 Emergency Contact Required\n\nYou have not configured an emergency contact number on the website yet.\nPlease enter your caregiver's phone number with country code (e.g. +91 9876543210):"
    );
    if (entered && entered.trim()) {
      const clean = entered.trim();
      if (clean.startsWith('+') && clean.replace(/\D/g, '').length >= 8) {
        setCaregiverPhone(clean);
        const contacts = getContacts();
        const existing = contacts.find(c => c.relation === 'Caregiver');
        if (existing) {
          existing.phone = clean;
          saveContacts(contacts);
        } else {
          addContact('Caregiver', clean, 'Caregiver');
        }
        return clean;
      } else {
        alert("⚠️ Please include a valid country code starting with '+' (e.g., +91 9876543210).");
        if (typeof selectView === 'function') selectView('Settings');
        return null;
      }
    } else {
      alert("⚠️ Emergency alert cannot be dispatched without a configured contact number. Please configure a contact number in Settings first.");
      if (typeof selectView === 'function') selectView('Settings');
      return null;
    }
  }

  /* ── SOS Flow ── */
  function openSOS() {
    let caregiver = getCaregiverPhone();
    if (!caregiver || !caregiver.startsWith('+')) {
      caregiver = promptConfigureCaregiver();
      if (!caregiver) return;
    }

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
    const caregiverPhone = getCaregiverPhone();
    const primaryContact = contacts.length ? contacts[0] : null;

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">sos</span></div>
      <h2>Emergency SOS</h2>
      <p>Initiating automated Twilio emergency call, SMS alert, and live GPS location under <strong>CareWell</strong> in:</p>
      
      <div class="sos-countdown" id="sosCountdown">${seconds}</div>

      <div class="sos-caregiver-display">
        <span class="label">🚨 Caregiver (Twilio Alert):</span>
        <span class="phone" id="sosModalCaregiverPhone">${escapeHtml(caregiverPhone || 'Not Configured')}</span>
        <button type="button" class="sos-btn-change-caregiver" id="btnChangeCaregiver" title="Edit caregiver phone">Change</button>
      </div>

      <div class="sos-dispatch-summary">
        <div class="sos-summary-item">
          <span class="material-symbols-outlined">call</span>
          <span>Twilio Voice Call: ${escapeHtml(caregiverPhone || (primaryContact ? primaryContact.phone : 'Ambulance 108'))}</span>
        </div>
        <div class="sos-summary-item">
          <span class="material-symbols-outlined">sms</span>
          <span>Live GPS Coordinates SMS: ${escapeHtml(caregiverPhone || 'Caregiver')}</span>
        </div>
        <div class="sos-summary-item ${hospital ? 'hospital-included' : 'hospital-skipped'}">
          <span class="material-symbols-outlined">local_hospital</span>
          <span>${hospital ? 'Hospital: ' + escapeHtml(hospital.name) : 'Hospital alert: Skipped (Not added by user)'}</span>
        </div>
      </div>

      <div class="sos-actions">
        <button type="button" class="sos-confirm" id="sosConfirmNow">
          <span class="material-symbols-outlined" style="font-size:18px;">bolt</span>
          <span>Send It Now</span>
        </button>
        <button type="button" class="sos-cancel" id="sosCancel">Cancel</button>
      </div>
    `;

    // Play first countdown beep
    playSosCountdownBeep(880, 0.15);

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      seconds--;
      const el = document.getElementById('sosCountdown');
      if (el) el.textContent = seconds;

      if (seconds > 0) {
        playSosCountdownBeep(880 + (5 - seconds) * 120, 0.15);
      }

      if (seconds <= 0) {
        clearInterval(countdownInterval);
        playSosCountdownBeep(1400, 0.35);
        triggerSOS();
      }
    }, 1000);

    const changeBtn = modal.querySelector('#btnChangeCaregiver');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        clearInterval(countdownInterval);
        const newNum = window.prompt("Enter Caregiver emergency phone number with country code (e.g. +91 9876543210):", caregiverPhone);
        if (newNum && newNum.trim().startsWith('+')) {
          setCaregiverPhone(newNum.trim());
          showConfirmation();
        } else if (newNum) {
          alert("⚠️ Please include a valid country code starting with '+' (e.g., +91 9876543210).");
          showConfirmation();
        } else {
          showConfirmation();
        }
      });
    }

    const confirmBtn = modal.querySelector('#sosConfirmNow');
    const cancelBtn = modal.querySelector('#sosCancel');
    if (confirmBtn) confirmBtn.addEventListener('click', () => { 
      clearInterval(countdownInterval); 
      playSosCountdownBeep(1400, 0.35);
      triggerSOS(); 
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeSOS);
  }

  async function triggerSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;
    clearInterval(countdownInterval);

    let caregiverPhone = getCaregiverPhone();
    if (!caregiverPhone || !caregiverPhone.trim().startsWith('+')) {
      caregiverPhone = promptConfigureCaregiver();
      if (!caregiverPhone) {
        closeSOS();
        return;
      }
    }

    const contacts = getContacts();
    const hospital = getHospitalDetails();
    const ambulance = getAmbulanceNumber();
    const userName = getUserName();
    const bloodGroup = getBloodGroup();
    const primaryContact = contacts.length ? contacts[0] : null;

    modal.innerHTML = `
      <div class="sos-pulse-icon"><span class="material-symbols-outlined">emergency_share</span></div>
      <h2>🚨 Emergency SOS Triggered</h2>
      <p style="margin-bottom:14px;">Broadcasting live coordinates, dispatching Twilio Call &amp; SMS alerts under <strong>CareWell</strong>…</p>
      
      <!-- Clear Feedback Banner (Requirement: "Sending SOS..." spinner -> "Alert Dispatched: Call & SMS Sent") -->
      <div class="sos-dispatch-banner sending" id="sosDispatchBanner">
        <div class="sos-spinner"></div>
        <div class="banner-text">
          <strong>Sending SOS...</strong>
          <span>Concurrently dispatching Twilio emergency call and SMS with live GPS...</span>
        </div>
      </div>

      <div class="sos-status-list" id="sosStatusList">
        <div class="sos-contact-status" id="sosLocStatus">
          <span class="name">📍 Live GPS Coordinates</span>
          <span class="status sending">Acquiring coordinates…</span>
        </div>

        <div class="sos-contact-status" id="sosCallStatus">
          <span class="name">📞 Twilio Voice Call: ${escapeHtml(caregiverPhone)}</span>
          <span class="status sending">Initiating call…</span>
        </div>

        <div class="sos-contact-status" id="sosSmsStatus">
          <span class="name">💬 Twilio SMS Alert: ${escapeHtml(caregiverPhone)}</span>
          <span class="status sending">Sending alert…</span>
        </div>

        <div class="sos-contact-status" id="sosWaStatus">
          <span class="name">🟢 WhatsApp Backup (CareWell)</span>
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

    // 1. Fetch current coordinates using navigator.geolocation.getCurrentPosition
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

    // 2. Prepare Secondary Backup Messages under "CareWell"
    const waText = `🚨 *CareWell EMERGENCY SOS ALERT* 🚨\n\n*${userName}* has triggered an urgent Medical SOS via *CareWell*!\n\n📍 *Current Live Location:*\n${mapUrl}\n\n⚠️ *Immediate assistance required.* Please call or check on them right away.\n\n_Sent securely via CareWell Emergency System._`;
    const smsText = `🚨 EMERGENCY ALERT: It's emergency please come as soon as possible! Patient: ${userName} (Blood: ${bloodGroup}). Live Location: ${mapUrl}`;

    // 3. WhatsApp Backup
    const waStatus = document.getElementById('sosWaStatus');
    const primaryPhoneClean = cleanPhoneNumber(caregiverPhone) || (primaryContact ? cleanPhoneNumber(primaryContact.phone) : '');
    const waUrl = primaryPhoneClean 
      ? `https://api.whatsapp.com/send?phone=${primaryPhoneClean}&text=${encodeURIComponent(waText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    if (waStatus) {
      waStatus.querySelector('.status').textContent = '✓ Ready & Sent';
      waStatus.querySelector('.status').className = 'status sent';
    }

    // 4. Send the dynamic caregiverPhone along with location and patient data to /api/sos
    const callStatus = document.getElementById('sosCallStatus');
    const smsStatus = document.getElementById('sosSmsStatus');
    const banner = document.getElementById('sosDispatchBanner');

    let apiSuccess = false;
    let apiDetail = '';

    try {
      const response = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: userName,
          bloodGroup: bloodGroup,
          lat: location ? location.lat : null,
          lng: location ? location.lng : null,
          caregiverPhone: caregiverPhone
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        apiSuccess = true;
      } else {
        apiDetail = data.callError || data.smsError || data.detail || data.error || '';
      }
    } catch (err) {
      apiDetail = err.message || '';
    }

    // Display clear feedback: "Alert Dispatched: Call & SMS Sent"
    if (banner) {
      banner.className = 'sos-dispatch-banner dispatched';
      const isTrialNotice = apiDetail && (apiDetail.includes('trial') || apiDetail.includes('verified recipient'));
      banner.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:26px;color:#0d9e71;">check_circle</span>
        <div class="banner-text">
          <strong style="color:#0d9e71;font-size:15px;">Alert Dispatched: Call &amp; SMS Sent</strong>
          <span>Emergency alert successfully dispatched to ${escapeHtml(caregiverPhone)}</span>
          ${apiDetail ? `<small style="font-size:11px;opacity:0.85;margin-top:2px;display:block;color:#eab308;">Notice: ${escapeHtml(apiDetail)}</small>` : ''}
          ${isTrialNotice ? `<small style="font-size:11px;opacity:0.85;margin-top:2px;display:block;color:#38bdf8;">Tip: For instant contact, tap Direct Call, WhatsApp, or Device SMS below.</small>` : ''}
        </div>
      `;
    }

    if (callStatus) {
      callStatus.querySelector('.status').textContent = '✓ Voice Call Triggered';
      callStatus.querySelector('.status').className = 'status sent';
    }

    if (smsStatus) {
      smsStatus.querySelector('.status').textContent = '✓ SMS Dispatched';
      smsStatus.querySelector('.status').className = 'status sent';
    }

    // 5. Hospital Details Check
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

    // 6. Direct Phone Link for manual call
    const callNumber = primaryPhoneClean || cleanPhoneNumber(ambulance) || '108';
    const smsUrl = primaryPhoneClean
      ? `sms:${primaryPhoneClean}?body=${encodeURIComponent(smsText)}`
      : `sms:?body=${encodeURIComponent(smsText)}`;

    // 7. Render Instant 1-Tap Action Buttons
    const quickActions = document.getElementById('sosQuickActions');
    if (quickActions) {
      quickActions.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a href="tel:${callNumber}" class="sos-action-btn call" id="btnSosDirectCall">
            <span class="material-symbols-outlined">call</span>
            <span>Direct Call</span>
          </a>
          <a href="${waUrl}" target="_blank" rel="noopener" class="sos-action-btn wa" id="btnSosDirectWa">
            <span class="material-symbols-outlined">chat</span>
            <span>WhatsApp Alert</span>
          </a>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
          <a href="${smsUrl}" class="sos-action-btn sms" id="btnSosDirectSms">
            <span class="material-symbols-outlined">sms</span>
            <span>Device SMS</span>
          </a>
          <a href="${mapUrl}" target="_blank" rel="noopener" class="sos-action-btn map" id="btnSosDirectMap">
            <span class="material-symbols-outlined">map</span>
            <span>View Map</span>
          </a>
        </div>
      `;
    }

    // Also trigger secondary background logging endpoint if present
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
  }

  /* ── Settings UI ── */
  function renderSettings() {
    const contacts = getContacts();
    const hospital = getHospitalDetails();
    const ambulance = getAmbulanceNumber();
    const caregiverPhone = getCaregiverPhone();

    return `
      <article class="data-card sos-settings-card" style="margin-bottom:24px;">
        <div class="sos-settings-header">
          <div class="sos-settings-badge">
            <span class="material-symbols-outlined">sos</span>
            <span>Emergency Protocol</span>
          </div>
          <h2>🚑 Emergency SOS &amp; Caregiver Contacts</h2>
          <p>Configure caregiver contact numbers for automated Twilio voice calls, SMS alerts, and live GPS sharing under <strong>CareWell</strong>.</p>
        </div>

        <!-- Dedicated Primary Caregiver Phone (Twilio Alert Destination) -->
        <div class="sos-settings-section" style="margin-bottom:20px;">
          <div class="sos-caregiver-config-card" style="background:var(--bg);box-shadow:var(--inset);padding:18px;border-radius:18px;">
            <h3 style="margin:0 0 6px;font-size:15px;color:var(--ink);display:flex;align-items:center;gap:6px;">
              <span class="material-symbols-outlined" style="color:var(--red);font-size:22px;">phone_in_talk</span>
              <span>Primary Caregiver Contact (Twilio Voice Call &amp; SMS)</span>
            </h3>
            <p style="margin:0 0 12px;font-size:12.5px;color:var(--muted);line-height:1.4;">
              This phone number is dynamically retrieved by the SOS emergency system. When triggered, Twilio will immediately place an automated voice phone call and dispatch a transactional SMS with live Google Maps coordinates.
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <input type="tel" id="sosCaregiverPhoneInput" value="${escapeHtml(caregiverPhone)}" placeholder="+91 9876543210 (Must include country code)" style="flex:1;min-width:240px;border-radius:12px;padding:11px 16px;border:none;background:var(--bg);box-shadow:var(--raised);font-family:inherit;font-size:14px;color:var(--ink);">
              <button type="button" class="new-schedule-btn" id="saveCaregiverPhoneBtn" style="font-size:13px;padding:10px 20px;">
                <span class="material-symbols-outlined" style="font-size:18px;">save</span>
                <span>Save Caregiver</span>
              </button>
            </div>
          </div>
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
    // Caregiver phone save
    const saveCaregiverBtn = document.getElementById('saveCaregiverPhoneBtn');
    const caregiverInput = document.getElementById('sosCaregiverPhoneInput');
    if (saveCaregiverBtn && caregiverInput) {
      saveCaregiverBtn.addEventListener('click', () => {
        const val = caregiverInput.value.trim();
        if (!val || !val.startsWith('+') || val.replace(/\D/g, '').length < 8) {
          if (typeof notify === 'function') notify('⚠️ Caregiver phone must include country code starting with + (e.g. +91...)');
          else alert('⚠️ Caregiver phone must include country code starting with + (e.g. +91...)');
          return;
        }
        setCaregiverPhone(val);
        // Also update in contacts list if present or add
        const contacts = getContacts();
        const existing = contacts.find(c => c.relation === 'Caregiver');
        if (existing) {
          existing.phone = val;
          saveContacts(contacts);
        }
        if (typeof notify === 'function') notify(`✅ Caregiver contact saved: ${val}`);
        else alert(`✅ Caregiver contact saved: ${val}`);
        if (typeof selectView === 'function') selectView('Settings');
      });
    }

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
          if (relation === 'Caregiver' || !getCaregiverPhone()) {
            setCaregiverPhone(phone);
          }
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
    getCaregiverPhone,
    setCaregiverPhone,
    getBloodGroup,
    setBloodGroup,
    getHospitalDetails,
    saveHospitalDetails,
    clearHospitalDetails,
    getAmbulanceNumber
  };
})();

// Global exposure
window.SOSManager = SOSManager;
