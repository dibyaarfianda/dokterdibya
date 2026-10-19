import test from 'node:test';
import assert from 'node:assert/strict';
import dateTime from './date-time-format.js';
import patientQueueView from '../../../public/scripts/patient-queue-view.js';

globalThis.DibyaDateTime = dateTime;
globalThis.PatientQueueView = patientQueueView;

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

test('online queue shows the patient view with masked names, slot numbers and patient status labels', () => {
  const html = renderOnlineQueuePageHtml([
    { session: 2, session_label: 'Siang', slot_number: 7, slot_time: '13:45', masked_name: 'A***',
      patient_name: 'Nama Rahasia', chief_complaint: 'Keluhan rahasia', mr_id: 'DRD9999', queue_status: 'anamnesa' },
    { session: 1, session_label: 'Pagi', slot_number: 3, slot_time: '09:30', masked_name: 'B***', queue_status: 'menunggu' }
  ], { isQueueVisible: true });
  assert.match(html, /A\*\*\*/);
  assert.match(html, /Pasien Hadir/);
  assert.match(html, /Belum Datang/);
  assert.match(html, /slot-num[^>]*>7</);
  assert.ok(html.indexOf('Sesi Pagi') < html.indexOf('Sesi Siang'));
  assert.doesNotMatch(html, /Nama Rahasia|Keluhan rahasia|DRD9999|<table|small-box|openSundayClinicWithMrId/);
});

test('online queue honors the same hidden and empty states as the patient portal', () => {
  assert.match(renderOnlineQueuePageHtml([], { isQueueVisible: true }), /Tidak ada antrian hari ini/);
  const hidden = renderOnlineQueuePageHtml([{ masked_name: 'A***', session: 1 }], { isQueueVisible: false });
  assert.match(hidden, /Antrian belum dibuka hari ini/);
  assert.doesNotMatch(hidden, /A\*\*\*/);
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

test('patient queue preview retains staff controls outside the patient cards', () => {
  const html = renderOnlineQueuePageHtml([
    {
      id: 42,
      patient_name: '<Pasien A>',
      masked_name: 'P***',
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
    isQueueVisible: true,
  });

  assert.match(html, /Antrian Online/);
  assert.match(html, /Minggu, 5 Juli 2026/);
  assert.match(html, /P\*\*\*/);
  assert.doesNotMatch(html, /<b>Nyeri<\/b>/);
  assert.match(html, /Pasien Hadir/);
  assert.match(html, /id="antrian-online-visibility-btn"/);
  assert.doesNotMatch(html, /DRD0042|&lt;Pasien A&gt;|openSundayClinicWithMrId/);
});

test('break state and controls remain available alongside the patient view', () => {
 const options = {isOnBreak:true, isQueueVisible:true};
 const html = renderOnlineQueuePageHtml([], options);
 assert.match(html, /patient-queue-doctor">Sedang istirahat/);
 assert.match(html, /id="antrian-online-break-btn"/);
 assert.doesNotMatch(renderOnlineQueuePageHtml([], {...options,isOnBreak:false}), /patient-queue-doctor">Sedang istirahat/);
});

test('patient cards escape all display fields and reject unrecognized CSS statuses', () => {
 const html = renderOnlineQueuePageHtml([{session:1, session_label:'<script>', slot_number:'<img>',
   slot_time:'<b>', masked_name:'<svg>', queue_status:'menunggu" onclick="alert(1)'}], {isQueueVisible:true});
 assert.match(html, /&lt;script&gt;|&lt;img&gt;|&lt;b&gt;|&lt;svg&gt;/);
 assert.match(html, /Belum Datang/);
 assert.doesNotMatch(html, /<script>|<img>|<svg>|onclick=/);
});
