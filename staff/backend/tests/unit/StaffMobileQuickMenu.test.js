const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(items = []) {
    const document = { addEventListener() {}, querySelectorAll: () => items, getElementById: () => null };
    const window = { addEventListener() {}, document };
    const file = path.resolve(__dirname, '../../../public/scripts/shell/mobile-quick-menu.js');
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document });
    return window.staffMobileQuickMenu;
}

test('quick menus expose a selectable catalog and editor independently of the fixed More button', () => {
    const menu = load();
    expect(menu).toBeDefined();
    expect(typeof menu.openEditor).toBe('function');
    expect(typeof menu.render).toBe('function');
});

function nav(id, text, { group = false, hidden = false } = {}) {
    const label = { childNodes: [{ nodeType: 3, textContent: text }] };
    const link = { querySelector: selector => selector === 'p' ? label : { classList: ['fas', 'fa-tachometer-alt'] }, getAttribute: () => null };
    return { id, style: { display: hidden ? 'none' : '' }, classList: { contains: () => group }, querySelector: () => link };
}

test('catalog excludes structural tree groups and retains original mobile labels and icons', () => {
    const menu = load([nav('nav-private', 'Private', { group: true }), nav('nav-dashboard', 'Dashboard'),
        nav('nav-kelola-pasien', 'Kelola Pasien'), nav('nav-pengaturan', 'Pengaturan', { hidden: true })]);
    const items = menu.catalog({ id: 'doctor', is_doctor_protected: true });
    expect(items.map(item => item.key)).toEqual(['dashboard', 'pasien', 'laboratorium', 'profile']);
    expect(items[0].iconClass).toBe('fas fa-home');
    expect(items[1].text).toBe('Pasien');
});

test('catalog preserves Lab without a sidebar node and follows granted account permissions', () => {
    const menu = load([nav('nav-community-chat', 'Chat Komunitas'), nav('nav-tanya-dokter', 'Tanya Dokter')]);
    expect(menu.catalog({ id: 'staff', navigation: ['nav-community-chat'], permissions: ['lab_exam.view'] }).map(item => item.key))
        .toEqual(['community', 'laboratorium', 'profile']);
    expect(menu.catalog({ id: 'staff', navigation: [], permissions: [] }).map(item => item.key)).toEqual(['profile']);
});

test('selection caps at five and rejects duplicates, More, and unknown entries', () => {
    const menu = load();
    expect(menu).toBeDefined();
    const available = ['dashboard', 'klinik', 'docboard', 'pasien', 'tanya', 'community'].map(key => ({ key }));
    expect(menu.normalize(['community', 'more', 'community', 'missing', 'tanya', 'pasien', 'docboard', 'klinik', 'dashboard'], available))
        .toEqual(['community', 'tanya', 'pasien', 'docboard', 'klinik']);
    expect(menu.normalize([], available)).toEqual([]);
});

test('saved selection never restores revoked menu access', () => {
    const menu = load();
    expect(menu).toBeDefined();
    expect(menu.normalize(['community', 'tanya'], [{ key: 'tanya' }])).toEqual(['tanya']);
});

test('quick menu preferences are isolated by verified account', () => {
    const menu = load();
    expect(menu).toBeDefined();
    expect(menu.storageKey({ id: 'a' })).not.toBe(menu.storageKey({ id: 'b' }));
});
