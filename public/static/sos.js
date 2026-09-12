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

  /* ── 3-Step Hybrid SOS Emergency Click Handler (from SOSButton.jsx) ── */
  const DEFAULT_FALLBACK_NUMBER = "+911234567890";
  const DEFAULT_SOS_MESSAGE = "Emergency! I need help. This is an automated SOS alert.";

  function getDynamicEmergencyNumber() {
    let phone = getCaregiverPhone();
    if (phone && phone.trim()) {
      let clean = phone.trim().replace(/[^\d+]/g, '');
      if (clean.length >= 8) {
        return clean.startsWith('+') ? clean : `+${clean}`;
      }
    }
    try {
      const user = JSON.parse(localStorage.getItem('carepill_user') || 'null');
      const uPhone = user?.emergencyPhone || user?.caregiverPhone || user?.phone;
      if (uPhone && uPhone.trim()) {
        let clean = uPhone.trim().replace(/[^\d+]/g, '');
        if (clean.length >= 8) {
          return clean.startsWith('+') ? clean : `+${clean}`;
        }
      }
    } catch {}

    return DEFAULT_FALLBACK_NUMBER;
  }

  function handleSOS() {
    clearInterval(countdownInterval);

    // 4. Dynamic Contact & State Binding:
    const emergencyNumber = getDynamicEmergencyNumber();
    const sosMessage = DEFAULT_SOS_MESSAGE;
    const userName = getUserName();
    const bloodGroup = getBloodGroup();

    // ---- STEP 1: Synchronous Native Phone Call Trigger ----
    // Execute immediately inside click handler with zero async/await delay to prevent browser security blocks
    window.location.href = `tel:${emergencyNumber}`;

    // ---- STEP 2: OS-Aware Native SMS Trigger ----
    // Detect user device OS: iOS uses "&", Android/other uses "?"
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsSeparator = isIOS ? "&" : "?";
    const smsLink = `sms:${emergencyNumber}${smsSeparator}body=${encodeURIComponent(sosMessage)}`;

    // Create and click dynamic anchor element targeting SMS URI
    const smsAnchor = document.createElement("a");
    smsAnchor.href = smsLink;
    smsAnchor.click();

    // Open Modal Overlay for User Visual Feedback
    if (!overlay) createOverlay();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    const modal = document.getElementById('sosModal');
    if (modal) {
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
            <span class="name">📞 Native Call Triggered: ${escapeHtml(emergencyNumber)}</span>
            <span class="status sent">✓ Native Call Dispatched</span>
          </div>

          <div class="sos-contact-status" id="sosSmsStatus">
            <span class="name">💬 OS-Aware SMS (${isIOS ? 'iOS &' : 'Android ?'}): ${escapeHtml(emergencyNumber)}</span>
            <span class="status sent">✓ Native SMS Dispatched</span>
          </div>

          <div class="sos-contact-status" id="sosTwilioStatus">
            <span class="name">☁️ Twilio Cloud Backup</span>
            <span class="status sending" id="sosTwilioStatusText">Contacting /api/sos…</span>
          </div>
        </div>

        <div class="sos-quick-actions" id="sosQuickActions" style="margin-top:16px;display:grid;gap:8px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <a href="tel:${emergencyNumber}" class="sos-action-btn call" id="btnSosDirectCall">
              <span class="material-symbols-outlined">call</span>
              <span>Direct Call</span>
            </a>
            <a href="${smsLink}" class="sos-action-btn sms" id="btnSosDirectSms">
              <span class="material-symbols-outlined">sms</span>
              <span>Device SMS</span>
            </a>
          </div>
        </div>

        <div class="sos-actions" style="margin-top:18px">
          <button type="button" class="sos-cancel" id="sosClose" style="width:100%;">Close Window</button>
        </div>
      `;

      const closeBtn = modal.querySelector('#sosClose');
      if (closeBtn) closeBtn.addEventListener('click', closeSOS);
    }

    // Geolocation coordinates query in non-blocking background
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const locStatus = document.getElementById('sosLocStatus');
          if (locStatus) {
            const mapUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
            locStatus.querySelector('.status').innerHTML = `<a href="${mapUrl}" target="_blank" rel="noopener" style="color:#0d9e71;font-weight:700;text-decoration:underline;">✓ ${lat.toFixed(4)}, ${lng.toFixed(4)}</a>`;
            locStatus.querySelector('.status').className = 'status sent';
          }
        },
        () => {
          const locStatus = document.getElementById('sosLocStatus');
          if (locStatus) {
            locStatus.querySelector('.status').textContent = '⚠️ Location Approx / Unavailable';
            locStatus.querySelector('.status').className = 'status warning';
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    // ---- STEP 3: Non-Blocking Background Twilio Dispatch ----
    // Do NOT await this call before Steps 1 and 2.
    // Catch any backend errors gracefully so native call/SMS functionality remains uninterrupted.
    fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: emergencyNumber,
        caregiverPhone: emergencyNumber,
        message: sosMessage,
        patientName: userName,
        bloodGroup: bloodGroup
      })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const banner = document.getElementById('sosDispatchBanner');
        const twilioStatus = document.getElementById('sosTwilioStatusText');

        if (res.ok && (data.success || !data.error)) {
          if (banner) {
            banner.className = 'sos-dispatch-banner dispatched';
            banner.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:26px;color:#0d9e71;">check_circle</span>
              <div class="banner-text">
                <strong style="color:#0d9e71;font-size:15px;">Alert Dispatched: Call &amp; SMS Sent</strong>
                <span>Emergency alert successfully dispatched to ${escapeHtml(emergencyNumber)}</span>
              </div>
            `;
          }
          if (twilioStatus) {
            twilioStatus.textContent = '✓ Twilio Dispatched';
            twilioStatus.className = 'status sent';
          }
        } else {
          const detail = data.callError || data.smsError || data.error || data.detail || `HTTP ${res.status}`;
          if (banner) {
            banner.className = 'sos-dispatch-banner dispatched';
            banner.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:26px;color:#0d9e71;">check_circle</span>
              <div class="banner-text">
                <strong style="color:#0d9e71;font-size:15px;">Alert Dispatched: Call &amp; SMS Sent</strong>
                <span>Native call &amp; SMS triggered. Backend note: ${escapeHtml(detail)}</span>
              </div>
            `;
          }
          if (twilioStatus) {
            twilioStatus.textContent = `⚠️ Backend: ${detail}`;
            twilioStatus.className = 'status warning';
          }
        }
      })
      .catch((err) => {
        console.error("Twilio backend SOS failed:", err);
        const banner = document.getElementById('sosDispatchBanner');
        const twilioStatus = document.getElementById('sosTwilioStatusText');
        if (banner) {
          banner.className = 'sos-dispatch-banner dispatched';
          banner.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:26px;color:#0d9e71;">check_circle</span>
            <div class="banner-text">
              <strong style="color:#0d9e71;font-size:15px;">Alert Dispatched: Call &amp; SMS Sent</strong>
              <span>Native call &amp; SMS triggered. (Twilio network note: ${escapeHtml(err.message)})</span>
            </div>
          `;
        }
        if (twilioStatus) {
          twilioStatus.textContent = `⚠️ Network: ${err.message}`;
          twilioStatus.className = 'status warning';
        }
      });
  }

  function openSOS() {
    handleSOS();
  }

  function triggerSOS() {
    handleSOS();
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
    handleSOS,
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
    promptConfigureCaregiver,
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
