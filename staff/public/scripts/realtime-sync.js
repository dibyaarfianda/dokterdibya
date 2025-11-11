// Real-time synchronization module using Socket.io
// Allows users to see what others are doing in real-time

const REALTIME_API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : window.location.origin;

let socket = null;
let currentUser = null;
let onlineUsers = new Map(); // Track online users: userId -> { name, role, activity, timestamp }

// Initialize Socket.io connection
export function initRealtimeSync(user) {
    if (!user) return;
    
    currentUser = user;
    
    // Connect to Socket.io server
    socket = io(REALTIME_API_BASE, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
        console.log('🔄 [REALTIME] Connected to real-time sync server');
        console.log('🔄 [REALTIME] Current user:', user);
        
        // Register user
        socket.emit('user:register', {
            userId: user.id,
            name: user.name,
            role: user.role,
            photo: user.photo_url || user.photoURL || null
        });
        
        console.log('🔄 [REALTIME] User registration sent');
    });
    
    socket.on('disconnect', () => {
        console.log('⚠️ [REALTIME] Disconnected from real-time sync server');
    });
    
    socket.on('reconnect', () => {
        console.log('🔄 [REALTIME] Reconnected to real-time sync server');
        
        // Re-register user on reconnect
        socket.emit('user:register', {
            userId: user.id,
            name: user.name,
            role: user.role,
            photo: user.photo_url || user.photoURL || null
        });
    });
    
    // Listen for online users list updates
    socket.on('users:list', (users) => {
        console.log('👥 [REALTIME] Received online users list:', users);
        onlineUsers.clear();
        users.forEach(user => {
            if (user.userId !== currentUser.id) {
                onlineUsers.set(user.userId, {
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
    socket.on('user:connected', (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`✅ [REALTIME] ${data.name} joined`);
            onlineUsers.set(data.userId, {
                name: data.name,
                role: data.role,
                activity: 'Baru bergabung',
                timestamp: new Date().toISOString()
            });
            renderOnlineUsers();
        }
    });
    
    // Listen for user disconnected
    socket.on('user:disconnected', (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`❌ [REALTIME] ${data.name} left`);
            onlineUsers.delete(data.userId);
            renderOnlineUsers();
        }
    });
    
    // Listen for user activity updates
    socket.on('user:activity', (data) => {
        if (data.userId !== currentUser.id) {
            const user = onlineUsers.get(data.userId);
            if (user) {
                user.activity = data.activity;
                user.timestamp = data.timestamp;
                renderOnlineUsers();
            }
        }
    });
    
    // Listen for patient selection events from other users
    socket.on('patient:selected', async (data) => {
        console.log(`👤 [REALTIME] Patient selected event received:`, data);
        console.log(`👤 [REALTIME] Current user ID: ${currentUser.id}`);
        console.log(`👤 [REALTIME] Event user ID: ${data.userId}`);
        
        // Skip if this user is the one who selected the patient
        // (they already have the patient selected from their own action)
        if (data.userId === currentUser.id) {
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
    socket.on('anamnesa:updated', async (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`📝 [REALTIME] ${data.userName} updated anamnesa for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate anamnesa untuk: ${data.patientName}`, 'info');
            
            // Auto-reload anamnesa data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('anamnesa');
            }
        }
    });
    
    // Listen for physical exam updates
    socket.on('physical:updated', async (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`🩺 [REALTIME] ${data.userName} updated physical exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate pemeriksaan fisik untuk: ${data.patientName}`, 'info');
            
            // Auto-reload physical exam data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('physical');
            }
        }
    });
    
    // Listen for USG exam updates
    socket.on('usg:updated', async (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`👶 [REALTIME] ${data.userName} updated USG exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate USG untuk: ${data.patientName}`, 'info');
            
            // Auto-reload USG data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('usg');
            }
        }
    });
    
    // Listen for lab exam updates
    socket.on('lab:updated', async (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`🔬 [REALTIME] ${data.userName} updated lab exam for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} mengupdate pemeriksaan penunjang untuk: ${data.patientName}`, 'info');
            
            // Auto-reload lab data if same patient
            if (window.currentPatientId === data.patientId) {
                await reloadMedicalExamData('lab');
            }
        }
    });
    
    // Listen for billing updates
    socket.on('billing:updated', (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`💰 [REALTIME] ${data.userName} updated billing for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} memperbarui billing untuk: ${data.patientName}`, 'info');
        }
    });
    
    // Listen for visit completion
    socket.on('visit:completed', (data) => {
        if (data.userId !== currentUser.id) {
            console.log(`✅ [REALTIME] ${data.userName} completed visit for: ${data.patientName}`);
            showRealtimeNotification(`${data.userName} menyelesaikan kunjungan: ${data.patientName}`, 'success');
        }
    });
}

// Broadcast patient selection
export function broadcastPatientSelection(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Memilih pasien: ${patientName}`;
    
    socket.emit('patient:select', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted patient selection:', patientName);
}

// Broadcast anamnesa update
export function broadcastAnamnesaUpdate(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Mengisi anamnesa: ${patientName}`;
    
    socket.emit('anamnesa:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted anamnesa update:', patientName);
}

// Broadcast physical exam update
export function broadcastPhysicalExamUpdate(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Mengisi pemeriksaan fisik: ${patientName}`;
    
    socket.emit('physical:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted physical exam update:', patientName);
}

// Broadcast USG exam update
export function broadcastUSGExamUpdate(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Mengisi USG: ${patientName}`;
    
    socket.emit('usg:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted USG exam update:', patientName);
}

// Broadcast lab exam update
export function broadcastLabExamUpdate(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Mengisi pemeriksaan penunjang: ${patientName}`;
    
    socket.emit('lab:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted lab exam update:', patientName);
}

// Broadcast billing update
export function broadcastBillingUpdate(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Memperbarui billing: ${patientName}`;
    
    socket.emit('billing:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted billing update:', patientName);
}

// Broadcast visit completion
export function broadcastVisitCompleted(patientId, patientName) {
    if (!socket || !currentUser) return;
    
    const activity = `Menyelesaikan kunjungan: ${patientName}`;
    
    socket.emit('visit:complete', {
        userId: currentUser.id,
        userName: currentUser.name,
        patientId: patientId,
        patientName: patientName,
        timestamp: new Date().toISOString()
    });
    
    // Update activity status
    socket.emit('activity:update', {
        userId: currentUser.id,
        activity: activity,
        timestamp: new Date().toISOString()
    });
    
    console.log('📤 [REALTIME] Broadcasted visit completion:', patientName);
}

// Show real-time notification
function showRealtimeNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    
    notification.innerHTML = `
        <i class="fas fa-sync-alt mr-2"></i>
        <strong>Update Real-time:</strong> ${message}
        <button type="button" class="close" data-dismiss="alert">
            <span>&times;</span>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
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
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('🔌 [REALTIME] Disconnected from real-time sync');
    }
}

// Export socket for other modules to use
export function getSocket() {
    return socket;
}

// Render online users in the sidebar panel
function renderOnlineUsers() {
    const onlineUsersList = document.getElementById('online-users-list');
    const onlineCount = document.getElementById('online-count');
    
    if (!onlineUsersList || !onlineCount) return;
    
    const userCount = onlineUsers.size;
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
    const usersArray = Array.from(onlineUsers.entries()).sort((a, b) => {
        return new Date(b[1].timestamp) - new Date(a[1].timestamp);
    });
    
    onlineUsersList.innerHTML = usersArray.map(([userId, user]) => {
        const roleColor = getRoleColor(user.role);
        const activityIcon = getActivityIcon(user.activity);
        const timeAgo = getTimeAgo(user.timestamp);
        
        return `
            <li class="list-group-item">
                <div class="d-flex align-items-start">
                    <span class="user-status-indicator user-status-online"></span>
                    <div class="flex-grow-1" style="min-width: 0;">
                        <div class="d-flex justify-content-between align-items-start">
                            <strong class="text-truncate" style="font-size: 0.85rem;">${user.name}</strong>
                            <span class="badge badge-${roleColor} ml-1">${user.role}</span>
                        </div>
                        <div class="user-activity">
                            <i class="fas ${activityIcon} user-activity-icon"></i>
                            <span class="text-truncate d-inline-block" style="max-width: 150px;">${user.activity}</span>
                        </div>
                        <div class="text-muted" style="font-size: 0.7rem;">${timeAgo}</div>
                    </div>
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
