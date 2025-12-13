// Real-time synchronization module using Socket.io
// Allows users to see what others are doing in real-time

const REALTIME_API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : window.location.origin;

// Use window-level singleton to prevent multiple instances across cached/fresh modules
if (!window.__realtimeSyncState) {
    window.__realtimeSyncState = {
        socket: null,
        currentUser: null,
        onlineUsers: new Map(),
        isInitializing: false,
        initialized: false
    };
}

const state = window.__realtimeSyncState;

// Initialize Socket.io connection
export function initRealtimeSync(user) {
    console.log('🔄 [REALTIME] initRealtimeSync called with:', JSON.stringify(user));

    if (!user) {
        console.warn('🔄 [REALTIME] No user provided, skipping initialization');
        return;
    }

    if (!user.id || !user.name) {
        console.error('🔄 [REALTIME] Invalid user object - missing id or name:', JSON.stringify(user));
        return;
    }

    // Use global state to check for existing initialization
    if (state.isInitializing) {
        console.log('🔄 [REALTIME] Already initializing (global state), skipping duplicate call');
        return;
    }

    // If already initialized with the same user, skip
    if (state.initialized && state.socket && state.socket.connected && state.currentUser?.id === user.id) {
        console.log('🔄 [REALTIME] Already initialized and connected as same user, skipping');
        return;
    }

    // Check if already connected or connecting (using global state)
    if (state.socket) {
        // Socket exists - check state
        if (state.socket.connected) {
            if (state.currentUser && state.currentUser.id === user.id) {
                console.log('🔄 [REALTIME] Already connected as same user, skipping');
                return;
            }
            // Different user - re-register
            console.log('🔄 [REALTIME] User changed, re-registering:', user.id, user.name);
            state.currentUser = user;
            state.socket.emit('user:register', {
                userId: user.id,
                name: user.name,
                role: user.role,
                photo: user.photo_url || user.photoURL || null
            });
            return;
        } else if (state.socket.connecting) {
            // Socket is still connecting - wait for it
            console.log('🔄 [REALTIME] Socket is connecting, will register when connected');
            state.currentUser = user; // Update user for when connect fires
            return;
        } else {
            // Socket exists but disconnected - close and recreate
            console.log('🔄 [REALTIME] Socket exists but disconnected, recreating...');
            state.socket.close();
            state.socket = null;
        }
    }

    console.log('🔄 [REALTIME] Initializing with user:', user.id, user.name, user.role);

    state.isInitializing = true;
    state.currentUser = user;

    // Connect to Socket.io server
    console.log('🔄 [REALTIME] Connecting to:', REALTIME_API_BASE);
    state.socket = io(REALTIME_API_BASE, {
        transports: ['polling'], // POLLING ONLY - some mobile ISPs kill WebSocket connections
        upgrade: false, // Disable upgrade to WebSocket
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10,
        timeout: 30000,
        forceNew: false
    });

    // Make socket globally available for other modules
    window.socket = state.socket;

    state.socket.on('connect', () => {
        state.isInitializing = false; // Clear flag on successful connect
        state.initialized = true;
        console.log('🔄 [REALTIME] Connected to real-time sync server, socket id:', state.socket.id);

        // Validate currentUser before registration
        if (!state.currentUser || !state.currentUser.id || !state.currentUser.name) {
            console.error('🔄 [REALTIME] Cannot register - currentUser is invalid:', JSON.stringify(state.currentUser));
            return;
        }

        // Register immediately - no delay (mobile networks drop connections quickly)
        console.log('🔄 [REALTIME] Registering user:', state.currentUser.id, state.currentUser.name);

        state.socket.emit('user:register', {
            userId: state.currentUser.id,
            name: state.currentUser.name,
            role: state.currentUser.role,
            photo: state.currentUser.photo_url || state.currentUser.photoURL || null
        });

        console.log('🔄 [REALTIME] User registration sent');
    });

    state.socket.on('connect_error', (error) => {
        state.isInitializing = false; // Clear flag on error
        console.error('🔄 [REALTIME] Connection error:', error.message, error);
    });

    state.socket.on('error', (error) => {
        console.error('🔄 [REALTIME] Socket error:', error);
    });

    state.socket.on('disconnect', (reason) => {
        console.log('⚠️ [REALTIME] Disconnected from real-time sync server, reason:', reason);
    });

    state.socket.on('reconnect', () => {
        console.log('🔄 [REALTIME] Reconnected to real-time sync server');

        // Validate currentUser before re-registration
        if (!state.currentUser || !state.currentUser.id || !state.currentUser.name) {
            console.error('🔄 [REALTIME] Cannot re-register - currentUser is invalid');
            return;
        }

        // Re-register user on reconnect
        state.socket.emit('user:register', {
            userId: state.currentUser.id,
            name: state.currentUser.name,
            role: state.currentUser.role,
            photo: state.currentUser.photo_url || state.currentUser.photoURL || null
        });
    });

    // Listen for online users list updates
    state.socket.on('users:list', (users) => {
        console.log('👥 [REALTIME] Received online users list:', users);
        state.onlineUsers.clear();
        users.forEach(user => {
            if (user.userId !== state.currentUser.id) {
                state.onlineUsers.set(user.userId, {
                    name: user.name,
                    role: user.role,
                    activity: user.activity || 'Idle',
                    timestamp: user.timestamp || new Date().toISOString()
                });
            }
        });
        renderOnlineUsers();
    });

    // Listen for user connected
    state.socket.on('user:connected', (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`✅ [REALTIME] ${data.name} joined`);
            state.onlineUsers.set(data.userId, {
                name: data.name,
                role: data.role,
                activity: 'Baru bergabung',
                timestamp: new Date().toISOString()
            });
            renderOnlineUsers();
        }
    });

    // Listen for user disconnected
    state.socket.on('user:disconnected', (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`❌ [REALTIME] ${data.name} left`);
            state.onlineUsers.delete(data.userId);
            renderOnlineUsers();
        }
    });

    // Listen for user activity updates
    state.socket.on('user:activity', (data) => {
        if (data.userId !== state.currentUser.id) {
            const user = state.onlineUsers.get(data.userId);
            if (user) {
                user.activity = data.activity;
                user.timestamp = data.timestamp;
                renderOnlineUsers();
            }
        }
    });

    // Listen for patient selection events from other users
    state.socket.on('patient:selected', async (data) => {
        console.log(`👤 [REALTIME] Patient selected event received:`, data);
        console.log(`👤 [REALTIME] Current user ID: ${state.currentUser.id}`);
        console.log(`👤 [REALTIME] Event user ID: ${data.userId}`);

        // Skip if this user is the one who selected the patient
        // (they already have the patient selected from their own action)
        if (data.userId === state.currentUser.id) {
            console.log(`[REALTIME] Skipping auto-select - user initiated this selection`);
            return;
        }

        console.log(`[REALTIME] ✅ Will auto-select patient - different user selected`);

        // Show notification for selections by other users
        if (data.userName) {
            showRealtimeNotification(`${data.userName} memilih pasien: ${data.patientName}`, 'info');
        }

        // Auto-select the same patient for other users
        console.log(`[REALTIME] Auto-selecting patient for synced work...`);
        await autoSelectPatient(data.patientId, data.patientName);
    });

    // Listen for anamnesa updates
    state.socket.on('anamnesa:updated', async (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`📝 [REALTIME] ${data.userName} updated anamnesa for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate anamnesa untuk: ${data.patientName}`, 'info');

            // Auto-reload anamnesa data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('anamnesa');
            }
        }
    });

    // Listen for physical exam updates
    state.socket.on('physical:updated', async (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`🩺 [REALTIME] ${data.userName} updated physical exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate pemeriksaan fisik untuk: ${data.patientName}`, 'info');

            // Auto-reload physical exam data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('physical');
            }
        }
    });

    // Listen for USG exam updates
    state.socket.on('usg:updated', async (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`👶 [REALTIME] ${data.userName} updated USG exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate USG untuk: ${data.patientName}`, 'info');

            // Auto-reload USG data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('usg');
            }
        }
    });

    // Listen for lab exam updates
    state.socket.on('lab:updated', async (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`🔬 [REALTIME] ${data.userName} updated lab exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate pemeriksaan penunjang untuk: ${data.patientName}`, 'info');

            // Auto-reload lab data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('lab');
            }
        }
    });

    // Listen for billing updates
    state.socket.on('billing:updated', (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`💰 [REALTIME] ${data.userName} updated billing for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} memperbarui billing untuk: ${data.patientName}`, 'info');
        }
    });

    // Listen for visit completion
    state.socket.on('visit:completed', (data) => {
        if (data.userId !== state.currentUser.id) {
            console.log(`✅ [REALTIME] ${data.userName} completed visit for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} menyelesaikan kunjungan: ${data.patientName}`, 'success');
        }
    });
}

// Broadcast patient selection
export function broadcastPatientSelection(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Memilih pasien: ${patientName}`;

    state.socket.emit('patient:select', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted patient selection:', patientName);
}

// Broadcast anamnesa update
export function broadcastAnamnesaUpdate(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Mengisi anamnesa: ${patientName}`;

    state.socket.emit('anamnesa:update', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted anamnesa update:', patientName);
}

// Broadcast intake verification
export function broadcastIntakeVerification(patientId, patientName, submissionId, reviewerName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Memverifikasi intake: ${patientName}`;

    state.socket.emit('intake:verified', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        submissionId: submissionId,
        reviewerName: reviewerName,
        timestamp: new Date().toISOString()
    });

    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted intake verification:', patientName);
}

// Broadcast physical exam update
export function broadcastPhysicalExamUpdate(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Mengisi pemeriksaan fisik: ${patientName}`;

    state.socket.emit('physical:update', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted physical exam update:', patientName);
}

// Broadcast USG exam update
export function broadcastUSGExamUpdate(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Mengisi USG: ${patientName}`;

    state.socket.emit('usg:update', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted USG exam update:', patientName);
}

// Broadcast lab exam update
export function broadcastLabExamUpdate(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Mengisi pemeriksaan penunjang: ${patientName}`;

    state.socket.emit('lab:update', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted lab exam update:', patientName);
}

// Broadcast billing update
export function broadcastBillingUpdate(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Memperbarui billing: ${patientName}`;

    state.socket.emit('billing:update', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted billing update:', patientName);
}

// Broadcast visit completion
export function broadcastVisitCompleted(patientId, patientName) {
    if (!state.socket || !state.currentUser) return;

    const activity = `Menyelesaikan kunjungan: ${patientName}`;

    state.socket.emit('visit:complete', {
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });

    // Update activity status
    state.socket.emit('activity:update', {
        userId: state.currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });

    console.log('📤 [REALTIME] Broadcasted visit completion:', patientName);
}

// Show real-time notification
function showRealtimeNotification(message, type = 'info') {
    // Inject CSS animations if not exists
    if (!document.getElementById('realtime-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'realtime-notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Get or create notification container
    let container = document.getElementById('realtime-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'realtime-notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 350px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }

    // Limit to max 3 notifications at a time
    const existingNotifications = container.querySelectorAll('.realtime-notification');
    if (existingNotifications.length >= 3) {
        existingNotifications[0].remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} realtime-notification`;
    notification.style.cssText = `
        margin: 0;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: slideInRight 0.3s ease;
        position: relative;
        padding-right: 35px;
    `;

    notification.innerHTML = `
        <i class="fas fa-sync-alt mr-2"></i>
        <strong>Update:</strong> ${message}
        <button type="button" class="close" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); opacity: 0.7;">
            <span>&times;</span>
        </button>
    `;

    // Native close handler (no Bootstrap dependency)
    const closeBtn = notification.querySelector('.close');
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    });

    container.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}

// Clear all realtime notifications
export function clearRealtimeNotifications() {
    const container = document.getElementById('realtime-notification-container');
    if (container) {
        container.innerHTML = '';
    }
}

// Auto-select patient for all users
async function autoSelectPatient(patientId, patientName) {
    try {
        console.log(`[REALTIME] Auto-selecting patient: ${patientName} (ID: ${patientId})`);
        
        // Fetch patient data from API
        const token = await (await import('./vps-auth-v2.js')).getIdToken();
        const response = await fetch(`${REALTIME_API_BASE}/api/patients/${patientId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        let patient;
        
        if (!response.ok) {
            console.warn(`[REALTIME] Failed to fetch patient data: ${response.status} ${response.statusText}`);
            console.warn(`[REALTIME] Using minimal patient data from broadcast`);
            // Fallback: use minimal data from broadcast
            patient = {
                id: patientId,
                patientId: patientId,
                name: patientName
            };
        } else {
            const result = await response.json();
            if (!result.success || !result.data) {
                console.warn('[REALTIME] Invalid patient data response, using minimal data');
                patient = {
                    id: patientId,
                    patientId: patientId,
                    name: patientName
                };
            } else {
                patient = result.data;
            }
        }
        
        // Import required modules dynamically for fallback scenario
        const { setCurrentPatientForExam, toggleMedicalExamMenu } = await import('./medical-exam.js');
        
        // Delegate to shared patient selection helper to keep UI consistent
        const applyRealtimeSelection = window.__applyRealtimePatientSelection;
        if (typeof applyRealtimeSelection === 'function') {
            await applyRealtimeSelection(patient);
        } else {
            // Fallback: minimal updates if helper not ready
            setCurrentPatientForExam(patient);
            toggleMedicalExamMenu(true);
            window.currentPatientId = patient.id || patientId;
            window.currentPatientData = patient;
        }
        
        console.log('[REALTIME] Patient auto-selected successfully');
        
    } catch (error) {
        console.error('[REALTIME] Error auto-selecting patient:', error);
    }
}

// Reload medical exam data based on type
async function reloadMedicalExamData(examType) {
    try {
        console.log(`[REALTIME] Reloading ${examType} data...`);
        
        // Import medical-exam module dynamically
        const medicalExamModule = await import('./medical-exam.js');
        
        // Call appropriate load function based on exam type
        switch(examType) {
            case 'anamnesa':
                if (typeof medicalExamModule.loadAnamnesaData === 'function') {
                    await medicalExamModule.loadAnamnesaData();
                    console.log('[REALTIME] Anamnesa data reloaded');
                }
                break;
            case 'physical':
                if (typeof medicalExamModule.loadPhysicalExamData === 'function') {
                    await medicalExamModule.loadPhysicalExamData();
                    console.log('[REALTIME] Physical exam data reloaded');
                }
                break;
            case 'usg':
                if (typeof medicalExamModule.loadUSGExamData === 'function') {
                    await medicalExamModule.loadUSGExamData();
                    console.log('[REALTIME] USG data reloaded');
                }
                break;
            case 'lab':
                if (typeof medicalExamModule.loadLabExamData === 'function') {
                    await medicalExamModule.loadLabExamData();
                    console.log('[REALTIME] Lab data reloaded');
                }
                break;
            default:
                console.warn(`[REALTIME] Unknown exam type: ${examType}`);
        }
    } catch (error) {
        console.error(`[REALTIME] Error reloading ${examType} data:`, error);
    }
}

// Refresh current view
function refreshCurrentView() {
    // This will be called when data changes for the currently viewed patient
    // Trigger reload of current section
    if (typeof window.reloadCurrentSection === 'function') {
        window.reloadCurrentSection();
    }
}

// Disconnect from real-time sync
export function disconnectRealtimeSync() {
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
        state.initialized = false;
        console.log('🔌 [REALTIME] Disconnected from real-time sync');
    }
}

// Export socket for other modules to use
export function getSocket() {
    return state.socket;
}

// Render online users in the sidebar panel
function renderOnlineUsers() {
    const onlineUsersList = document.getElementById('online-users-list');
    const onlineCount = document.getElementById('online-count');

    if (!onlineUsersList || !onlineCount) return;

    const userCount = state.onlineUsers.size;
    onlineCount.textContent = userCount;
    if (typeof window.updateOnlineUsersStat === 'function') {
        window.updateOnlineUsersStat(userCount);
    }

    if (userCount === 0) {
        onlineUsersList.innerHTML = `
            <li class="list-group-item text-center text-muted py-2">
                <small>No users online</small>
            </li>
        `;
        return;
    }

    // Convert map to array and sort by timestamp (most recent first)
    const usersArray = Array.from(state.onlineUsers.entries()).sort((a, b) => {
        return new Date(b[1].timestamp) - new Date(a[1].timestamp);
    });
    
    onlineUsersList.innerHTML = usersArray.map(([userId, user]) => {
        const roleColor = getRoleColor(user.role);

        return `
            <li class="list-group-item py-1">
                <div class="d-flex align-items-center">
                    <span class="user-status-indicator user-status-online"></span>
                    <strong class="text-truncate" style="font-size: 12px;">${user.name}</strong>
                    <span class="badge badge-${roleColor} ml-auto" style="font-size: 10px;">${user.role}</span>
                </div>
            </li>
        `;
    }).join('');
}

// Get role badge color
function getRoleColor(role) {
    const roleColors = {
        'superadmin': 'danger',
        'admin': 'primary',
        'manager': 'warning',
        'doctorassistant': 'info',
        'doctor': 'success'
    };
    return roleColors[role] || 'secondary';
}

// Get activity icon
function getActivityIcon(activity) {
    if (activity.includes('pasien') || activity.includes('patient')) return 'fa-user-injured';
    if (activity.includes('anamnesa')) return 'fa-clipboard-list';
    if (activity.includes('billing') || activity.includes('tagihan')) return 'fa-file-invoice-dollar';
    if (activity.includes('kunjungan') || activity.includes('visit')) return 'fa-check-circle';
    if (activity.includes('bergabung') || activity.includes('joined')) return 'fa-sign-in-alt';
    return 'fa-circle';
}

// Get time ago string
function getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    
    if (diffSec < 10) return 'baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    if (diffMin < 60) return `${diffMin} menit lalu`;
    
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} jam lalu`;
}
