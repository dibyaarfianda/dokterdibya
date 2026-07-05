import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderOnlineQueuePageHtml,
  renderLiveQueueHtml,
  summarizeQueue,
} from './live-queue-dashboard-utils.js';

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

test('renderOnlineQueuePageHtml renders a full staff queue page with actions', () => {
  const html = renderOnlineQueuePageHtml([
    {
      id: 42,
      patient_name: '<Pasien A>',
      session_label: 'Sesi Pagi',
      slot_time: '08:15',
      chief_complaint: '<b>Nyeri</b>',
      queue_status: 'anamnesa',
      status: 'confirmed',
      mr_id: 'DRD0042',
    },
  ], {
    dateLabel: 'Minggu, 5 Juli 2026',
    updatedAt: '2026-07-05T08:30:00+07:00',
  });

  assert.match(html, /Antrian Online/);
  assert.match(html, /Minggu, 5 Juli 2026/);
  assert.match(html, /Total\s*1/);
  assert.match(html, /&lt;Pasien A&gt;/);
  assert.doesNotMatch(html, /<b>Nyeri<\/b>/);
  assert.match(html, /Anamnesa/);
  assert.match(html, /openSundayClinicWithMrId\('DRD0042', 'identitas'\)/);
});
