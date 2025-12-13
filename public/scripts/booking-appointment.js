// Booking Appointment Script v2.0
// Auth check is done inline in HTML before this script loads
const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || localStorage.getItem('patient_token');
const API_BASE = '/api/sunday-appointments';

// Booking state
let currentStep = 1;
const bookingData = {
    date: null,
    dateFormatted: null,
    session: null,
    sessionLabel: null,
    slot: null,
    slotTime: null,
    consultationCategory: 'obstetri',
    consultationCategoryLabel: 'Kehamilan (Obstetri)',
    chiefComplaint: null
};

// Category labels map
const categoryLabels = {
    'obstetri': 'Kehamilan (Obstetri)',
    'gyn_repro': 'Program Hamil (Reproduksi)',
    'gyn_special': 'Ginekologi Umum'
};

// Initialize
$(document).ready(function() {
    loadSundays();
    setupEventListeners();
});

function setupEventListeners() {
    $('#btn-next').click(nextStep);
    $('#btn-back').click(prevStep);
    $('#btn-submit').click(submitBooking);
    $('#chief-complaint').on('input', validateComplaint);

    // Category selection
    $('input[name="consultation_category"]').on('change', function() {
        const value = $(this).val();
        bookingData.consultationCategory = value;
        bookingData.consultationCategoryLabel = categoryLabels[value] || value;
    });
}

function showAlert(message, type = 'info') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible" role="alert">
            <button type="button" class="close" data-dismiss="alert">
                <span>&times;</span>
            </button>
            ${message}
        </div>
    `;
    $('#alert-container').html(alertHtml);
    $('html, body').animate({ scrollTop: 0 }, 300);
}

// Load available Sundays
async function loadSundays() {
    try {
        $('#date-loading').show();
        const response = await fetch(`${API_BASE}/sundays`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load dates');
        
        const data = await response.json();
        renderSundays(data.sundays);
        
    } catch (error) {
        console.error('Error loading sundays:', error);
        showAlert('Gagal memuat tanggal. Silakan refresh halaman.', 'danger');
    }
}

function renderSundays(sundays) {
    $('#date-loading').hide();
    $('#date-grid').show();
    
    const html = sundays.map(sunday => `
        <div class="date-card" data-date="${sunday.date}" data-formatted="${sunday.formatted}">
            <div class="day">Minggu</div>
            <div class="date">${new Date(sunday.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</div>
        </div>
    `).join('');
    
    $('#date-grid').html(html);
    
    $('.date-card').click(function() {
        $('.date-card').removeClass('selected');
        $(this).addClass('selected');
        bookingData.date = $(this).data('date');
        bookingData.dateFormatted = $(this).data('formatted');
        validateStep(1);
    });
}

// Load available slots
async function loadSlots() {
    try {
        $('#session-loading').show();
        $('#session-container').hide();
        
        const response = await fetch(`${API_BASE}/available?date=${bookingData.date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load slots');
        
        const data = await response.json();
        renderSessions(data.sessions);
        
    } catch (error) {
        console.error('Error loading slots:', error);
        showAlert('Gagal memuat slot. Silakan coba lagi.', 'danger');
    }
}

function renderSessions(sessions) {
    $('#session-loading').hide();
    $('#session-container').show();

    const html = sessions.map(session => {
        const totalSlots = session.slots.length;
        const availableCount = session.slots.filter(s => s.available).length;
        let badgeClass = 'badge-available';
        let badgeText = `${availableCount}/${totalSlots} tersedia`;

        if (availableCount === 0) {
            badgeClass = 'badge-full';
            badgeText = 'Penuh';
        } else if (availableCount <= 3) {
            badgeClass = 'badge-limited';
            badgeText = `Hanya ${availableCount} slot`;
        }
        
        const slotsHtml = session.slots.map(slot => `
            <button class="slot-btn ${slot.available ? '' : 'disabled'}" 
                    data-session="${session.session}"
                    data-session-label="${session.label}"
                    data-slot="${slot.number}"
                    data-time="${slot.time}"
                    ${slot.available ? '' : 'disabled'}>
                ${slot.time}
            </button>
        `).join('');
        
        return `
            <div class="session-card" data-session="${session.session}">
                <div class="session-header">
                    <div>
                        <div class="session-title">Sesi ${session.session}</div>
                        <div class="session-time">${session.label}</div>
                    </div>
                    <span class="session-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="slot-grid">
                    ${slotsHtml}
                </div>
            </div>
        `;
    }).join('');
    
    $('#session-container').html(html);
    
    $('.slot-btn:not(.disabled)').click(function() {
        $('.slot-btn').removeClass('selected');
        $('.session-card').removeClass('selected');
        $(this).addClass('selected');
        $(this).closest('.session-card').addClass('selected');
        
        bookingData.session = $(this).data('session');
        bookingData.sessionLabel = $(this).data('session-label');
        bookingData.slot = $(this).data('slot');
        bookingData.slotTime = $(this).data('time');
        
        validateStep(2);
    });
}

function validateComplaint() {
    const complaint = $('#chief-complaint').val().trim();
    bookingData.chiefComplaint = complaint;
    validateStep(3);
}

function validateStep(step) {
    let isValid = false;
    
    switch(step) {
        case 1:
            isValid = bookingData.date !== null;
            break;
        case 2:
            isValid = bookingData.session !== null && bookingData.slot !== null;
            break;
        case 3:
            isValid = bookingData.chiefComplaint && bookingData.chiefComplaint.length >= 10;
            break;
        case 4:
            isValid = true;
            break;
    }
    
    if (step === currentStep) {
        $('#btn-next').prop('disabled', !isValid);
    }
    
    return isValid;
}

function nextStep() {
    if (currentStep < 4) {
        if (currentStep === 1) {
            loadSlots();
        } else if (currentStep === 3) {
            showSummary();
        }
        
        currentStep++;
        updateUI();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateUI();
    }
}

function updateUI() {
    // Update steps
    $('.booking-step').removeClass('active');
    $(`#step-${currentStep}`).addClass('active');
    
    // Update step indicator
    $('.step').removeClass('active completed');
    for (let i = 1; i < currentStep; i++) {
        $(`.step[data-step="${i}"]`).addClass('completed');
    }
    $(`.step[data-step="${currentStep}"]`).addClass('active');
    
    // Update buttons
    $('#btn-back').toggle(currentStep > 1);
    $('#btn-next').toggle(currentStep < 4);
    $('#btn-submit').toggle(currentStep === 4);
    
    // Validate current step
    validateStep(currentStep);
    
    // Scroll to top
    $('html, body').animate({ scrollTop: 0 }, 300);
}

function showSummary() {
    $('#summary-date').text(bookingData.dateFormatted);
    $('#summary-session').text(bookingData.sessionLabel);
    $('#summary-time').text(bookingData.slotTime);
    $('#summary-category').text(bookingData.consultationCategoryLabel);
    $('#summary-complaint').text(bookingData.chiefComplaint);
}

async function submitBooking() {
    try {
        $('#btn-submit').prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Memproses...');

        const response = await fetch(`${API_BASE}/book`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                appointment_date: bookingData.date,
                session: bookingData.session,
                slot_number: bookingData.slot,
                chief_complaint: bookingData.chiefComplaint,
                consultation_category: bookingData.consultationCategory
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle 409 Conflict (slot already booked by another patient)
            if (response.status === 409) {
                showAlert(`
                    <strong><i class="fa fa-exclamation-triangle"></i> Slot Sudah Terisi</strong><br>
                    ${data.message}<br><br>
                    <small>Memuat ulang slot yang tersedia...</small>
                `, 'warning');

                // Reset slot selection
                bookingData.session = null;
                bookingData.sessionLabel = null;
                bookingData.slot = null;
                bookingData.slotTime = null;

                // Go back to step 2 (slot selection) and refresh slots
                currentStep = 2;
                updateUI();
                await loadSlots();

                $('#btn-submit').prop('disabled', false).html('<i class="fa fa-check"></i> Konfirmasi Booking');
                return;
            }
            throw new Error(data.message || 'Gagal membuat janji temu');
        }

        // Success
        showAlert(`
            <strong>Janji Temu Berhasil Dibuat!</strong><br>
            Tanggal: ${data.details.date}<br>
            Waktu: ${data.details.time}<br>
            Sesi: ${data.details.session}<br><br>
            <div style="margin-top: 10px; padding: 10px; background: #FFF3E0; color: #E65100; border-radius: 5px; border-left: 4px solid #FF9800;">
                <i class="fa fa-clock-o"></i> <strong>Status: Menunggu Konfirmasi</strong><br>
                Staff klinik akan segera mengkonfirmasi janji temu Anda.
            </div><br>
            Anda akan dialihkan ke dashboard...
        `, 'success');

        setTimeout(() => {
            window.location.href = '/patient-dashboard.html';
        }, 3000);

    } catch (error) {
        console.error('Error booking appointment:', error);
        showAlert(error.message, 'danger');
        $('#btn-submit').prop('disabled', false).html('<i class="fa fa-check"></i> Konfirmasi Booking');
    }
}
