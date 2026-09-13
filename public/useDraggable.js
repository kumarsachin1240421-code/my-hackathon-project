/**
 * CareWell — Robust Multi-Drag Movable AI Chatbot Utility & Hook
 * 
 * Module 2 Requirements:
 * - State Handling: Keeps track of coordinates { x, y } and boolean isDragging.
 * - Pointer / Drag Event Lifecycle:
 *   * When drag starts (mousedown or touchstart on chatbot bubble/header):
 *     Calculate pointer offset relative to chatbot element bounds. Set isDragging = true.
 *   * Global Tracking: Bind mousemove and touchmove directly to window.
 *   * Coordinate Clamping: Keep widget within viewport bounds:
 *     clamp(10, newX, window.innerWidth - chatbotWidth - 10)
 *     clamp(10, newY, window.innerHeight - chatbotHeight - 10).
 *   * Cleanup: Bind mouseup and touchend to window. Reset isDragging = false completely
 *     so subsequent drags trigger cleanly without state lockup.
 *   * CSS on drag handle: touch-action: none !important; user-select: none !important;
 *   * Position Retention: Store final { x, y } coordinates in localStorage.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.makeDraggable = exports.makeDraggable;
    root.useDraggable = exports.useDraggable;
    root.initDraggableChatbot = exports.initDraggableChatbot;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_STORAGE_KEY = 'carewell_chatbot_pos_v2';

  /**
   * Clamp helper: clamp(min, val, max)
   */
  function clamp(min, val, max) {
    return Math.max(min, Math.min(val, Math.max(min, max)));
  }

  /**
   * Make any DOM element continuously draggable without freezing
   */
  function makeDraggable(element, handle, options = {}) {
    if (!element) return null;

    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const handles = Array.isArray(handle) ? handle.filter(Boolean) : [handle || element];

    // State Handling
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let currentX = 0;
    let currentY = 0;
    let hasMoved = false;

    // Apply strict CSS requirements on drag handles
    handles.forEach((h) => {
      if (!h) return;
      h.style.setProperty('touch-action', 'none', 'important');
      h.style.setProperty('user-select', 'none', 'important');
      h.style.setProperty('-webkit-user-select', 'none', 'important');
      h.style.setProperty('cursor', 'grab', 'important');
    });

    /**
     * Restore saved position from localStorage
     */
    function restorePosition() {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const pos = JSON.parse(saved);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            const rect = element.getBoundingClientRect();
            const w = rect.width || 80;
            const h = rect.height || 80;
            const clampedX = clamp(10, pos.x, window.innerWidth - w - 10);
            const clampedY = clamp(10, pos.y, window.innerHeight - h - 10);
            applyPosition(clampedX, clampedY);
          }
        }
      } catch {}
    }

    /**
     * Apply coordinates { x, y } in fixed screen space
     */
    function applyPosition(x, y) {
      currentX = x;
      currentY = y;
      element.style.setProperty('position', 'fixed', 'important');
      element.style.setProperty('left', `${Math.round(x)}px`, 'important');
      element.style.setProperty('top', `${Math.round(y)}px`, 'important');
      element.style.setProperty('right', 'auto', 'important');
      element.style.setProperty('bottom', 'auto', 'important');
      element.style.setProperty('transform', 'none', 'important');
    }

    /**
     * Store final { x, y } in localStorage
     */
    function savePosition(x, y) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
      } catch {}
    }

    /**
     * Extract clientX / clientY from pointer event
     */
    function getPointerPos(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    /**
     * Global window mousemove / touchmove handler
     */
    function onPointerMove(e) {
      if (!isDragging) return;

      const pos = getPointerPos(e);
      const newX = pos.x - offsetX;
      const newY = pos.y - offsetY;

      // Small movement threshold to distinguish intentional drag from a stationary click
      if (!hasMoved && Math.hypot(newX - currentX, newY - currentY) > 4) {
        hasMoved = true;
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();

        const rect = element.getBoundingClientRect();
        const chatbotWidth = rect.width || 80;
        const chatbotHeight = rect.height || 80;

        // Coordinate Clamping strictly within viewport boundaries:
        // clamp(10, newX, window.innerWidth - chatbotWidth - 10)
        // clamp(10, newY, window.innerHeight - chatbotHeight - 10)
        const clampedX = clamp(10, newX, window.innerWidth - chatbotWidth - 10);
        const clampedY = clamp(10, newY, window.innerHeight - chatbotHeight - 10);

        applyPosition(clampedX, clampedY);
      }
    }

    /**
     * Global window mouseup / touchend / touchcancel cleanup handler
     */
    function onPointerEnd(e) {
      if (!isDragging) return;

      // Complete reset so subsequent drags trigger cleanly without state lockup
      isDragging = false;

      // Clean up global window listeners
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerEnd);
      window.removeEventListener('touchend', onPointerEnd);
      window.removeEventListener('touchcancel', onPointerEnd);

      // Restore cursor & body styles
      handles.forEach((h) => {
        if (h) h.style.setProperty('cursor', 'grab', 'important');
      });
      document.body.style.removeProperty('user-select');

      if (hasMoved) {
        savePosition(currentX, currentY);

        // Prevent accidental click triggering on release after dragging
        const preventClick = (clickEvt) => {
          clickEvt.stopPropagation();
          clickEvt.preventDefault();
        };
        window.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', preventClick, { capture: true }), 100);
      }
    }

    /**
     * Drag Start Handler (bound to handle elements)
     */
    function onPointerStart(e) {
      // Don't drag if user is clicking interactive controls (buttons, inputs, close buttons)
      if (e.target && e.target.closest && e.target.closest('button, input, textarea, a, select, [role="button"]:not(.bot-character-wrap)')) {
        return;
      }

      const pos = getPointerPos(e);
      const rect = element.getBoundingClientRect();

      // Calculate pointer offset relative to chatbot element bounds
      offsetX = pos.x - rect.left;
      offsetY = pos.y - rect.top;
      currentX = rect.left;
      currentY = rect.top;
      hasMoved = false;

      // Set isDragging = true
      isDragging = true;

      handles.forEach((h) => {
        if (h) h.style.setProperty('cursor', 'grabbing', 'important');
      });
      document.body.style.setProperty('user-select', 'none', 'important');

      // Bind mousemove and touchmove directly to window for global multi-drag tracking
      window.addEventListener('mousemove', onPointerMove, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('mouseup', onPointerEnd, { once: true });
      window.addEventListener('touchend', onPointerEnd, { once: true });
      window.addEventListener('touchcancel', onPointerEnd, { once: true });
    }

    // Attach start listeners to handles
    handles.forEach((h) => {
      if (!h) return;
      h.addEventListener('mousedown', onPointerStart);
      h.addEventListener('touchstart', onPointerStart, { passive: false });
    });

    // Window resize handler ensures widget stays within clamped boundaries
    window.addEventListener('resize', () => {
      const rect = element.getBoundingClientRect();
      const w = rect.width || 80;
      const h = rect.height || 80;
      const clampedX = clamp(10, rect.left, window.innerWidth - w - 10);
      const clampedY = clamp(10, rect.top, window.innerHeight - h - 10);
      if (clampedX !== rect.left || clampedY !== rect.top) {
        applyPosition(clampedX, clampedY);
        savePosition(clampedX, clampedY);
      }
    });

    // Restore position initially
    restorePosition();

    return {
      destroy: () => {
        handles.forEach((h) => {
          if (!h) return;
          h.removeEventListener('mousedown', onPointerStart);
          h.removeEventListener('touchstart', onPointerStart);
        });
      },
      restorePosition,
      applyPosition
    };
  }

  /**
   * Automatic initializer for CareWell floating chatbot and standalone chat
   */
  function initDraggableChatbot() {
    if (typeof document === 'undefined') return;

    // 1. CareWell Floating Bot Container & Avatar
    const botContainer = document.getElementById('carewellBotContainer');
    const botAvatar = document.getElementById('botCharacterAvatar');
    const botBubble = document.getElementById('botSpeechBubble');
    const drawerHeader = document.querySelector('.chat-drawer-header');

    if (botContainer) {
      const handles = [botAvatar, botBubble, drawerHeader].filter(Boolean);
      makeDraggable(botContainer, handles, {
        storageKey: 'carewell_floating_bot_coords'
      });
      console.log('[useDraggable] Continuous multi-drag initialized on CareWell AI chatbot.');
    }

    // 2. Standalone Chatbot Container (chatbot.html)
    const standaloneChat = document.querySelector('.chat-container');
    const standaloneHeader = document.querySelector('.chat-header');
    if (standaloneChat && standaloneHeader) {
      makeDraggable(standaloneChat, standaloneHeader, {
        storageKey: 'carewell_standalone_chat_coords'
      });
    }

    // 3. Keep position locked when bot visibility changes
    const observer = new MutationObserver(() => {
      const saved = localStorage.getItem('carewell_floating_bot_coords');
      if (saved && botContainer && botContainer.style.display !== 'none') {
        try {
          const pos = JSON.parse(saved);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            const rect = botContainer.getBoundingClientRect();
            const w = rect.width || 80;
            const h = rect.height || 80;
            const clampedX = clamp(10, pos.x, window.innerWidth - w - 10);
            const clampedY = clamp(10, pos.y, window.innerHeight - h - 10);
            botContainer.style.setProperty('left', `${clampedX}px`, 'important');
            botContainer.style.setProperty('top', `${clampedY}px`, 'important');
            botContainer.style.setProperty('right', 'auto', 'important');
            botContainer.style.setProperty('bottom', 'auto', 'important');
          }
        } catch {}
      }
    });

    if (botContainer) {
      observer.observe(botContainer, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  /**
   * React Hook Wrapper
   */
  function useDraggable(elementRef, handleRef, options = {}) {
    if (typeof window === 'undefined') return;
    const useEffect = (window.React && window.React.useEffect) || null;
    if (!useEffect) return;

    useEffect(() => {
      if (elementRef && elementRef.current) {
        const handle = (handleRef && handleRef.current) || elementRef.current;
        const instance = makeDraggable(elementRef.current, handle, options);
        return () => instance && instance.destroy();
      }
    }, [elementRef, handleRef]);
  }

  // Self-init on DOM readiness
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDraggableChatbot);
    } else {
      setTimeout(initDraggableChatbot, 50);
    }
  }

  return {
    makeDraggable,
    useDraggable,
    initDraggableChatbot,
    clamp
  };
});
