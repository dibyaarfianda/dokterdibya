import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as schedule from '../src/stores/schedule.js';

const KEY = 'docboard_schedule_revision_v1';
const marker = (revision) => JSON.stringify({ revision, surgery_id: '42' });

function fixture(initial = marker('before'), options = {}) {
  assert.equal(typeof schedule.subscribeToSurgeryScheduleChanges, 'function', 'DocBoard must subscribe to external surgery changes');
  const values = new Map(initial === null ? [] : [[KEY, initial]]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const received = [];
  const retryState = { failed: false, pending: false };
  const stop = schedule.subscribeToSurgeryScheduleChanges((revision) => received.push(revision), {
    windowTarget, documentTarget, storage,
    shouldRetry: () => retryState.failed && !retryState.pending,
    ...options,
  });
  const emit = (properties = {}) => windowTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: KEY, newValue: values.get(KEY), storageArea: storage, ...properties,
  }));
  return { values, storage, windowTarget, documentTarget, received, retryState, stop, emit };
}

test('refreshes a mounted schedule once when Planning publishes a changed surgery revision', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.received, []);
    f.values.set(KEY, marker('cancelled-42'));
    f.emit();
    f.emit();
    assert.deepEqual(f.received, ['cancelled-42']);
  } finally { f.stop(); }
});

test('reconciles a missed revision when the tab becomes visible or focused without repeated refreshes', () => {
  const f = fixture();
  try {
    f.documentTarget.visibilityState = 'hidden';
    f.values.set(KEY, marker('missed-while-hidden'));
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, []);
    f.documentTarget.visibilityState = 'visible';
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, ['missed-while-hidden']);
    f.values.set(KEY, marker('missed-focus'));
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, ['missed-while-hidden', 'missed-focus']);
  } finally { f.stop(); }
});

test('ignores unrelated keys, session storage, clear and removal events', () => {
  const f = fixture();
  try {
    f.values.set(KEY, marker('changed'));
    f.emit({ key: 'unrelated' });
    f.emit({ storageArea: { getItem: () => marker('session-only') } });
    f.emit({ key: null, newValue: null });
    f.emit({ newValue: null });
    assert.deepEqual(f.received, []);
    f.emit();
    assert.deepEqual(f.received, ['changed']);
  } finally { f.stop(); }
});

test('malformed or missing markers do not reset the last revision or trigger refreshes', () => {
  const f = fixture();
  try {
    for (const value of ['{', 'null', '{}', '{"revision":5}', '{"revision":""}', '{"revision":"  "}']) {
      f.values.set(KEY, value);
      f.emit();
      f.windowTarget.dispatchEvent(new Event('focus'));
    }
    f.values.delete(KEY);
    f.windowTarget.dispatchEvent(new Event('focus'));
    f.values.set(KEY, marker('before'));
    f.emit();
    assert.deepEqual(f.received, []);
    f.values.set(KEY, marker('after-invalid'));
    f.emit();
    assert.deepEqual(f.received, ['after-invalid']);
  } finally { f.stop(); }
});

test('queued stale events reconcile the latest stored revision without rolling back', () => {
  const f = fixture();
  try {
    f.values.set(KEY, marker('newest'));
    f.emit({ newValue: marker('older-queued') });
    f.emit({ newValue: marker('newest') });
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, ['newest']);
  } finally { f.stop(); }
});

test('cleanup detaches storage, focus and visibility listeners', () => {
  const f = fixture();
  f.stop();
  f.values.set(KEY, marker('after-unmount'));
  f.emit();
  f.windowTarget.dispatchEvent(new Event('focus'));
  f.windowTarget.dispatchEvent(new Event('online'));
  f.documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.received, []);
});

test('a valid revision can be observed after initially missing or malformed storage', () => {
  for (const initial of [null, '{']) {
    const f = fixture(initial);
    try {
      f.values.set(KEY, marker('first-known'));
      f.windowTarget.dispatchEvent(new Event('focus'));
      assert.deepEqual(f.received, ['first-known']);
    } finally { f.stop(); }
  }
});

test('blocked local storage does not break the app subscription lifecycle', () => {
  assert.equal(typeof schedule.subscribeToSurgeryScheduleChanges, 'function');
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  Object.defineProperty(windowTarget, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  const received = [];
  const stop = schedule.subscribeToSurgeryScheduleChanges((value) => received.push(value), { windowTarget, documentTarget });
  windowTarget.dispatchEvent(new Event('focus'));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  stop();
  assert.deepEqual(received, []);
});

test('focus retries a failed refresh of the same revision and stops retrying after success', () => {
  const f = fixture();
  try {
    f.values.set(KEY, marker('cancelled-42'));
    f.emit();
    f.retryState.failed = true;
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, ['cancelled-42', 'cancelled-42']);
    f.retryState.failed = false;
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, ['cancelled-42', 'cancelled-42']);
  } finally { f.stop(); }
});

test('visibility retries a failed refresh only after the page becomes visible', () => {
  const f = fixture();
  try {
    f.retryState.failed = true;
    f.documentTarget.visibilityState = 'hidden';
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(f.received, []);
    f.documentTarget.visibilityState = 'visible';
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(f.received, ['before']);
  } finally { f.stop(); }
});

test('network reconnection retries failed surgery reads even without a stored cancellation marker', () => {
  const f = fixture(null);
  try {
    f.retryState.failed = true;
    f.windowTarget.dispatchEvent(new Event('online'));
    assert.deepEqual(f.received, [null]);
  } finally { f.stop(); }
});

test('duplicate storage markers stay deduplicated after a read failure and pending retries do not multiply', () => {
  const f = fixture();
  try {
    f.values.set(KEY, marker('cancelled-42'));
    f.emit();
    f.retryState.failed = true;
    f.emit();
    assert.deepEqual(f.received, ['cancelled-42']);
    f.retryState.pending = true;
    for (const type of ['focus', 'online']) f.windowTarget.dispatchEvent(new Event(type));
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(f.received, ['cancelled-42']);
    f.retryState.pending = false;
    f.windowTarget.dispatchEvent(new Event('online'));
    assert.deepEqual(f.received, ['cancelled-42', 'cancelled-42']);
  } finally { f.stop(); }
});

test('the shared view failure state drives retry and retains its warning until a successful read', () => {
  const f = fixture(marker('before'), { shouldRetry: undefined });
  try {
    schedule.surgeryRefreshFailed.value = true;
    schedule.surgeryRefreshPending.value = true;
    f.windowTarget.dispatchEvent(new Event('focus'));
    assert.deepEqual(f.received, []);
    schedule.surgeryRefreshPending.value = false;
    f.windowTarget.dispatchEvent(new Event('online'));
    assert.deepEqual(f.received, ['before']);
    assert.equal(schedule.surgeryRefreshFailed.value, true);
    schedule.surgeryRefreshFailed.value = false;
    f.documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(f.received, ['before']);
  } finally {
    f.stop();
    schedule.surgeryRefreshFailed.value = false;
    schedule.surgeryRefreshPending.value = false;
  }
});
