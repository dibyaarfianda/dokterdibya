const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../../../public/scripts/patient-menu-shell.js'), 'utf8');

test('an incomplete intake stops the profile gate before settings and nickname', async () => {
    const profileSource = source.match(/async function loadProfile\(\) \{[\s\S]*?(?=\n        async function checkVipSubscription)/)?.[0];
    expect(profileSource).toBeTruthy();
    const replace = jest.fn();
    const ctx = vm.createContext({
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ user: { id: 'synthetic' } }) }),
        getToken: () => 'synthetic', setPatientUser() {}, isIntakeCompleted: () => false,
        window: { location: { replace } }, Date, currentProfile: null
    });
    vm.runInContext(`${profileSource}\nresult = loadProfile();`, ctx);
    expect(await ctx.result).toBe(false);
    expect(replace).toHaveBeenCalledWith('/patient-intake.html?required=1');
});

test('patient bootstrap parallelizes only independent post-intake reads and preserves nickname and birth precedence', () => {
    const init = source.match(/async function init\(\) \{[\s\S]*?(?=\n        const shellActionHandlers)/)?.[0] || '';
    expect(init).toMatch(/profileReady = await loadProfile\(\)/);
    expect(init).toContain('if (!profileReady) return;');
    expect(init).toContain('Promise.all([loadPortalSettings(), loadNotificationCount()])');
    expect(init.indexOf('await ensurePortalNicknameOnLogin()')).toBeGreaterThan(init.indexOf('Promise.all([loadPortalSettings(), loadNotificationCount()])'));
    expect(init.indexOf('await loadBirthCongratsHome()')).toBeGreaterThan(init.indexOf('await checkBirthPending()'));
});

test('deferred bootstrap timing waits for profile, overlaps independent reads, then gates reveal on nickname', async () => {
    const initSource = source.match(/async function init\(\) \{[\s\S]*?(?=\n        const shellActionHandlers)/)?.[0];
    const deferred = () => {
        let resolve;
        return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) };
    };
    const profile = deferred();
    const settings = deferred();
    const notification = deferred();
    const nickname = deferred();
    const calls = [];
    const elements = {
        'loading-state': { style: { display: 'block' } },
        'content-wrapper': { style: { display: 'none' } },
        'community-chat-badge': {}
    };
    const noop = () => {};
    const ctx = vm.createContext({
        window: { location: { search: '' }, PatientSession: { isDemoMode: () => false } },
        document: { getElementById: id => elements[id] }, URLSearchParams,
        resetScrollToTop: noop, bindProfilePhotoInputs: noop, installHomeBackExitGuard: noop,
        lockHomeSections: noop, todayLabel: noop, updateSoundUI: noop,
        getToken: () => 'synthetic', getPatientUser: () => ({ id: 'synthetic' }),
        loadPatientFeature: () => Promise.resolve(), refreshPatientServiceWorker: noop,
        loadProfile: () => { calls.push('profile'); return profile.promise; },
        loadPortalSettings: () => { calls.push('settings'); return settings.promise; },
        loadNotificationCount: () => { calls.push('notification'); return notification.promise; },
        ensurePortalNicknameOnLogin: () => { calls.push('nickname'); return nickname.promise; },
        requestAnimationFrame: noop, updateHomeActionGap: noop, revealPrimaryActionsIfReady: noop,
        triggerHomeIntroAnimation: noop, scheduleHomeAutoUnlock: noop, loadHomeAnnouncements: noop,
        loadUnreadDocCounts: noop, initializeLiveQueueHome: noop, stopCommunityBadge: null,
        startCommunityBadge: () => noop, isGuestMode: () => false, updateRuangBacaBadges: noop,
        checkActiveBooking: noop, loadBirthClassHomeCard: noop, checkAttendanceConfirmation: noop,
        checkBirthPending: async () => { calls.push('birth-pending'); return false; },
        loadBirthCongratsHome: async () => { calls.push('birth-congrats'); return false; },
        loadPregnancyTrackerHome: noop, autoShowPatientInstallPrompt: noop
    });
    vm.runInContext(`${initSource}\nresult = init();`, ctx);
    expect(calls).toEqual(['profile']);
    profile.resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    expect(calls).toEqual(['profile', 'settings', 'notification']);
    settings.resolve({});
    await Promise.resolve();
    expect(calls).not.toContain('nickname');
    notification.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    expect(calls).toContain('nickname');
    expect(elements['content-wrapper'].style.display).toBe('none');
    nickname.resolve(true);
    await ctx.result;
    expect(elements['content-wrapper'].style.display).toBe('block');
    expect(calls.indexOf('birth-pending')).toBeLessThan(calls.indexOf('birth-congrats'));
});
