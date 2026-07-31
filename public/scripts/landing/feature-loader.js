const loadedFeatures = new Map();

const featureLoaders = {
    pushNotifications: () => import('../../js/push-subscribe.js'),
    patientTracking: () => import('../../js/patient-tracker.js'),
    appUpdater: () => import('../app-updater.js'),
    promoPreview: () => import('./promo-preview.js'),
    installPrompt: () => import('./install-prompt.js'),
    navigationInteractions: () => import('./navigation-interactions.js'),
    announcementGuard: () => import('./announcement-guard.js'),
    footerEffects: () => import('./footer-effects.js')
};

export async function loadLandingFeature(name) {
    const loader = featureLoaders[name];
    if (!loader) throw new Error(`Unknown landing feature: ${name}`);

    if (!loadedFeatures.has(name)) {
        loadedFeatures.set(name, loader().catch(error => {
            loadedFeatures.delete(name);
            throw error;
        }));
    }

    return loadedFeatures.get(name);
}
