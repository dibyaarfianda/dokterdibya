/**
 * SIMRS Melinda Exporter - Background Service Worker
 */

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
        return true; // Keep channel open for async response
    }

    if (message.action === 'openStaffPanel') {
        chrome.tabs.create({
            url: 'https://dokterdibya.com/staff/public/index-adminlte.html#import-medical'
        });
        sendResponse({ success: true });
        return true;
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
