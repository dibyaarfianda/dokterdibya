const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');
const main = fs.readFileSync(path.join(root, 'staff/public/scripts/main.js'), 'utf8');
const { PageRegistry } = require(path.join(root, 'staff/public/scripts/shell/page-registry.js'));
const { PollingCoordinator } = require(path.join(root, 'staff/public/scripts/shell/polling-coordinator.js'));

function extract(start, end) {
    const from = main.indexOf(start);
    const to = main.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Missing handler boundary: ${start}`);
    return main.slice(from, to);
}

function deferred() {
    let resolve;
    return { promise: new Promise(done => { resolve = done; }), resolve };
}

function fixture(slowKey) {
    const state = { title: null, nav: null };
    const classList = () => {
        const values = new Set(['d-none']);
        return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
    };
    const containers = {
        'dashboard-page': { dataset: {}, classList: classList() },
        'patient-page': { dataset: {}, classList: classList() }
    };
    const document = {
        getElementById: id => containers[id] || null,
        dispatchEvent() {},
        querySelectorAll: () => [],
        documentElement: { classList: classList() },
        body: { classList: classList() }
    };
    const slow = deferred();
    const registry = new PageRegistry({ document, eventTarget: document });
    registry.registerAll([
        { key: 'dashboard', containerId: 'dashboard-page', load: slowKey === 'dashboard' ? () => slow.promise : null },
        { key: 'patients', containerId: 'patient-page', load: slowKey === 'patients' ? () => slow.promise : null }
    ]);
    const window = { staffPageRegistry: registry, ensureStaffFeature: async () => {}, loadDashboardNewPatients: async () => {}, __currentPage: null };
    const pages = { dashboard: containers['dashboard-page'], patient: containers['patient-page'], finance: { classList: classList() },
        anamnesa: { classList: classList() }, usg: { classList: classList() }, kelolaObat: { classList: classList() },
        kelolaRoles: { classList: classList() }, financeAnalysis: { classList: classList() }, profile: { classList: classList() } };
    const context = vm.createContext({
        window, document, pages, setSundayClinicStylesActive() {}, initPages() {},
        setTitleAndActive: (title, navId, mobileAction) => { state.title = title; state.nav = navId; window.__currentPage = mobileAction || title; },
        importWithVersion: async () => ({ activateDashboard: async () => {}, loadAnamnesaData: async () => {}, loadUSGExamData: async () => {} }),
        ensureRegisteredPage: () => slow.promise, loadExternalPage() {}, setTimeout() {},
        console: { log() {}, warn() {}, error() {} }
    });
    vm.runInContext([
        extract('let staffNavigationGeneration = 0;', '\nlet communityChatViewportSyncBound'),
        extract('async function showDashboardPage() {', '\nfunction showCommunityChatPage()'),
        extract('async function showPatientPage() {', '\n// Make function globally accessible'),
        extract('function showFinancePage() {', '\nfunction showKelolaPasienPage()')
    ].join('\n'), context);
    return { context, state, pages, window, slow };
}

test.each([
    ['dashboard', 'showDashboardPage', 'showPatientPage', 'Data Pasien', 'nav-patient', 'patients'],
    ['patients', 'showPatientPage', 'showDashboardPage', 'Dashboard', 'nav-dashboard', 'dashboard'],
    ['patients', 'showRecordHistoryPage', 'showDashboardPage', 'Dashboard', 'nav-dashboard', 'dashboard']
])('slow %s legacy handler cannot overwrite a later %s/%s click', async (slowKey, first, second, title, nav, currentPage) => {
    const { context, state, pages, window, slow } = fixture(slowKey);
    const older = context[first]();
    await context[second]();
    slow.resolve();
    await older;
    expect(state).toEqual({ title, nav });
    expect(window.__currentPage).toBe(currentPage);
    expect((currentPage === 'dashboard' ? pages.dashboard : pages.patient).classList.contains('d-none')).toBe(false);
});

test('a synchronous menu click supersedes an in-flight patient fragment', async () => {
    const { context, state, pages, window, slow } = fixture('patients');
    const older = context.showPatientPage();
    context.showFinancePage();
    slow.resolve();
    await older;
    expect(state).toEqual({ title: 'Finance Analysis', nav: 'nav-finance' });
    expect(window.__currentPage).toBe('finance');
    expect(pages.finance.classList.contains('d-none')).toBe(false);
});

test('Finance supersedes registry and polling state before a slow Patients activation resolves', async () => {
    const slow = deferred();
    const events = [];
    const listeners = new Map();
    const classList = () => {
        const values = new Set(['d-none']);
        return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
    };
    const title = { textContent: '' };
    const patient = { dataset: {}, classList: classList() };
    const finance = { classList: classList() };
    const nav = { classList: classList(), closest: () => null };
    const document = {
        visibilityState: 'visible', documentElement: { classList: classList() }, body: { classList: classList() },
        getElementById: id => ({ 'patient-page': patient, 'page-title': title })[id] || null,
        querySelectorAll: () => [], querySelector: () => nav,
        addEventListener: (name, handler) => listeners.set(name, handler),
        removeEventListener: name => listeners.delete(name),
        dispatchEvent: event => { events.push(event); listeners.get(event.type)?.(event); }
    };
    const registry = new PageRegistry({ document, eventTarget: document });
    registry.register({ key: 'patients', containerId: 'patient-page', load: () => slow.promise });
    const coordinator = new PollingCoordinator({ eventTarget: document, visibilityTarget: document,
        setTimeout: () => 1, clearTimeout() {} });
    coordinator.register('patients-job', { page: 'patients', run: async () => {} });
    coordinator.register('finance-job', { page: 'finance', run: async () => {} });
    const window = { staffPageRegistry: registry, __currentPage: null };
    const context = vm.createContext({ window, document, pages: { patient, finance }, initPages() {},
        setSundayClinicStylesActive() {}, sessionStorage: { setItem() {} }, logActivity() {},
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
    vm.runInContext([
        extract('let staffNavigationGeneration = 0;', '\nlet communityChatViewportSyncBound'),
        extract('function setTitleAndActive(title, navId, mobileAction) {', '\n// Activity logging function'),
        extract('async function showPatientPage() {', '\n// Make function globally accessible'),
        extract('function showFinancePage() {', '\nfunction showKelolaPasienPage()')
    ].join('\n'), context);
    const older = context.showPatientPage();
    context.showFinancePage();
    slow.resolve();
    await older;
    expect(title.textContent).toBe('Finance Analysis');
    expect(finance.classList.contains('d-none')).toBe(false);
    expect(patient.classList.contains('d-none')).toBe(true);
    expect(registry.activeKey).toBe('finance');
    expect(events.filter(event => event.type === 'page:changed').map(event => event.detail.page)).toEqual(['finance']);
    expect(coordinator.activePage).toBe('finance');
    expect(coordinator.isEligible(coordinator.jobs.get('finance-job'))).toBe(true);
    expect(coordinator.isEligible(coordinator.jobs.get('patients-job'))).toBe(false);
    coordinator.destroy();
});

test.each([
    ['showAnamnesa', 'async function showAnamnesa() {', '\nasync function showPhysicalExam()'],
    ['showUSGExam', 'async function showUSGExam() {', '\nasync function showLabExam()'],
    ['showKelolaObatPage', 'async function showKelolaObatPage() {', '\nfunction showLogPage()'],
    ['showKelolaRolesPage', 'async function showKelolaRolesPage() {', '\nfunction showPatientBlockListPage()'],
    ['showFinanceAnalysisPage', 'async function showFinanceAnalysisPage() {', '\n// ==================== END INVOICE HISTORY'],
    ['showProfileSettings', 'async function showProfileSettings() {', '\nfunction showKantorSayaPage()']
])('%s registered-fragment navigation cannot commit after a later synchronous click', async (name, start, end) => {
    const { context, state, window, slow } = fixture(null);
    vm.runInContext(extract(start, end), context);
    const older = context[name]();
    context.showFinancePage();
    slow.resolve({});
    await older;
    expect(state).toEqual({ title: 'Finance Analysis', nav: 'nav-finance' });
    expect(window.__currentPage).toBe('finance');
});
