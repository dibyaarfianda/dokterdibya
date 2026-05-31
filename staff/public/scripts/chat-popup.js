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

  // Measure actual nav height (dynamic, avoids hardcoded 78px mismatch)
  function getNavBottomPx() {
    var nav = document.getElementById('mobile-action-bar');
    if (nav && nav.offsetHeight > 0) return nav.offsetHeight + 'px';
    return '65px';
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

  function isChatKeyboardModeActive() {
    return !!(document.body && document.body.classList.contains('chat-keyboard-active'));
  }

  function setChatKeyboardMode(active) {
    if (!document.body) return;
    document.body.classList.toggle('chat-keyboard-active', !!active);
  }

  function scrollChatToLatest() {
    var messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    var applyScroll = function() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (messagesEl.lastElementChild && typeof messagesEl.lastElementChild.scrollIntoView === 'function') {
        try {
          messagesEl.lastElementChild.scrollIntoView({ block: 'end', inline: 'nearest' });
        } catch (error) {
          messagesEl.lastElementChild.scrollIntoView(false);
        }
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    applyScroll();
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function() {
        applyScroll();
        window.requestAnimationFrame(applyScroll);
      });
    }
    window.setTimeout(applyScroll, 80);
    window.setTimeout(applyScroll, 220);
    window.setTimeout(applyScroll, 520);
  }

  function scheduleChatScrollToLatest() {
    scrollChatToLatest();
    window.setTimeout(scrollChatToLatest, 120);
    window.setTimeout(scrollChatToLatest, 320);
    window.setTimeout(scrollChatToLatest, 700);
    window.setTimeout(scrollChatToLatest, 1200);
    window.setTimeout(scrollChatToLatest, 2200);
    window.setTimeout(scrollChatToLatest, 4200);
  }

  function getReservedBottomPx() {
    return isChatKeyboardModeActive() ? '0px' : getNavBottomPx();
  }

  function getMobileChatHeightPx(navPx) {
    var viewportHeight = getMobileViewportHeight();
    var safeNavPx = Number(navPx);
    if (isNaN(safeNavPx)) safeNavPx = 65;
    return Math.max(320, viewportHeight - safeNavPx) + 'px';
  }

  function applyMobileViewportFrame(cont, reservedBottomPx) {
    var viewportTop = getMobileViewportTop();
    var viewportLeft = getMobileViewportLeft();
    var viewportWidth = getMobileViewportWidth();
    var chatHeight = getMobileChatHeightPx(reservedBottomPx);
    cont.style.setProperty('position', 'fixed', 'important');
    cont.style.setProperty('top', viewportTop + 'px', 'important');
    cont.style.setProperty('left', viewportLeft + 'px', 'important');
    cont.style.setProperty('right', 'auto', 'important');
    cont.style.setProperty('bottom', 'auto', 'important');
    cont.style.setProperty('width', viewportWidth + 'px', 'important');
    cont.style.setProperty('height', chatHeight, 'important');
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
      cont.innerHTML = '<div id="chat-toggle-btn" onclick="window.toggleChatPopup&&window.toggleChatPopup()" style="width:56px;height:56px;border-radius:50%;background:#007BFF;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 15px rgba(0,0,0,.4);position:relative;"><i class="fas fa-comments"></i><span id="chat-badge" style="display:none;position:absolute;top:-5px;right:-5px;background:#f5576c;color:#fff;border-radius:12px;padding:2px 6px;font-size:11px;font-weight:bold;min-width:20px;text-align:center;">0</span></div>';
      var target = document.body || document.documentElement;
      if (target) target.appendChild(cont);
      console.log('[ChatPopup] FAB recreated by guardian');
    }
    var chatOpen = cont.classList.contains('chat-is-open');
    var isMobile = window.innerWidth <= 991;

    if (chatOpen && isMobile) {
      // Full-screen mode: move to body to avoid transform-ancestor offset issues
      if (cont.parentNode !== document.body) document.body.appendChild(cont);
      var navH = getReservedBottomPx();
      var navPx = parseInt(navH, 10);
      if (isNaN(navPx)) navPx = 65;
      // Clear HTML inline style first, then set each property with !important
      cont.style.cssText = '';
      applyMobileViewportFrame(cont, navPx);
      cont.style.setProperty('margin', '0', 'important');
      cont.style.setProperty('padding', '0', 'important');
      cont.style.setProperty('display', 'block', 'important');
      cont.style.setProperty('visibility', 'visible', 'important');
      cont.style.setProperty('opacity', '1', 'important');
      cont.style.setProperty('z-index', '2147483647', 'important');
      cont.style.setProperty('pointer-events', 'auto', 'important');
      cont.style.setProperty('transform', 'none', 'important');
      var box = document.getElementById('chat-box');
      if (box && box.style.getPropertyValue('display') !== 'none') {
        box.style.setProperty('width', '100%', 'important');
        box.style.setProperty('height', '100%', 'important');
        box.style.setProperty('border-radius', '0', 'important');
        box.style.setProperty('box-shadow', 'none', 'important');
        box.style.setProperty('max-height', 'none', 'important');
        box.style.setProperty('max-width', 'none', 'important');
      }
    } else if (!chatOpen) {
      // FAB mode
      var navH2 = getNavBottomPx();
      var navPx2 = parseInt(navH2, 10);
      if (isNaN(navPx2)) navPx2 = 65;
      var fabBottom = (navPx2 + 12) + 'px';
      cont.style.cssText = '';
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
      }
    }
  }

  // Run immediately
  ensureFAB();

  // Guardian interval — every 2s (200ms was too aggressive, triggered observer loop)
  setInterval(ensureFAB, 2000);

  // Helper: apply full-screen mode for the chat box on mobile
  function applyMobileFullScreen(cont) {
    if (cont.parentNode !== document.body) document.body.appendChild(cont);
    var navH = getReservedBottomPx();
    var navPx = parseInt(navH, 10);
    if (isNaN(navPx)) navPx = 65;
    cont.style.cssText = '';
    applyMobileViewportFrame(cont, navPx);
    cont.style.setProperty('margin', '0', 'important');
    cont.style.setProperty('padding', '0', 'important');
    cont.style.setProperty('display', 'block', 'important');
    cont.style.setProperty('visibility', 'visible', 'important');
    cont.style.setProperty('opacity', '1', 'important');
    cont.style.setProperty('z-index', '2147483647', 'important');
    cont.style.setProperty('pointer-events', 'auto', 'important');
    cont.style.setProperty('transform', 'none', 'important');
    // Style chat-box to fill container
    var box = document.getElementById('chat-box');
    if (box) {
      box.style.setProperty('width', '100%', 'important');
      box.style.setProperty('height', '100%', 'important');
      box.style.setProperty('border-radius', '0', 'important');
      box.style.setProperty('box-shadow', 'none', 'important');
      box.style.setProperty('max-height', 'none', 'important');
      box.style.setProperty('max-width', 'none', 'important');
    }
  }

  // Export so toggle functions can call it
  window._applyChatMobileFullScreen = applyMobileFullScreen;

  var _chatLayoutSyncQueued = false;
  function syncOpenChatLayout() {
    var cont = document.getElementById('chat-popup-container');
    if (!cont || !cont.classList.contains('chat-is-open') || window.innerWidth > 991) return;
    applyMobileFullScreen(cont);
    scheduleChatScrollToLatest();
  }

  function queueChatLayoutSync() {
    if (_chatLayoutSyncQueued) return;
    _chatLayoutSyncQueued = true;
    requestAnimationFrame(function () {
      _chatLayoutSyncQueued = false;
      syncOpenChatLayout();
    });
  }

  window.addEventListener('resize', queueChatLayoutSync, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueChatLayoutSync, { passive: true });
    window.visualViewport.addEventListener('scroll', queueChatLayoutSync, { passive: true });
  }

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
  // Role ID constants (match backend constants/roles.js)
  const ROLE_IDS = {
    DOKTER: 1,
    MANAGERIAL: 7,
    BIDAN: 22,
    ADMIN: 24,
    FRONT_OFFICE: 25
  };

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

    return localStorage.getItem('vps_auth_token') ||
           sessionStorage.getItem('vps_auth_token') ||
           localStorage.getItem('token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('idToken') ||
           sessionStorage.getItem('idToken') ||
           null;
  }

  // ---------- HTML ----------
  const chatHTML = `
    <div id="chat-popup-container">
      <!-- Floating Chat Button -->
      <div id="chat-toggle-btn" class="chat-toggle-btn" onclick="window.toggleChatPopup && window.toggleChatPopup()" aria-label="Buka Chat Tim" title="Buka Chat Tim">
        <i class="fas fa-comments"></i>
        <span class="chat-badge" style="display:none;">0</span>
      </div>

      <!-- Chat Box -->
      <div id="chat-box" class="chat-box" style="display:none;">
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
            <button id="chat-close-btn" class="chat-close-btn" onclick="window.closeChatPopup && window.closeChatPopup()" aria-label="Tutup">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

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
        transition: all .3s ease; position: relative;
      }
      .chat-toggle-btn:hover { transform: scale(1.1); box-shadow: 0 6px 16px rgba(102,126,234,.5); }
      .chat-toggle-btn:active { transform: scale(.95); }

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
        animation: slideUp .3s ease;
      }
      @keyframes slideUp { from {opacity:0; transform: translateY(20px);} to {opacity:1; transform:translateY(0);} }

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

      .chat-close-btn {
        background: rgba(255,255,255,.2); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        display:flex; align-items:center; justify-content:center; transition: all .2s ease;
      }
      .chat-close-btn:hover { background: rgba(255,255,255,.3); transform: rotate(90deg); }

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

      /* Mobile: full-screen chat panel when open */
      @media (max-width: 991.98px) {
        #chat-popup-container.chat-is-open {
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 65px !important;
          width: 100% !important;
          height: calc(100dvh - 65px) !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body.chat-keyboard-active #chat-popup-container.chat-is-open {
          bottom: 0 !important;
          height: 100dvh !important;
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
          animation: none !important;
        }
        #chat-popup-container.chat-is-open .chat-messages {
          flex: 1 1 0 !important;
          min-height: 0 !important;
          overflow-y: auto !important;
        }
        #chat-popup-container.chat-is-open .chat-input-container {
          flex-shrink: 0 !important;
        }
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
                const chatBoxHTML = `<div id="chat-box" class="chat-box" style="display:none;">
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
                        <button id="chat-close-btn" class="chat-close-btn" onclick="window.closeChatPopup && window.closeChatPopup()" aria-label="Tutup"><i class="fas fa-times"></i></button>
                      </div>
                    </div>
                    <div class="chat-messages" id="chat-messages"></div>
                    <div class="chat-input-container">
                      <input type="text" id="chat-input" class="chat-input" placeholder="Ketik pesan...">
                      <button id="chat-send-btn" class="chat-send-btn" aria-label="Kirim"><i class="fas fa-paper-plane"></i></button>
                    </div>
                  </div>`;
                existingContainer.insertAdjacentHTML('beforeend', chatBoxHTML);
            }
        }

        // Set up basic toggle handlers IMMEDIATELY (for WebView onclick compatibility)
        const toggleBtn = document.getElementById('chat-toggle-btn');
        const closeBtn = document.getElementById('chat-close-btn');
        const chatBox = document.getElementById('chat-box');

        let isChatOpenBasic = false;

        // Basic toggle that works without auth
        function basicToggle() {
            isChatOpenBasic = !isChatOpenBasic;
            const cont = document.getElementById('chat-popup-container');
            const btn = document.getElementById('chat-toggle-btn');
            if (isChatOpenBasic) {
            setChatKeyboardMode(false);
                chatBox.style.setProperty('display', 'flex', 'important');
                chatBox.classList.add('chat-open');
                if (cont) {
                    cont.classList.add('chat-is-open');
                    if (window.innerWidth <= 991 && window._applyChatMobileFullScreen) window._applyChatMobileFullScreen(cont);
                }
                if (btn) btn.style.setProperty('display', 'none', 'important');
                scheduleChatScrollToLatest();
            } else {
            setChatKeyboardMode(false);
                chatBox.style.setProperty('display', 'none', 'important');
                chatBox.classList.remove('chat-open');
                chatBox.style.removeProperty('width'); chatBox.style.removeProperty('height');
                chatBox.style.removeProperty('max-width'); chatBox.style.removeProperty('max-height');
                chatBox.style.removeProperty('border-radius'); chatBox.style.removeProperty('box-shadow');
                if (cont) cont.classList.remove('chat-is-open');
                if (btn) btn.style.setProperty('display', 'flex', 'important');
            }
            console.log('[ChatPopup] Basic toggle - isChatOpen:', isChatOpenBasic);
        }

        function basicClose() {
            isChatOpenBasic = false;
            const cont = document.getElementById('chat-popup-container');
            const btn = document.getElementById('chat-toggle-btn');
          setChatKeyboardMode(false);
            chatBox.style.setProperty('display', 'none', 'important');
            chatBox.classList.remove('chat-open');
            chatBox.style.removeProperty('width'); chatBox.style.removeProperty('height');
            chatBox.style.removeProperty('max-width'); chatBox.style.removeProperty('max-height');
            chatBox.style.removeProperty('border-radius'); chatBox.style.removeProperty('box-shadow');
            if (cont) cont.classList.remove('chat-is-open');
            if (btn) btn.style.setProperty('display', 'flex', 'important');
            console.log('[ChatPopup] Basic close');
        }

        // Set these as the real functions initially
        window._realToggleChatPopup = basicToggle;
        window._realCloseChatPopup = basicClose;
        chatInitialized = true;
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
        let user = window.auth?.currentUser;
        console.log('[ChatPopup] Initial user:', user);

        // If auth not ready, wait for it
        if (!user) {
            console.log('[ChatPopup] User not ready, waiting...');
            await new Promise((resolve) => {
                const checkAuth = setInterval(() => {
                    if (window.auth?.currentUser) {
                        console.log('[ChatPopup] Auth ready!');
                        clearInterval(checkAuth);
                        resolve();
                    }
                }, 100);

                // Timeout after 10 seconds
                setTimeout(() => {
                    console.warn('[ChatPopup] Auth wait timeout');
                    clearInterval(checkAuth);
                    resolve();
                }, 10000);
            });

            user = window.auth?.currentUser;
            console.log('[ChatPopup] User after wait:', user);
        }

        // Check if user exists. Role fallback is enough for chat features.
        if (!user) {
            console.warn('[ChatPopup] Chat features limited: User not authenticated', user);
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

  // isChatOpenBasic already defined above - reuse it
  let isChatOpen = isChatOpenBasic;
  let isHistoryLoading = false;
  let lastSender = null; // Track last message sender for avatar grouping
  const renderedMessageIds = new Set();
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

          function getCurrentChatUserId() {
            return normalizeChatUserId(user && (user.id || user.uid));
          }

          function isOwnChatMessage(data) {
            var messageUserId = normalizeChatUserId(data && data.user_id);
            var currentUserId = getCurrentChatUserId();
            return !!messageUserId && !!currentUserId && messageUserId === currentUserId;
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

            if (!isOwnChatMessage(data)) {
              console.log('[ChatPopup] Adding received message');
              addMessage(data.message, 'received', data.created_at, data.user_name, data.user_photo, data.user_id, data.role_id, data.id);
            } else {
              console.log('[ChatPopup] Skipping own message');
              if (data && data.id) {
                renderedMessageIds.add(String(data.id));
              }
            }
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

    // Toggle function - exposed globally for WebView onclick compatibility
    function handleToggleChat() {
      isChatOpen = !isChatOpen;
      const cont = document.getElementById('chat-popup-container');
      if (isChatOpen) {
        setChatKeyboardMode(false);
        chatBox.style.display = 'flex';
        chatBox.classList.add('chat-open');
        if (cont) {
          cont.classList.add('chat-is-open');
          if (window.innerWidth <= 991 && window._applyChatMobileFullScreen) window._applyChatMobileFullScreen(cont);
        }
        toggleBtn.style.setProperty('display', 'none', 'important');
        chatBadge.style.display = 'none';
        chatBadge.textContent = '0';
        markMessagesAsRead();
        scheduleChatScrollToLatest();
        setTimeout(() => {
          scheduleChatScrollToLatest();
          if (chatInput) {
            setChatKeyboardMode(true);
            chatInput.focus();
            queueChatLayoutSync();
            scheduleChatScrollToLatest();
          }
        }, 100);
        checkClearButtonVisibility();
      } else {
        setChatKeyboardMode(false);
        chatBox.style.setProperty('display', 'none', 'important');
        chatBox.classList.remove('chat-open');
        chatBox.style.removeProperty('width'); chatBox.style.removeProperty('height');
        chatBox.style.removeProperty('max-width'); chatBox.style.removeProperty('max-height');
        chatBox.style.removeProperty('border-radius'); chatBox.style.removeProperty('box-shadow');
        if (cont) cont.classList.remove('chat-is-open');
        toggleBtn.style.setProperty('display', 'flex', 'important');
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
      isChatOpen = false;
      const cont = document.getElementById('chat-popup-container');
      setChatKeyboardMode(false);
      chatBox.style.setProperty('display', 'none', 'important');
      chatBox.classList.remove('chat-open');
      chatBox.style.removeProperty('width'); chatBox.style.removeProperty('height');
      chatBox.style.removeProperty('max-width'); chatBox.style.removeProperty('max-height');
      chatBox.style.removeProperty('border-radius'); chatBox.style.removeProperty('box-shadow');
      if (cont) cont.classList.remove('chat-is-open');
      toggleBtn.style.setProperty('display', 'flex', 'important');
    }

    // Upgrade the close function
    window._realCloseChatPopup = handleCloseChat;

    // Send
    async function sendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;
      const curUser = window.auth?.currentUser;
      if (!curUser) { console.error('User not authenticated'); return; }

      const userPhoto = curUser.photo_url || curUser.photoURL || null;
      const userRoleId = curUser.role_id || null;

      // Show immediately
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
            messageHTML += `<div class="chat-avatar" title="${escapeHtml(userName || '')}"><img src="${photoUrl}" alt="${escapeHtml(userName || '')}" onerror="this.parentElement.innerHTML='${getInitials(userName || '')}';this.parentElement.style.background='${avatarBg}'"></div>`;
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
      if (!isHistoryLoading || isChatOpen) {
        scheduleChatScrollToLatest();
      } else {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      // Badge ONLY for new real-time messages, NOT history
      // Skip ALL badge updates during history loading
      if (!isHistoryLoading && !isChatOpen && type === 'received') {
        const msgTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const isUnread = msgTime > lastReadTimestamp;

        if (isUnread) {
          const currentCount = parseInt(chatBadge.textContent) || 0;
          chatBadge.textContent = currentCount + 1;
          chatBadge.style.display = 'block';
        }
      }

      if (!isHistoryLoading && type === 'received' && incomingAudio && typeof incomingAudio.play === 'function') {
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
                    const token = localStorage.getItem('vps_auth_token');
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
        
        // Re-check after a delay to ensure auth is fully loaded
        setTimeout(() => {
            checkClearButtonVisibility();
        }, 1000);
        
        // Also check periodically
        setInterval(() => {
            checkClearButtonVisibility();
        }, 5000);

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
