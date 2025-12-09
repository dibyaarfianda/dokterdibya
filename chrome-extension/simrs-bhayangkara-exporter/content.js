/**
 * RS Bhayangkara to Klinik Dibya Exporter
 * Content script - runs on SIMRS RS Bhayangkara pages
 * Supports both HTML pages and PDF files
 */

(function() {
    'use strict';

    const CONFIG = {
        API_URL: 'https://dokterdibya.com/api/medical-import/parse',
        PDF_API_URL: 'https://dokterdibya.com/api/medical-import/parse-pdf',
        STAFF_URL: 'https://dokterdibya.com/staff/public/index-adminlte.html',
        BUTTON_ID: 'dibya-export-btn',
        FLOATING_BUTTON_ID: 'dibya-floating-btn'
    };

    // Check if current page is a PDF
    function isPdfPage() {
        const url = window.location.href.toLowerCase();

        // Direct PDF indicators
        if (url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('/pdf/')) {
            return true;
        }

        // Check document content type
        if (document.contentType === 'application/pdf') {
            return true;
        }

        // Check for Chrome's PDF viewer (embed element)
        const pdfEmbed = document.querySelector('embed[type="application/pdf"]');
        if (pdfEmbed) {
            return true;
        }

        // Check URL patterns that typically serve PDFs
        if (url.includes('/cetak/') || url.includes('/print/') || url.includes('/laporan/')) {
            // Additional check: if body has very little text, it's likely a PDF viewer
            const bodyText = document.body?.innerText?.trim() || '';
            if (bodyText.length < 200) {
                return true;
            }
        }

        return false;
    }

    // Get the actual PDF URL (might be different from current URL for embedded PDFs)
    function getPdfUrl() {
        // Check for embed element first
        const pdfEmbed = document.querySelector('embed[type="application/pdf"]');
        if (pdfEmbed && pdfEmbed.src) {
            return pdfEmbed.src;
        }

        // Check for iframe with PDF
        const pdfIframe = document.querySelector('iframe[src*=".pdf"]');
        if (pdfIframe) {
            return pdfIframe.src;
        }

        // Check for object element
        const pdfObject = document.querySelector('object[type="application/pdf"]');
        if (pdfObject && pdfObject.data) {
            return pdfObject.data;
        }

        // Default to current URL
        return window.location.href;
    }

    // Check if we're on a patient/medical record page
    function isPatientPage() {
        const path = window.location.pathname.toLowerCase();
        return path.includes('/kasus/') ||
               path.includes('/pasien/') ||
               path.includes('/rekam-medis/') ||
               path.includes('/cppt/') ||
               path.includes('/med') ||
               path.includes('/resume_medis') ||
               path.includes('/rawat_jalan') ||
               path.includes('/cetak/') ||
               isPdfPage();
    }

    // Create and inject the export button
    function injectExportButton() {
        if (!isPatientPage()) return;
        if (document.getElementById(CONFIG.FLOATING_BUTTON_ID)) return;

        const btn = document.createElement('div');
        btn.id = CONFIG.FLOATING_BUTTON_ID;
        btn.innerHTML = `
            <button id="${CONFIG.BUTTON_ID}" title="Export ke Klinik Dibya">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <span>Export</span>
            </button>
        `;
        document.body.appendChild(btn);

        document.getElementById(CONFIG.BUTTON_ID).addEventListener('click', handleExport);
    }

    // Combine all scraped data into text format for AI parsing
    function combineDataAsText() {
        let text = '';

        // Try to get main content area first
        const mainContent = document.querySelector('.main-content, #main-content, .content, main, [role="main"], .card-body');
        if (mainContent) {
            text = mainContent.innerText;
        }

        // If no main content, get body text but exclude nav/header/footer
        if (!text || text.length < 100) {
            const clone = document.body.cloneNode(true);
            const removeSelectors = ['nav', 'header', 'footer', 'script', 'style', '.navbar', '.sidebar', '.menu'];
            removeSelectors.forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });
            text = clone.innerText;
        }

        // Clean up the text
        text = text
            .replace(/\t+/g, ' ')
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        // Limit to first 15000 chars
        if (text.length > 15000) {
            text = text.substring(0, 15000);
        }

        console.log('[Bhayangkara Export] Extracted text length:', text.length);
        return text;
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const existing = document.getElementById('dibya-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'dibya-notification';
        notification.className = `dibya-notif dibya-notif-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 5000);
    }

    // Check if extension context is still valid
    function isExtensionValid() {
        try {
            return chrome.runtime && chrome.runtime.id;
        } catch (e) {
            return false;
        }
    }

    // Handle export button click
    async function handleExport() {
        const btn = document.getElementById(CONFIG.BUTTON_ID);

        if (!isExtensionValid()) {
            showNotification('Extension perlu di-refresh. Reload halaman ini (F5)', 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `
            <svg class="dibya-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
            </svg>
            <span>Exporting...</span>
        `;

        try {
            let result;
            let usePdfParser = isPdfPage();

            // Try HTML extraction first if not detected as PDF
            if (!usePdfParser) {
                const text = combineDataAsText();
                console.log('[Bhayangkara Export] HTML text length:', text.length);

                // If text is too short, fallback to PDF parsing
                if (!text || text.length < 200) {
                    console.log('[Bhayangkara Export] Text too short, trying PDF parser');
                    usePdfParser = true;
                } else {
                    // Use HTML text parsing
                    result = await new Promise((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            action: 'parseRecord',
                            text: text,
                            category: 'obstetri',
                            source: 'rs_bhayangkara'
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve(response);
                            }
                        });
                    });
                }
            }

            // Use PDF parser
            if (usePdfParser) {
                const pdfUrl = getPdfUrl();
                console.log('[Bhayangkara Export] Using PDF parser for:', pdfUrl);
                showNotification('Mengekstrak data dari PDF...', 'info');

                try {
                    result = await new Promise((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            action: 'parsePdf',
                            pdf_url: pdfUrl,
                            category: 'obstetri',
                            source: 'rs_bhayangkara'
                        }, (response) => {
                            console.log('[Bhayangkara Export] PDF parse response:', response);
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (!response) {
                                reject(new Error('No response from background script'));
                            } else {
                                resolve(response);
                            }
                        });
                    });
                } catch (pdfError) {
                    console.error('[Bhayangkara Export] PDF parse error:', pdfError);
                    throw new Error('Gagal parse PDF: ' + pdfError.message);
                }
            }

            // Check if we got a result
            if (!result) {
                throw new Error('Tidak ada hasil parsing');
            }

            if (result.success) {
                // Store parsed data
                try {
                    await chrome.storage.local.set({
                        'dibya_import_data': result.data,
                        'dibya_import_timestamp': Date.now(),
                        'dibya_import_source': 'rs_bhayangkara'
                    });
                } catch (e) {
                    // Ignore storage error
                }

                showNotification('Data berhasil di-parse! Membuka Staff Panel...', 'success');

                // Open staff panel - auto flow will handle the rest
                setTimeout(() => {
                    window.open(CONFIG.STAFF_URL + '?import=' + encodeURIComponent(JSON.stringify(result.data)), '_blank');
                }, 1000);
            } else {
                throw new Error(result.message || 'Gagal parsing data');
            }

        } catch (error) {
            console.error('Export error:', error);

            if (error.message.includes('Extension context invalidated')) {
                showNotification('Extension perlu di-refresh. Reload halaman ini (F5)', 'warning');
            } else {
                showNotification(`Error: ${error.message}`, 'error');
            }
        }

        resetButton(btn);
    }

    // Reset button to default state
    function resetButton(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <span>Export</span>
        `;
    }

    // Initialize
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectExportButton);
        } else {
            injectExportButton();
        }

        // Also inject on URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(injectExportButton, 500);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    init();
})();
