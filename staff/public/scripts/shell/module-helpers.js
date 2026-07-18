export function getAuthToken() {
    return typeof window !== 'undefined' && typeof window.getAuthToken === 'function'
        ? window.getAuthToken()
        : '';
}

export function createCanonicalImporter(options = {}) {
    const moduleCache = new Map();
    const importBaseUrl = options.importBaseUrl || new URL('../', import.meta.url);

    return function importWithVersion(path) {
        if (moduleCache.has(path)) {
            return moduleCache.get(path);
        }

        const specifier = new URL(path, importBaseUrl).href;
        const promise = import(specifier);
        moduleCache.set(path, promise);
        return promise;
    };
}

// Compatibility export for existing callers. Imports are canonical and unversioned;
// only the top-level bootstrap entry carries the deploy cache version.
export const importWithVersion = createCanonicalImporter();

export function grab(id) {
    return document.getElementById(id);
}
