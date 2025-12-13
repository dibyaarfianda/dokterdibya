/**
 * RS Bhayangkara Exporter - Background Service Worker
 * Supports both HTML and PDF parsing
 */

const API_BASE = 'https://dokterdibya.com';

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('RS Bhayangkara Exporter installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getToken') {
        chrome.storage.local.get(['dibya_token'], (result) => {
            sendResponse({ token: result.dibya_token });
        });
        return true;
    }

    if (message.action === 'openStaffPanel') {
        chrome.tabs.create({
            url: 'https://dokterdibya.com/staff/public/index-adminlte.html'
        });
        sendResponse({ success: true });
        return true;
    }

    // Handle HTML text parsing
    if (message.action === 'parseRecord') {
        (async () => {
            try {
                const storage = await chrome.storage.local.get(['dibya_token']);
                const token = storage.dibya_token;

                if (!token) {
                    sendResponse({ success: false, message: 'Silakan login terlebih dahulu' });
                    return;
                }

                console.log('[Bhayangkara BG] Text length:', message.text?.length);

                const response = await fetch(API_BASE + '/api/medical-import/parse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        text: message.text,
                        category: message.category || 'obstetri',
                        source: 'rs_bhayangkara'
                    })
                });

                const result = await response.json();
                sendResponse(result);
            } catch (error) {
                console.error('API error:', error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    }

    // Handle PDF parsing
    if (message.action === 'parsePdf') {
        console.log('[Bhayangkara BG] Received parsePdf request');
        (async () => {
            try {
                const storage = await chrome.storage.local.get(['dibya_token']);
                const token = storage.dibya_token;

                console.log('[Bhayangkara BG] Token exists:', !!token);

                if (!token) {
                    console.log('[Bhayangkara BG] No token, returning error');
                    sendResponse({ success: false, message: 'Silakan login terlebih dahulu' });
                    return;
                }

                console.log('[Bhayangkara BG] Parsing PDF:', message.pdf_url);

                const response = await fetch(API_BASE + '/api/medical-import/parse-pdf', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        pdf_url: message.pdf_url,
                        category: message.category || 'obstetri',
                        source: 'rs_bhayangkara'
                    })
                });

                console.log('[Bhayangkara BG] API response status:', response.status);

                const result = await response.json();
                console.log('[Bhayangkara BG] PDF parse result:', result.success, result.message || '');
                sendResponse(result);
            } catch (error) {
                console.error('[Bhayangkara BG] PDF API error:', error);
                sendResponse({ success: false, message: 'API Error: ' + error.message });
            }
        })();
        return true;
    }
});

// Check if we're on RS Bhayangkara SIMRS and show badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('rsbhayangkara')) {
            chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId: tabId });
        } else {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
    }
});
