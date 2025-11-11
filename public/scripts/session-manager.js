import { showSuccess, showWarning, showConfirm } from './toast.js';

const SESSION_KEY = 'dibyaklinik_current_session';

// Session data structure
let currentSession = {
    patient: null,
    anamnesa: null,
    physical: null,
    usg: null,
    lab: null,
    services: [],
    obat: [],
    timestamp: null,
    isActive: false
};

// Save session to localStorage
export function saveSession(data) {
    try {
        const sessionData = {
            ...currentSession,
            ...data,
            timestamp: new Date().toISOString(),
            isActive: true
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        currentSession = sessionData;
        
        console.log('Session saved:', sessionData);
        return true;
    } catch (err) {
        console.error('Failed to save session:', err);
        return false;
    }
}

// Load session from localStorage
export function loadSession() {
    try {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
            currentSession = JSON.parse(savedSession);
            console.log('Session loaded:', currentSession);
            return currentSession;
        }
        return null;
    } catch (err) {
        console.error('Failed to load session:', err);
        return null;
    }
}

// Clear session
export function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
        currentSession = {
            patient: null,
            anamnesa: null,
            physical: null,
            usg: null,
            lab: null,
            services: [],
            obat: [],
            timestamp: null,
            isActive: false
        };
        console.log('Session cleared');
        return true;
    } catch (err) {
        console.error('Failed to clear session:', err);
        return false;
    }
}

// Check if there's an active session
export function hasActiveSession() {
    const session = loadSession();
    return session && session.isActive && session.patient;
}

// Get current session
export function getCurrentSession() {
    return currentSession;
}

// Update patient in session
export function updateSessionPatient(patient) {
    return saveSession({ patient });
}

// Update anamnesa in session
export function updateSessionAnamnesa(anamnesa) {
    return saveSession({ anamnesa });
}

// Update physical exam in session
export function updateSessionPhysical(physical) {
    return saveSession({ physical });
}

// Update USG exam in session
export function updateSessionUSG(usg) {
    return saveSession({ usg });
}

// Update lab exam in session
export function updateSessionLab(lab) {
    return saveSession({ lab });
}

// Update services in session
export function updateSessionServices(services) {
    return saveSession({ services });
}

// Update obat in session
export function updateSessionObat(obat) {
    return saveSession({ obat });
}

// Restore session on page load
export async function restoreSessionOnLoad() {
    const session = loadSession();
    
    if (!session || !session.isActive || !session.patient) {
        return null;
    }
    
    // Calculate time since last activity
    const lastActivity = new Date(session.timestamp);
    const now = new Date();
    const hoursSince = (now - lastActivity) / (1000 * 60 * 60);
    
    // If more than 24 hours, auto-clear stale session
    if (hoursSince > 24) {
        clearSession();
        return null;
    }
    
    // Don't show notification - just silently restore session
    // showWarning(`Melanjutkan pemeriksaan pasien: ${session.patient.name}`);
    
    return session;
}

// Ask to start new patient after finalization
export async function askForNextPatient() {
    const nextPatient = await showConfirm(
        'Pemeriksaan selesai!<br><br>Apakah Anda ingin memeriksa pasien selanjutnya?',
        'Pasien Selanjutnya'
    );
    
    if (nextPatient) {
        clearSession();
        // Redirect to patient page
        if (window.showPatientPage) {
            window.showPatientPage();
        }
        showSuccess('Silakan pilih pasien selanjutnya');
    }
    // If user clicks "Tidak", stay on current page (Rincian Tagihan)
    // Don't clear session or redirect
}

// Initialize session manager
export function initSessionManager() {
    // Auto-save on beforeunload
    window.addEventListener('beforeunload', () => {
        if (currentSession.isActive) {
            saveSession(currentSession);
        }
    });
    
    console.log('Session manager initialized');
}

