const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('staff panel wave 3 lifecycle contracts', () => {
    test('bootstrap owns one PollingCoordinator and restores the active page before dashboard work', () => {
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(bootstrap).toContain("import('./polling-coordinator.js')");
        expect(bootstrap).not.toContain("import('../dashboard.js')");
        expect(bootstrap).toContain('window.staffPollingCoordinator');
        expect(bootstrap).toContain("new CustomEvent('staff:auth-ready'");
    });

    test('page changes include the previous page and support participates in lifecycle', () => {
        const main = read('staff', 'public', 'scripts', 'main.js');
        const html = read('staff', 'public', 'index-adminlte.html');

        expect(main).toContain('previousPage');
        expect(main).toMatch(/detail:\s*\{\s*page,\s*previousPage\s*\}/);
        expect(html).toContain("dispatchStaffPageChanged('support-chat')");
    });

    test('page pollers are coordinator jobs instead of independent intervals', () => {
        const dashboard = read('staff', 'public', 'scripts', 'dashboard.js');
        const queue = read('staff', 'public', 'scripts', 'antrian-online.js');
        const support = read('staff', 'public', 'scripts', 'support-chat-staff.js');
        const badge = read('staff', 'public', 'scripts', 'shell', 'support-chat-badge.js');

        expect(dashboard).not.toMatch(/setInterval\([^\n]*loadDashboardLiveQueue/);
        expect(queue).not.toMatch(/setInterval\([^\n]*loadAntrianOnlineQueue/);
        expect(support).not.toContain('state.pollTimer = setInterval');
        expect(support).not.toContain('state.messagePollTimer = setInterval');
        expect(support).toContain('interval: 30000');
        expect(support).toContain('interval: 5000');
        expect(badge).toContain('interval: 60000');
    });

    test('chat popup uses observers and auth events without guardian intervals', () => {
        const popup = read('staff', 'public', 'scripts', 'chat-popup.js');
        const loader = read('staff', 'public', 'scripts', 'global-chat-loader.js');

        expect(popup).toContain('MutationObserver');
        expect(popup).not.toContain('setInterval(ensureFAB');
        expect(popup).not.toMatch(/setInterval\(\(\) => \{\s*checkClearButtonVisibility/);
        expect(loader).toContain("addEventListener('staff:auth-ready'");
        expect(loader).not.toContain('waitForAuth');
    });

    test('PollingCoordinator gates by page and visibility, aborts in-flight work, and cleans up', async () => {
        jest.useFakeTimers();
        const coordinatorPath = path.join(repoRoot, 'staff', 'public', 'scripts', 'shell', 'polling-coordinator.js');
        delete require.cache[require.resolve(coordinatorPath)];
        const { PollingCoordinator } = require(coordinatorPath);

        const listeners = new Map();
        const eventTarget = {
            addEventListener: jest.fn((name, handler) => listeners.set(name, handler)),
            removeEventListener: jest.fn((name, handler) => {
                if (listeners.get(name) === handler) listeners.delete(name);
            })
        };
        const visibilityTarget = {
            visibilityState: 'visible',
            addEventListener: eventTarget.addEventListener,
            removeEventListener: eventTarget.removeEventListener
        };
        const signals = [];
        const run = jest.fn(({ signal }) => {
            signals.push(signal);
            return new Promise(() => {});
        });
        const coordinator = new PollingCoordinator({ eventTarget, visibilityTarget });
        coordinator.register('dashboard-live', { page: 'dashboard', interval: 45000, run });

        coordinator.setActivePage('support-chat');
        await jest.advanceTimersByTimeAsync(1);
        expect(run).not.toHaveBeenCalled();

        coordinator.setActivePage('dashboard');
        await jest.advanceTimersByTimeAsync(1);
        expect(run).toHaveBeenCalledTimes(1);
        expect(signals[0].aborted).toBe(false);

        coordinator.setActivePage('support-chat');
        expect(signals[0].aborted).toBe(true);

        visibilityTarget.visibilityState = 'hidden';
        listeners.get('visibilitychange')();
        coordinator.setActivePage('dashboard');
        await jest.advanceTimersByTimeAsync(50000);
        expect(run).toHaveBeenCalledTimes(1);

        coordinator.destroy();
        expect(eventTarget.removeEventListener).toHaveBeenCalled();
        jest.useRealTimers();
    });
});
