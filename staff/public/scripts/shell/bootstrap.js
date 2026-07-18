async function bootstrapStaffShell() {
    const [
        authClient,
        credentialGuard,
        roleConstants,
        _pageRegistryModule,
        _pollingCoordinatorModule,
        featureLoader,
        pageDescriptorsModule
    ] = await Promise.all([
        import('../vps-auth-v2.js'),
        import('./credentials.js'),
        import('../role-constants.js'),
        import('./page-registry.js'),
        import('./polling-coordinator.js'),
        import('./feature-loader.js'),
        import('./page-descriptors.js')
    ]);

    const { auth, getIdToken, initAuth: initAuthLib } = authClient;
    const { verifyStaffCredentials, renderStaffShellError } = credentialGuard;
    const { ensureFeature } = featureLoader;
    const { createPageDescriptors } = pageDescriptorsModule;

    const pageRegistry = new window.PageRegistry();
    const pollingCoordinator = new window.PollingCoordinator();
    pageRegistry.registerAll(createPageDescriptors());

    window.staffPageRegistry = pageRegistry;
    window.staffPollingCoordinator = pollingCoordinator;
    window.ensureStaffFeature = ensureFeature;

    function installLazyFeatureShim(globalName, featureName, pageKey = null) {
        const originalHandler = typeof window[globalName] === 'function' ? window[globalName] : null;
        const shim = async (...args) => {
            if (pageKey) await pageRegistry.ensureLoaded(pageKey);
            await ensureFeature(featureName);
            const loadedHandler = window[globalName];
            if (typeof loadedHandler === 'function' && loadedHandler !== shim) return loadedHandler(...args);
            if (originalHandler) return originalHandler(...args);
        };
        window[globalName] = shim;
    }

    installLazyFeatureShim('showTanyaDokterPage', 'tanyaDokter', 'tanya-dokter');
    installLazyFeatureShim('viewPatientDetail', 'patientSearchDetail');

    window.auth = auth;
    window.getIdToken = getIdToken;
    window.renderStaffShellError = renderStaffShellError;

    // Run auth bootstrap in parallel with module loading to reduce startup wait.
    const authInitPromise = initAuthLib();
    const [
        _,
        mainModule,
        authModule,
        sessionModule,
        _chatPopupModule
    ] = await Promise.all([
        import('../toast.js'),
        import('../main.js'),
        import('../auth.js'),
        import('../session-manager.js'),
        import('../chat-popup.js')
    ]);

    const { initMain } = mainModule;
    const { initAuth } = authModule;
    const { initSessionManager, restoreSessionOnLoad } = sessionModule;

    // Ensure auth state is available, then verify the token against the backend.
    await authInitPromise;
    const user = await verifyStaffCredentials({ auth });

    function resolveSafeDisplayName(staffUser) {
        const candidate = String(staffUser?.name || '').trim();
        if (candidate && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
            return candidate;
        }

        const fallbackId = String(staffUser?.id || '').trim();
        return fallbackId || 'User';
    }

    // IMMEDIATE navbar update
    const navName = document.getElementById('navbar-user-name');
    const navRole = document.getElementById('navbar-user-role');
    const newName = resolveSafeDisplayName(user);
    const newRole = user.role_display_name || user.role || 'Staff';
    if (navName) navName.textContent = newName;
    if (navRole) navRole.textContent = newRole;

    // Set RUM context
    window.__userRole = user.role || 'unknown';
    window.__currentPage = null;

    // User is verified, initialize app.
    initializeApp(user);

    function initializeApp(user) {
        const runIdle = window.requestIdleCallback || function(callback, options) {
            return setTimeout(callback, options?.timeout || 1);
        };

        // Initialize core UI (pages, clock, navigation)
        try {
            initMain();
        } catch (error) {
            console.error('[ERROR] Error initializing main:', error);
        }

        // Initialize feature areas
        try {
            initAuth(user);
            window.dispatchEvent(new CustomEvent('staff:auth-ready', { detail: { user } }));
        } catch (error) {
            console.error('[ERROR] Error initializing auth UI:', error);
        }

        // Direct navbar update
        if (user) {
            const navName = document.getElementById('navbar-user-name');
            const navRole = document.getElementById('navbar-user-role');
            if (navName) navName.textContent = resolveSafeDisplayName(user);
            if (navRole) navRole.textContent = user.role_display_name || user.role || 'Staff';
        }

        import('./support-chat-badge.js')
            .then(module => module.initSupportChatBadge?.())
            .catch(error => console.warn('[WARN] Support badge fallback unavailable:', error));

        // Non-critical boot tasks run during idle so first paint can happen sooner.
        runIdle(() => {
            try {
                initSessionManager();
            } catch (error) {
                console.error('[ERROR] Error initializing session manager:', error);
            }

            try {
                if (window.__currentPage !== 'dashboard') return;
                if (typeof window.loadDashboardCurrentCode === 'function') {
                    window.loadDashboardCurrentCode();
                } else {
                    setTimeout(() => {
                        if (typeof window.loadDashboardCurrentCode === 'function') {
                            window.loadDashboardCurrentCode();
                        }
                    }, 500);
                }
            } catch (error) {
                console.error('[ERROR] Error loading dashboard code:', error);
            }
        }, { timeout: 1500 });

            // Real-time sync initialized in main.js via onAuthStateChanged.

        // Restore session if exists.
        runIdle(() => {
            try {
                restoreSessionOnLoad().then(session => {
                    if (session && session.patient) {
                        console.log('[OK] Session restored for patient:', session.patient.name);
                    }
                }).catch(error => {
                    console.warn('[WARN] Session restore failed (non-critical):', error);
                });
            } catch (error) {
                console.error('[WARN] Session restoration setup failed:', error);
            }
        }, { timeout: 2200 });

        console.log('[OK] AdminLTE app initialized successfully');
    }
}

function renderBootstrapFailure(error) {
    console.error('[STAFF SHELL] Bootstrap failed:', error);

    if (error?.shellErrorRendered) {
        return;
    }

    const renderer = window.renderStaffShellError;
    if (typeof renderer === 'function') {
        renderer({
            title: 'Staff panel gagal dimuat',
            message: 'Aplikasi staff berhenti saat proses awal. Silakan perbarui aplikasi atau login ulang.',
            details: error?.message || ''
        });
        return;
    }

    const host = document.getElementById('main-app') || document.body;
    if (!host) return;

    host.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #f4f6f9;">
            <div style="max-width: 520px; width: 100%; background: #fff; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; text-align: center;">
                <h3 style="margin: 0 0 12px; color: #343a40;">Staff panel gagal dimuat</h3>
                <p style="margin: 0 0 18px; color: #495057;">Aplikasi staff berhenti saat proses awal. Silakan perbarui aplikasi atau login ulang.</p>
                <button type="button" onclick="window.location.reload()" style="padding: 10px 16px; border: 0; border-radius: 8px; background: #0d6efd; color: #fff;">Perbarui aplikasi</button>
                <button type="button" onclick="window.location.replace('/staff/public/login.html')" style="padding: 10px 16px; border: 1px solid #6c757d; border-radius: 8px; background: #fff; color: #343a40; margin-left: 8px;">Login ulang</button>
            </div>
        </div>
    `;
}

bootstrapStaffShell().catch(renderBootstrapFailure);
