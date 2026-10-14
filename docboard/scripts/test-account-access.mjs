import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
globalThis.window = new EventTarget();
window.location = { href: '' };

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/stores/auth.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const auth = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { docboardSession } = await import('../../public/scripts/docboard-session.js');
const tokenFor = (id, role = 'bidan') => `header.${Buffer.from(JSON.stringify({ id, role, exp: 9999999999 })).toString('base64')}.signature`;
const accessFor = (permissions, job_label = 'Observer') => ({ mode: 'account', job_label, permissions, access_version: 8 });
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => ({ success: status < 400, data }) });

beforeEach(() => {
  auth.logout();
  storage.clear();
  globalThis.fetch = async () => response(accessFor(['docboard.view', 'docboard.write', 'medical_records.create', 'medical_records.edit']));
});

test('Observer with the old bidan role can edit schedules using the current account grants', async () => {
  docboardSession.setToken(tokenFor('observer-1'));
  await auth.initAuth();
  assert.equal(auth.userRole.value, 'Observer');
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, true);
  assert.equal(auth.surgeryPermissions.value.canChangeStatus, true);
  assert.equal(auth.surgeryPermissions.value.canDeleteSurgery, false);
});

test('an old admin role cannot override a read-only account', async () => {
  fetch = async () => response(accessFor(['docboard.view']));
  docboardSession.setToken(tokenFor('viewer-1', 'admin'));
  await auth.initAuth();
  assert.equal(auth.surgeryPermissions.value.canCreateSurgery, false);
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
  assert.equal(auth.surgeryPermissions.value.canDeleteSurgery, false);
});

test('loads uncached permissions with the current shared DocBoard credential', async () => {
  const calls = [];
  fetch = async (...args) => { calls.push(args); return response(accessFor(['docboard.view'])); };
  const token = tokenFor('observer-1');
  docboardSession.setToken(token);
  await auth.initAuth();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/access/me');
  assert.equal(calls[0][1].headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[0][1].cache, 'no-store');
});

test('refresh applies revoked grants and keeps clinical and schedule permissions separate', async () => {
  docboardSession.setToken(tokenFor('observer-1'));
  await auth.initAuth();
  fetch = async () => response(accessFor(['docboard.view', 'docboard.delete', 'medical_records.edit']));
  await auth.refreshAccountAccess();
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
  assert.equal(auth.surgeryPermissions.value.canDeleteSurgery, true);
  assert.equal(auth.surgeryPermissions.value.canEditOutcome, true);
});

test('a failed permission read disables mutations without guessing from the old role', async () => {
  docboardSession.setToken(tokenFor('observer-1', 'dokter'));
  await auth.initAuth();
  fetch = async () => response(null, 503);
  await auth.refreshAccountAccess();
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
  assert.ok(auth.accessError.value);
  assert.equal(auth.isLoggedIn.value, true);
});

test('a late permission response cannot restore access after logout', async () => {
  let finish;
  fetch = () => new Promise(resolve => { finish = resolve; });
  docboardSession.setToken(tokenFor('observer-1'));
  const pending = auth.initAuth();
  auth.logout();
  finish(response(accessFor(['docboard.view', 'docboard.write', 'docboard.delete'])));
  await pending;
  assert.equal(auth.isLoggedIn.value, false);
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
});

test('expired credentials do not load permissions', async () => {
  let calls = 0;
  fetch = async () => { calls++; return response(accessFor(['docboard.write'])); };
  docboardSession.setToken(`header.${Buffer.from(JSON.stringify({ id: 'expired', exp: 1 })).toString('base64')}.signature`);
  await auth.initAuth();
  assert.equal(calls, 0);
  assert.equal(auth.isLoggedIn.value, false);
});

test('the operation form retains its clinical permission guard', async () => {
  fetch = async () => response(accessFor(['docboard.view', 'docboard.write']));
  docboardSession.setToken(tokenFor('scheduler-only'));
  await auth.initAuth();
  assert.equal(auth.surgeryPermissions.value.canCreateSurgery, false);
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
  assert.equal(auth.surgeryPermissions.value.canChangeStatus, true);
});

test('an expired server session clears both the identity and effective access', async () => {
  docboardSession.setToken(tokenFor('observer-1'));
  await auth.initAuth();
  fetch = async () => response(null, 401);
  await auth.refreshAccountAccess();
  assert.equal(auth.isLoggedIn.value, false);
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
  assert.equal(docboardSession.getToken(), null);
});

test('switching accounts ignores a late response for the previous account', async () => {
  let finishPrevious;
  fetch = () => new Promise(resolve => { finishPrevious = resolve; });
  docboardSession.setToken(tokenFor('previous'));
  const previous = auth.initAuth();
  fetch = async () => response(accessFor(['docboard.view'], 'Staff'));
  docboardSession.setToken(tokenFor('current', 'admin'));
  await auth.initAuth();
  finishPrevious(response(accessFor(['docboard.write', 'medical_records.edit'], 'Owner')));
  await previous;
  assert.equal(auth.user.value.id, 'current');
  assert.equal(auth.userRole.value, 'Staff');
  assert.equal(auth.surgeryPermissions.value.canEditSurgery, false);
});
