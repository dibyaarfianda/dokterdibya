let initializationPromise = null;

export function loadPatientPage() {
    if (!initializationPromise) {
        initializationPromise = import('../patients.js').then(async patientsModule => {
            await patientsModule.initPatients?.();
        });
    }
    return initializationPromise;
}
