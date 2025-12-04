/**
 * SIMRS Melinda Exporter - Background Service Worker
 */

const API_BASE = 'https://dokterdibya.com';

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('SIMRS Melinda Exporter installed');
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
            url: 'https://dokterdibya.com/staff/public/index-adminlte.html#import-medical'
        });
        sendResponse({ success: true });
        return true;
    }

    // Handle API call from content script (avoids CORS)
    if (message.action === 'parseRecord') {
        (async () => {
            try {
                // Get token from storage
                const storage = await chrome.storage.local.get(['dibya_token']);
                const token = storage.dibya_token;

                if (!token) {
                    sendResponse({ success: false, message: 'Silakan login terlebih dahulu' });
                    return;
                }

                console.log('[SIMRS BG] Text length:', message.text?.length);
                console.log('[SIMRS BG] Text preview:', message.text?.substring(0, 300));

                // Make API call
                const response = await fetch(API_BASE + '/api/medical-import/parse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        text: message.text,
                        category: message.category || 'obstetri',  // Default to obstetri
                        source: 'simrs_melinda'
                    })
                });

                console.log('[SIMRS BG] API response status:', response.status);

                const result = await response.json();
                sendResponse(result);
            } catch (error) {
                console.error('API error:', error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }
});

// Check if we're on SIMRS Melinda and show badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('simrs.melinda.co.id')) {
            chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId: tabId });
        } else {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
    }
});
