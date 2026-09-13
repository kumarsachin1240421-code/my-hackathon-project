/**
 * CareWell — Plug-and-Play Background Reminder Notification Utility
 * 
 * Implements persistent, non-destructive background reminder alerts:
 * 1. Requests Notification permissions.
 * 2. Registers Service Worker for native background notifications.
 * 3. Schedules reminder alerts triggered via Service Worker even when tabs are inactive.
 * 4. Non-destructively hooks into existing schedule creation events without breaking logic.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BackgroundNotifier = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'carewell_background_reminders';
  const VIBRATION_PATTERN = [500, 250, 500, 250, 500, 250, 500];
  let swRegistration = null;
  let activeWorker = null;
  let activeTimers = new Map();
  let isInitialized = false;

  /**
   * Request Notification Permission from the user
   */
  async function requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('[BackgroundNotifier] Notifications not supported in this environment');
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    try {
      const permission = await Notification.requestPermission();
      console.log('[BackgroundNotifier] Notification permission status:', permission);
      return permission;
    } catch (err) {
      console.warn('[BackgroundNotifier] Permission request error:', err);
      return Notification.permission;
    }
  }

  /**
   * Register the Service Worker for background notifications
   */
  async function registerServiceWorker(customPath) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[BackgroundNotifier] Service Workers not supported');
      return null;
    }

    if (swRegistration) {
      return swRegistration;
    }

    const swPaths = customPath
      ? [customPath]
      : ['./sw.js', 'sw.js', '/sw.js', 'public/sw.js'];

    for (const path of swPaths) {
      try {
        const reg = await navigator.serviceWorker.register(path, { scope: './' });
        swRegistration = reg;
        console.log('[BackgroundNotifier] Service Worker registered with scope:', reg.scope);
        return reg;
      } catch (err) {
        // Try next fallback path
      }
    }

    // Try ready promise fallback
    try {
      swRegistration = await navigator.serviceWorker.ready;
      return swRegistration;
    } catch (err) {
      console.warn('[BackgroundNotifier] Failed to resolve ServiceWorker registration:', err);
      return null;
    }
  }

  /**
   * Retrieve active Service Worker Registration
   */
  async function getRegistration() {
    if (swRegistration) return swRegistration;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.ready;
        return swRegistration;
      } catch {}
    }
    return null;
  }

  /**
   * Parse reminder time string or date into milliseconds delay
   * Supports: "08:00 AM", "8:30 PM", "14:00", Date objects, ISO strings, timestamps
   */
  function calculateDelayMs(scheduledTime) {
    const now = new Date();

    if (!scheduledTime) {
      // Default to 1 hour from now if missing
      return 60 * 60 * 1000;
    }

    // Direct timestamp or Date instance
    if (scheduledTime instanceof Date) {
      return Math.max(0, scheduledTime.getTime() - now.getTime());
    }

    if (typeof scheduledTime === 'number') {
      return Math.max(0, scheduledTime - now.getTime());
    }

    const timeStr = String(scheduledTime).trim();

    // Standard HH:MM [AM/PM] format
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const period = match[3] ? match[3].toUpperCase() : null;

      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 0, 0);

      // If scheduled time has already passed today, schedule for next occurrence tomorrow
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      return targetDate.getTime() - now.getTime();
    }

    // Fallback: try parsing as generic date string
    const parsed = Date.parse(timeStr);
    if (!isNaN(parsed)) {
      const delay = parsed - now.getTime();
      return delay > 0 ? delay : 24 * 60 * 60 * 1000 + delay;
    }

    // Default fallback 10 minutes
    return 10 * 60 * 1000;
  }

  /**
   * Load stored reminders from localStorage
   */
  function getStoredReminders() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save reminders array to localStorage
   */
  function saveStoredReminders(reminders) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch {}
  }

  /**
   * Trigger the notification through the Service Worker with required vibration pattern
   */
  async function triggerNotification(reminder) {
    const title = reminder.title || `⏰ Medicine Reminder: ${reminder.name || 'Dosage Due'}`;
    const message = reminder.message || (
      (reminder.dosage ? `${reminder.dosage} · ` : '') +
      (reminder.instructions || 'Time to take your scheduled dose.')
    );

    const options = {
      body: message,
      icon: reminder.icon || './carewell-icon-192.png',
      badge: './carewell-icon-192.png',
      vibrate: VIBRATION_PATTERN,
      requireInteraction: true,
      tag: `carewell-reminder-${reminder.id || Date.now()}`,
      data: {
        url: './',
        reminderId: reminder.id,
        scheduledTime: reminder.scheduledTime
      }
    };

    console.log('[BackgroundNotifier] Triggering notification:', title, options);

    // 1. Trigger via ServiceWorkerRegistration.showNotification (OS native background notification)
    try {
      const reg = await getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, options);
      }
    } catch (err) {
      console.warn('[BackgroundNotifier] showNotification error, falling back:', err);
      try {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, options);
        }
      } catch {}
    }

    // 2. Send message to Service Worker controller as secondary trigger channel
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_REMINDER',
          title,
          message,
          ...options
        });
      } catch {}
    }

    // 3. Mark reminder as triggered in storage
    const reminders = getStoredReminders();
    const updated = reminders.map(r => {
      if (r.id === reminder.id) {
        return { ...r, lastTriggered: Date.now(), triggered: true };
      }
      return r;
    });
    saveStoredReminders(updated);

    // 4. Dispatch in-app custom event & trigger loud alarm if window is open
    if (typeof window !== 'undefined') {
      try {
        if (window.AlarmManager && typeof window.AlarmManager.playLoudAlarm === 'function') {
          window.AlarmManager.playLoudAlarm(reminder);
        }
        window.dispatchEvent(new CustomEvent('carewell:reminderAlert', { detail: reminder }));
      } catch {}
    }
  }

  /**
   * Start un-throttled background timer ticker via Blob Web Worker
   * Handles inactive / background tab throttling seamlessly
   */
  function startBackgroundWorker() {
    if (activeWorker || typeof window === 'undefined' || !window.Worker || !window.Blob) {
      return;
    }

    try {
      const workerCode = `
        let interval = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!interval) {
              interval = setInterval(function() {
                self.postMessage('tick');
              }, 15000);
            }
          } else if (e.data === 'stop') {
            clearInterval(interval);
            interval = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      activeWorker = new Worker(blobUrl);

      activeWorker.onmessage = function (e) {
        if (e.data === 'tick') {
          checkPendingReminders();
        }
      };

      activeWorker.postMessage('start');
    } catch (e) {
      // Fallback standard setInterval if Web Worker is restricted
      setInterval(checkPendingReminders, 20000);
    }
  }

  /**
   * Check all stored reminders to fire any whose scheduled time has arrived
   */
  function checkPendingReminders() {
    const reminders = getStoredReminders();
    const now = Date.now();

    reminders.forEach(reminder => {
      if (!reminder.targetTimestamp) return;

      // Fire if target time has arrived and hasn't triggered in the last 2 minutes
      const hasElapsed = now >= reminder.targetTimestamp;
      const recentlyTriggered = reminder.lastTriggered && (now - reminder.lastTriggered < 120000);

      if (hasElapsed && !recentlyTriggered) {
        triggerNotification(reminder);

        // If recurring daily, advance targetTimestamp by 24 hours
        if (reminder.frequency === 'Daily' || reminder.repeat_label === 'Daily' || !reminder.frequency) {
          reminder.targetTimestamp += 24 * 60 * 60 * 1000;
          reminder.triggered = false;
        }
      }
    });

    saveStoredReminders(reminders);
  }

  /**
   * Schedule a reminder alert based on existing reminder time
   * Works even if the tab is inactive
   */
  function scheduleReminder(reminderData) {
    if (!reminderData) return null;

    const id = reminderData.id || `rem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const scheduledTime = reminderData.scheduled_time || reminderData.scheduledTime || reminderData.time || '08:00 AM';
    const delayMs = calculateDelayMs(scheduledTime);
    const targetTimestamp = Date.now() + delayMs;

    const reminder = {
      id,
      name: reminderData.name || 'Medication',
      dosage: reminderData.dosage || '',
      instructions: reminderData.instructions || 'Scheduled Dose',
      scheduledTime,
      delayMs,
      targetTimestamp,
      frequency: reminderData.frequency || reminderData.repeat_label || 'Daily',
      title: reminderData.title || `⏰ Medicine Reminder: ${reminderData.name || 'Scheduled Dose'}`,
      message: reminderData.message || (
        (reminderData.dosage ? `${reminderData.dosage} · ` : '') +
        (reminderData.instructions || 'Time to take your scheduled dose.')
      ),
      createdAt: Date.now(),
      triggered: false
    };

    // Store in localStorage
    const reminders = getStoredReminders();
    const existingIndex = reminders.findIndex(r => r.name === reminder.name && r.scheduledTime === reminder.scheduledTime);
    if (existingIndex >= 0) {
      reminders[existingIndex] = reminder;
    } else {
      reminders.push(reminder);
    }
    saveStoredReminders(reminders);

    // Clear previous timer for this ID if any
    if (activeTimers.has(id)) {
      clearTimeout(activeTimers.get(id));
      activeTimers.delete(id);
    }

    // Set client-side timeout
    const timerId = setTimeout(() => {
      triggerNotification(reminder);
      activeTimers.delete(id);
    }, delayMs);

    activeTimers.set(id, timerId);

    console.log(
      `[BackgroundNotifier] Scheduled "${reminder.name}" in ${(delayMs / 1000 / 60).toFixed(1)} mins (at ${new Date(targetTimestamp).toLocaleTimeString()})`
    );

    return reminder;
  }

  /**
   * Non-destructively sync and schedule existing medications from localStorage
   */
  function syncExistingMedications() {
    try {
      const raw = localStorage.getItem('carepill_local_medications');
      if (raw) {
        const meds = JSON.parse(raw);
        if (Array.isArray(meds)) {
          meds.forEach(med => {
            if (med.scheduled_time && med.status !== 'taken') {
              scheduleReminder({
                id: med.id,
                name: med.name,
                dosage: med.dosage,
                instructions: med.instructions,
                scheduled_time: med.scheduled_time,
                frequency: med.repeat_label || 'Daily'
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('[BackgroundNotifier] Error syncing existing medications:', err);
    }
  }

  /**
   * Attach listener hooks to the existing reminder creation event
   * Strictly modular and non-destructive: does NOT overwrite or break existing logic
   */
  function attachHooks() {
    if (typeof document === 'undefined') return;

    // Hook 1: Listen to #newScheduleForm submit event without interfering with existing listeners
    const form = document.getElementById('newScheduleForm');
    if (form && !form._bgReminderHookAttached) {
      form._bgReminderHookAttached = true;
      form.addEventListener('submit', function () {
        try {
          const medName = document.getElementById('schedMedName')?.value?.trim();
          const dosage = document.getElementById('schedDosage')?.value?.trim();
          const schedTime = document.getElementById('schedTime')?.value?.trim();
          const instructions = document.getElementById('schedInstructions')?.value?.trim();
          const frequency = document.getElementById('schedFrequency')?.value || 'Daily';

          if (medName && schedTime) {
            scheduleReminder({
              id: Date.now(),
              name: medName,
              dosage: dosage || '',
              instructions: instructions || 'Take as scheduled',
              scheduledTime: schedTime,
              frequency: frequency
            });
          }
        } catch (err) {
          console.warn('[BackgroundNotifier] Form listener hook error:', err);
        }
      }, true); // Use capture phase so reminder is captured reliably
    }

    // Hook 2: Transparent wrapper around window.handleScheduleSubmit if already registered
    if (typeof window !== 'undefined' && typeof window.handleScheduleSubmit === 'function' && !window.handleScheduleSubmit._bgHooked) {
      const originalHandler = window.handleScheduleSubmit;
      const wrappedHandler = async function (e) {
        const result = await originalHandler.apply(this, arguments);
        try {
          const medName = document.getElementById('schedMedName')?.value?.trim();
          const dosage = document.getElementById('schedDosage')?.value?.trim();
          const schedTime = document.getElementById('schedTime')?.value?.trim();
          const instructions = document.getElementById('schedInstructions')?.value?.trim();
          const frequency = document.getElementById('schedFrequency')?.value || 'Daily';

          if (medName && schedTime) {
            scheduleReminder({
              id: Date.now(),
              name: medName,
              dosage: dosage || '',
              instructions: instructions || 'Take as scheduled',
              scheduledTime: schedTime,
              frequency: frequency
            });
          }
        } catch (err) {
          console.warn('[BackgroundNotifier] Wrapper hook error:', err);
        }
        return result;
      };
      wrappedHandler._bgHooked = true;
      window.handleScheduleSubmit = wrappedHandler;
    }

    // Hook 3: Custom event listener for programmatic reminder creation
    if (typeof window !== 'undefined') {
      window.addEventListener('carewell:scheduleSaved', (event) => {
        if (event && event.detail) {
          scheduleReminder(event.detail);
        }
      });
      window.addEventListener('carewell:reminderCreated', (event) => {
        if (event && event.detail) {
          scheduleReminder(event.detail);
        }
      });
    }
  }

  /**
   * Plug-and-Play Initializer
   */
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[BackgroundNotifier] Initializing background reminder notification system...');

    // 1. Register Service Worker
    await registerServiceWorker();

    // 2. Request permission (or bind gentle unlock on first user gesture)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        // Already granted
      } else if (Notification.permission === 'default') {
        const unlockNotification = async () => {
          await requestPermission();
          document.removeEventListener('click', unlockNotification);
          document.removeEventListener('keydown', unlockNotification);
        };
        document.addEventListener('click', unlockNotification, { once: true });
        document.addEventListener('keydown', unlockNotification, { once: true });
      }
    }

    // 3. Attach non-destructive hooks to existing reminder save events
    attachHooks();

    // 4. Start background ticker for inactive tab support
    startBackgroundWorker();

    // 5. Sync any existing saved medications
    syncExistingMedications();

    // 6. Periodically check pending reminders as secondary safeguard
    setInterval(checkPendingReminders, 30000);

    return {
      scheduleReminder,
      requestPermission,
      registerServiceWorker,
      triggerNotification
    };
  }

  // Auto-init on DOM readiness in browser environments
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init());
    } else {
      setTimeout(init, 50);
    }
  }

  return {
    init,
    requestPermission,
    registerServiceWorker,
    scheduleReminder,
    triggerNotification,
    calculateDelayMs,
    attachHooks,
    getStoredReminders
  };
});
