/* ═══════════════════════════════════════════════
   CarePill — Alarm Manager & Ringtone System
   5 Rich Web Audio Ringtones + Background & Minimized Notifications
   ═══════════════════════════════════════════════ */

const AlarmManager = (() => {
  const TONE_KEY = 'carepill_alarm_tone';
  const ALARM_ENABLED_KEY = 'carepill_alarm_enabled';
  const VOLUME_KEY = 'carepill_alarm_volume';

  let audioCtx = null;
  let activeAlarmLoop = null;
  let activePreviewLoop = null;
  let activeOscillators = [];
  let checkInterval = null;

  /* ── 5 Built-in Alarm Ringtones ── */
  const TONES = {
    gentle: {
      name: 'Gentle Chime',
      icon: '🔔',
      desc: 'Soothing soft harmonic bell with warm chords',
      type: 'sine',
      tempo: 320,
      notes: [
        { freq: 523.25, dur: 0.28 }, // C5
        { freq: 659.25, dur: 0.28 }, // E5
        { freq: 783.99, dur: 0.28 }, // G5
        { freq: 1046.50, dur: 0.55 }, // C6
        { freq: 0, dur: 0.35 }
      ]
    },
    morning: {
      name: 'Morning Bell',
      icon: '🌅',
      desc: 'Bright acoustic ascending arpeggio',
      type: 'triangle',
      tempo: 260,
      notes: [
        { freq: 440.00, dur: 0.22 }, // A4
        { freq: 554.37, dur: 0.22 }, // C#5
        { freq: 659.25, dur: 0.22 }, // E5
        { freq: 880.00, dur: 0.35 }, // A5
        { freq: 1108.73, dur: 0.45 }, // C#6
        { freq: 0, dur: 0.4 }
      ]
    },
    radar: {
      name: 'Soft Radar',
      icon: '📡',
      desc: 'Rhythmic warm sonar pulse for steady attention',
      type: 'sine',
      tempo: 380,
      notes: [
        { freq: 587.33, dur: 0.15 }, // D5
        { freq: 880.00, dur: 0.25 }, // A5
        { freq: 0, dur: 0.15 },
        { freq: 880.00, dur: 0.25 }, // A5
        { freq: 1174.66, dur: 0.4 }, // D6
        { freq: 0, dur: 0.45 }
      ]
    },
    melody: {
      name: 'Care Melody',
      icon: '🎶',
      desc: 'Uplifting 6-note friendly healthcare melody',
      type: 'sine',
      tempo: 240,
      notes: [
        { freq: 523.25, dur: 0.2 }, // C5
        { freq: 587.33, dur: 0.2 }, // D5
        { freq: 659.25, dur: 0.2 }, // E5
        { freq: 783.99, dur: 0.25 }, // G5
        { freq: 880.00, dur: 0.25 }, // A5
        { freq: 1046.50, dur: 0.5 }, // C6
        { freq: 0, dur: 0.45 }
      ]
    },
    urgent: {
      name: 'Medical Pulse',
      icon: '🚨',
      desc: 'High-clarity alert pulse for critical time-sensitive doses',
      type: 'sawtooth',
      tempo: 180,
      notes: [
        { freq: 784.00, dur: 0.14 },
        { freq: 0, dur: 0.08 },
        { freq: 784.00, dur: 0.14 },
        { freq: 0, dur: 0.08 },
        { freq: 987.77, dur: 0.2 },
        { freq: 0, dur: 0.3 }
      ]
    },
    buzzer: {
      name: 'Loud Alarm Buzzer',
      icon: '⚡',
      desc: 'Ultra-loud repeating digital buzzer alarm for time-critical medication',
      type: 'sawtooth',
      tempo: 150,
      notes: [
        { freq: 880.00, dur: 0.16 },
        { freq: 0, dur: 0.06 },
        { freq: 987.77, dur: 0.16 },
        { freq: 0, dur: 0.06 },
        { freq: 880.00, dur: 0.20 },
        { freq: 0, dur: 0.35 }
      ]
    }
  };

  /* ── Getters & Setters ── */
  function getSelectedTone() {
    return localStorage.getItem(TONE_KEY) || 'gentle';
  }
  function setSelectedTone(t) {
    if (TONES[t]) {
      localStorage.setItem(TONE_KEY, t);
    }
  }
  function isEnabled() {
    return localStorage.getItem(ALARM_ENABLED_KEY) !== 'false';
  }
  function setEnabled(v) {
    localStorage.setItem(ALARM_ENABLED_KEY, v ? 'true' : 'false');
  }
  function getVolume() {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY));
    return isNaN(v) ? 0.4 : v;
  }
  function setVolume(v) {
    localStorage.setItem(VOLUME_KEY, Math.max(0.1, Math.min(1.0, v)));
  }

  /* ── Audio Context Initialization ── */
  function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /* ── Play Tone Loop ── */
  function playTone(toneKey, loop = true) {
    stopAlarm();
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const tone = TONES[toneKey] || TONES.gentle;
    const vol = getVolume();
    let noteIdx = 0;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol, ctx.currentTime);
    masterGain.connect(ctx.destination);

    function step() {
      if (!activeAlarmLoop && !activePreviewLoop) return;
      const note = tone.notes[noteIdx % tone.notes.length];
      noteIdx++;

      if (note.freq > 0) {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = tone.type;
        osc.frequency.setValueAtTime(note.freq, ctx.currentTime);

        // Smooth acoustic envelope
        noteGain.gain.setValueAtTime(0.001, ctx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.04);
        noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.dur);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + note.dur);
        activeOscillators.push(osc);
      }
    }

    if (loop) {
      activeAlarmLoop = setInterval(step, tone.tempo);
    } else {
      activePreviewLoop = setInterval(step, tone.tempo);
    }
    step();
  }

  /* ── Preview Tone (Plays 1-2 sequence cycles) ── */
  function previewTone(toneKey) {
    stopAlarm();
    playTone(toneKey, false);
    setTimeout(() => {
      stopAlarm();
    }, 2800);
  }

  /* ── Stop Current Alarm / Silence ── */
  function stopAlarm() {
    if (activeAlarmLoop) {
      clearInterval(activeAlarmLoop);
      activeAlarmLoop = null;
    }
    if (activePreviewLoop) {
      clearInterval(activePreviewLoop);
      activePreviewLoop = null;
    }
    activeOscillators.forEach(o => {
      try { o.stop(); } catch {}
    });
    activeOscillators = [];

    // Stop HTML5 audio player
    const audioEl = document.getElementById('carewellAlarmAudio');
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.currentTime = 0;
      } catch {}
    }

    // Cancel vibration pattern
    if ('vibrate' in navigator) {
      try { navigator.vibrate(0); } catch {}
    }

    // Hide top loud alarm bar
    hideLoudAlarmBar();
  }

  /* ── Floating Loud Alarm Top Bar ── */
  function showLoudAlarmBar(medication = {}) {
    let bar = document.getElementById('carewellLoudAlarmBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'carewellLoudAlarmBar';
      bar.className = 'carewell-loud-alarm-bar';
      bar.innerHTML = `
        <div class="loud-alarm-content">
          <span class="alarm-pulsing-icon">⏰</span>
          <div>
            <strong class="loud-alarm-title">Medicine Reminder Alarm is Ringing</strong>
            <p class="loud-alarm-sub" id="loudAlarmSubText"></p>
          </div>
        </div>
        <div class="loud-alarm-actions">
          <button type="button" class="btn-stop-loud-alarm" id="stopLoudAlarmBtn" aria-label="Stop Alarm">
            <span class="material-symbols-outlined" style="font-size:18px;">volume_off</span>
            <span>Stop Alarm</span>
          </button>
        </div>
      `;
      document.body.appendChild(bar);
      const stopBtn = bar.querySelector('#stopLoudAlarmBtn');
      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          stopAlarm();
        });
      }
    }
    const subText = bar.querySelector('#loudAlarmSubText');
    if (subText) {
      subText.textContent = `${medication.name || 'Medicine'} · ${medication.dosage || 'Take as scheduled'}`;
    }
    bar.classList.add('visible');
  }

  function hideLoudAlarmBar() {
    const bar = document.getElementById('carewellLoudAlarmBar');
    if (bar) {
      bar.classList.remove('visible');
    }
  }

  /* ── Prime and Play HTML5 Audio Player ── */
  function playAudioElement() {
    let audioEl = document.getElementById('carewellAlarmAudio');
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'carewellAlarmAudio';
      audioEl.preload = 'auto';
      audioEl.loop = true;
      audioEl.innerHTML = `
        <source src="alarm.mp3" type="audio/mpeg">
        <source src="public/alarm.mp3" type="audio/mpeg">
        <source src="public/alarm.wav" type="audio/wav">
        <source src="static/alarm.wav" type="audio/wav">
      `;
      document.body.appendChild(audioEl);
    }
    try {
      audioEl.volume = 1.0;
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {}
  }

  /* ── Native Notification & Background Trigger ── */
  async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
  }

  function triggerBackgroundNotification(medication) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const title = `⏰ Medicine Reminder: ${medication.name}`;
        const body = `${medication.dosage} · ${medication.instructions || 'Scheduled Dose'}\n${medication.doctor_prescription ? '👨‍⚕️ ' + medication.doctor_prescription : ''}`;
        
        const notif = new Notification(title, {
          body,
          icon: '/static/hero-care.jpg',
          badge: '/static/hero-care.jpg',
          tag: `carewell-med-${medication.id}`,
          requireInteraction: true,
          vibrate: [500, 250, 500, 250, 500, 250, 500],
          data: { url: './?alarm=true', playAlarm: true, reminder: medication },
          actions: [
            { action: 'taken', title: 'Taken' },
            { action: 'snooze', title: 'Snooze 10m' }
          ]
        });

        notif.onclick = () => {
          window.focus();
          playLoudAlarm(medication);
          notif.close();
        };

        notif.onclose = () => {};
      } catch {}
    }
  }

  /* ── Play Loud Repeating Buzzer Alarm Loop (Requirement 1) ── */
  function playLoudAlarm(medication = {}) {
    ensureAudioContext();

    // 1. Play HTML5 Audio
    playAudioElement();

    // 2. Play high-penetration Web Audio buzzer tone (loops continuously)
    playTone('buzzer', true);

    // 3. Service Worker / Mobile vibration pattern [500, 250, 500, 250, 500, 250, 500]
    if ('vibrate' in navigator) {
      try { navigator.vibrate([500, 250, 500, 250, 500, 250, 500]); } catch {}
    }

    // 4. Show top loud alarm bar with prominent Stop Alarm button
    showLoudAlarmBar(medication);

    // 5. Show in-app actionable popup
    showActionableAlarmPopup(medication);
  }

  /* ── Trigger Full Alarm & Actionable Pop-up ── */
  function triggerAlarm(medication) {
    playLoudAlarm(medication);
    triggerBackgroundNotification(medication);
  }

  /* ── Actionable In-App Pop-Up Modal / Floating Notification (Requirement 3) ── */
  function showActionableAlarmPopup(medication) {
    const overlay = document.getElementById('alarmPopupOverlay');
    const nameEl = document.getElementById('alarmPopupMedName');
    const dosageEl = document.getElementById('alarmPopupDosage');
    const timeEl = document.getElementById('alarmPopupTime');
    const instEl = document.getElementById('alarmPopupInstructions');
    const rxEl = document.getElementById('alarmPopupRx');
    const takenBtn = document.getElementById('popupTakenBtn');
    const snoozeBtn = document.getElementById('popupSnoozeBtn');
    const dismissBtn = document.getElementById('popupDismissBtn');
    const dismissCrossBtn = document.getElementById('popupDismissCrossBtn');

    if (!overlay) {
      // Fallback to banner if modal not in DOM
      return showAlarmBanner(medication);
    }

    if (nameEl) nameEl.textContent = medication.name || 'Prescribed Medicine';
    if (dosageEl) dosageEl.textContent = medication.dosage || '1 dose';
    if (timeEl) timeEl.textContent = medication.scheduled_time || medication.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (instEl) instEl.textContent = medication.instructions || 'Take as scheduled';
    if (rxEl) {
      rxEl.textContent = medication.doctor_prescription ? `👨‍⚕️ ${medication.doctor_prescription}` : '';
      rxEl.style.display = medication.doctor_prescription ? 'block' : 'none';
    }

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    function closePopup() {
      stopAlarm();
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }

    // 1. Taken Button: updates status to completed
    if (takenBtn) {
      const newTakenBtn = takenBtn.cloneNode(true);
      takenBtn.parentNode.replaceChild(newTakenBtn, takenBtn);

      newTakenBtn.addEventListener('click', async () => {
        closePopup();

        // Immediately mark dose as completed in state/localStorage
        if (typeof updateLocalDose === 'function') {
          const db = updateLocalDose(medication.id, 'taken');
          if (typeof renderDashboard === 'function') renderDashboard(db);
        }

        // Also trigger API if available
        try {
          await fetch(`/api/medications/${medication.id}/dose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'taken' }),
          });
        } catch {}

        if (typeof currentView !== 'undefined') {
          if (currentView === 'Schedule' && typeof showSchedule === 'function') {
            showSchedule(getLocalSchedule());
          } else if (currentView === 'Reports' && typeof showReports === 'function') {
            showReports(getLocalWeeklyReports());
          }
        }

        if (typeof notify === 'function') notify(`✅ ${medication.name} marked as taken!`);
      });
    }

    // 2. Snooze Button: delays alert by 10 minutes
    if (snoozeBtn) {
      const newSnoozeBtn = snoozeBtn.cloneNode(true);
      snoozeBtn.parentNode.replaceChild(newSnoozeBtn, snoozeBtn);

      newSnoozeBtn.addEventListener('click', () => {
        closePopup();
        if (typeof notify === 'function') notify(`⏰ ${medication.name} snoozed for 10 minutes.`);
        setTimeout(() => triggerAlarm(medication), 10 * 60 * 1000);
      });
    }

    // 3. Dismiss Button: closes the popup
    if (dismissBtn) {
      const newDismissBtn = dismissBtn.cloneNode(true);
      dismissBtn.parentNode.replaceChild(newDismissBtn, dismissBtn);

      newDismissBtn.addEventListener('click', () => {
        closePopup();
        if (typeof notify === 'function') notify(`Reminder for ${medication.name} dismissed.`);
      });
    }

    if (dismissCrossBtn) {
      const newCrossBtn = dismissCrossBtn.cloneNode(true);
      dismissCrossBtn.parentNode.replaceChild(newCrossBtn, dismissCrossBtn);

      newCrossBtn.addEventListener('click', () => {
        closePopup();
      });
    }
  }

  /* ── In-App Sliding Banner Fallback ── */
  function showAlarmBanner(medication) {
    let banner = document.getElementById('alarmBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'alarmBanner';
      banner.className = 'carepill-alarm-banner';
      document.body.appendChild(banner);
    }

    banner.innerHTML = `
      <div class="alarm-banner-inner">
        <div class="alarm-banner-icon-box">
          <span class="material-symbols-outlined alarm-bell-pulse">notifications_active</span>
        </div>
        <div class="alarm-banner-content">
          <div class="alarm-banner-tag">MEDICINE DUE NOW</div>
          <strong class="alarm-banner-title">${escapeHtml(medication.name)} — ${escapeHtml(medication.dosage)}</strong>
          <p class="alarm-banner-sub">${escapeHtml(medication.instructions || 'Take as scheduled')}</p>
          ${medication.doctor_prescription ? `<p class="alarm-banner-rx"><span class="material-symbols-outlined">medical_information</span> ${escapeHtml(medication.doctor_prescription)}</p>` : ''}
        </div>
        <div class="alarm-banner-actions">
          <button class="alarm-btn-take" id="alarmTakeBtn"><span class="material-symbols-outlined">check_circle</span> Taken</button>
          <button class="alarm-btn-snooze" id="alarmSnoozeBtn"><span class="material-symbols-outlined">snooze</span> Snooze 10m</button>
          <button class="alarm-btn-dismiss" id="alarmDismissBtn"><span class="material-symbols-outlined">close</span> Dismiss</button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => banner.classList.add('visible'));

    // Bind banner actions
    const takeBtn = document.getElementById('alarmTakeBtn');
    const snoozeBtn = document.getElementById('alarmSnoozeBtn');
    const dismissBtn = document.getElementById('alarmDismissBtn');

    if (takeBtn) {
      takeBtn.addEventListener('click', async () => {
        stopAlarm();
        banner.classList.remove('visible');
        if (typeof updateLocalDose === 'function') {
          const db = updateLocalDose(medication.id, 'taken');
          if (typeof renderDashboard === 'function') renderDashboard(db);
        }
        if (typeof notify === 'function') notify(`✅ ${medication.name} recorded as taken!`);
      });
    }

    if (snoozeBtn) {
      snoozeBtn.addEventListener('click', () => {
        stopAlarm();
        banner.classList.remove('visible');
        if (typeof notify === 'function') notify(`⏰ ${medication.name} snoozed for 10 minutes.`);
        setTimeout(() => triggerAlarm(medication), 10 * 60 * 1000);
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        stopAlarm();
        banner.classList.remove('visible');
      });
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  /* ── Background Medication Interval Checker ── */
  function startChecking() {
    if (checkInterval) return;
    checkInterval = setInterval(checkSchedule, 20000); // check every 20s
    checkSchedule();
  }

  function stopChecking() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  const triggeredSet = new Set();

  async function checkSchedule() {
    if (!isEnabled()) return;
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.medications) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const todayStr = now.toISOString().split('T')[0];

      for (const med of data.medications) {
        if (med.status !== 'pending') continue;

        const timeParts = med.scheduled_time ? med.scheduled_time.match(/(\d+):(\d+)\s*(AM|PM)/i) : null;
        if (!timeParts) continue;

        let hours = parseInt(timeParts[1]);
        const mins = parseInt(timeParts[2]);
        const period = timeParts[3].toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        const medMinutes = hours * 60 + mins;
        const triggerKey = `${todayStr}-${med.id}-${hours}:${mins}`;

        // Trigger if within current minute window and not already triggered today
        if (Math.abs(currentMinutes - medMinutes) === 0 && !triggeredSet.has(triggerKey)) {
          triggeredSet.add(triggerKey);
          triggerAlarm(med);
          break;
        }
      }
    } catch {}
  }

  /* ── Settings UI Component ── */
  function renderSettings() {
    const selected = getSelectedTone();
    const enabled = isEnabled();

    const toneRows = Object.entries(TONES).map(([key, t]) => `
      <div class="alarm-tone-card ${key === selected ? 'active' : ''}" data-tone="${key}">
        <div class="alarm-tone-icon">${t.icon}</div>
        <div class="alarm-tone-info">
          <strong>${t.name}</strong>
          <small>${t.desc}</small>
        </div>
        <div class="alarm-tone-actions">
          <button type="button" class="alarm-preview-btn" data-preview="${key}" aria-label="Preview ${t.name}">
            <span class="material-symbols-outlined">play_arrow</span>
          </button>
          <div class="alarm-radio-check ${key === selected ? 'checked' : ''}">
            <span class="material-symbols-outlined">check</span>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <article class="data-card alarm-settings-card">
        <div class="section-title">
          <h2>⏰ Alarm & Reminder Settings</h2>
          <span>Sound preferences</span>
        </div>
        <p style="color:var(--muted);font-size:13px;margin:4px 0 18px;">
          Choose your favorite ringtone for daily medicine reminders. Alarms trigger with notifications even when CarePill is minimized.
        </p>

        <div class="alarm-toggle-row">
          <div>
            <strong>Medication Reminders</strong>
            <small style="display:block;color:var(--muted);font-size:12px;">Play sound ringtone and show desktop alerts when doses are due</small>
          </div>
          <label class="neumorphic-switch">
            <input type="checkbox" id="alarmEnabledToggle" ${enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="alarm-tones-list">
          ${toneRows}
        </div>

        <div class="alarm-test-row">
          <button type="button" class="btn-signup" id="testAlarmBtn" style="padding:10px 20px;font-size:13px;">
            <span class="material-symbols-outlined">notifications_active</span>
            <span>Test Reminder Alarm</span>
          </button>
          <button type="button" class="btn-login" id="reqNotifBtn" style="padding:10px 18px;font-size:13px;">
            <span class="material-symbols-outlined">lock</span>
            <span>Allow Notification Permission</span>
          </button>
        </div>
      </article>
    `;
  }

  /* ── Bind Settings Events ── */
  function bindSettingsEvents() {
    const toggle = document.getElementById('alarmEnabledToggle');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        setEnabled(e.target.checked);
        if (e.target.checked) requestNotificationPermission();
      });
    }

    document.querySelectorAll('.alarm-tone-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.alarm-preview-btn')) return;
        const tone = card.getAttribute('data-tone');
        setSelectedTone(tone);
        document.querySelectorAll('.alarm-tone-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.alarm-radio-check').forEach(r => r.classList.remove('checked'));
        card.classList.add('active');
        const radio = card.querySelector('.alarm-radio-check');
        if (radio) radio.classList.add('checked');
        previewTone(tone);
      });
    });

    document.querySelectorAll('.alarm-preview-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tone = btn.getAttribute('data-preview');
        previewTone(tone);
      });
    });

    const testBtn = document.getElementById('testAlarmBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        triggerAlarm({
          id: 99,
          name: 'Atorvastatin (Test Alarm)',
          dosage: '20mg · 1 tablet',
          scheduled_time: '08:00 AM',
          instructions: 'Take with food and water',
          doctor_prescription: 'Rx by Dr. A. Sharma: Evening dose with dinner.'
        });
      });
    }

    const reqBtn = document.getElementById('reqNotifBtn');
    if (reqBtn) {
      reqBtn.addEventListener('click', async () => {
        await requestNotificationPermission();
        if ('Notification' in window && Notification.permission === 'granted') {
          reqBtn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Permissions Granted';
        }
      });
    }
  }

  /* ── Init ── */
  function init() {
    requestNotificationPermission();
    startChecking();

    // User gesture unlock for Web Audio & Audio player on first click/touch/keypress anywhere
    const unlockAudio = () => {
      ensureAudioContext();
      try {
        const audioEl = document.getElementById('carewellAlarmAudio');
        if (audioEl) {
          audioEl.play().then(() => {
            audioEl.pause();
            audioEl.currentTime = 0;
          }).catch(() => {});
        }
      } catch {}
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });

    // Listen for Service Worker messages to immediately play loud alarm
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PLAY_LOUD_ALARM') {
          playLoudAlarm(event.data.reminder || { name: 'Scheduled Medicine' });
        }
      });
    }

    // When window focuses or tab becomes visible, play alarm if triggered via query or due
    window.addEventListener('focus', () => {
      if (window.location.search.includes('alarm=true')) {
        playLoudAlarm({ name: 'Scheduled Medicine' });
        try {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        } catch {}
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && window.location.search.includes('alarm=true')) {
        playLoudAlarm({ name: 'Scheduled Medicine' });
        try {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        } catch {}
      }
    });

    // Check if opened directly with ?alarm=true
    if (typeof window !== 'undefined' && window.location.search.includes('alarm=true')) {
      setTimeout(() => {
        playLoudAlarm({ name: 'Scheduled Medicine' });
        try {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        } catch {}
      }, 350);
    }
  }

  return {
    init,
    TONES,
    getSelectedTone,
    setSelectedTone,
    previewTone,
    stopAlarm,
    triggerAlarm,
    playLoudAlarm,
    showLoudAlarmBar,
    hideLoudAlarmBar,
    renderSettings,
    bindSettingsEvents,
    requestNotificationPermission
  };
})();

document.addEventListener('DOMContentLoaded', () => AlarmManager.init());
