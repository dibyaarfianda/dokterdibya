import { ROLE_IDS } from './role-constants.js';

// Compact Chat Popup Widget (customized to Dr. Dibya Private Clinic)
// Implements in-bubble name + timestamp, #737373 incoming bubbles, blue outgoing,
// balanced padding, line-height 1.2, and fixed max-width.
// Preserves original auth, history loading, and realtime hooks.

(function () {
  'use strict';

  if (window.__chatPopupModuleLoaded) {
    console.log('[ChatPopup] Module already loaded, skipping duplicate initialization');
    return;
  }
  window.__chatPopupModuleLoaded = true;

  const CHAT_HISTORY_POLL_INTERVAL_MS = 15000;
  const CHAT_HISTORY_ERROR_BACKOFF_MS = 30000;
  const CHAT_NOTIFICATION_VOLUME_KEY = 'staff_team_chat_notification_volume_v1';
  let chatNotificationVolume = 100;
  try {
    const savedVolume = window.localStorage.getItem(CHAT_NOTIFICATION_VOLUME_KEY);
    if (savedVolume !== null && savedVolume.trim() !== '' && Number.isFinite(Number(savedVolume))) {
      chatNotificationVolume = Math.max(0, Math.min(100, Number(savedVolume)));
    }
  } catch (_) { /* Keep volume usable when browser storage is unavailable. */ }

  function applyChatNotificationVolume() {
    const audio = document.getElementById('chat-incoming-sound');
    if (audio) audio.volume = chatNotificationGain ? 1 : chatNotificationVolume / 100;
    if (chatNotificationGain) chatNotificationGain.gain.value = chatNotificationVolume / 100;
    const slider = document.getElementById('chat-notification-volume');
    if (slider) {
      slider.value = String(chatNotificationVolume);
      slider.setAttribute('aria-valuetext', chatNotificationVolume === 0 ? 'Senyap' : chatNotificationVolume + '%');
    }
    const value = document.getElementById('chat-notification-volume-value');
    if (value) value.textContent = chatNotificationVolume === 0 ? 'Senyap' : chatNotificationVolume + '%';
  }

  function bindChatNotificationVolume() {
    prepareChatNotificationAudio();
    applyChatNotificationVolume();
    if (IS_IOS_DEVICE) {
      document.addEventListener('pointerdown', resumeChatNotificationAudio, { passive: true });
      document.addEventListener('touchend', resumeChatNotificationAudio, { passive: true });
      document.addEventListener('keydown', resumeChatNotificationAudio);
    }
    const slider = document.getElementById('chat-notification-volume');
    if (!slider) return;
    slider.addEventListener('input', function () {
      const nextVolume = Number(slider.value);
      if (!Number.isFinite(nextVolume)) return;
      chatNotificationVolume = Math.max(0, Math.min(100, nextVolume));
      resumeChatNotificationAudio();
      applyChatNotificationVolume();
      try {
        window.localStorage.setItem(CHAT_NOTIFICATION_VOLUME_KEY, String(chatNotificationVolume));
      } catch (_) { /* The current page still retains the selected volume. */ }
    });
  }
  const IS_IOS_DEVICE = /iPad|iPhone|iPod/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let chatNotificationAudioContext = null;
  let chatNotificationGain = null;

  // iOS ignores HTMLMediaElement.volume, so attenuate only incoming audio
  // through Web Audio. Other browsers retain their existing media playback.
  function prepareChatNotificationAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audio = document.getElementById('chat-incoming-sound');
    if (!IS_IOS_DEVICE || !AudioContextClass || !audio || chatNotificationAudioContext) return;
    try {
      const context = new AudioContextClass();
      const gain = context.createGain();
      gain.gain.value = chatNotificationVolume / 100;
      gain.connect(context.destination);
      const source = context.createMediaElementSource(audio);
      source.connect(gain);
      chatNotificationAudioContext = context;
      chatNotificationGain = gain;
      audio.volume = 1;
    } catch (_) { /* Keep the original media playback if Web Audio is unavailable. */ }
  }

  function resumeChatNotificationAudio() {
    prepareChatNotificationAudio();
    if (chatNotificationAudioContext && chatNotificationAudioContext.state !== 'running') {
      try { chatNotificationAudioContext.resume().catch(() => {}); } catch (_) {}
    }
  }

  function isVisibleBottomNav(nav) {
    if (!nav) return false;
    var navStyle = typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(nav)
      : null;
    if (navStyle && (navStyle.display === 'none'
        || navStyle.visibility === 'hidden'
        || navStyle.opacity === '0')) {
      return false;
    }
    var navRect = nav.getBoundingClientRect();
    var viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
    var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var viewportBottom = viewportTop + viewportHeight;
    return navRect.height > 0 && navRect.bottom > viewportTop && navRect.top < viewportBottom;
  }

  // Sunday Clinic replaces the shell action bar with its embedded section nav.
  // Measure whichever bottom navigation is actually visible, never a hidden one.
  function getNavBottomPx() {
    var embeddedNav = document.querySelector('body.sunday-clinic-embedded-active .sc-staff-section-nav');
    var shellNav = document.getElementById('mobile-action-bar');
    var nav = isVisibleBottomNav(embeddedNav)
      ? embeddedNav
      : (isVisibleBottomNav(shellNav) ? shellNav : null);
    if (nav) {
      var navRect = nav.getBoundingClientRect();
      var viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
      var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      var viewportBottom = viewportTop + viewportHeight;
      var visibleNavHeight = Math.round(viewportBottom - navRect.top);
      if (visibleNavHeight < 0) visibleNavHeight = 0;
      var fullNavHeight = Math.round(navRect.height || nav.offsetHeight || 0);
      var cssNavHeight = 0;
      if (document.body && typeof window.getComputedStyle === 'function') {
        cssNavHeight = parseFloat(
          window.getComputedStyle(document.body).getPropertyValue('--sc-pwa-bottom-nav-height')
        ) || 0;
      }
      var requiredNavHeight = Math.max(visibleNavHeight, fullNavHeight, cssNavHeight);
      if (requiredNavHeight > 0) {
        return Math.min(140, Math.max(56, requiredNavHeight)) + 'px';
      }
    }
    return '65px';
  }

  function getChatFabInsetPx() {
    if (!document.body) return 6;
    return document.body.classList.contains('sunday-clinic-embedded-active') ? 10 : 6;
  }

  function getMobileViewportHeight() {
    if (window.visualViewport && window.visualViewport.height) {
      return Math.round(window.visualViewport.height);
    }
    if (window.innerHeight) return window.innerHeight;
    if (document.documentElement && document.documentElement.clientHeight) {
      return document.documentElement.clientHeight;
    }
    return 800;
  }

  function getMobileViewportTop() {
    if (window.visualViewport && typeof window.visualViewport.offsetTop === 'number') {
      return Math.max(0, Math.round(window.visualViewport.offsetTop));
    }
    return 0;
  }

  function getMobileViewportLeft() {
    if (window.visualViewport && typeof window.visualViewport.offsetLeft === 'number') {
      return Math.max(0, Math.round(window.visualViewport.offsetLeft));
    }
    return 0;
  }

  function getMobileViewportWidth() {
    if (window.visualViewport && window.visualViewport.width) {
      return Math.round(window.visualViewport.width);
    }
    if (window.innerWidth) return window.innerWidth;
    if (document.documentElement && document.documentElement.clientWidth) {
      return document.documentElement.clientWidth;
    }
    return 360;
  }

  function isDesktopWebChat() {
    var mobileApp = typeof window.isMobileAppMode === 'function'
      ? window.isMobileAppMode()
      : document.documentElement.classList.contains('mobile-app-mode')
        || document.body?.classList.contains('mobile-app-mode');
    return getMobileViewportWidth() > 768 && !mobileApp;
  }

  // The regular desktop shell uses CSS zoom: .8 on <html>. Cancel only that
  // inherited CSS scale for this viewport overlay, preserving browser zoom.
  function getChatZoomCorrection() {
    if (typeof window.getComputedStyle !== 'function') return 1;
    var scale = [document.documentElement, document.body].reduce(function (total, element) {
      var zoom = element ? parseFloat(window.getComputedStyle(element).zoom) : 1;
      return total * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
    }, 1);
    return 1 / scale;
  }

  function isChatKeyboardModeActive() {
    return !!(document.body && document.body.classList.contains('chat-keyboard-active'));
  }

  function setChatKeyboardMode(active) {
    if (!document.body) return;
    document.body.classList.toggle('chat-keyboard-active', !!active && !isDesktopWebChat());
  }

  var chatScrollFrameId = null;
  var chatScrollSettleTimerId = null;

  function scrollChatToLatest() {
    var messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function scheduleChatScrollToLatest() {
    if (chatScrollFrameId === null) {
      if (typeof window.requestAnimationFrame === 'function') {
        chatScrollFrameId = window.requestAnimationFrame(function () {
          chatScrollFrameId = null;
          scrollChatToLatest();
        });
      } else {
        scrollChatToLatest();
      }
    }

    if (chatScrollSettleTimerId !== null) {
      window.clearTimeout(chatScrollSettleTimerId);
    }
    chatScrollSettleTimerId = window.setTimeout(function () {
      chatScrollSettleTimerId = null;
      scrollChatToLatest();
    }, 180);
  }

  // Layout is shared by the early UI and the authenticated UI on every screen.
  var chatPanelOpen = false;
  var chatCloseTimer = null;
  var savedPageOverflow = null;
  function setChatPageScrollLocked(locked) {
    if (locked) {
      if (!savedPageOverflow) {
        savedPageOverflow = [document.body, document.documentElement].map(function (element) {
          return { element: element, value: element.style.getPropertyValue('overflow'), priority: element.style.getPropertyPriority('overflow') };
        });
      }
      savedPageOverflow.forEach(function (entry) { entry.element.style.setProperty('overflow', 'hidden', 'important'); });
    } else {
      (savedPageOverflow || []).forEach(function (entry) {
        if (entry.value) entry.element.style.setProperty('overflow', entry.value, entry.priority);
        else entry.element.style.removeProperty('overflow');
      });
      savedPageOverflow = null;
    }
  }
  const CHAT_FAB_POSITION_KEY = 'staff_team_chat_fab_position_v1';
  var chatFabPosition = null;
  try {
    var storedFabPosition = JSON.parse(window.localStorage.getItem(CHAT_FAB_POSITION_KEY));
    if (storedFabPosition && Number.isFinite(storedFabPosition.x) && Number.isFinite(storedFabPosition.y)) {
      chatFabPosition = {
        x: Math.max(0, Math.min(1, storedFabPosition.x)),
        y: Math.max(0, Math.min(1, storedFabPosition.y))
      };
    }
  } catch (_) { /* Storage can be unavailable; the in-memory position still works. */ }

  function applyMobileViewportFrame(cont) {
    var compact = isDesktopWebChat();
    var viewportWidth = getMobileViewportWidth();
    var viewportHeight = getMobileViewportHeight();
    var width = compact ? Math.min(400, viewportWidth - 32) : viewportWidth;
    var height = compact ? Math.min(560, Math.max(1, viewportHeight - 32)) : viewportHeight;
    cont.style.setProperty('zoom', String(getChatZoomCorrection()), 'important');
    cont.style.setProperty('position', 'fixed', 'important');
    cont.style.setProperty('top', (getMobileViewportTop() + (compact ? viewportHeight - height - 16 : 0)) + 'px', 'important');
    cont.style.setProperty('left', (getMobileViewportLeft() + (compact ? viewportWidth - width - 16 : 0)) + 'px', 'important');
    cont.style.setProperty('right', 'auto', 'important');
    cont.style.setProperty('bottom', 'auto', 'important');
    cont.style.setProperty('width', width + 'px', 'important');
    cont.style.setProperty('height', height + 'px', 'important');
  }

  function getFabBounds(btn) {
    var rect = btn.getBoundingClientRect();
    var width = getMobileViewportWidth();
    var height = getMobileViewportHeight();
    var insetX = Math.min(8, Math.max(0, (width - rect.width) / 2));
    var insetY = Math.min(8, Math.max(0, (height - rect.height) / 2));
    return {
      left: getMobileViewportLeft() + insetX,
      top: getMobileViewportTop() + insetY,
      travelX: Math.max(0, width - rect.width - insetX * 2),
      travelY: Math.max(0, height - rect.height - insetY * 2)
    };
  }

  function applyFabPosition(cont, btn) {
    if (!chatFabPosition || !btn) return;
    var bounds = getFabBounds(btn);
    cont.style.setProperty('left', Math.round(bounds.left + chatFabPosition.x * bounds.travelX) + 'px', 'important');
    cont.style.setProperty('top', Math.round(bounds.top + chatFabPosition.y * bounds.travelY) + 'px', 'important');
    cont.style.setProperty('right', 'auto', 'important');
    cont.style.setProperty('bottom', 'auto', 'important');
  }

  function bindFabDrag(btn) {
    if (!btn || btn.__teamChatDragBound) return;
    btn.__teamChatDragBound = true;
    var drag = null;
    var suppressClick = false;
    btn.addEventListener('pointerdown', function (event) {
      if (event.isPrimary === false || event.button !== 0 || chatPanelOpen) return;
      suppressClick = false;
      var rect = btn.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top,
        previous: chatFabPosition, moved: false };
      try { btn.setPointerCapture(event.pointerId); } catch (_) {}
    });
    btn.addEventListener('pointermove', function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) <= 6) return;
      drag.moved = true;
      suppressClick = true;
      event.preventDefault();
      btn.classList.add('chat-fab-dragging');
      var bounds = getFabBounds(btn);
      chatFabPosition = {
        x: bounds.travelX ? Math.max(0, Math.min(1, (drag.left + dx - bounds.left) / bounds.travelX)) : 0,
        y: bounds.travelY ? Math.max(0, Math.min(1, (drag.top + dy - bounds.top) / bounds.travelY)) : 0
      };
      applyFabPosition(document.getElementById('chat-popup-container'), btn);
    });
    function finishDrag(event) {
      if (!drag || drag.id !== event.pointerId) return;
      var finished = drag;
      drag = null;
      btn.classList.remove('chat-fab-dragging');
      if (event.type !== 'pointerup') {
        chatFabPosition = finished.previous;
        suppressClick = true;
        ensureFAB();
      } else if (finished.moved) {
        try { window.localStorage.setItem(CHAT_FAB_POSITION_KEY, JSON.stringify(chatFabPosition)); } catch (_) {}
      }
      try { btn.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    btn.addEventListener('pointerup', finishDrag);
    btn.addEventListener('pointercancel', finishDrag);
    btn.addEventListener('lostpointercapture', finishDrag);
    btn.addEventListener('click', function (event) {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  // ---------- ENSURE FAB EXISTS + VISIBLE (creates if missing, restores if hidden) ----------
  var _ensureFABBusy = false;
  function ensureFAB() {
    if (_ensureFABBusy) return;
    _ensureFABBusy = true;
    try { _ensureFABImpl(); } finally { _ensureFABBusy = false; }
  }
  function _ensureFABImpl() {
    var cont = document.getElementById('chat-popup-container');
    if (!cont) {
      // FAB was removed from DOM — recreate it
      cont = document.createElement('div');
      cont.id = 'chat-popup-container';
      cont.innerHTML = '<button type="button" id="chat-toggle-btn" class="chat-toggle-btn" aria-label="Buka Chat Tim" title="Buka Chat Tim" aria-controls="chat-box" aria-expanded="false" onclick="window.toggleChatPopup&&window.toggleChatPopup()" style="width:56px;height:56px;border-radius:50%;background:#007BFF;color:#fff;border:none;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 15px rgba(0,0,0,.4);position:relative;"><i class="fas fa-comments"></i><span id="chat-badge" class="chat-badge" style="display:none;">0</span></button>';
      var target = document.body || document.documentElement;
      if (target) target.appendChild(cont);
      console.log('[ChatPopup] FAB recreated by guardian');
    }
    var chatOpen = cont.classList.contains('chat-is-open');
    if (chatOpen) {
      applyMobileFullScreen(cont);
    } else if (!chatOpen) {
      // FAB mode
      var navH2 = getNavBottomPx();
      var navPx2 = parseInt(navH2, 10);
      if (isNaN(navPx2)) navPx2 = 65;
      var fabBottom = (navPx2 + getChatFabInsetPx()) + 'px';
      cont.style.cssText = '';
      cont.style.setProperty('zoom', String(getChatZoomCorrection()), 'important');
      cont.style.setProperty('position', 'fixed', 'important');
      cont.style.setProperty('display', 'block', 'important');
      cont.style.setProperty('visibility', 'visible', 'important');
      cont.style.setProperty('opacity', '1', 'important');
      cont.style.setProperty('z-index', '2147483647', 'important');
      cont.style.setProperty('pointer-events', 'auto', 'important');
      cont.style.setProperty('bottom', fabBottom, 'important');
      cont.style.setProperty('right', '14px', 'important');
      var btn = document.getElementById('chat-toggle-btn');
      if (btn) {
        btn.style.setProperty('display', 'flex', 'important');
        btn.style.setProperty('visibility', 'visible', 'important');
        btn.style.setProperty('opacity', '1', 'important');
        applyFabPosition(cont, btn);
        bindFabDrag(btn);
      }
    }
  }

  // Run immediately
  ensureFAB();

  // Guardian interval — every 2s (200ms was too aggressive, triggered observer loop)

  // Keep the historical export name; desktop web now uses a compact frame.
  function applyMobileFullScreen(cont) {
    var compact = isDesktopWebChat();
    cont.classList.toggle('chat-is-compact', compact);
    if (cont.parentNode !== document.body) document.body.appendChild(cont);
    cont.style.cssText = '';
    applyMobileViewportFrame(cont);
    cont.style.setProperty('margin', '0', 'important');
    cont.style.setProperty('padding', '0', 'important');
    cont.style.setProperty('display', 'block', 'important');
    cont.style.setProperty('visibility', 'visible', 'important');
    cont.style.setProperty('opacity', '1', 'important');
    cont.style.setProperty('z-index', '2147483647', 'important');
    cont.style.setProperty('pointer-events', 'auto', 'important');
    cont.style.setProperty('transform', 'none', 'important');
    cont.style.setProperty('border-radius', compact ? '12px' : '0', 'important');
    cont.style.setProperty('box-shadow', compact ? '0 8px 32px rgba(0,0,0,.2)' : 'none', 'important');
    setChatPageScrollLocked(!compact);
    if (compact) setChatKeyboardMode(false);
    // Style chat-box to fill container
    var box = document.getElementById('chat-box');
    if (box) {
      box.style.setProperty('width', '100%', 'important');
      box.style.setProperty('height', '100%', 'important');
      box.style.setProperty('border-radius', compact ? '12px' : '0', 'important');
      box.style.setProperty('box-shadow', 'none', 'important');
      box.style.setProperty('max-height', 'none', 'important');
      box.style.setProperty('max-width', 'none', 'important');
      box.setAttribute('aria-modal', String(!compact));
    }
  }

  // Export so toggle functions can call it
  window._applyChatMobileFullScreen = applyMobileFullScreen;

  var _chatLayoutSyncQueued = false;
  function syncChatLayout() {
    var cont = document.getElementById('chat-popup-container');
    if (!cont) return;
    if (!cont.classList.contains('chat-is-open')) {
      ensureFAB();
      return;
    }
    applyMobileFullScreen(cont);
    scheduleChatScrollToLatest();
  }

  function queueChatLayoutSync() {
    if (_chatLayoutSyncQueued) return;
    _chatLayoutSyncQueued = true;
    requestAnimationFrame(function () {
      _chatLayoutSyncQueued = false;
      syncChatLayout();
    });
  }

  window.addEventListener('resize', queueChatLayoutSync, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueChatLayoutSync, { passive: true });
    window.visualViewport.addEventListener('scroll', queueChatLayoutSync, { passive: true });
  }
  document.addEventListener('page:changed', queueChatLayoutSync);
  document.addEventListener('sunday-clinic:viewport-synced', queueChatLayoutSync);

  // MutationObserver — instant detection if FAB is removed or attribute changed
  function startObserver() {
    if (!document.body) {
      // body not ready yet, wait
      setTimeout(startObserver, 10);
      return;
    }
    var obs = new MutationObserver(function (mutations) {
      var needsFix = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        // Detect FAB removal
        if (m.type === 'childList' && m.removedNodes) {
          for (var j = 0; j < m.removedNodes.length; j++) {
            var n = m.removedNodes[j];
            if (n.id === 'chat-popup-container' || (n.querySelector && n.querySelector('#chat-popup-container'))) {
              needsFix = true;
              break;
            }
          }
        }
        // Detect style/class changes on FAB
        if (m.type === 'attributes' && m.target && m.target.id === 'chat-popup-container') {
          needsFix = true;
        }
        if (needsFix) break;
      }
      if (needsFix) ensureFAB();
    });
    // Only watch for FAB removal from body — DO NOT watch style/attribute changes
    // (watching style causes infinite loop: ensureFAB sets style → observer fires → ensureFAB again)
    obs.observe(document.body, { childList: true, subtree: false });
  }
  startObserver();

  // Backwards-compat alias
  var forceFABVisible = ensureFAB;

  function restoreChatFabAfterClose(cont, btn) {
    if (cont && document.activeElement && cont.contains(document.activeElement)
        && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (cont) cont.classList.remove('chat-is-open', 'chat-is-closing');
    ensureFAB();
    if (btn) btn.style.setProperty('display', 'flex', 'important');
  }

  function setChatPanelOpen(open) {
    var cont = document.getElementById('chat-popup-container');
    var box = document.getElementById('chat-box');
    var btn = document.getElementById('chat-toggle-btn');
    if (!cont || !box) return;
    if (!open && (!cont.classList.contains('chat-is-open') || chatCloseTimer !== null)) return;
    if (chatCloseTimer !== null) { window.clearTimeout(chatCloseTimer); chatCloseTimer = null; }
    chatPanelOpen = open;
    setChatKeyboardMode(false);
    btn?.setAttribute('aria-expanded', String(open));
    var reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      cont.classList.remove('chat-is-closing');
      cont.classList.add('chat-is-open');
      if (btn) btn.style.setProperty('display', 'none', 'important');
      box.classList.add('chat-open');
      box.style.setProperty('display', 'flex', 'important');
      box.setAttribute('aria-hidden', 'false');
      applyMobileFullScreen(cont);
      box.style.setProperty('animation', reducedMotion ? 'none' : 'chatPanelSlideIn 250ms ease both', 'important');
      scheduleChatScrollToLatest();
    } else {
      if (document.activeElement && cont.contains(document.activeElement)) document.activeElement.blur();
      cont.classList.add('chat-is-closing');
      box.style.setProperty('animation', reducedMotion ? 'none' : 'chatPanelSlideOut 250ms ease both', 'important');
      var finishClose = function () {
        chatCloseTimer = null;
        box.style.setProperty('display', 'none', 'important');
        box.classList.remove('chat-open');
        box.setAttribute('aria-hidden', 'true');
        restoreChatFabAfterClose(cont, btn);
        setChatPageScrollLocked(false);
        if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
      };
      if (reducedMotion) finishClose();
      else chatCloseTimer = window.setTimeout(finishClose, 250);
    }
  }

  // ---------- EARLY STUB FUNCTIONS for WebView onclick compatibility ----------
  // These will be replaced with real implementations after init
  // This ensures onclick handlers work even before async init completes
  let chatInitialized = false;
  let pendingToggle = false;
  let pendingClose = false;

  window.toggleChatPopup = function() {
    if (chatInitialized && window._realToggleChatPopup) {
      window._realToggleChatPopup();
    } else {
      pendingToggle = true;
      console.log('[ChatPopup] Toggle pending - not initialized yet');
    }
  };

  window.closeChatPopup = function() {
    if (chatInitialized && window._realCloseChatPopup) {
      window._realCloseChatPopup();
    } else {
      pendingClose = true;
      console.log('[ChatPopup] Close pending - not initialized yet');
    }
  };

  // ---------- UTIL: color per role + avatar ----------
  // Badge colors for chat name (matching auth.js badge colors)
  function colorFromRoleId(roleId) {
    if (roleId === ROLE_IDS.DOKTER) return '#ff6b6b';      // lighter red for dokter (badge-danger)
    if (roleId === ROLE_IDS.ADMIN) return '#ffc107';       // yellow/gold for admin (badge-warning)
    if (roleId === ROLE_IDS.MANAGERIAL) return '#17a2b8'; // cyan for managerial (badge-info)
    return '#adb5bd'; // lighter gray for others (badge-secondary)
  }

  const namePalette = [
    "#ffd6a5", "#b5ead7", "#a0c4ff", "#fdffb6",
    "#cdb4db", "#fbc4ab", "#d0f4de", "#ffc6ff"
  ];

  function colorFromName(name = '') {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return namePalette[h % namePalette.length];
  }

  function getInitials(name = '') {
    return name
      .split(' ')
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  const API_ORIGIN = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

  async function getChatToken() {
    const fallbackToken = async () => {
      return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
        ? window.getAuthToken()
        : null;
    };

    try {
      if (window.getAuthToken && typeof window.getAuthToken === 'function') {
        const token = await window.getAuthToken();
        if (token) return token;
      }
    } catch (error) {
      console.warn('[ChatPopup] getAuthToken failed:', error?.message || error);
    }

    try {
      if (window.getIdToken && typeof window.getIdToken === 'function') {
        const token = await window.getIdToken();
        if (token) return token;
      }
    } catch (error) {
      console.warn('[ChatPopup] getIdToken failed:', error?.message || error);
    }

    try {
      if (window.getToken && typeof window.getToken === 'function') {
        const token = await window.getToken();
        if (token) return token;
      }
    } catch (error) {
      console.warn('[ChatPopup] getToken failed:', error?.message || error);
    }

    return fallbackToken();
  }

  function getStoredChatToken() {
    try {
      return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
        ? window.getAuthToken()
        : null;
    } catch (error) {
      console.warn('[ChatPopup] Failed to read stored auth token:', error?.message || error);
      return null;
    }
  }

  function normalizeUserFromTokenPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      const payload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
      return JSON.parse(atob(payload));
    } catch (error) {
      console.warn('[ChatPopup] Failed to parse auth token payload:', error?.message || error);
      return null;
    }
  }

  async function resolveAuthUser() {
    const hasUserId = (candidate) => !!(candidate && (candidate.id || candidate.uid || candidate.user_id || candidate.new_id));

    if (hasUserId(window.auth && window.auth.currentUser)) {
      return window.auth.currentUser;
    }

    if (hasUserId(window.currentStaffIdentity)) {
      return window.currentStaffIdentity;
    }

    if (hasUserId(window.currentStaffUser)) {
      return window.currentStaffUser;
    }

    if (window.__realtimeSyncState && hasUserId(window.__realtimeSyncState.currentUser)) {
      return window.__realtimeSyncState.currentUser;
    }

    const token = await getChatToken();
    if (!token) return null;

    const payload = normalizeUserFromTokenPayload(token);
    if (!payload) return null;

    return {
      id: payload.id || payload.user_id || payload.uid || payload.sub || null,
      uid: payload.uid || payload.id || payload.user_id || payload.sub || null,
      name: payload.name || payload.fullName || payload.email || 'Unknown',
      role: payload.role || payload.user_role || '',
      email: payload.email || null
    };
  }

  function collectCurrentChatUserIds(localUser) {
    const ids = new Set();
    const addId = (value) => {
      const normalized = String(value == null ? '' : value).trim();
      if (normalized) ids.add(normalized);
    };

    const realtimeState = window.__realtimeSyncState || {};
    const candidates = [
      localUser,
      window.auth && window.auth.currentUser,
      window.currentStaffIdentity,
      window.currentStaffUser,
      realtimeState.currentUser
    ];

    candidates.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      addId(candidate.id);
      addId(candidate.uid);
      addId(candidate.user_id);
      addId(candidate.new_id);
    });

    const payload = normalizeUserFromTokenPayload(getStoredChatToken());
    if (payload) {
      addId(payload.id);
      addId(payload.uid);
      addId(payload.user_id);
      addId(payload.new_id);
      addId(payload.sub);
    }

    return ids;
  }

  function normalizeChatNameForMatch(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collectCurrentChatUserNames(localUser) {
    const names = new Set();
    const addName = (value) => {
      const normalized = normalizeChatNameForMatch(value);
      if (normalized) names.add(normalized);
    };

    const realtimeState = window.__realtimeSyncState || {};
    const candidates = [
      localUser,
      window.auth && window.auth.currentUser,
      window.currentStaffIdentity,
      window.currentStaffUser,
      realtimeState.currentUser
    ];

    candidates.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      addName(candidate.name);
      addName(candidate.displayName);
      addName(candidate.fullName);
      addName(candidate.email);
    });

    const payload = normalizeUserFromTokenPayload(getStoredChatToken());
    if (payload) {
      addName(payload.name);
      addName(payload.displayName);
      addName(payload.fullName);
      addName(payload.email);
    }

    return names;
  }

  function normalizeChatTextForMatch(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  // ---------- HTML ----------
  const chatVolumeHTML = `
    <div class="chat-notification-volume">
      <label for="chat-notification-volume"><i class="fas fa-volume-up" aria-hidden="true"></i> Volume notifikasi</label>
      <input id="chat-notification-volume" type="range" min="0" max="100" step="1" value="100">
      <output id="chat-notification-volume-value" for="chat-notification-volume">100%</output>
    </div>
  `;
  const chatHTML = `
    <div id="chat-popup-container">
      <!-- Floating Chat Button -->
      <button type="button" id="chat-toggle-btn" class="chat-toggle-btn" onclick="window.toggleChatPopup && window.toggleChatPopup()" aria-label="Buka Chat Tim" aria-controls="chat-box" aria-expanded="false" title="Buka Chat Tim">
        <i class="fas fa-comments"></i>
        <span class="chat-badge" style="display:none;">0</span>
      </button>

      <!-- Chat Box -->
      <div id="chat-box" class="chat-box" role="dialog" aria-label="Team Chat" aria-modal="true" aria-hidden="true" style="display:none;">
        <div class="chat-header">
          <div class="chat-header-content">
            <div>
              <div class="chat-header-title">Team Chat</div>
              <div class="chat-header-online" id="chat-online-users">
                <i class="fas fa-circle" style="font-size: 8px; color: #4ade80;"></i>
                <span id="online-names"></span>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="chat-clear-btn" class="chat-clear-btn" aria-label="Clear Chat" title="Clear Chat">
              <i class="fas fa-trash-alt"></i>
            </button>
            <button type="button" id="chat-close-btn" class="chat-close-btn" onclick="window.closeChatPopup && window.closeChatPopup()" aria-label="Tutup chat" title="Tutup chat">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        ${chatVolumeHTML}
        <div class="chat-messages" id="chat-messages">
          <!-- Messages will be loaded here -->
        </div>

        <div class="chat-input-container">
          <input type="text" id="chat-input" class="chat-input" placeholder="Ketik pesan...">
          <button id="chat-send-btn" class="chat-send-btn" aria-label="Kirim">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  // ---------- CSS ----------
  const chatCSS = `
    <style>
      /* CRITICAL: Force FAB always visible - overrides ALL other CSS including mobile-responsive.css */
      #chat-popup-container {
        position: fixed !important;
        bottom: 80px !important;
        right: 14px !important;
        z-index: 2147483647 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      body.has-mobile-action-bar #chat-popup-container {
        bottom: calc(110px + env(safe-area-inset-bottom)) !important;
      }

      @media (max-width: 991.98px) {
        #chat-popup-container {
          bottom: 75px !important;
          right: 12px !important;
        }

        body.chat-keyboard-active #mobile-action-bar,
        body.chat-keyboard-active .mobile-action-bar-force {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          transform: translateY(120%) !important;
          transition: opacity .12s ease, transform .12s ease, visibility .12s ease !important;
        }
      }

      /* Toggle button always visible; hidden only when container has .chat-is-open class */
      #chat-popup-container #chat-toggle-btn,
      #chat-popup-container .chat-toggle-btn {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Hide toggle button ONLY when chat is open (class-based, no JS inline needed) */
      #chat-popup-container.chat-is-open #chat-toggle-btn,
      #chat-popup-container.chat-is-open .chat-toggle-btn {
        display: none !important;
      }

      .chat-toggle-btn {
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; box-shadow: 0 4px 12px rgba(102,126,234,.4);
        transition: box-shadow .2s ease; position: relative;
        touch-action: none !important; user-select: none !important; -webkit-user-select: none !important;
        cursor: grab !important; padding: 0 !important;
      }
      .chat-toggle-btn:hover { box-shadow: 0 6px 16px rgba(102,126,234,.5); }
      #chat-toggle-btn.chat-fab-dragging { cursor: grabbing !important; transform: none !important; }

      .chat-badge {
        position: absolute; top: -5px; right: -5px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: #fff; border-radius: 12px; padding: 2px 6px;
        font-size: 11px; font-weight: bold; min-width: 20px; text-align: center;
      }

      .chat-box {
        width: 340px; height: 480px; background: #fff; border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,.12);
        display: flex; flex-direction: column; overflow: hidden;
      }
      @keyframes chatPanelSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes chatPanelSlideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }

      /* Header compact per request */
      .chat-header {
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; padding: 10px 12px; /* compact vertically */
        display: flex; justify-content: space-between; align-items: center;
        box-shadow: 0 2px 8px rgba(0,0,0,.1);
      }
      .chat-header-content { display: flex; align-items: center; }
      .chat-header-title { font-weight: 600; font-size: 15px; line-height: 1.2; }
      .chat-header-online { 
        font-size: 11px; line-height: 1.2; margin-top: 2px; 
        opacity: 0.9; display: flex; align-items: center; gap: 4px;
      }
      #chat-popup-container.chat-is-compact .chat-header { gap: 8px !important; }
      #chat-popup-container.chat-is-compact .chat-header-content {
        flex: 1 !important; min-width: 0 !important;
      }
      #chat-popup-container.chat-is-compact .chat-header-content > div { min-width: 0 !important; }
      #chat-popup-container.chat-is-compact .chat-header-content + div { flex-shrink: 0 !important; }
      #chat-popup-container.chat-is-compact #online-names {
        min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;
      }

      #chat-box .chat-notification-volume {
        display: flex !important; align-items: center !important; gap: 10px !important;
        flex-shrink: 0 !important; padding: 6px 12px !important;
        background: #f8fafc !important; border-bottom: 1px solid #e2e8f0 !important;
        color: #475569 !important; font-size: 12px !important;
      }
      #chat-box .chat-notification-volume label {
        margin: 0 !important; white-space: nowrap !important; font-weight: 500 !important;
      }
      #chat-box #chat-notification-volume {
        flex: 1 !important; min-width: 0 !important; width: auto !important; height: 32px !important;
        margin: 0 !important; padding: 0 !important; accent-color: #007bff !important; cursor: pointer !important;
      }
      #chat-box #chat-notification-volume-value {
        min-width: 44px !important; padding: 0 !important; text-align: right !important; font-variant-numeric: tabular-nums;
      }

      #chat-popup-container #chat-close-btn.chat-close-btn {
        background: rgba(255,255,255,.2); border: none; color: #fff;
        width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
        border-radius: 50%; cursor: pointer; flex-shrink: 0 !important;
        display:flex; align-items:center; justify-content:center; transition: all .2s ease;
      }
      #chat-popup-container .chat-close-btn span { font-size: 28px !important; line-height: 1 !important; }
      .chat-close-btn:hover { background: rgba(255,255,255,.3); }

      .chat-clear-btn {
        background: rgba(220,38,38,.85); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        display:flex; align-items:center; justify-content:center; transition: all .2s ease;
        font-size: 12px;
      }
      .chat-clear-btn:hover { background: rgba(220,38,38,1); transform: scale(1.05); }
      .chat-clear-btn:active { transform: scale(0.95); }

      /* Background di belakang bubble = abu-abu */
      .chat-messages {
        flex: 1; overflow-y: auto; padding: 12px;
        background: #e5e7eb; /* gray-300 */
      }
      .chat-messages::-webkit-scrollbar { width: 6px; }
      .chat-messages::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%); border-radius: 10px;
      }

      .chat-message {
        margin-bottom: 8px; display: flex; flex-flow: row nowrap; gap: 8px;
        animation: fadeIn .3s ease; width: 100%; align-items: flex-start;
      }
      @keyframes fadeIn { from {opacity:0; transform: translateY(10px);} to {opacity:1; transform: translateY(0);} }

      .chat-message.sent { justify-content: flex-end; }
      .chat-message.received { justify-content: flex-start; }

      /* Avatar */
      .chat-avatar {
        width: 36px; height: 36px; min-width: 36px; min-height: 36px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 600; font-size: 14px; color: #111827;
        box-shadow: 0 1px 2px rgba(0,0,0,.1); flex-shrink: 0;
        overflow: hidden; background-size: cover; background-position: center;
      }
      
      .chat-avatar img {
        width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
      }
      
      .chat-avatar-spacer { width: 36px; min-width: 36px; flex-shrink: 0; }

      .chat-message-wrapper { display: flex; flex-direction: column; max-width: 65%; }

      /* BUBBLE BASE — padding 10px semua sisi */
      .chat-message-content {
        padding: 10px; border-radius: 6px; font-size: 15.4px; font-weight: 400; line-height: 1.2;
        letter-spacing: 0.1px; word-wrap: break-word; word-break: break-word; white-space: normal;
        overflow-wrap: break-word; display: inline-block; min-width: 64px;
        writing-mode: horizontal-tb; direction: ltr;
        box-shadow: 0 1px 2px rgba(0,0,0,.1);
      }

      /* Incoming: biru gelap, teks putih; Outgoing: biru terang */
      .chat-message.received .chat-message-content {
        background: #0056b3; color: #fff; text-align: left;
      }
      .chat-message.sent .chat-message-content {
        background: #007bff; color: #fff; text-align: right;
      }

      /* Nama di dalam bubble (bold, kecil) + warna */
      .chat-name {
        font-size: 14.1px; font-weight: 700; margin-bottom: 1px; line-height: 1.1;
      }
      
      /* Text content */
      .chat-text {
        display: block; line-height: 1.2; margin: 0; padding: 0;
      }

      /* Timestamp di dalam bubble, spasi sedikit ke bawah */
      .chat-message-time {
        font-size: 11px; margin-top: 2px; line-height: 1.1;
      }
      .chat-message.received .chat-message-time { color: #d1d5db; } /* gray-300 */
      .chat-message.sent .chat-message-time { color: #dbeafe; }     /* blue-100 */

      .chat-input-container {
        display: flex; padding: 12px; background: #fff; border-top: 1px solid #e9ecef; gap: 8px;
      }
      .chat-input {
        flex: 1; border: 1px solid #e9ecef; border-radius: 20px; padding: 10px 16px; font-size: 16px;
        outline: none; transition: all .2s ease; background: #fff;
      }
      .chat-input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,.1); }

      .chat-send-btn {
        width: 40px; height: 40px; border-radius: 50%;
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all .2s ease;
      }
      .chat-send-btn:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(102,126,234,.3); }
      .chat-send-btn:active { transform: scale(.95); }
      .chat-send-btn:disabled { opacity: .5; cursor: not-allowed; }

      /* Fill the responsive frame: compact desktop web or fullscreen mobile. */
        #chat-popup-container.chat-is-open {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #chat-popup-container.chat-is-open #chat-box,
        #chat-popup-container.chat-is-open .chat-box {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          border: 0 !important;
          padding: 0 !important;
        }
        #chat-popup-container.chat-is-open .chat-messages {
          flex: 1 1 0 !important;
          min-height: 0 !important;
          overflow-y: auto !important;
        }
        #chat-popup-container.chat-is-open .chat-input-container {
          flex-shrink: 0 !important;
          padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
          padding-left: max(12px, env(safe-area-inset-left)) !important;
          padding-right: max(12px, env(safe-area-inset-right)) !important;
        }
        #chat-popup-container.chat-is-open .chat-header {
          flex-shrink: 0 !important;
          padding-top: max(10px, env(safe-area-inset-top)) !important;
          padding-left: max(12px, env(safe-area-inset-left)) !important;
          padding-right: max(12px, env(safe-area-inset-right)) !important;
        }
        #chat-popup-container .chat-input { min-width: 0 !important; }
      @media (prefers-reduced-motion: reduce) {
        #chat-popup-container #chat-box { animation: none !important; }
      }
    </style>
  `;

    // Initialize chat popup
    async function initChatPopup() {
        console.log('[ChatPopup] initChatPopup called, readyState:', document.readyState);
        console.log('[ChatPopup] window.auth:', window.auth);

        // Inject CSS always
        console.log('[ChatPopup] Injecting CSS...');
        document.head.insertAdjacentHTML('beforeend', chatCSS);

        // Inject HTML only if container not already present (it may be injected directly in HTML)
        const existingContainer = document.getElementById('chat-popup-container');
        if (!existingContainer) {
            console.log('[ChatPopup] Injecting HTML (container not found in DOM)...');
            document.body.insertAdjacentHTML('beforeend', chatHTML);
        } else {
            console.log('[ChatPopup] Container already in DOM, injecting only chat-box...');
            // Container is in HTML but chat-box is not — inject just the chat box
            if (!document.getElementById('chat-box')) {
                const chatBoxHTML = `<div id="chat-box" class="chat-box" role="dialog" aria-label="Team Chat" aria-modal="true" aria-hidden="true" style="display:none;">
                    <div class="chat-header">
                      <div class="chat-header-content">
                        <div>
                          <div class="chat-header-title">Team Chat</div>
                          <div class="chat-header-online" id="chat-online-users">
                            <i class="fas fa-circle" style="font-size: 8px; color: #4ade80;"></i>
                            <span id="online-names"></span>
                          </div>
                        </div>
                      </div>
                      <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="chat-clear-btn" class="chat-clear-btn" aria-label="Clear Chat" title="Clear Chat"><i class="fas fa-trash-alt"></i></button>
                        <button type="button" id="chat-close-btn" class="chat-close-btn" onclick="window.closeChatPopup && window.closeChatPopup()" aria-label="Tutup chat" title="Tutup chat"><span aria-hidden="true">×</span></button>
                      </div>
                    </div>
                    ${chatVolumeHTML}
                    <div class="chat-messages" id="chat-messages"></div>
                    <div class="chat-input-container">
                      <input type="text" id="chat-input" class="chat-input" placeholder="Ketik pesan...">
                      <button id="chat-send-btn" class="chat-send-btn" aria-label="Kirim"><i class="fas fa-paper-plane"></i></button>
                    </div>
                  </div>`;
                existingContainer.insertAdjacentHTML('beforeend', chatBoxHTML);
            }
        }
        bindChatNotificationVolume();

        // Set up basic toggle handlers IMMEDIATELY (for WebView onclick compatibility)
        const toggleBtn = document.getElementById('chat-toggle-btn');
        const closeBtn = document.getElementById('chat-close-btn');
        const chatBox = document.getElementById('chat-box');

        // Basic toggle that works without auth
        function basicToggle() {
            setChatPanelOpen(!chatPanelOpen);
        }

        function basicClose() {
            setChatPanelOpen(false);
        }

        // Set these as the real functions initially
        window._realToggleChatPopup = basicToggle;
        window._realCloseChatPopup = basicClose;
        chatInitialized = true;

        function handleCloseButtonClick(event) {
            event.preventDefault();
            event.stopPropagation();
            window.closeChatPopup();
        }

        if (closeBtn) {
            closeBtn.removeAttribute('onclick');
            closeBtn.addEventListener('pointerdown', handleCloseButtonClick);
            closeBtn.addEventListener('click', handleCloseButtonClick);
        }
        console.log('[ChatPopup] Basic handlers ready, chatInitialized=true');

        // Handle any pending actions from before init
        if (pendingToggle) {
            console.log('[ChatPopup] Executing pending toggle (basic)');
            pendingToggle = false;
            basicToggle();
        }
        if (pendingClose) {
            console.log('[ChatPopup] Executing pending close (basic)');
            pendingClose = false;
            basicClose();
        }

        // Now wait for auth to enable full features
        let user = await resolveAuthUser();
        console.log('[ChatPopup] Initial user:', user);

        // If auth not ready, wait for it
        if (!user) {
            console.log('[ChatPopup] User not ready, waiting for auth event...');

            const waitForAuth = () => new Promise((resolve) => {
                const finalize = (candidate) => {
                    if (candidate && (candidate.id || candidate.uid)) {
                        user = candidate;
                    }
                    window.removeEventListener('staff:auth-ready', handleAuthReady);
                    clearTimeout(authTimeout);
                    resolve();
                };

                const handleAuthReady = async event => {
                    const candidate = event?.detail?.user || await resolveAuthUser().catch(() => null);
                    if (candidate && (candidate.id || candidate.uid)) {
                        console.log('[ChatPopup] Auth ready:', candidate);
                        finalize(candidate);
                    }
                };
                window.addEventListener('staff:auth-ready', handleAuthReady);

                const authTimeout = setTimeout(async () => {
                    const fallbackUser = await resolveAuthUser().catch(() => null);
                    if (fallbackUser) {
                        console.log('[ChatPopup] Auth fallback available after timeout', fallbackUser);
                    } else {
                        console.log('[ChatPopup] Auth wait timeout, continuing with limited mode');
                    }
                    finalize(fallbackUser);
                }, 120000);
            });

            await waitForAuth();
        }

        user = user || (window.auth && (window.auth.currentUser || window.currentStaffIdentity));
        if (!user) {
            console.warn('[ChatPopup] Chat features limited: User not authenticated');
            // Chat toggle still works, but no real-time features
            return;
        }

        if (!user.role) {
          user.role = 'staff';
        }

        // All users have chat access - enable full features
        console.log('[ChatPopup] ✅ Enabling full chat for user:', user.role, user);

        console.log('[ChatPopup] Preparing realtime chat bindings...');

        // Ensure chat audio elements exist
        if (!document.getElementById('chat-send-sound')) {
          const assetVersionSuffix = window.__assetVersion
            ? `?v=${encodeURIComponent(window.__assetVersion)}`
            : '';
            const sendAudioEl = document.createElement('audio');
            sendAudioEl.id = 'chat-send-sound';
          sendAudioEl.src = `/staff/public/sounds/send.mp3${assetVersionSuffix}`;
            sendAudioEl.preload = 'auto';
            document.body.appendChild(sendAudioEl);
        }
        if (!document.getElementById('chat-incoming-sound')) {
          const assetVersionSuffix = window.__assetVersion
            ? `?v=${encodeURIComponent(window.__assetVersion)}`
            : '';
            const incomingAudioEl = document.createElement('audio');
            incomingAudioEl.id = 'chat-incoming-sound';
          incomingAudioEl.src = `/staff/public/sounds/incoming.mp3${assetVersionSuffix}`;
            incomingAudioEl.preload = 'auto';
            document.body.appendChild(incomingAudioEl);
        }
        prepareChatNotificationAudio();
        applyChatNotificationVolume();

        // Get additional elements (toggleBtn, closeBtn, chatBox already defined above)
        const clearBtn = document.getElementById('chat-clear-btn');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
    const messagesContainer = document.getElementById('chat-messages');
    const chatBadge = document.querySelector('.chat-badge');
    const sendAudio = document.getElementById('chat-send-sound');
    const incomingAudio = document.getElementById('chat-incoming-sound');
        const onlineNamesEl = document.getElementById('online-names');
        let boundSocket = null;
        let socketWaitTimer = null;
        let socketWaitAttempts = 0;
        let historyPollRegistered = false;
        let historyPollInFlight = false;

        function clearSocketWaitTimer() {
          if (socketWaitTimer) {
            clearTimeout(socketWaitTimer);
            socketWaitTimer = null;
          }
        }

        function scheduleRealtimeSocketRetry() {
          clearSocketWaitTimer();

          if (boundSocket) {
            socketWaitAttempts = 0;
            return;
          }

          socketWaitTimer = setTimeout(function retryBindRealtimeSocket() {
            if (boundSocket || tryBindRealtimeSocket()) {
              socketWaitAttempts = 0;
              return;
            }

            socketWaitAttempts += 1;

            if (socketWaitAttempts < 12) {
              scheduleRealtimeSocketRetry();
              return;
            }

            console.info('[ChatPopup] Realtime socket unavailable; chat popup stays in limited mode until realtime-sync is ready');
            clearSocketWaitTimer();
          }, socketWaitAttempts === 0 ? 2000 : 5000);
        }

        function getRealtimeSocket() {
          return window.socket || (window.__realtimeSyncState && window.__realtimeSyncState.socket) || null;
        }

  let isHistoryLoading = false;
  let lastSender = null; // Track last message sender for avatar grouping
  const renderedMessageIds = new Set();
  const pendingSentMessages = new Map();
  const userPhotoCache = new Map();
  const userRoleCache = new Map(); // Cache role_id for badge colors

  // Track last read message timestamp in localStorage
  const LAST_READ_KEY = `chat_last_read_${user.id}`;
  let lastReadTimestamp = localStorage.getItem(LAST_READ_KEY) || '1970-01-01T00:00:00.000Z';

  // Save last read timestamp when chat is opened or messages are viewed
  function markMessagesAsRead() {
    lastReadTimestamp = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, lastReadTimestamp);
  }

          function normalizeChatUserId(value) {
            return String(value == null ? '' : value).trim();
          }

          function rememberPendingSentMessage(text) {
            var key = normalizeChatTextForMatch(text);
            if (!key) return;
            pendingSentMessages.set(key, Date.now());
          }

          function consumePendingSentEcho(data) {
            var key = normalizeChatTextForMatch(data && data.message);
            if (!key || !pendingSentMessages.has(key)) return false;

            var sentAt = pendingSentMessages.get(key);
            if (Date.now() - sentAt > 30000) {
              pendingSentMessages.delete(key);
              return false;
            }

            pendingSentMessages.delete(key);
            if (data && data.id) {
              renderedMessageIds.add(String(data.id));
            }
            console.log('[ChatPopup] Skipping socket echo for recently sent local message:', data);
            return true;
          }

          function isOwnChatMessage(data) {
            var messageUserId = normalizeChatUserId(data && data.user_id);
            var messageUserName = normalizeChatNameForMatch(data && data.user_name);
            var currentUserNames = collectCurrentChatUserNames(user);

            if (messageUserName && currentUserNames.has(messageUserName)) {
              return true;
            }

            if (!messageUserId) return false;

            var currentUserIds = collectCurrentChatUserIds(user);
            if (!currentUserIds.size) {
              console.warn('[ChatPopup] Cannot classify chat message ownership: no current user id available', {
                data: data,
                currentUserNames: Array.from(currentUserNames)
              });
              return false;
            }

            var isOwn = currentUserIds.has(messageUserId);
            if (!isOwn) {
              console.log('[ChatPopup] Message is not mine', {
                messageUserId: messageUserId,
                messageUserName: messageUserName,
                currentUserIds: Array.from(currentUserIds),
                currentUserNames: Array.from(currentUserNames)
              });
            }
            return isOwn;
          }
  
        // Show clear button only for superadmin
        function checkClearButtonVisibility() {
            if (!clearBtn) return;
            
            // Check multiple sources for user role
            const authData = window.auth || {};
            const currentUser = authData.currentUser || {};
            const role = currentUser.role || authData.role || '';
            
            console.log('Checking clear button visibility - Role:', role);

            // Show clear button for all users
            clearBtn.style.display = 'flex';
            console.log('Clear button shown for all users');
        }

        // Function to update online users
        function updateOnlineUsers(users) {
            if (!onlineNamesEl) return;

            if (!users || users.length === 0) {
                onlineNamesEl.textContent = 'No one online';
                return;
            }

            const uniqueUsers = [];
            const seen = new Set();

            users.forEach((u) => {
                if (!u) return;
                const key = `${u.userId || u.id || ''}-${u.name || ''}`;
                if (!key || seen.has(key)) return;
                seen.add(key);
                uniqueUsers.push(u);
            });

            if (uniqueUsers.length === 0) {
                onlineNamesEl.textContent = 'No one online';
                return;
            }

            uniqueUsers.forEach((u) => {
                if (!u || !u.userId) return;
                if (u.photo) {
                    userPhotoCache.set(u.userId, u.photo);
                }
            });

            onlineNamesEl.textContent = uniqueUsers.map((u) => u.name).join(', ');
        }

          function handleUsersList(users) {
            updateOnlineUsers(users);
          }

          function handleUserPresenceChange() {
            if (boundSocket) {
              boundSocket.emit('users:get-list');
            }
          }

          function handleRealtimeChatMessage(data) {
            console.log('[ChatPopup] 📨 Received chat:message:', data);
            console.log('[ChatPopup] My user.id:', user.id, 'Message user_id:', data.user_id);
            if (data && data.id && renderedMessageIds.has(String(data.id))) {
              console.log('[ChatPopup] Skipping duplicate message id:', data.id);
              return;
            }

            if (consumePendingSentEcho(data)) {
              return;
            }

            var messageType = isOwnChatMessage(data) ? 'sent' : 'received';
            console.log('[ChatPopup] Adding realtime message:', messageType);
            addMessage(data.message, messageType, data.created_at, data.user_name, data.user_photo, data.user_id, data.role_id, data.id);
          }

          function bindRealtimeSocket(socket) {
            if (!socket || boundSocket === socket) return;

            if (boundSocket && typeof boundSocket.off === 'function') {
              boundSocket.off('users:list', handleUsersList);
              boundSocket.off('user:connected', handleUserPresenceChange);
              boundSocket.off('user:disconnected', handleUserPresenceChange);
              boundSocket.off('chat:message', handleRealtimeChatMessage);
            }

            boundSocket = socket;
            socketWaitAttempts = 0;
            clearSocketWaitTimer();

            console.log('[ChatPopup] Binding to global Socket.IO connection:', socket.id || 'connecting...');
            socket.on('users:list', handleUsersList);
            socket.on('user:connected', handleUserPresenceChange);
            socket.on('user:disconnected', handleUserPresenceChange);
            socket.on('chat:message', handleRealtimeChatMessage);
            socket.emit('users:get-list');
          }

          function tryBindRealtimeSocket() {
            var socket = getRealtimeSocket();
            if (socket) {
              bindRealtimeSocket(socket);
              return true;
            }
            return false;
          }

          function handleSocketReadyEvent(event) {
            var socket = event && event.detail ? event.detail.socket : null;
            if (socket) {
              bindRealtimeSocket(socket);
              return;
            }
            tryBindRealtimeSocket();
          }

          window.addEventListener('realtime:socket-ready', handleSocketReadyEvent);
          window.addEventListener('realtime:socket-connected', handleSocketReadyEvent);

          if (!tryBindRealtimeSocket()) {
            console.log('[ChatPopup] Waiting for realtime socket from realtime-sync...');
            scheduleRealtimeSocketRetry();
          }

        // Load chat history
        await loadChatHistory();
        startChatHistoryPolling();

    // Toggle function - exposed globally for WebView onclick compatibility
    function handleToggleChat() {
      setChatPanelOpen(!chatPanelOpen);
      if (chatPanelOpen) {
        chatBadge.style.display = 'none';
        chatBadge.textContent = '0';
        markMessagesAsRead();
        scheduleChatScrollToLatest();
        setTimeout(() => {
          if (!chatPanelOpen) return;
          scheduleChatScrollToLatest();
          if (chatInput) {
            setChatKeyboardMode(true);
            chatInput.focus();
            queueChatLayoutSync();
            scheduleChatScrollToLatest();
          }
        }, 250);
        checkClearButtonVisibility();
      }
    }

    // Upgrade the toggle function with full features (badge, scroll, etc.)
    window._realToggleChatPopup = handleToggleChat;
    if (chatBox.classList.contains('chat-open')) {
      queueChatLayoutSync();
    }
    console.log('[ChatPopup] Upgraded toggle handler with full features');

    // Close function - exposed globally for WebView onclick compatibility
    function handleCloseChat() {
      setChatPanelOpen(false);
    }

    // Upgrade the close function
    window._realCloseChatPopup = handleCloseChat;

    // Send
    async function sendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;
      const curUser = await resolveAuthUser();
      if (!curUser) { console.error('User not authenticated'); return; }
      user = curUser;

      const userPhoto = curUser.photo_url || curUser.photoURL || null;
      const userRoleId = curUser.role_id || null;

      // Show immediately
      rememberPendingSentMessage(message);
      addMessage(message, 'sent', null, curUser.name || curUser.email, userPhoto, curUser.id || curUser.uid, userRoleId);
      if (sendAudio && typeof sendAudio.play === 'function') {
        try {
          sendAudio.currentTime = 0;
          sendAudio.play().catch(() => {});
        } catch (err) {}
      }
      chatInput.value = '';

      // Send to backend
      try {
        const token = await getChatToken();
        if (!token) {
          throw new Error('Token auth tidak ditemukan');
        }
        const payload = {
            message,
            user_id: curUser.id || curUser.uid,
            user_name: curUser.name || curUser.email,
            user_photo: userPhoto
        };
        console.log('[ChatPopup] Sending message:', payload);
        
        const response = await fetch(`${API_ORIGIN}/api/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('[ChatPopup] Message sent successfully:', result);
            if (result && result.data && result.data.id) {
              renderedMessageIds.add(String(result.data.id));
            }
        } else {
            const error = await response.json().catch(() => ({}));
            console.error('[ChatPopup] Failed to send chat message:', response.status, error);
        }
      } catch (err) {
        console.error('[ChatPopup] Error sending chat message:', err);
      }
    }
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    chatInput.addEventListener('focus', function () {
      if (window.innerWidth > 991) return;
      setChatKeyboardMode(true);
      queueChatLayoutSync();
    });
    chatInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === chatInput) return;
        setChatKeyboardMode(false);
        queueChatLayoutSync();
      }, 180);
    });

        // Load chat history
    async function loadChatHistory() {
      isHistoryLoading = true;
            try {
                const token = await getChatToken();
                if (!token) {
                  throw new Error('Token auth tidak ditemukan');
                }
                const response = await fetch(`${API_ORIGIN}/api/chat/messages`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.data) {
                        messagesContainer.innerHTML = '';
                        resetChatState(); // Reset block tracking
            result.data.forEach(msg => {
              const type = isOwnChatMessage(msg) ? 'sent' : 'received';
              addMessage(msg.message, type, msg.created_at, msg.user_name, msg.user_photo, msg.user_id, msg.role_id, msg.id);
                        });
            scheduleChatScrollToLatest();
          }
        }
      } catch (error) {
                console.error('Error loading chat history:', error);
                messagesContainer.innerHTML = '<div class="text-center text-muted p-3">Gagal memuat riwayat chat</div>';
      } finally {
        isHistoryLoading = false;
        scheduleChatScrollToLatest();
            }
        }

        async function pollChatHistoryForNewMessages(context) {
          if (historyPollInFlight || isHistoryLoading) return;
          if (boundSocket && boundSocket.connected) return;
          historyPollInFlight = true;

      try {
        const token = await getChatToken();
        if (!token) return;

            const response = await fetch(`${API_ORIGIN}/api/chat/messages?limit=100&_t=${Date.now()}`, {
              signal: context && context.signal,
              headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        });

            if (!response.ok) {
              throw new Error(`Chat history HTTP ${response.status}`);
            }

            const result = await response.json();
            if (!result.success || !Array.isArray(result.data)) return;

            result.data.forEach((msg) => {
          if (!msg || !msg.id || renderedMessageIds.has(String(msg.id))) {
            return;
          }

          const type = isOwnChatMessage(msg) ? 'sent' : 'received';
          addMessage(msg.message, type, msg.created_at, msg.user_name, msg.user_photo, msg.user_id, msg.role_id, msg.id);
        });
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            console.warn('[ChatPopup] Chat history polling failed:', error?.message || error);
            throw error;
          } finally {
        historyPollInFlight = false;
      }
    }

        function startChatHistoryPolling() {
          if (historyPollRegistered || !window.staffPollingCoordinator) return;
          historyPollRegistered = true;
          window.staffPollingCoordinator.register('global-chat-history', {
            interval: CHAT_HISTORY_POLL_INTERVAL_MS,
            backoff: CHAT_HISTORY_ERROR_BACKOFF_MS,
            // Safari may report a polling socket as connected while its long
            // poll is suspended. Keep a lightweight reconciliation poll on iOS.
            when: function () { return IS_IOS_DEVICE || !(boundSocket && boundSocket.connected); },
            run: pollChatHistoryForNewMessages
          });
          var reconcileChatHistory = function () { window.staffPollingCoordinator?.reconcile(); };
          window.addEventListener('realtime:socket-connected', reconcileChatHistory);
          window.addEventListener('realtime:socket-disconnected', reconcileChatHistory);
        }

    // Add message with avatar support
    function addMessage(text, type, timestamp = null, userName = null, userPhoto = null, userId = null, roleId = null, messageId = null) {
      if (messageId && renderedMessageIds.has(String(messageId))) {
        return;
      }
      if (messageId) {
        renderedMessageIds.add(String(messageId));
      }

      const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
        : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });

      const isSelf = type === 'sent';
      const isBlockStart = lastSender !== userName;
      lastSender = userName;

      if (userId && userPhoto) {
        userPhotoCache.set(userId, userPhoto);
      }
      if (userId && roleId) {
        userRoleCache.set(userId, roleId);
      }

      // Color for name based on role (badge colors), avatar based on name
      const cachedRoleId = roleId || (userId ? userRoleCache.get(userId) : null);
      const nameColor = isSelf ? '#dbeafe' : colorFromRoleId(cachedRoleId);
      const avatarBg = isSelf ? '#111827' : colorFromName(userName || '');

      let messageHTML = `<div class="chat-message ${type}">`;

      // Avatar for all messages (only at block start)
      if (isBlockStart) {
        if (isSelf) {
          messageHTML += `<div class="chat-avatar-spacer"></div>`;
        } else {
          const photoUrl = userPhoto || (userId ? userPhotoCache.get(userId) : null)
                        || (userId ? `${API_ORIGIN}/api/users/${encodeURIComponent(userId)}/photo` : null);

          if (photoUrl) {
            messageHTML += `<div class="chat-avatar" title="${escapeHtml(userName || '')}"><img src="${photoUrl}" alt="${escapeHtml(userName || '')}" loading="lazy" decoding="async" width="36" height="36" onerror="this.parentElement.innerHTML='${getInitials(userName || '')}';this.parentElement.style.background='${avatarBg}'"></div>`;
          } else {
            const initials = getInitials(userName || '');
            messageHTML += `<div class="chat-avatar" style="background: ${avatarBg}" title="${escapeHtml(userName || '')}">${initials}</div>`;
          }
        }
      } else {
        messageHTML += `<div class="chat-avatar-spacer"></div>`;
      }

      // Message bubble
      messageHTML += `
        <div class="chat-message-wrapper">
          <div class="chat-message-content">
            ${isBlockStart && userName && !isSelf ? `<div class="chat-name" style="color:${nameColor}">${escapeHtml(userName)}</div>` : ''}
            <span class="chat-text" style="text-align: ${isSelf ? 'right' : 'left'}">${escapeHtml(text)}</span>
            <div class="chat-message-time">${time}</div>
          </div>
        </div>
      </div>`;

      messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
      if (isHistoryLoading) return;
      scheduleChatScrollToLatest();

      // Badge ONLY for new real-time messages, NOT history
      // Skip ALL badge updates during history loading
      if (!chatPanelOpen && type === 'received') {
        const msgTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const isUnread = msgTime > lastReadTimestamp;

        if (isUnread) {
          const currentCount = parseInt(chatBadge.textContent) || 0;
          chatBadge.textContent = currentCount + 1;
          chatBadge.style.display = 'block';
        }
      }

      if (type === 'received' && chatNotificationVolume > 0 && incomingAudio && typeof incomingAudio.play === 'function') {
        try {
          incomingAudio.currentTime = 0;
          incomingAudio.play().catch(() => {});
        } catch (err) {}
      }
    }
    
    // Reset last sender when loading history
    function resetChatState() {
      lastSender = null;
      renderedMessageIds.clear();
    }

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    }

        // Clear chat button handler
        if (clearBtn) {
            clearBtn.addEventListener('click', async function() {
                if (!confirm('⚠️ Hapus SEMUA chat log?\n\nTindakan ini TIDAK DAPAT dibatalkan!\n\nKetik "HAPUS SEMUA" untuk konfirmasi.')) {
                    return;
                }
                
                const confirmation = prompt('Untuk konfirmasi, ketik: HAPUS SEMUA');
                
                if (confirmation !== 'HAPUS SEMUA') {
                    alert('Konfirmasi tidak sesuai. Pembersihan chat log dibatalkan.');
                    return;
                }
                
                try {
                    const token = await getChatToken();
                    const response = await fetch('/api/admin/clear-chat-logs', {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.message || 'Failed to clear chat logs');
                    }
                    
                    const data = await response.json();
                    
                    // Clear messages from UI
                    messagesContainer.innerHTML = '';
                    lastSender = null;
                    
                    alert(`✅ Chat logs berhasil dihapus!\n\nTotal pesan: ${data.data.deletedCount}`);
                    
                } catch (error) {
                    console.error('Error clearing chat logs:', error);
                    alert('❌ Gagal menghapus chat logs: ' + error.message);
                }
            });
        }
        
        // Check clear button visibility after auth is loaded
        checkClearButtonVisibility();
        
        // React to lifecycle changes instead of running a guardian interval.
        window.addEventListener('staff:auth-ready', checkClearButtonVisibility);
        window.addEventListener('realtime:socket-connected', checkClearButtonVisibility);

        // Expose addMessage globally for external use
        window.addChatMessage = addMessage;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatPopup);
    } else {
        initChatPopup();
    }

})();
