export const NANDA_EMAIL = 'nanda.arfianda@gmail.com';
export const NANDA_USER_ID = 'UDZAQUCQWZ';

export function isNandaUser(currentUser) {
  const email = String(currentUser?.email || '').toLowerCase();
  const userId = String(currentUser?.id || '');
  return email === NANDA_EMAIL || userId === NANDA_USER_ID;
}

