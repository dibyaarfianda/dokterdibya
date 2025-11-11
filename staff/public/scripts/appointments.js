// appointments.js - Appointment Management
import { auth, getIdToken } from './vps-auth-v2.js';
import { showSuccess, showError, showWarning } from './toast.js';

const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

let allAppointments = [];
let allPatients = [];
let isEditMode = false;
let isLoadingPatients = false; // Guard to prevent race conditions
let isLoadingAppointments = false; // Guard to prevent race conditions
let isInitialized = false; // Prevent double initialization

// Helper function to get today's date in Jakarta timezone (YYYY-MM-DD format)
function getTodayJakarta() {
    try {
        return new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    } catch (e) {
        // Fallback for older browsers
        const now = new Date();
        const jakartaOffset = 7 * 60; // GMT+7 in minutes
        const localOffset = now.getTimezoneOffset(); // Local timezone offset
        const jakartaTime = new Date(now.getTime() + (jakartaOffset + localOffset) * 60000);
        return jakartaTime.toISOString().split('T')[0];
    }
}

// Initialize appointments module
export async function initAppointments() {
    if (isInitialized) {
        console.log('⚠️ Appointments already initialized, skipping duplicate call...');
        return;
    }
    
    console.log('� [APPOINTMENTS] initAppointments called');
    isInitialized = true;
    
    // Bind event listeners once
    bindEventListeners();
    
    // Load data
    await loadPatients();
    await loadAppointments();
}

// Load all patients for dropdown
async function loadPatients() {
    // Prevent multiple simultaneous loads
    if (isLoadingPatients) {
        console.log('⏳ [DEBUG] Patients already loading, waiting...');
        // Wait for current load to finish
        while (isLoadingPatients) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return; // Current load should have populated allPatients
    }
    
    isLoadingPatients = true;
    try {
        const token = await getIdToken();
        if (!token) {
            console.warn('No authentication token available');
            isLoadingPatients = false;
            return;
        }
        
        console.log('🔧 [DEBUG] Loading patients from:', `${VPS_API_BASE}/api/patients`);
        const response = await fetch(`${VPS_API_BASE}/api/patients`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('🔧 [DEBUG] API response:', result);
        
        if (result.success && result.data) {
            console.log('🔧 [DEBUG] API returned data, processing', result.data.length, 'patients');
            // Normalize patient data to handle different API responses
            allPatients = result.data.map(p => {
                const normalized = {
                    id: p.id,
                    patientId: p.patientId || p.id, // Use patientId if available, otherwise use id
                    name: p.name || p.full_name, // Use name if available, otherwise use full_name
                    ...p
                };
                console.log('🔧 [DEBUG] Normalized patient:', normalized.id, normalized.name);
                return normalized;
            });
            console.log('✅ [DEBUG] Loaded', allPatients.length, 'patients:', allPatients.map(p => p.name));
        } else {
            console.warn('⚠️ [DEBUG] API returned success=false or no data');
            console.warn('⚠️ [DEBUG] Response:', JSON.stringify(result, null, 2));
            allPatients = [];
        }
    } catch (error) {
        console.error('❌ [DEBUG] Error loading patients:', error);
        allPatients = [];
        throw error; // Re-throw so caller can handle it
    } finally {
        isLoadingPatients = false;
    }
}

// Load appointments from VPS
async function loadAppointments() {
    // Prevent multiple simultaneous loads
    if (isLoadingAppointments) {
        console.log('⏳ [APPOINTMENTS] Appointments already loading, skipping...');
        return;
    }
    
    isLoadingAppointments = true;
    try {
        const token = await getIdToken();
        if (!token) {
            console.error('No token available');
            allAppointments = [];
            renderTodayAppointments();
            renderAppointmentsList([]);
            isLoadingAppointments = false;
            return;
        }
        
        const response = await fetch(`${VPS_API_BASE}/api/appointments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success) {
            allAppointments = result.data || [];
            console.log('✅ Loaded', allAppointments.length, 'appointments');
            renderTodayAppointments();
            renderAppointmentsList(allAppointments);
        } else {
            console.error('API returned success=false:', result.message);
            allAppointments = [];
            renderTodayAppointments();
            renderAppointmentsList([]);
        }
    } catch (error) {
        console.error('Error loading appointments:', error);
        allAppointments = [];
        renderTodayAppointments();
        renderAppointmentsList([]);
    } finally {
        isLoadingAppointments = false;
    }
}

// Render today's appointments
function renderTodayAppointments() {
    const container = document.getElementById('appointments-today-list');
    if (!container) return;
    
    const todayStr = getTodayJakarta();
    
    const todayAppts = allAppointments
        .filter(apt => {
            // Extract just the date part from appointment_date (might be ISO string with time)
            const aptDate = typeof apt.appointment_date === 'string' 
                ? apt.appointment_date.split('T')[0] 
                : apt.appointment_date;
            
            const dateMatches = aptDate === todayStr;
            const statusMatches = (apt.status === 'scheduled' || apt.status === 'confirmed');
            
            return dateMatches && statusMatches;
        })
        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    
    if (todayAppts.length === 0) {
        container.innerHTML = '<p class="text-center text-muted mb-0">Tidak ada appointment hari ini.</p>';
        return;
    }
    
    container.innerHTML = todayAppts.map(apt => `
        <div class="border rounded p-3 mb-2">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <strong>${apt.patient_name}</strong><br>
                    <small class="text-muted">${apt.appointment_type}</small>
                </div>
                <div>
                    <span class="badge badge-primary">${apt.appointment_time.substring(0, 5)}</span><br>
                    <button class="btn btn-sm btn-warning mt-1" onclick="window.editAppointment('${apt.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
            ${apt.notes ? `<p class="small mb-0 mt-2"><em>${apt.notes}</em></p>` : ''}
        </div>
    `).join('');
}

// Render appointments list
function renderAppointmentsList(appointments) {
    console.log('🎨 [APPOINTMENTS] renderAppointmentsList called with', appointments.length, 'appointments');
    
    const tbody = document.getElementById('appointments-list-body');
    console.log('🎯 [APPOINTMENTS] tbody element found:', !!tbody);
    
    if (!tbody) {
        console.error('❌ [APPOINTMENTS] tbody element not found!');
        return;
    }
    
    if (appointments.length === 0) {
        console.log('⚠️ [APPOINTMENTS] No appointments to display');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p class="mb-0">Tidak ada appointment</p>
                </td>
            </tr>
        `;
        return;
    }
    
    console.log('✅ [APPOINTMENTS] Rendering', appointments.length, 'appointments to table');
    
    tbody.innerHTML = appointments.map((apt, index) => {
        const statusBadge = getStatusBadge(apt.status);
        const appointmentDate = new Date(apt.appointment_date);
        const dateStr = appointmentDate.toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${apt.patient_name}</strong></td>
                <td>${apt.appointment_type}</td>
                <td>${dateStr}</td>
                <td><span class="badge badge-info">${apt.appointment_time.substring(0, 5)}</span></td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning mr-1" onclick="window.editAppointment('${apt.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${apt.status !== 'completed' && apt.status !== 'cancelled' ? `
                        <button class="btn btn-sm btn-danger mr-1" onclick="window.cancelAppointment('${apt.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="window.permanentDeleteAppointment('${apt.id}')" title="Hapus Permanen">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    console.log('✅ [APPOINTMENTS] Render complete, tbody.innerHTML length:', tbody.innerHTML.length);
}

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        'scheduled': '<span class="badge badge-secondary">Terjadwal</span>',
        'confirmed': '<span class="badge badge-primary">Dikonfirmasi</span>',
        'completed': '<span class="badge badge-success">Selesai</span>',
        'cancelled': '<span class="badge badge-danger">Dibatalkan</span>',
        'no_show': '<span class="badge badge-warning">Tidak Hadir</span>'
    };
    return badges[status] || '<span class="badge badge-secondary">Unknown</span>';
}

  // Open new appointment modal
  console.log('🔧 [DEBUG] Defining window.openNewAppointment...');
  window.openNewAppointment = async function() {
      try {
          console.log('🔧 [DEBUG] ===== openNewAppointment CALLED =====');
          isEditMode = false;
          
          const modalId = document.getElementById('appointment-id');
          const modalTitle = document.getElementById('appointment-modal-title');
          const select = document.getElementById('appointment-patient-select');
          
          if (!modalId || !modalTitle || !select) {
              console.error('❌ Modal elements not found!');
              showError('Modal elements tidak ditemukan. Silakan refresh halaman.');
              return;
          }
          
          // STEP 1: Load patients FIRST (before showing modal) - this fixes the race condition
          if (!allPatients || allPatients.length === 0) {
              console.log('🔧 [DEBUG] No patients loaded, loading now (BEFORE showing modal)...');
              try {
                  await loadPatients();
                  console.log('✅ [DEBUG] Patients loaded:', allPatients.length);
              } catch (error) {
                  console.error('❌ [DEBUG] Error loading patients:', error);
                  showError('Gagal memuat daftar pasien: ' + error.message);
                  return; // Don't show modal if we can't load patients
              }
          }
          
          // STEP 2: Set up form fields (but don't show modal yet)
          modalId.value = '';
          modalTitle.innerHTML = '<i class="fas fa-calendar-plus mr-2"></i>Tambah Appointment Baru';
          
          // Populate patient dropdown with already-loaded patients
          console.log('🔧 [DEBUG] About to populate dropdown. allPatients:', allPatients?.length || 0);
          select.innerHTML = '<option value="">Pilih pasien...</option>';
          if (allPatients && allPatients.length > 0) {
              allPatients.forEach(patient => {
                  if (!patient || !patient.id) {
                      console.warn('⚠️ [DEBUG] Skipping invalid patient:', patient);
                      return;
                  }
                  const option = document.createElement('option');
                  option.value = patient.id;
                  const displayName = patient.name || patient.full_name || 'Tanpa Nama';
                  const displayId = patient.patientId || patient.id || '';
                  option.textContent = `${displayName}${displayId ? ` (${displayId})` : ''}`;
                  select.appendChild(option);
              });
              
              // Verify the dropdown was populated
              const optionCount = select.options.length;
              console.log('✅ [DEBUG] Populated dropdown with', allPatients.length, 'patients. Options in select:', optionCount);
              
              if (optionCount <= 1) {
                  console.error('❌ [DEBUG] DROPDOWN NOT POPULATED! Select only has', optionCount, 'options');
                  select.innerHTML = '<option value="">⚠️ Gagal memuat pasien (cek console)</option>';
              }
          } else {
              console.warn('⚠️ [DEBUG] No patients available after loading. allPatients:', allPatients);
              select.innerHTML = '<option value="">Tidak ada pasien tersedia</option>';
          }
          
          // Set default date to today in Jakarta timezone (GMT+7)
          const dateInput = document.getElementById('appointment-date');
          if (dateInput) {
              dateInput.value = getTodayJakarta();
          }
          
          // Reset form
          const typeInput = document.getElementById('appointment-type');
          const timeInput = document.getElementById('appointment-time');
          const notesInput = document.getElementById('appointment-notes');
          const reminderInput = document.getElementById('appointment-reminder');
          
          if (typeInput) typeInput.value = 'Konsultasi';
          if (timeInput) timeInput.value = '09:00';
          if (notesInput) notesInput.value = '';
          if (reminderInput) reminderInput.checked = false;
          
          // STEP 3: NOW show modal (after everything is ready)
          if (typeof $ !== 'undefined' && $.fn.modal) {
              console.log('✅ [DEBUG] Showing modal with jQuery (after patients loaded)');
              
              // Refresh dropdown one more time after modal is fully shown (Bootstrap event)
              $('#appointment-modal').on('shown.bs.modal', function() {
                  console.log('✅ [DEBUG] Modal fully shown, refreshing dropdown...');
                  const selectRefresh = document.getElementById('appointment-patient-select');
                  if (selectRefresh && allPatients && allPatients.length > 0) {
                      // Clear and repopulate to ensure it's visible
                      selectRefresh.innerHTML = '<option value="">Pilih pasien...</option>';
                      allPatients.forEach(patient => {
                          const option = document.createElement('option');
                          option.value = patient.id;
                          option.textContent = `${patient.name} (${patient.patientId || patient.id})`;
                          selectRefresh.appendChild(option);
                      });
                      console.log('✅ [DEBUG] Dropdown refreshed with', allPatients.length, 'patients after modal shown');
                  } else {
                      console.warn('⚠️ [DEBUG] Cannot refresh dropdown - select element or patients not available');
                  }
                  // Remove event listener to prevent multiple triggers
                  $('#appointment-modal').off('shown.bs.modal');
              });
              
              $('#appointment-modal').modal('show');
          } else {
              // Fallback: show modal manually if jQuery not available
              console.warn('⚠️ jQuery not available, using fallback');
              const modal = document.getElementById('appointment-modal');
              if (modal) {
                  modal.classList.add('show');
                  modal.style.display = 'block';
                  document.body.classList.add('modal-open');
                  const backdrop = document.createElement('div');
                  backdrop.className = 'modal-backdrop fade show';
                  backdrop.id = 'modal-backdrop-fallback';
                  document.body.appendChild(backdrop);
                  
                  // Refresh dropdown after a short delay for fallback
                  setTimeout(() => {
                      const selectRefresh = document.getElementById('appointment-patient-select');
                      if (selectRefresh && allPatients && allPatients.length > 0) {
                          selectRefresh.innerHTML = '<option value="">Pilih pasien...</option>';
                          allPatients.forEach(patient => {
                              const option = document.createElement('option');
                              option.value = patient.id;
                              option.textContent = `${patient.name} (${patient.patientId || patient.id})`;
                              selectRefresh.appendChild(option);
                          });
                          console.log('✅ [DEBUG] Dropdown refreshed with', allPatients.length, 'patients (fallback)');
                      }
                  }, 300);
              }
          }
          
          console.log('✅ [DEBUG] Modal should be visible now with patients loaded');
      } catch (error) {
          console.error('❌ Error in openNewAppointment:', error);
          showError('Gagal membuka modal appointment: ' + error.message);
      }
  };

// Edit appointment
window.editAppointment = function(appointmentId) {
    const appointment = allAppointments.find(apt => apt.id == appointmentId);
    if (!appointment) return;
    
    isEditMode = true;
    document.getElementById('appointment-id').value = appointment.id;
    document.getElementById('appointment-modal-title').innerHTML = '<i class="fas fa-calendar-edit mr-2"></i>Edit Appointment';
    
    // Populate patient dropdown
    const select = document.getElementById('appointment-patient-select');
    select.innerHTML = '<option value="">Pilih pasien...</option>';
    allPatients.forEach(patient => {
        const option = document.createElement('option');
        option.value = patient.id;
        option.textContent = `${patient.name} (${patient.patientId})`;
        option.selected = patient.id == appointment.patient_id;
        select.appendChild(option);
    });
    
    // Set form values
    document.getElementById('appointment-date').value = appointment.appointment_date;
    document.getElementById('appointment-time').value = appointment.appointment_time;
    document.getElementById('appointment-type').value = appointment.appointment_type;
    document.getElementById('appointment-notes').value = appointment.notes || '';
    document.getElementById('appointment-reminder').checked = appointment.whatsapp_reminder || false;
    
    $('#appointment-modal').modal('show');
};

// Save appointment
window.saveAppointment = async function() {
    const form = document.getElementById('appointment-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const appointmentId = document.getElementById('appointment-id').value;
    const patientId = document.getElementById('appointment-patient-select').value;
    const patient = allPatients.find(p => p.id == patientId);
    
    if (!patient) {
        showError('Pilih pasien terlebih dahulu');
        return;
    }
    
    const appointmentData = {
        patient_id: patientId,
        patient_name: patient.name,
        appointment_date: document.getElementById('appointment-date').value,
        appointment_time: document.getElementById('appointment-time').value,
        appointment_type: document.getElementById('appointment-type').value,
        location: 'Klinik', // Private clinic only
        notes: document.getElementById('appointment-notes').value,
        whatsapp_reminder: document.getElementById('appointment-reminder').checked,
        reminder_time: 60,
        created_by: auth.currentUser?.name || auth.currentUser?.email || 'System'
    };
    
    try {
        const token = await getIdToken();
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        const url = isEditMode 
            ? `${VPS_API_BASE}/api/appointments/${appointmentId}`
            : `${VPS_API_BASE}/api/appointments`;
        const method = isEditMode ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(appointmentData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save appointment');
        }
        
        const result = await response.json();
        if (result.success) {
            showSuccess(isEditMode ? 'Appointment berhasil diperbarui' : 'Appointment berhasil dibuat');
            $('#appointment-modal').modal('hide');
            loadAppointments();
        } else {
            throw new Error(result.message || 'Failed to save appointment');
        }
    } catch (error) {
        console.error('Error saving appointment:', error);
        showError('Gagal menyimpan appointment: ' + error.message);
    }
};

// Cancel appointment
window.cancelAppointment = async function(appointmentId) {
    if (!confirm('Yakin ingin membatalkan appointment ini?')) return;
    
    try {
        const token = await getIdToken();
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        const response = await fetch(`${VPS_API_BASE}/api/appointments/${appointmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'cancelled' })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to cancel appointment');
        }
        
        const result = await response.json();
        if (result.success) {
            showSuccess('Appointment berhasil dibatalkan');
            loadAppointments();
        }
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        showError('Gagal membatalkan appointment: ' + error.message);
    }
};

// Permanently delete appointment from database
window.permanentDeleteAppointment = async function(appointmentId) {
    if (!confirm('⚠️ PERINGATAN: Ini akan menghapus appointment PERMANEN dari database!\n\nTidak bisa dikembalikan. Yakin ingin melanjutkan?')) return;
    
    try {
        const token = await getIdToken();
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        const response = await fetch(`${VPS_API_BASE}/api/appointments/${appointmentId}/permanent`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete appointment');
        }
        
        const result = await response.json();
        if (result.success) {
            showSuccess('Appointment berhasil dihapus permanen');
            loadAppointments();
        }
    } catch (error) {
        console.error('Error permanently deleting appointment:', error);
        showError('Gagal menghapus appointment: ' + error.message);
    }
};

// Bind event listeners
function bindEventListeners() {
    // Add appointment button - only bind if not already done
    const addBtn = document.getElementById('btn-add-appointment');
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = 'true';
        // Button already has onclick in HTML, so we don't need to bind again
    }
    
    // Search
    const searchInput = document.getElementById('appointments-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            filterAppointments(searchTerm);
        });
    }
    
    // Status filter
    const statusFilter = document.getElementById('appointments-filter-status');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            filterAppointments();
        });
    }
    
    // Date filter
    const dateFilter = document.getElementById('appointments-filter-date');
    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            filterAppointments();
        });
    }
}

// Filter appointments
function filterAppointments(searchTerm = '') {
    let filtered = allAppointments;
    
    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(apt => 
            apt.patient_name.toLowerCase().includes(searchTerm) ||
            apt.appointment_type.toLowerCase().includes(searchTerm)
        );
    }
    
    // Status filter
    const statusFilter = document.getElementById('appointments-filter-status');
    if (statusFilter && statusFilter.value) {
        filtered = filtered.filter(apt => apt.status === statusFilter.value);
    }
    
    // Date filter
    const dateFilter = document.getElementById('appointments-filter-date');
    if (dateFilter && dateFilter.value) {
        filtered = filtered.filter(apt => apt.appointment_date === dateFilter.value);
    }
    
    renderAppointmentsList(filtered);
}

// Quick check function - call from console: window.checkAppointments()
window.checkAppointments = function() {
    console.log('=== APPOINTMENTS QUICK CHECK ===');
    console.log('Module loaded?', typeof window.openNewAppointment === 'function');
    console.log('Patients loaded?', allPatients?.length || 0, 'patients');
    console.log('Appointments loaded?', allAppointments?.length || 0, 'appointments');
    console.log('Button exists?', !!document.getElementById('btn-add-appointment'));
    console.log('Modal exists?', !!document.getElementById('appointment-modal'));
    console.log('Select exists?', !!document.getElementById('appointment-patient-select'));
    if (allPatients?.length > 0) {
        console.log('First 3 patients:', allPatients.slice(0, 3).map(p => ({ id: p.id, name: p.name })));
    }
    console.log('================================');
};

// Debug function - can be called from console: window.debugAppointments()
window.debugAppointments = function() {
    console.log('🔧 [DEBUG] ===== APPOINTMENTS DEBUG INFO =====');
    console.log('🔧 [DEBUG] Button exists?', !!document.getElementById('btn-add-appointment'));
    console.log('🔧 [DEBUG] Button element:', document.getElementById('btn-add-appointment'));
    console.log('🔧 [DEBUG] Modal exists?', !!document.getElementById('appointment-modal'));
    console.log('🔧 [DEBUG] Modal element:', document.getElementById('appointment-modal'));
    console.log('🔧 [DEBUG] window.openNewAppointment type:', typeof window.openNewAppointment);
    console.log('🔧 [DEBUG] window.openNewAppointment:', window.openNewAppointment);
    console.log('🔧 [DEBUG] allPatients count:', allPatients.length);
    console.log('🔧 [DEBUG] allAppointments count:', allAppointments.length);
    console.log('🔧 [DEBUG] jQuery available?', typeof $ !== 'undefined');
    console.log('🔧 [DEBUG] Bootstrap modal available?', typeof $ !== 'undefined' && $.fn.modal);
    
    const btn = document.getElementById('btn-add-appointment');
    if (btn) {
        console.log('🔧 [DEBUG] Button onclick:', btn.onclick);
        console.log('🔧 [DEBUG] Button parent:', btn.parentNode);
        console.log('🔧 [DEBUG] Button text:', btn.textContent);
        
        // Try to manually trigger click
        console.log('🔧 [DEBUG] Attempting manual click...');
        try {
            if (typeof window.openNewAppointment === 'function') {
                console.log('🔧 [DEBUG] Calling window.openNewAppointment() directly...');
                window.openNewAppointment();
            } else {
                console.error('❌ [DEBUG] window.openNewAppointment is not a function!');
            }
        } catch (err) {
            console.error('❌ [DEBUG] Error calling function:', err);
        }
    } else {
        console.error('❌ [DEBUG] Button not found!');
    }
    
    console.log('🔧 [DEBUG] ===== END DEBUG INFO =====');
    return {
        buttonExists: !!btn,
        modalExists: !!document.getElementById('appointment-modal'),
        functionExists: typeof window.openNewAppointment === 'function',
        jqueryExists: typeof $ !== 'undefined',
        patientsCount: allPatients.length,
        appointmentsCount: allAppointments.length
    };
};

