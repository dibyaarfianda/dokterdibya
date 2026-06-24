export function getAuthToken() {
    return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
        ? window.getAuthToken()
        : '';
}

export function createVersionedImporter(options = {}) {
    const moduleCache = new Map();
    const skipVersionModules = options.skipVersionModules || new Set();
    const getAssetVersion = options.getAssetVersion || (() => window.__assetVersion);

    return function importWithVersion(path) {
        if (moduleCache.has(path)) {
            return moduleCache.get(path);
        }

        let specifier = path;
        const version = getAssetVersion();
        if (version && !skipVersionModules.has(path)) {
            const separator = path.includes('?') ? '&' : '?';
            specifier = `${path}${separator}v=${version}`;
        }

        const promise = import(specifier);
        moduleCache.set(path, promise);
        return promise;
    };
}

export const importWithVersion = createVersionedImporter({
    skipVersionModules: new Set(['./billing.js', './billing-obat.js', './medical-exam.js'])
});

export function grab(id) {
    return document.getElementById(id);
}
