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

  /* ── Stop Current Alarm / Preview ── */
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
          tag: `carepill-med-${medication.id}`,
          requireInteraction: true,
          vibrate: [300, 150, 300, 150, 400]
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch {}
    }
  }

  /* ── Trigger Full Alarm ── */
  function triggerAlarm(medication) {
    ensureAudioContext();
    playTone(getSelectedTone(), true);

    // Vibration on mobile
    if ('vibrate' in navigator) {
      try { navigator.vibrate([400, 200, 400, 200, 600]); } catch {}
    }

    // Trigger Notification (even if minimized)
    triggerBackgroundNotification(medication);

    // Show In-App Neumorphic Sliding Alert Banner
    showAlarmBanner(medication);
  }

  /* ── In-App Sliding Banner ── */
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
          <button class="alarm-btn-take" id="alarmTakeBtn"><span class="material-symbols-outlined">check_circle</span> Take Now</button>
          <button class="alarm-btn-snooze" id="alarmSnoozeBtn"><span class="material-symbols-outlined">snooze</span> Snooze</button>
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
        if (typeof requestDose === 'function') {
          const card = document.querySelector(`[data-id="${medication.id}"]`);
          if (card) {
            try {
              const res = await requestDose(card, 'taken');
              if (typeof renderDashboard === 'function') renderDashboard(res.dashboard);
            } catch {}
          }
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

    // User gesture unlock for Web Audio
    const unlockAudio = () => {
      ensureAudioContext();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
  }

  return {
    init,
    TONES,
    getSelectedTone,
    setSelectedTone,
    previewTone,
    stopAlarm,
    triggerAlarm,
    renderSettings,
    bindSettingsEvents,
    requestNotificationPermission
  };
})();

document.addEventListener('DOMContentLoaded', () => AlarmManager.init());
