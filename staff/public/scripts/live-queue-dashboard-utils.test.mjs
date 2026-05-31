import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderLiveQueueHtml,
  summarizeQueue,
} from './live-queue-dashboard-utils.mjs';

test('summarizeQueue counts waiting, in progress, and completed patients', () => {
  const summary = summarizeQueue([
    { queue_status: 'menunggu' },
    { queue_status: 'anamnesa' },
    { queue_status: 'diperiksa' },
    { queue_status: 'selesai_periksa' },
    { queue_status: 'lunas' },
  ]);

  assert.deepEqual(summary, {
    total: 5,
    waiting: 1,
    inProgress: 2,
    completed: 2,
  });
});

test('renderLiveQueueHtml escapes patient text and renders status badges', () => {
  const html = renderLiveQueueHtml([
    {
      patient_name: '<Dibya>',
      session_label: 'Sesi 1',
      slot_time: '08:00',
      chief_complaint: '<script>alert(1)</script>',
      queue_status: 'diperiksa',
      mr_id: 'DRD0001',
    },
  ]);

  assert.match(html, /Antrian Live Hari Ini/);
  assert.match(html, /&lt;Dibya&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Sedang Diperiksa/);
  assert.match(html, /DRD0001/);
});
