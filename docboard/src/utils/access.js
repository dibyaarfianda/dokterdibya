export const NANDA_EMAIL = 'nanda.arfianda@gmail.com';
export const NANDA_USER_ID = 'UDZAQUCQWZ';
export const AURA_EMAIL = 'auranurin56@gmail.com';

export function isNandaUser(currentUser) {
  const email = String(currentUser?.email || '').toLowerCase();
  const userId = String(currentUser?.id || '');
  return email === NANDA_EMAIL || userId === NANDA_USER_ID;
}

export function canAccessScientificSchedule(currentUser) {
  const email = String(currentUser?.email || '').toLowerCase();
  return isNandaUser(currentUser) || email === AURA_EMAIL;
}

// The server-owned account grants are the authorization source. Job labels and
// legacy JWT roles are display metadata, never a fallback for these decisions.
export function getAccountPermissions(access) {
  const granted = new Set(Array.isArray(access?.permissions) ? access.permissions : []);
  const canWrite = granted.has('docboard.write');
  const canEditClinical = granted.has('medical_records.edit');
  return {
    // The operation form includes patient/clinical fields, so retain the
    // corresponding medical-record grant checked by the surgery endpoint.
    canCreateSurgery: canWrite && granted.has('medical_records.create'),
    canEditSurgery: canWrite && canEditClinical,
    canDeleteSurgery: granted.has('docboard.delete'),
    canChangeStatus: canWrite,
    canEditClinical,
    canEditAnesthesia: canEditClinical,
    canEditOutcome: canEditClinical,
    canEditChecklist: canEditClinical,
  };
}
