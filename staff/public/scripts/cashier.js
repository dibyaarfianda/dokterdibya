// Cashier module for billing summary, finalization, and printing
// Uses VPS API for data operations

import { auth, getIdToken } from './vps-auth-v2.js';
import { showSuccess, showError, showConfirm, showWarning, showInfo } from './toast.js';
import { askForNextPatient, clearSession, getCurrentSession } from './session-manager.js';
import { getCurrentPatient } from './billing.js';
import { broadcastVisitCompleted } from './realtime-sync.js';

// VPS API Configuration
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

// Helper function to log activities
async function logActivity(action, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        await fetch(`${VPS_API_BASE}/api/logs`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getIdToken()}`
            },
            body: JSON.stringify({
                user_id: user.id,
                user_name: user.name || user.email,
                action: action,
                details: details
            })
        });
    } catch (err) {
        console.error('Failed to log activity:', err);
        // Don't show error to user - logging is non-critical
    }
}

// Import jsPDF from CDN
let jsPDF;

// Load jsPDF dynamically
async function loadJsPDF() {
    if (!jsPDF) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        document.head.appendChild(script);
        
        await new Promise((resolve) => {
            script.onload = () => {
                jsPDF = window.jspdf.jsPDF;
                resolve();
            };
        });
    }
    return jsPDF;
}

let isFinalized = false;
let currentBillingData = null;

// Check if patient is dummy (test patient)
function isDummyPatient(patientName) {
    if (!patientName) return false;
    return patientName.toLowerCase().trim() === 'tes';
}

// Update stock for obat items via VPS API
async function updateObatStock(obatItems) {
    const updates = [];
    const token = await getIdToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    for (const item of obatItems) {
        if (!item.name || !item.quantity) continue;
        
        try {
            // Fetch obat from VPS API
            const response = await fetch(`${VPS_API_BASE}/api/obat?name=${encodeURIComponent(item.name)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data && result.data.length > 0) {
                    const obatDoc = result.data[0];
                    const currentStock = parseInt(obatDoc.stock || 0);
                    const newStock = Math.max(0, currentStock - item.quantity);
                    
                    // Update via VPS API
                    await fetch(`${VPS_API_BASE}/api/obat/${obatDoc.id}`, {
                        method: 'PUT',
                        headers: headers,
                        body: JSON.stringify({ stock: newStock })
                    });
                    
                    updates.push({
                        name: item.name,
                        oldStock: currentStock,
                        newStock: newStock,
                        used: item.quantity
                    });
                    
                    console.log(`Stock updated: ${item.name} (${currentStock} → ${newStock})`);
                }
            }
        } catch (err) {
            console.error(`Failed to update stock for ${item.name}:`, err);
        }
    }
    
    return updates;
}

// Format currency functions - match index-asli.html exactly
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR', 
        minimumFractionDigits: 0 
    }).format(amount || 0);
}

function formatCurrencyNoName(number) {
    return (isNaN(number) || number === 0) ? '0' : new Intl.NumberFormat('id-ID').format(number);
}

// Helper to convert image to base64
async function fetchImageAsBase64(imgElement) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0);
        try {
            const base64 = canvas.toDataURL('image/png');
            resolve(base64);
        } catch (e) {
            reject(e);
        }
    });
}

export function initCashier() {
    const finalizeBillBtn = document.getElementById('finalize-bill-btn');
    const printEtiketBtn = document.getElementById('print-etiket-btn');
    const printInvoiceBtn = document.getElementById('print-invoice-btn');
    const newPatientBtn = document.getElementById('new-patient-btn');
    
    if (finalizeBillBtn) {
        finalizeBillBtn.addEventListener('click', finalizeBill);
    }
    
    if (printEtiketBtn) {
        printEtiketBtn.addEventListener('click', printEtiket);
    }
    
    if (printInvoiceBtn) {
        printInvoiceBtn.addEventListener('click', printInvoice);
    }
    
    if (newPatientBtn) {
        newPatientBtn.addEventListener('click', startNewPatient);
    }
}

export function updateCashierSummary(patientData, tindakanData, obatData) {
    // Store billing data
    currentBillingData = {
        patient: patientData,
        services: tindakanData || [],  // Use 'services' for consistency
        tindakan: tindakanData || [],  // Keep for backward compatibility
        obat: obatData || []
    };
    
    // Update patient info
    document.getElementById('summary-patient-name').textContent = patientData.name || '-';
    document.getElementById('summary-patient-phone').textContent = patientData.whatsapp || '-';
    document.getElementById('summary-date').textContent = new Date().toLocaleDateString('id-ID', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const cashierName = auth.currentUser ? auth.currentUser.name : 'Staff';
    document.getElementById('summary-cashier').textContent = cashierName;
    
    // Calculate totals (with safety checks)
    const safeTindakan = tindakanData || [];
    const safeObat = obatData || [];
    
    const tindakanTotal = safeTindakan.reduce((sum, item) => sum + (item.price || 0), 0);
    const obatTotal = safeObat.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    const grandTotal = tindakanTotal + obatTotal;
    
    document.getElementById('summary-tindakan-total').textContent = formatCurrency(tindakanTotal);
    document.getElementById('summary-obat-total').textContent = formatCurrency(obatTotal);
    document.getElementById('summary-grand-total').textContent = formatCurrency(grandTotal);
    
    // Render tindakan list
    const tindakanListEl = document.getElementById('summary-tindakan-list');
    if (safeTindakan.length === 0) {
        tindakanListEl.innerHTML = '<p class="text-muted">Tidak ada tindakan</p>';
    } else {
        let html = '<table class="table table-sm table-hover">';
        html += '<thead><tr><th>No</th><th>Layanan</th><th class="text-right">Harga</th></tr></thead><tbody>';
        safeTindakan.forEach((item, index) => {
            html += `<tr>
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td class="text-right">${formatCurrency(item.price)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        tindakanListEl.innerHTML = html;
    }
    
    // Render obat list
    const obatListEl = document.getElementById('summary-obat-list');
    if (safeObat.length === 0) {
        obatListEl.innerHTML = '<p class="text-muted">Tidak ada obat</p>';
    } else {
        let html = '<table class="table table-sm table-hover">';
        html += '<thead><tr><th>No</th><th>Nama</th><th>Jumlah</th><th>Cara Pakai</th><th class="text-right">Harga</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
        safeObat.forEach((item, index) => {
            const subtotal = (item.price || 0) * (item.quantity || 1);
            const caraPakai = item.category === 'drugs' ? (item.usage || '-') : '-';
            html += `<tr>
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${caraPakai}</td>
                <td class="text-right">${formatCurrency(item.price)}</td>
                <td class="text-right">${formatCurrency(subtotal)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        obatListEl.innerHTML = html;
    }
}

async function finalizeBill() {
    if (!currentBillingData) {
        showError('Tidak ada data billing untuk difinalisasi');
        return;
    }
    
    const patientName = currentBillingData.patient.name || '';
    const isDummy = isDummyPatient(patientName);
    
    // Show different confirmation for dummy vs real patient
    let confirmMessage = 'Apakah Anda yakin data sudah benar dan siap untuk difinalisasi?<br><br>Setelah difinalisasi, Anda dapat mencetak etiket dan invoice.';
    if (isDummy) {
        confirmMessage = '⚠️ <strong>PASIEN DUMMY TERDETEKSI</strong><br><br>Pasien dengan nama "tes" tidak akan:<br>- Mengurangi stock obat<br>- Masuk ke analytics/keuntungan<br>- Tercatat di history<br><br>Lanjutkan?';
    }
    
    const confirmed = await showConfirm(confirmMessage, 'Finalisasi Pemeriksaan');
    
    if (!confirmed) return;
    
    // Get session data for complete medical record
    const session = getCurrentSession();
    
    // Calculate totals (with safety checks)
    const services = currentBillingData.services || [];
    const obat = currentBillingData.obat || [];
    
    const totalTindakan = services.reduce((sum, s) => sum + (s.price || 0), 0);
    const totalObat = obat.reduce((sum, o) => sum + ((o.price || 0) * (o.quantity || 1)), 0);
    const grandTotal = totalTindakan + totalObat;
    
    if (isDummy) {
        // Dummy patient - skip database operations
        showInfo('Mode DUMMY: Data tidak disimpan ke database dan stock tidak dikurangi.');
        console.log('DUMMY PATIENT - Skipping database operations');
    } else {
        // Real patient - full database operations
        try {
            // 1. Update obat stock
            const stockUpdates = await updateObatStock(obat);
            
            // 2. Save complete visit data with medical examination details via VPS API
            const visitData = {
                patient_id: currentBillingData.patient.id || null,
                patient_name: currentBillingData.patient.name || '-',
                visit_date: new Date().toISOString().split('T')[0],
                
                // Services and medications
                services: services,
                medications: obat,
                
                // Financial data
                grand_total: grandTotal,
                
                // Metadata
                examiner: auth.currentUser?.displayName || 'Admin',
                is_dummy: 0
            };
            
            // Save to VPS API
            const token = await getIdToken();
            const visitHeaders = { 'Content-Type': 'application/json' };
            if (token) {
                visitHeaders['Authorization'] = `Bearer ${token}`;
            }
            const visitResponse = await fetch(`${VPS_API_BASE}/api/visits`, {
                method: 'POST',
                headers: visitHeaders,
                body: JSON.stringify(visitData)
            });
            
            if (visitResponse.ok) {
                console.log('Visit recorded successfully with complete medical data');
            } else {
                const errorText = await visitResponse.text();
                console.error('Visit save failed:', visitResponse.status, errorText);
                throw new Error(`Failed to save visit to VPS: ${visitResponse.status} - ${errorText}`);
            }
            
            // 3. Update patient's visit count and last visit via VPS API
            if (currentBillingData.patient.id) {
                try {
                    const patientId = currentBillingData.patient.id;
                    const visitResponse = await fetch(`${VPS_API_BASE}/api/patients/${patientId}/visit`, {
                        method: 'PATCH'
                    });
                    
                    if (visitResponse.ok) {
                        console.log('Patient visit count updated successfully');
                    } else {
                        console.warn('Failed to update patient visit count');
                    }
                } catch (err) {
                    console.error('Failed to update patient visit count:', err);
                }
            }
            
            // Log finalization activity
            try {
                await logActivity('Finalized Visit', `Finalized visit for ${currentBillingData.patient.name || 'Unknown'} - Total: Rp ${grandTotal.toLocaleString('id-ID')}`);
            } catch (logErr) {
                console.error('Failed to log activity:', logErr);
            }
            
            // Broadcast visit completion to other users
            if (currentBillingData.patient) {
                broadcastVisitCompleted(
                    currentBillingData.patient.id || currentBillingData.patient.patientId,
                    currentBillingData.patient.name
                );
            }
            
            showSuccess('Pemeriksaan berhasil difinalisasi! Stock obat telah dikurangi dan data tersimpan.');
        } catch (err) {
            console.error('Failed to finalize:', err);
            showError('Gagal menyimpan data. Silakan coba lagi.');
            return;
        }
    }
    
    isFinalized = true;
    
    // Clear session and patient selection after successful finalization
    clearSession();
    
    // Clear patient selection dynamically to avoid import issues
    import('./billing.js').then(billingModule => {
        if (billingModule.clearSelectedPatient) {
            billingModule.clearSelectedPatient();
        }
    }).catch(err => {
        console.warn('Failed to clear patient selection:', err);
    });
    
    // Show print buttons and new patient button
    document.getElementById('print-etiket-btn').classList.remove('d-none');
    document.getElementById('print-invoice-btn').classList.remove('d-none');
    document.getElementById('new-patient-btn').classList.remove('d-none');
    
    // Hide finalize button
    document.getElementById('finalize-bill-btn').classList.add('d-none');
}

async function startNewPatient() {
    const confirmed = await showConfirm(
        'Apakah Anda yakin ingin memulai pemeriksaan pasien baru?<br><br>Data pemeriksaan saat ini akan dihapus.',
        'Periksa Pasien Baru'
    );
    
    if (confirmed) {
        clearSession();
        
        // Reset cashier page
        isFinalized = false;
        currentBillingData = null;
        
        // Redirect to patient page
        if (window.showPatientPage) {
            window.showPatientPage();
        }
        
        showSuccess('Silakan pilih atau tambah pasien baru');
    }
}

async function printEtiket() {
    if (!isFinalized) {
        showError('Harap finalisasi pemeriksaan terlebih dahulu');
        return;
    }
    
    if (!currentBillingData || !currentBillingData.obat || !Array.isArray(currentBillingData.obat)) {
        showError('Tidak ada data obat');
        return;
    }
    
    const drugsToPrint = currentBillingData.obat.filter(item => 
        item.category === 'drugs' && item.usage && item.quantity > 0
    );
    
    if (drugsToPrint.length === 0) {
        showError('Tidak ada obat dengan instruksi cara pakai untuk dicetak');
        return;
    }
    
    try {
        await loadJsPDF();
        const doc = new jsPDF();
        const patientName = currentBillingData.patient.name;
        
        // Label dimensions
        const labelWidth = 60;
        const labelHeight = 40;
        const marginX = 15;
        const marginY = 15;
        const gapX = 5;
        const gapY = 5;
        const cols = 3;
        
        let currentX = marginX;
        let currentY = marginY;
        let col = 0;
        
        drugsToPrint.forEach(item => {
            // Check if need new page
            if (currentY + labelHeight > doc.internal.pageSize.height - marginY) {
                doc.addPage();
                currentX = marginX;
                currentY = marginY;
                col = 0;
            }
            
            // Draw label border
            doc.rect(currentX, currentY, labelWidth, labelHeight);
            
            let textY = currentY + 3;
            
            // Header
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("Dr. Dibya Private Clinic", currentX + labelWidth / 2, textY, { align: 'center' });
            
            textY += 3;
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text("RSIA Melinda", currentX + labelWidth / 2, textY, { align: 'center' });
            
            textY += 3;
            doc.text("Jl. Balowerti 2 No. 59, Kediri", currentX + labelWidth / 2, textY, { align: 'center' });
            
            textY += 3;
            doc.text("SIPA: 503/0522/SIP-SIK/419.104/2024", currentX + labelWidth / 2, textY, { align: 'center' });
            
            // Separator line
            textY += 2;
            doc.setLineWidth(0.2);
            doc.line(currentX + 2, textY, currentX + labelWidth - 2, textY);
            textY += 4;
            
            // Patient name and date
            doc.setFontSize(8);
            doc.text(`Pasien: ${patientName}`, currentX + 3, textY);
            doc.text(new Date().toLocaleDateString('id-ID'), currentX + labelWidth - 3, textY, { align: 'right' });
            
            // Drug name
            textY += 4;
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            const drugNameLines = doc.splitTextToSize(item.name, labelWidth - 6);
            doc.text(drugNameLines, currentX + 3, textY);
            textY += (drugNameLines.length * 4) + 1;
            
            // Usage instructions
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            const instructionLines = doc.splitTextToSize(item.usage, labelWidth - 6);
            doc.text(instructionLines, currentX + 3, textY);
            
            // Footer text
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("Diminum sebelum/sesudah makan", currentX + 3, currentY + labelHeight - 3);
            
            // Move to next position
            col++;
            if (col >= cols) {
                col = 0;
                currentX = marginX;
                currentY += labelHeight + gapY;
            } else {
                currentX += labelWidth + gapX;
            }
        });
        
        doc.save(`etiket-${patientName.replace(/\s/g, '_')}.pdf`);
        showSuccess('Etiket obat berhasil dicetak!');
    } catch (error) {
        console.error('Error printing etiket:', error);
        showError('Gagal mencetak etiket obat');
    }
}

async function printInvoice() {
    if (!isFinalized) {
        showError('Harap finalisasi pemeriksaan terlebih dahulu');
        return;
    }
    
    if (!currentBillingData) {
        showError('Tidak ada data billing');
        return;
    }
    
    try {
        await loadJsPDF();
        const doc = new jsPDF({ format: 'a6' });
        
        const patientName = currentBillingData.patient.name;
        const cashierName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : 'Staff';
        const tindakanList = currentBillingData.services || currentBillingData.tindakan || [];
        const printedObat = (currentBillingData.obat || []).filter(item => item.quantity > 0); // EXACT from index-asli.html
        
        // Calculate totals
        const tindakanTotal = tindakanList.reduce((sum, item) => sum + (item.price || 0), 0);
        const obatTotal = printedObat.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
        
        // Get logo
        const logoImg = document.querySelector('img[src="images/logodpc.svg"]');
        let logoBase64 = null;
        if (logoImg && logoImg.complete && logoImg.naturalHeight > 0) {
            try {
                logoBase64 = await fetchImageAsBase64(logoImg);
            } catch (e) {
                console.warn('Failed to load logo:', e);
            }
        }
        
        // PDF Generation (A6 Format) - Compact spacing
        const pageWidth = doc.internal.pageSize.getWidth();
        const leftMargin = 8;
        const rightMargin = 8;
        const rightEdge = pageWidth - rightMargin;
        const center = pageWidth / 2;
        let y = 5; // Reduced from 10 to 5
        
        // Logo
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', center - 20, y, 37, 16);
            y += 17; // Reduced from 20 to 17
        } else {
            y += 3; // Reduced from 5 to 3
        }
        
        doc.setFontSize(6.3);
        doc.setFont("helvetica", "normal");
        doc.text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', center, y, { align: 'center' });
        y += 3; // Reduced from 4 to 3
        doc.text('SIP: 503/0126/SIP-SIK/419.104/2024', center, y, { align: 'center' });
        y += 5; // Reduced from 8 to 5
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Invoice Pembayaran", center, y, { align: 'center' });
        y += 1.5; // Reduced from 2 to 1.5
        doc.setLineWidth(0.5);
        doc.line(leftMargin, y, rightEdge, y);
        y += 5; // Reduced from 8 to 5
        
        // Patient info
        doc.setFontSize(7.2);
        doc.setFont("helvetica", "normal");
        doc.text(`Nama Pasien: ${patientName}`, leftMargin, y);
        doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, rightEdge, y, { align: 'right' });
        y += 4; // Reduced from 6 to 4
        
        // Tindakan section
        if (tindakanList.length > 0) {
            const tindakanTotal = tindakanList.reduce((sum, item) => sum + (item.price || 0), 0);
            
            y += 1; // Reduced from 2 to 1
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("Rincian Layanan & Tindakan", leftMargin, y);
            y += 3.5; // Reduced from 5 to 3.5
            
            doc.setFontSize(7.2);
            doc.text("Deskripsi", leftMargin, y);
            doc.text("Harga", rightEdge, y, { align: 'right' });
            y += 1.5; // Reduced from 2 to 1.5
            doc.setLineWidth(0.2);
            doc.line(leftMargin, y, rightEdge, y);
            y += 3; // Reduced from 4 to 3
            
            doc.setFont("helvetica", "normal");
            tindakanList.forEach(item => {
                const itemLines = doc.splitTextToSize(item.name, 60);
                doc.text(itemLines, leftMargin, y);
                doc.text(formatCurrencyNoName(item.price), rightEdge, y, { align: 'right' });
                y += (itemLines.length * 3) + 1.5; // Reduced from 3.5 to 3, and 2 to 1.5
            });
            
            y += 1.5; // Reduced from 2 to 1.5
            doc.setFont("helvetica", "bold");
            doc.text("Subtotal Tindakan", rightEdge - 25, y, { align: 'right' });
            doc.text(formatCurrency(tindakanTotal), rightEdge, y, { align: 'right' });
            y += 3.5; // Reduced from 5 to 3.5
        }
        
        // Obat Section
        if (printedObat.length > 0) {
            
            y += 3; // Reduced from 5 to 3
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("Rincian Obat & Alkes", leftMargin, y);
            y += 3.5; // Reduced from 5 to 3.5
            
            doc.setFontSize(7.2);
            const jmlCol = rightEdge - 38;
            const hargaCol = rightEdge - 20;
            doc.text("Deskripsi", leftMargin, y);
            doc.text("Jml", jmlCol, y, { align: 'center' });
            doc.text("Harga", hargaCol, y, { align: 'right' });
            doc.text("Subtotal", rightEdge, y, { align: 'right' });
            y += 1.5; // Reduced from 2 to 1.5
            doc.setLineWidth(0.2);
            doc.line(leftMargin, y, rightEdge, y);
            y += 3; // Reduced from 4 to 3
            
            doc.setFont("helvetica", "normal");
            printedObat.forEach(item => {
                const itemLines = doc.splitTextToSize(item.name, 45);
                doc.text(itemLines, leftMargin, y);
                doc.text(String(item.quantity), jmlCol, y, { align: 'center' });
                doc.text(formatCurrencyNoName(item.price), hargaCol, y, { align: 'right' });
                doc.text(formatCurrencyNoName(item.price * item.quantity), rightEdge, y, { align: 'right' });
                y += (itemLines.length * 3) + 1.5; // Reduced from 3.5 to 3, and 2 to 1.5
            });
            
            y += 1.5; // Reduced from 2 to 1.5
            doc.setFont("helvetica", "bold");
            doc.text("Subtotal Obat & Alkes", rightEdge - 25, y, { align: 'right' });
            doc.text(formatCurrency(obatTotal), rightEdge, y, { align: 'right' });
            y += 3.5; // Reduced from 5 to 3.5
        }
        
        // Grand Total
        y += 3; // Reduced from 5 to 3
        doc.setLineWidth(0.5); 
        doc.line(leftMargin, y, rightEdge, y); 
        y += 3.5; // Reduced from 5 to 3.5
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("GRAND TOTAL", rightEdge - 35, y, { align: 'right' });
        doc.text(formatCurrency(tindakanTotal + obatTotal), rightEdge, y, { align: 'right' });
        y += 6; // Reduced from 10 to 6
        doc.setFontSize(7.2);
        doc.setFont("helvetica", "normal");
        doc.text(`Kasir: ${cashierName}`, leftMargin, y);
        
        // Save with exact filename format from index-asli.html line 5383
        doc.save(`invoice-A6-${patientName.replace(/\s/g, '_')}.pdf`);
        showSuccess('Invoice berhasil dicetak!');
        
        // Ask for next patient after invoice is printed
        setTimeout(async () => {
            await askForNextPatient();
        }, 1500);
    } catch (error) {
        console.error('Error printing invoice:', error);
        showError('Gagal mencetak invoice');
    }
}

// Export function to get selected data from billing module
export function prepareAndShowCashier() {
    // This will be called from main.js when cashier page is opened
    // We need to import the selected data from billing module
    import('./billing.js').then(module => {
        const patientName = module.getCurrentPatient();
        // For now, use placeholder data - will be connected to actual billing data
        updateCashierSummary(
            { name: patientName, whatsapp: '-' },
            [],
            []
        );
    });
}

