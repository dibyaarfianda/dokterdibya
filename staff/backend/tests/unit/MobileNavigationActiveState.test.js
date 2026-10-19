const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptsRoot = path.resolve(__dirname, '../../../public/scripts');

function createShell(initialPage, quickMenu = null) {
    const makeButton = (action) => {
        const classes = new Set();
        const attributes = {};
        const listeners = {};
        return {
            id: `mobile-btn-${action}`,
            dataset: { mobileNav: action },
            classList: {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name),
                toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
            },
            setAttribute: (name, value) => { attributes[name] = value; },
            removeAttribute: name => { delete attributes[name]; },
            getAttribute: name => attributes[name] ?? null,
            closest: selector => selector === '#mobile-action-bar' && action !== 'regular' ? {} : null,
            addEventListener: (type, listener) => { listeners[type] = listener; },
            emit: type => listeners[type]?.call(buttons.find(button => button.dataset.mobileNav === action))
        };
    };
    const buttons = ['dashboard', 'klinik', 'docboard', 'pasien', 'tanya', 'more', 'nav-rsia-melinda', 'regular'].map(makeButton);
    const events = {};
    const document = {
        readyState: 'complete',
        body: { classList: { add() {} } },
        documentElement: { style: { setProperty() {} } },
        getElementById: id => buttons.find(button => button.id === id),
        querySelector: () => null,
        querySelectorAll: selector => selector === '#mobile-action-bar button'
            ? buttons.filter(button => button.dataset.mobileNav !== 'regular')
            : selector === '.btn, button' ? buttons : [],
        addEventListener: (type, listener) => { (events[type] ||= []).push(listener); }
    };
    const window = { __currentPage: initialPage, innerHeight: 844, ontouchstart: null, addEventListener() {}, staffMobileQuickMenu: quickMenu };
    const context = vm.createContext({ window, document, navigator: { maxTouchPoints: 1 }, setTimeout, clearTimeout });
    for (const file of ['shell/actions.js', 'mobile-helper.js']) {
        vm.runInContext(fs.readFileSync(path.join(scriptsRoot, file), 'utf8'), context);
    }
    return {
        window,
        button: action => buttons.find(button => button.dataset.mobileNav === action),
        active: () => buttons.filter(button => button.classList.contains('active')).map(button => button.dataset.mobileNav),
        navigate: page => (events['page:changed'] || []).forEach(listener => listener({ detail: { page } }))
    };
}

describe('mobile navigation active page', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('touch feedback preserves the selected page after the finger lifts', () => {
        const shell = createShell();
        const patientButton = shell.button('pasien');
        shell.window.mobileNavClick(patientButton, 'pasien');
        patientButton.emit('touchstart');
        patientButton.emit('touchend');
        jest.advanceTimersByTime(200);
        expect(shell.active()).toEqual(['pasien']);

        const regularButton = shell.button('regular');
        regularButton.emit('touchstart');
        expect(regularButton.classList.contains('active')).toBe(true);
        regularButton.emit('touchend');
        jest.advanceTimersByTime(200);
        expect(regularButton.classList.contains('active')).toBe(false);
    });

    test.each([
        ['dashboard', 'dashboard'], ['klinik-private', 'klinik'], ['sunday-clinic', 'klinik'],
        ['docboard', 'docboard'], ['kelola-pasien', 'pasien'], ['patients', 'pasien'],
        ['tanya-dokter', 'tanya'], ['booking-settings', 'more'], ['laboratorium', 'more']
    ])('page %s selects only its menu %s without a bottom-bar click', (page, action) => {
        const shell = createShell();
        shell.navigate(page);
        expect(shell.active()).toEqual([action]);
        expect(shell.button(action).getAttribute('aria-current')).toBe('page');
        shell.navigate('dashboard');
        expect(shell.active()).toEqual(['dashboard']);
        if (action !== 'dashboard') expect(shell.button(action).getAttribute('aria-current')).toBeNull();
    });

    test('restores the indicator when the shell already has an active page', () => {
        expect(createShell('docboard').active()).toEqual(['docboard']);
    });

    test('a selected hospital shortcut wins over the generic appointment-page alias', () => {
        const shell = createShell(null, { activeKey: () => 'nav-rsia-melinda' });
        shell.navigate('hospital-appointments');
        expect(shell.active()).toEqual(['nav-rsia-melinda']);
    });
});
