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

    // Function to initialize chat
    function initializeChat() {
        // Ensure auth functions are available globally
        if (!window.getToken) {
            window.getToken = function() {
                const token = localStorage.getItem('token') || 
                             sessionStorage.getItem('token') ||
                             localStorage.getItem('vps_auth_token') ||
                             sessionStorage.getItem('vps_auth_token');
                return token;
            };
        }

        if (!window.getIdToken) {
            window.getIdToken = function() {
                // Try multiple token sources for compatibility
                const idToken = localStorage.getItem('idToken') || 
                               sessionStorage.getItem('idToken') ||
                               localStorage.getItem('vps_auth_token') ||
                               sessionStorage.getItem('vps_auth_token') ||
                               localStorage.getItem('token') ||
                               sessionStorage.getItem('token');
                return idToken;
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

        // Check if auth is valid (support both Firebase 'uid' and VPS auth 'id')
        if (!window.auth.currentUser || (!window.auth.currentUser.uid && !window.auth.currentUser.id)) {
            console.error('[GlobalChat] Cannot initialize: No valid user auth');
            return;
        }

        // Load chat popup script if not already loaded
        if (!document.querySelector('script[src*="chat-popup.js"]')) {
            const script = document.createElement('script');
            script.src = '/staff/public/scripts/chat-popup.js';
            script.onload = function() {
                console.log('[GlobalChat] Chat popup loaded successfully');
                window.chatPopupLoaded = true;
            };
            script.onerror = function() {
                console.error('[GlobalChat] Failed to load chat popup');
            };
            document.body.appendChild(script);
        } else {
            window.chatPopupLoaded = true;
            console.log('[GlobalChat] Chat popup script already present');
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

    // Check if we need to wait for ES6 module initialization
    function waitForAuth(callback, retries = 0, maxRetries = 20) {
        // Check if currentStaffIdentity has actual data (not just empty object)
        const hasIdentity = window.currentStaffIdentity && 
                           window.currentStaffIdentity.id && 
                           window.currentStaffIdentity.name;
        
        const hasToken = window.getToken && window.getToken();
        
        if (hasIdentity) {
            console.log('[GlobalChat] Auth context ready');
            callback();
        } else if (retries < maxRetries) {
            setTimeout(() => waitForAuth(callback, retries + 1, maxRetries), 200);
        } else {
            console.warn('[GlobalChat] Auth context timeout, loading chat anyway');
            callback();
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            waitForAuth(initializeChat);
        });
    } else {
        waitForAuth(initializeChat);
    }

})();
