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

async function dispatchLandingFeatureAction(event, target) {
    const module = await loadLandingFeature(target.dataset.landingFeature);
    const action = module[target.dataset.landingAction || ''];
    if (typeof action !== 'function') {
        throw new Error(
            `Unknown action "${target.dataset.landingAction || ''}" for landing feature "${target.dataset.landingFeature || ''}"`
        );
    }

    return action({ event, trigger: target });
}

function bindDelegatedLandingFeatures() {
    const selector = '[data-landing-feature][data-landing-action]';

    document.addEventListener('click', event => {
        const target = event.target.closest(selector);
        if (!target) return;

        event.preventDefault();
        dispatchLandingFeatureAction(event, target)
            .catch(error => reportOptionalFeatureFailure(target.dataset.landingFeature, error));
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        const target = event.target.closest(selector);
        if (!target) return;

        event.preventDefault();
        dispatchLandingFeatureAction(event, target)
            .catch(error => reportOptionalFeatureFailure(target.dataset.landingFeature, error));
    });
}

bindDelegatedLandingActions();
bindDelegatedLandingFeatures();

loadLandingFeature('installPrompt')
    .then(module => module.init?.())
    .catch(error => reportOptionalFeatureFailure('installPrompt', error));

loadLandingFeature('navigationInteractions')
    .then(module => module.init?.())
    .catch(error => reportOptionalFeatureFailure('navigationInteractions', error));

loadLandingFeature('announcementGuard')
    .then(module => module.init?.())
    .catch(error => reportOptionalFeatureFailure('announcementGuard', error));

loadLandingFeature('footerEffects')
    .then(module => module.init?.())
    .catch(error => reportOptionalFeatureFailure('footerEffects', error));

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
