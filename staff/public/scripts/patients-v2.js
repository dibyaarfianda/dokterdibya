// Compatibility shim kept for legacy bundles after Firebase removal.
// All patient data now flows through patients.js (VPS API) so deletes stay consistent.
import { initPatients as initPatientsFromBackend } from './patients.js';

export async function initPatients() {
    return initPatientsFromBackend();
}
