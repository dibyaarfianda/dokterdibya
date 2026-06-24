async function bootstrapStaffShell() {
    // Use stable version string for cache busting (set above from CACHE_VERSION).
    const v = window.__assetVersion;

    const [
        authClient,
        credentialGuard
    ] = await Promise.all([
        import('../vps-auth-v2.js?v=' + v),
        import('./credentials.js?v=' + v)
    ]);

    const { auth, getIdToken, initAuth: initAuthLib } = authClient;
    const { verifyStaffCredentials, renderStaffShellError } = credentialGuard;

    window.auth = auth;
    window.getIdToken = getIdToken;
    window.renderStaffShellError = renderStaffShellError;

    // Run auth bootstrap in parallel with module loading to reduce startup wait.
    const authInitPromise = initAuthLib();
    const [
        _,
        mainModule,
        dashboardModule,
        authModule,
        sessionModule
    ] = await Promise.all([
        import('../toast.js?v=' + v),
        import('../main.js?v=' + v),
        import('../dashboard.js?v=' + v),
        import('../auth.js?v=' + v),
        import('../session-manager.js?v=' + v)
    ]);

    const { initMain } = mainModule;
    const { initDashboard } = dashboardModule;
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
    window.__currentPage = 'dashboard';

    // User is verified, initialize app.
    initializeApp(user);

    function initializeApp(user) {
        const v = window.__assetVersion;
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

        try {
            initDashboard();
        } catch (error) {
            console.error('[ERROR] Error initializing dashboard:', error);
        }

        // Non-critical boot tasks run during idle so first paint can happen sooner.
        runIdle(() => {
            try {
                initSessionManager();
            } catch (error) {
                console.error('[ERROR] Error initializing session manager:', error);
            }

            try {
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

        // Lazy-load non-critical modules after initial render.
        runIdle(() => {
            // Patients module - needed for search/kelola pasien
            import('../patients.js?v=' + v).then(m => {
                if (m.initPatients) m.initPatients();
            }).catch(e => console.error('[ERROR] patients.js:', e));

            // Medical exam - needed when opening exam pages
            import('../medical-exam.js?v=' + v).catch(e => console.error('[ERROR] medical-exam.js:', e));

            // Finance & Analytics - superadmin only
            if (user.role === 'superadmin') {
                import('../finance-dashboard.js?v=' + v).then(m => {
                    if (m.initFinanceDashboard) m.initFinanceDashboard();
                }).catch(e => console.error('[ERROR] finance-dashboard.js:', e));

                import('../analytics.js?v=' + v).then(m => {
                    if (m.initAnalyticsDashboard) m.initAnalyticsDashboard();
                }).catch(e => console.error('[ERROR] analytics.js:', e));
            }
        }, { timeout: 3000 });

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
