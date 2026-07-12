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
