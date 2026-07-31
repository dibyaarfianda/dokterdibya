const { loadLandingFeature } = await import('./feature-loader.js');

function reportOptionalFeatureFailure(name, error) {
    console.warn(`[Landing] Optional feature "${name}" could not load:`, error);
}

function runIdle(callback, timeout = 1500) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout });
        return;
    }
    window.setTimeout(callback, 1);
}

function bindDelegatedLandingActions() {
    document.addEventListener('click', event => {
        const target = event.target.closest('[data-landing-call]');
        if (!target) return;

        const handler = window[target.dataset.landingCall || ''];
        if (typeof handler !== 'function') return;

        event.preventDefault();
        const args = JSON.parse(target.dataset.landingArgs || '[]');
        handler(...args, event);
    });
}

bindDelegatedLandingActions();

runIdle(() => {
    loadLandingFeature('patientTracking')
        .catch(error => reportOptionalFeatureFailure('patientTracking', error));
}, 1000);

runIdle(() => {
    loadLandingFeature('pushNotifications')
        .catch(error => reportOptionalFeatureFailure('pushNotifications', error));
}, 1800);

window.addEventListener('load', () => {
    window.setTimeout(() => {
        loadLandingFeature('appUpdater')
            .then(module => module.checkForUpdates?.())
            .catch(error => reportOptionalFeatureFailure('appUpdater', error));
    }, 2000);
});

window.checkForAppUpdates = async function checkForAppUpdates() {
    const module = await loadLandingFeature('appUpdater');
    return module.manualCheckForUpdates?.();
};
