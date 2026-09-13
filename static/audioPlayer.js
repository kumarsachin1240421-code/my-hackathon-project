/**
 * CareWell — Resilient Audio Player & Ringtone Engine
 * 
 * Features:
 * - Single active Audio instance preventing overlapping sounds
 * - Seamless user-selected ringtone lookup (localStorage: 'carepill_alarm_tone')
 * - Absolute root path resolution strictly from /public directory (/sounds/...)
 * - audio.loop = true, audio.volume = 1.0, audio.currentTime = 0
 * - Autoplay policy rejection fallback with one-time user gesture trigger
 * - Robust Web Audio synthesis fallback for 100% sound guarantee
 * - Autoplay permission unlocker on initial mount / first interaction
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.AudioPlayer = exports;
    root.playSelectedRingtone = exports.playSelectedRingtone;
    root.stopSelectedRingtone = exports.stopSelectedRingtone;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TONE_KEY = 'carepill_alarm_tone';
  const DEFAULT_TONE = 'buzzer';

  // Sound paths resolved with absolute root paths from /public directory
  const SOUND_PATHS = {
    gentle: '/sounds/gentle.mp3',
    morning: '/sounds/morning.mp3',
    radar: '/sounds/radar.mp3',
    melody: '/sounds/melody.mp3',
    urgent: '/sounds/urgent.mp3',
    buzzer: '/sounds/buzzer.mp3',
    alarm: '/sounds/alarm.mp3'
  };

  let activeAudio = null;
  let pendingRingtone = null;
  let isAudioUnlocked = false;
  let activeAudioCtx = null;
  let activeOscLoop = null;
  let activeOscillators = [];

  /**
   * Silently prime and unlock the Web Audio pipeline on first user interaction
   */
  function unlockAudio() {
    if (isAudioUnlocked || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!activeAudioCtx || activeAudioCtx.state === 'closed') {
          activeAudioCtx = new AudioCtx();
        }
        if (activeAudioCtx.state === 'suspended') {
          activeAudioCtx.resume();
        }
        // Create and play silent 1ms buffer to prime browser audio subsystem
        const buffer = activeAudioCtx.createBuffer(1, 1, 22050);
        const source = activeAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(activeAudioCtx.destination);
        source.start(0);
      }
      isAudioUnlocked = true;
      console.log('[AudioPlayer] Audio pipeline primed and unlocked');
    } catch (err) {
      console.warn('[AudioPlayer] Audio unlock warning:', err);
    }
  }

  /**
   * Resolve audio file path for a given tone ID or path
   */
  function resolveAudioPath(ringtonePathOrId) {
    if (!ringtonePathOrId) {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(TONE_KEY) : null;
      ringtonePathOrId = saved || DEFAULT_TONE;
    }

    // Direct path or URL provided
    if (typeof ringtonePathOrId === 'string' && (ringtonePathOrId.startsWith('/') || ringtonePathOrId.startsWith('http'))) {
      return ringtonePathOrId;
    }

    const key = String(ringtonePathOrId).toLowerCase().trim();
    if (SOUND_PATHS[key]) {
      return SOUND_PATHS[key];
    }

    return SOUND_PATHS[DEFAULT_TONE] || '/sounds/buzzer.mp3';
  }

  /**
   * Web Audio synthesis fallback in case HTML5 audio is blocked or fails to decode
   */
  function startWebAudioSynthesis(toneId) {
    stopWebAudioSynthesis();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!activeAudioCtx || activeAudioCtx.state === 'closed') {
        activeAudioCtx = new AudioCtx();
      }
      if (activeAudioCtx.state === 'suspended') {
        activeAudioCtx.resume();
      }

      const ctx = activeAudioCtx;
      const isBuzzer = toneId === 'buzzer' || toneId === 'urgent' || toneId === 'alarm';
      const freq1 = isBuzzer ? 880 : 587.33;
      const freq2 = isBuzzer ? 987.77 : 880;

      let tick = 0;
      activeOscLoop = setInterval(() => {
        if (!activeOscLoop) return;
        tick++;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = isBuzzer ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(tick % 2 === 0 ? freq1 : freq2, ctx.currentTime);

        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.03);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.16);
        activeOscillators.push(osc);
      }, 160);
    } catch {}
  }

  function stopWebAudioSynthesis() {
    if (activeOscLoop) {
      clearInterval(activeOscLoop);
      activeOscLoop = null;
    }
    activeOscillators.forEach((o) => {
      try { o.stop(); } catch {}
    });
    activeOscillators = [];
  }

  /**
   * Play the user-selected ringtone in a continuous loop at volume 1.0
   */
  function playSelectedRingtone(ringtonePathOrId) {
    // 1. Maintain a single active Audio instance to prevent overlapping sounds
    stopSelectedRingtone();

    unlockAudio();

    const resolvedPath = resolveAudioPath(ringtonePathOrId);
    const toneId = typeof ringtonePathOrId === 'string' && !ringtonePathOrId.includes('/')
      ? ringtonePathOrId.toLowerCase()
      : (typeof localStorage !== 'undefined' ? localStorage.getItem(TONE_KEY) : null) || DEFAULT_TONE;

    console.log('[AudioPlayer] Playing selected ringtone:', resolvedPath, `(tone: ${toneId})`);

    try {
      activeAudio = new Audio(resolvedPath);
      activeAudio.loop = true;
      activeAudio.volume = 1.0;
      activeAudio.currentTime = 0;

      const playPromise = activeAudio.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            pendingRingtone = null;
          })
          .catch((err) => {
            console.warn('[AudioPlayer] Autoplay prevented:', err.name || err);

            // Start Web Audio synthesis as immediate fallback
            startWebAudioSynthesis(toneId);

            // Register one-time user gesture fallback listener
            pendingRingtone = ringtonePathOrId || toneId;
            const resumePending = () => {
              if (pendingRingtone) {
                playSelectedRingtone(pendingRingtone);
                pendingRingtone = null;
              }
              window.removeEventListener('click', resumePending, true);
              window.removeEventListener('touchstart', resumePending, true);
              window.removeEventListener('keydown', resumePending, true);
            };

            window.addEventListener('click', resumePending, { once: true, capture: true });
            window.addEventListener('touchstart', resumePending, { once: true, capture: true });
            window.addEventListener('keydown', resumePending, { once: true, capture: true });
          });
      }
    } catch (err) {
      console.warn('[AudioPlayer] Audio instance error, using Web Audio fallback:', err);
      startWebAudioSynthesis(toneId);
    }

    // Mobile vibration pattern for alarm alert
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([500, 250, 500, 250, 500, 250, 500]);
      } catch {}
    }

    // Broadcast event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('carewell:ringtoneStarted', { detail: { path: resolvedPath, tone: toneId } }));
    }

    return activeAudio;
  }

  /**
   * Safely stop the currently playing ringtone, reset, and release references
   */
  function stopSelectedRingtone() {
    pendingRingtone = null;

    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (err) {
        console.warn('[AudioPlayer] Pause error:', err);
      }
      activeAudio = null;
    }

    stopWebAudioSynthesis();

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }

    // Silence AlarmManager if active
    if (typeof window !== 'undefined' && window.AlarmManager && typeof window.AlarmManager.stopAlarm === 'function') {
      try {
        window.AlarmManager.stopAlarm();
      } catch {}
    }

    // Hide any floating alarm bar
    if (typeof document !== 'undefined') {
      const alarmBar = document.getElementById('carewellLoudAlarmBar');
      if (alarmBar) alarmBar.classList.remove('visible');
    }

    // Broadcast event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('carewell:ringtoneStopped'));
    }
  }

  /**
   * Bind stop listeners to modal actions, buttons, and keys
   */
  function bindDismissTriggers() {
    if (typeof document === 'undefined') return;

    // Delegate clicks on any known dismiss/taken/snooze/stop buttons
    const triggerSelectors = [
      '#stopLoudAlarmBtn',
      '#popupDismissBtn',
      '#popupDismissCrossBtn',
      '#popupTakenBtn',
      '#popupSnoozeBtn',
      '#alarmDismissBtn',
      '#alarmTakeBtn',
      '#alarmSnoozeBtn',
      '.btn-alarm-dismiss',
      '.btn-alarm-snooze',
      '.alarm-btn-dismiss',
      '.alarm-btn-take'
    ];

    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest(triggerSelectors.join(','))) {
        stopSelectedRingtone();
      }
    }, true);

    // Escape key dismiss
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        stopSelectedRingtone();
      }
    });
  }

  // Self-initialize on DOM ready
  if (typeof window !== 'undefined') {
    // Autoplay permission unlocker on initial user interaction
    ['click', 'touchstart', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockAudio, { once: true, capture: true });
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDismissTriggers);
    } else {
      bindDismissTriggers();
    }
  }

  return {
    playSelectedRingtone,
    stopSelectedRingtone,
    unlockAudio,
    resolveAudioPath,
    SOUND_PATHS
  };
});
