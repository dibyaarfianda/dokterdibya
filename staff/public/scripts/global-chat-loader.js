/**
 * Global Chat Loader
 * Loads chat popup widget on any page with proper auth context
 * Handles timing issues with ES6 modules
 */

(function() {
    'use strict';

    // Check if chat already loaded
    if (window.chatPopupLoaded) {
        console.log('[GlobalChat] Already loaded');
        return;
    }

    console.log('[GlobalChat] Initializing...');

    function markChatPopupReady() {
        window.chatPopupLoaded = true;
        console.log('[GlobalChat] Chat popup ready');
    }

    function ensureChatPopupScriptLoaded() {
        if (window.toggleChatPopup || window._realToggleChatPopup) {
            markChatPopupReady();
            return;
        }

        if (window.__chatPopupScriptRequested) {
            console.log('[GlobalChat] chat-popup.js load already requested');
            return;
        }

        window.__chatPopupScriptRequested = true;

        const version = window.STAFF_CACHE_VERSION || window.__assetVersion || 'v307';
        const moduleUrl = `/staff/public/scripts/chat-popup.js?v=${encodeURIComponent(version)}`;
        import(moduleUrl)
            .then(() => {
                console.log('[GlobalChat] chat-popup.js loaded dynamically as ESM');
                markChatPopupReady();
            })
            .catch(error => {
                window.__chatPopupScriptRequested = false;
                console.error('[GlobalChat] Failed to load chat-popup.js dynamically:', error);
            });
        console.log('[GlobalChat] Loading chat-popup.js dynamically as ESM');
    }

    // Function to initialize chat
    function initializeChat() {
        // Ensure auth functions are available globally
        if (!window.getToken) {
            window.getToken = function() {
                return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
                    ? window.getAuthToken()
                    : '';
            };
        }

        if (!window.getIdToken) {
            window.getIdToken = function() {
                return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
                    ? window.getAuthToken()
                    : '';
            };
        }

        // Get current user identity
        if (!window.currentStaffIdentity) {
            const token = window.getToken();
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    window.currentStaffIdentity = {
                        id: payload.id,
                        name: payload.name || 'Unknown',
                        role: payload.role || 'staff',
                        email: payload.email
                    };
                    console.log('[GlobalChat] Staff identity:', window.currentStaffIdentity);
                } catch (error) {
                    console.error('[GlobalChat] Failed to parse token:', error);
                }
            }
        }

        // Setup window.auth compatibility for chat-popup.js
        if (!window.auth) {
            window.auth = {
                currentUser: null
            };
        }

        // Populate auth.currentUser from currentStaffIdentity or token
        if (!window.auth.currentUser && window.currentStaffIdentity) {
            window.auth.currentUser = {
                uid: window.currentStaffIdentity.id,
                id: window.currentStaffIdentity.id,  // Add id field for compatibility
                name: window.currentStaffIdentity.name,
                role: window.currentStaffIdentity.role,
                email: window.currentStaffIdentity.email
            };
            console.log('[GlobalChat] Auth user set:', window.auth.currentUser);
        } else if (!window.auth.currentUser) {
            // Try to get from token
            const token = window.getToken();
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    window.auth.currentUser = {
                        uid: payload.id,
                        id: payload.id,  // Add id field for compatibility
                        name: payload.name || 'Unknown',
                        role: payload.role || 'staff',
                        email: payload.email
                    };
                    console.log('[GlobalChat] Auth user set from token:', window.auth.currentUser);
                } catch (error) {
                    console.error('[GlobalChat] Failed to set auth user:', error);
                }
            }
        }

        // On pages like Sunday Clinic, chat-popup.js is not included statically.
        // Delay this check one tick so index-adminlte's following static script tag can load first.
        setTimeout(() => {
            if (window.toggleChatPopup || window._realToggleChatPopup) {
                console.log('[GlobalChat] Auth ready, chat-popup.js already loaded statically');
                markChatPopupReady();
                return;
            }

            ensureChatPopupScriptLoaded();
        }, 0);

        // Check if auth is valid (support both Firebase 'uid' and VPS auth 'id').
        // Chat popup should still bootstrap even if auth finishes a little later.
        if (!window.auth.currentUser || (!window.auth.currentUser.uid && !window.auth.currentUser.id)) {
            console.warn('[GlobalChat] Chat popup bootstrapped before valid user auth was ready');
            return;
        }

        // Use global Socket.IO connection from realtime-sync.js
        // DO NOT create our own socket - wait for realtime-sync to initialize it
        if (window.socket) {
            console.log('[GlobalChat] Using existing Socket.IO connection from realtime-sync');
        } else {
            console.log('[GlobalChat] Socket not ready yet - realtime-sync will initialize it');
            // Socket will be created by realtime-sync.js when user auth is ready
        }
    }

    function hasAuthContext() {
        const hasIdentity = window.currentStaffIdentity && 
                           window.currentStaffIdentity.id && 
                           window.currentStaffIdentity.name;
        
        const hasToken = typeof window.getToken === 'function' ? window.getToken() : '';
        return Boolean(hasIdentity || hasToken);
    }

    function startWhenAuthenticated() {
        if (hasAuthContext()) {
            console.log('[GlobalChat] Auth context ready');
            initializeChat();
            return;
        }
        window.addEventListener('staff:auth-ready', initializeChat, { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWhenAuthenticated, { once: true });
    } else {
        startWhenAuthenticated();
    }

})();
