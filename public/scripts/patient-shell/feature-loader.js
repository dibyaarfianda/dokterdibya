const featurePromises = new Map();

const featureLoaders = {
    profilePhotoCropper: () => import('../profile-photo-cropper.js'),
    myCorner: () => import('../patient-my-corner.js'),
    patientTracking: () => import('../../js/patient-tracker.js')
};

export async function loadPatientFeature(name) {
    const loader = featureLoaders[name];
    if (!loader) throw new Error(`Unknown patient feature: ${name}`);

    if (!featurePromises.has(name)) {
        featurePromises.set(name, loader().catch(error => {
            featurePromises.delete(name);
            throw error;
        }));
    }

    return featurePromises.get(name);
}
