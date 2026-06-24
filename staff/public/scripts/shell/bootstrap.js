(async function bootstrapStaffShell() {
    // Use stable version string for cache busting (set above from CACHE_VERSION)
    const v = window.__assetVersion;

    // Critical startup modules only - auth + shell + dashboard
    const { auth, getIdToken, initAuth: initAuthLib } = await import('../vps-auth-v2.js?v=' + v);
    window.auth = auth;
    window.getIdToken = getIdToken;

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

    // Ensure auth state is available before route decision.
    await authInitPromise;

    // Now check authentication
    const user = auth.currentUser;

    function resolveSafeDisplayName(staffUser) {
        const candidate = String(staffUser?.name || '').trim();
        if (candidate && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
            return candidate;
        }

        const fallbackId = String(staffUser?.id || '').trim();
        return fallbackId || 'User';
    }

    if (!user) {
        window.location.replace('login.html');
    } else {
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

        // User is logged in, initialize app
        initializeApp(user);
    }
    
    function initializeApp(user) {
        const v = window.__assetVersion;

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
        requestIdleCallback(() => {
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

        // Lazy-load non-critical modules after initial render
        // These modules are loaded in the background and init on first page access
        requestIdleCallback(() => {
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

        // Real-time sync initialized in main.js via onAuthStateChanged

        // Restore session if exists
        requestIdleCallback(() => {
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
})();
