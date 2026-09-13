/**
 * CareWell — Draggable & Movable AI Chatbot Utility & Hook
 * 
 * Requirements:
 * - Supports Mouse events (mousedown, mousemove, mouseup) and Touch events (touchstart, touchmove, touchend).
 * - Allows click & drag or touch & drag on chatbot bubble / header anywhere on screen.
 * - Viewport boundary clamping so chatbot stays fully on-screen.
 * - cursor: grab and cursor: grabbing with touch-action: none to prevent mobile screen scroll conflicts.
 * - Saves last position in localStorage to persist across reloads.
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

  const DEFAULT_STORAGE_KEY = 'carewell_chatbot_position_v1';

  /**
   * Clamps x and y within the current viewport boundaries
   */
  function clampToViewport(x, y, elementWidth, elementHeight) {
    const winWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const winHeight = window.innerHeight || document.documentElement.clientHeight || 640;

    const w = elementWidth || 80;
    const h = elementHeight || 80;

    const maxX = Math.max(0, winWidth - w);
    const maxY = Math.max(0, winHeight - h);

    const clampedX = Math.max(8, Math.min(x, maxX - 8));
    const clampedY = Math.max(8, Math.min(y, maxY - 8));

    return { x: clampedX, y: clampedY };
  }

  /**
   * Make a DOM element draggable by one or more handle elements
   */
  function makeDraggable(element, handle, options = {}) {
    if (!element) return null;

    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const handles = Array.isArray(handle) ? handle.filter(Boolean) : [handle || element];

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialElemLeft = 0;
    let initialElemTop = 0;
    let hasMoved = false;

    // Apply grab styling to handles
    handles.forEach((h) => {
      if (!h) return;
      h.style.setProperty('cursor', 'grab', 'important');
      h.style.setProperty('touch-action', 'none', 'important');
      h.style.setProperty('user-select', 'none', 'important');
      h.style.setProperty('-webkit-user-select', 'none', 'important');
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
            const clamped = clampToViewport(pos.x, pos.y, rect.width, rect.height);
            applyPosition(clamped.x, clamped.y);
          }
        }
      } catch (err) {
        console.warn('[useDraggable] Position restore warning:', err);
      }
    }

    /**
     * Apply position in fixed coordinates
     */
    function applyPosition(x, y) {
      element.style.setProperty('position', 'fixed', 'important');
      element.style.setProperty('left', `${Math.round(x)}px`, 'important');
      element.style.setProperty('top', `${Math.round(y)}px`, 'important');
      element.style.setProperty('right', 'auto', 'important');
      element.style.setProperty('bottom', 'auto', 'important');
      element.style.setProperty('transform', 'none', 'important');
    }

    /**
     * Save position to localStorage
     */
    function savePosition(x, y) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
      } catch {}
    }

    /**
     * Extract clientX and clientY from Mouse or Touch event
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
     * Drag Start Handler
     */
    function onPointerStart(e) {
      // Don't drag if clicking interactive controls (buttons, inputs, links)
      if (e.target && e.target.closest && e.target.closest('button, input, textarea, a, select, [role="button"]:not(.bot-character-wrap)')) {
        return;
      }

      const pos = getPointerPos(e);
      startX = pos.x;
      startY = pos.y;

      const rect = element.getBoundingClientRect();
      initialElemLeft = rect.left;
      initialElemTop = rect.top;
      hasMoved = false;
      isDragging = true;

      handles.forEach((h) => h && h.style.setProperty('cursor', 'grabbing', 'important'));
      document.body.style.setProperty('user-select', 'none', 'important');

      window.addEventListener('mousemove', onPointerMove, { passive: false });
      window.addEventListener('mouseup', onPointerEnd, { once: true });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerEnd, { once: true });
      window.addEventListener('touchcancel', onPointerEnd, { once: true });

      if (options.onDragStart) options.onDragStart({ x: initialElemLeft, y: initialElemTop });
    }

    /**
     * Drag Move Handler
     */
    function onPointerMove(e) {
      if (!isDragging) return;

      const pos = getPointerPos(e);
      const deltaX = pos.x - startX;
      const deltaY = pos.y - startY;

      // Small threshold (5px) to differentiate click from drag
      if (!hasMoved && Math.hypot(deltaX, deltaY) > 5) {
        hasMoved = true;
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();

        const rect = element.getBoundingClientRect();
        const rawX = initialElemLeft + deltaX;
        const rawY = initialElemTop + deltaY;

        const clamped = clampToViewport(rawX, rawY, rect.width, rect.height);
        applyPosition(clamped.x, clamped.y);

        if (options.onDrag) options.onDrag({ x: clamped.x, y: clamped.y });
      }
    }

    /**
     * Drag End Handler
     */
    function onPointerEnd(e) {
      if (!isDragging) return;
      isDragging = false;

      handles.forEach((h) => h && h.style.setProperty('cursor', 'grab', 'important'));
      document.body.style.removeProperty('user-select');

      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);

      if (hasMoved) {
        const rect = element.getBoundingClientRect();
        const clamped = clampToViewport(rect.left, rect.top, rect.width, rect.height);
        savePosition(clamped.x, clamped.y);

        // Prevent ghost clicks if user dragged
        const preventGhostClick = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        window.addEventListener('click', preventGhostClick, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', preventGhostClick, { capture: true }), 100);

        if (options.onDragEnd) options.onDragEnd({ x: clamped.x, y: clamped.y });
      }
    }

    // Attach start listeners to each handle
    handles.forEach((h) => {
      if (!h) return;
      h.addEventListener('mousedown', onPointerStart);
      h.addEventListener('touchstart', onPointerStart, { passive: false });
    });

    // Handle window resize to keep element inside viewport
    window.addEventListener('resize', () => {
      const rect = element.getBoundingClientRect();
      const clamped = clampToViewport(rect.left, rect.top, rect.width, rect.height);
      if (clamped.x !== rect.left || clamped.y !== rect.top) {
        applyPosition(clamped.x, clamped.y);
        savePosition(clamped.x, clamped.y);
      }
    });

    // Restore saved position on initialization
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
   * Automatically initializes dragging on the CareWell Bot Container and Chat Drawer
   */
  function initDraggableChatbot() {
    if (typeof document === 'undefined') return;

    // 1. CareWell Floating Bot Container in main index.html
    const botContainer = document.getElementById('carewellBotContainer');
    const botAvatar = document.getElementById('botCharacterAvatar');
    const drawerHeader = document.querySelector('.chat-drawer-header');

    if (botContainer) {
      const handles = [botAvatar, drawerHeader].filter(Boolean);
      makeDraggable(botContainer, handles, {
        storageKey: 'carewell_floating_bot_pos'
      });
      console.log('[useDraggable] CareWell AI Chatbot draggable attached successfully.');
    }

    // 2. Standalone Chatbot container (chatbot.html)
    const standaloneChat = document.querySelector('.chat-container');
    const standaloneHeader = document.querySelector('.chat-header');
    if (standaloneChat && standaloneHeader) {
      makeDraggable(standaloneChat, standaloneHeader, {
        storageKey: 'carewell_standalone_chat_pos'
      });
    }

    // 3. Keep draggable position synchronized when bot authentication state changes
    const observer = new MutationObserver(() => {
      const saved = localStorage.getItem('carewell_floating_bot_pos');
      if (saved && botContainer && botContainer.style.display !== 'none') {
        try {
          const pos = JSON.parse(saved);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            const rect = botContainer.getBoundingClientRect();
            const clamped = clampToViewport(pos.x, pos.y, rect.width, rect.height);
            botContainer.style.setProperty('left', `${clamped.x}px`, 'important');
            botContainer.style.setProperty('top', `${clamped.y}px`, 'important');
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
   * React Hook Wrapper for Next.js / React components
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

  // Auto-init on DOMContentLoaded in browser environments
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDraggableChatbot);
    } else {
      setTimeout(initDraggableChatbot, 60);
    }
  }

  return {
    makeDraggable,
    useDraggable,
    initDraggableChatbot,
    clampToViewport
  };
});
