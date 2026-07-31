const scriptPromises = new Map();
const stylePromises = new Map();
const featurePromises = new Map();

function absoluteUrl(url) {
    const resolved = new URL(url, window.location.href);
    if (resolved.origin === window.location.origin && !resolved.searchParams.has('v')) {
        resolved.searchParams.set('v', window.STAFF_CACHE_VERSION || 'dev');
    }
    return resolved.href;
}

function loadScript(url) {
    const resolved = absoluteUrl(url);
    if (scriptPromises.has(resolved)) return scriptPromises.get(resolved);
    const promise = new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find(script => script.src === resolved);
        if (existing?.dataset.loaded === 'true') return resolve(existing);
        const script = existing || document.createElement('script');
        script.src = resolved;
        script.async = false;
        script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(script); }, { once: true });
        script.addEventListener('error', () => reject(new Error(`Failed to load script: ${resolved}`)), { once: true });
        if (!existing) document.head.appendChild(script);
    });
    scriptPromises.set(resolved, promise);
    return promise;
}

function loadStyle(url) {
    const resolved = absoluteUrl(url);
    if (stylePromises.has(resolved)) return stylePromises.get(resolved);
    const promise = new Promise((resolve, reject) => {
        const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(link => link.href === resolved);
        if (existing?.sheet) return resolve(existing);
        const link = existing || document.createElement('link');
        link.rel = 'stylesheet';
        link.href = resolved;
        link.addEventListener('load', () => resolve(link), { once: true });
        link.addEventListener('error', () => reject(new Error(`Failed to load stylesheet: ${resolved}`)), { once: true });
        if (!existing) document.head.appendChild(link);
    });
    stylePromises.set(resolved, promise);
    return promise;
}

const featureLoaders = {
    dataTables: async () => {
        await loadStyle('https://cdn.datatables.net/1.13.6/css/dataTables.bootstrap4.min.css');
        await loadScript('https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js');
        await loadScript('https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap4.min.js');
        window.installGlobalDataTableDateSorting?.();
    },
    apexCharts: () => loadScript('https://cdn.jsdelivr.net/npm/apexcharts@3.54.1/dist/apexcharts.min.js'),
    markdown: () => Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
        loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js')
    ]),
    qrcode: async () => {
        await import('./qrcode-loader.js');
    },
    xendit: () => loadScript('https://js.xendit.co/v1/xendit.min.js'),
    sundayClinic: async () => {
        await Promise.all([ensureFeature('qrcode'), ensureFeature('xendit')]);
        await loadScript('/staff/public/scripts/sunday-clinic/utils/planning-helpers.js');
        await loadScript('/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js');
    },
    supportChat: () => loadScript('/staff/public/scripts/support-chat-staff.js'),
    dashboardNewPatients: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/dashboard-new-patients.js?v=${version}`);
    },
    staffActivity: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/staff-activity-page.js?v=${version}`);
    },
    estimasiBiaya: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/estimasi-biaya-page.js?v=${version}`);
    },
    troubleshooting: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/troubleshooting-page.js?v=${version}`);
    },
    tanyaDokter: () => loadScript('/staff/public/scripts/tanya-dokter.js'),
    staffPoints: () => loadScript('/staff/public/scripts/staff-points.js'),
    staffBriefing: () => loadScript('/staff/public/scripts/staff-briefing.js'),
    staffPayroll: () => loadScript('/staff/public/scripts/staff-payroll.js'),
    appointmentDebug: () => loadScript('/staff/public/scripts/shell/appointment-debug.js'),
    patientSearchDetail: () => loadScript('/staff/public/scripts/shell/patient-search-detail.js'),
    patientTools: () => loadScript('/staff/public/scripts/legacy/patient-tools.js'),
    financeAnalysis: async () => {
        await ensureFeature('apexCharts');
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/finance-analysis-page.js?v=${version}`);
    },
    registrationCodes: () => loadScript('/staff/public/scripts/shell/registration-codes.js'),
    notifications: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`./notifications.js?v=${version}`);
    },
    birthContent: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/birth-content-page.js?v=${version}`);
    },
    invoiceHistory: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/invoice-history-page.js?v=${version}`);
    },
    contentModeration: async () => {
        const version = encodeURIComponent(window.STAFF_CACHE_VERSION || 'dev');
        await import(`../pages/content-moderation-page.js?v=${version}`);
    }
};

export function ensureFeature(name) {
    if (!featureLoaders[name]) return Promise.reject(new Error(`Unknown feature asset: ${name}`));
    if (!featurePromises.has(name)) featurePromises.set(name, Promise.resolve().then(featureLoaders[name]));
    return featurePromises.get(name);
}

export { loadScript, loadStyle };
