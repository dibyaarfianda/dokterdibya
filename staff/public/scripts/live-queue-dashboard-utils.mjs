const STATUS_CONFIG = {
  menunggu: { label: 'Menunggu', badge: 'badge-secondary' },
  anamnesa: { label: 'Anamnesa', badge: 'badge-info' },
  diperiksa: { label: 'Sedang Diperiksa', badge: 'badge-danger' },
  selesai_periksa: { label: 'Selesai Periksa', badge: 'badge-success' },
  lunas: { label: 'Lunas', badge: 'badge-primary' },
};

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeQueueStatus(status) {
  const value = String(status || '').trim();
  return STATUS_CONFIG[value] ? value : 'menunggu';
}

export function getQueueStatusConfig(status) {
  return STATUS_CONFIG[normalizeQueueStatus(status)];
}

export function summarizeQueue(queueItems = []) {
  return queueItems.reduce((summary, item) => {
    const status = normalizeQueueStatus(item && item.queue_status);
    summary.total += 1;

    if (status === 'menunggu') {
      summary.waiting += 1;
    } else if (status === 'anamnesa' || status === 'diperiksa') {
      summary.inProgress += 1;
    } else {
      summary.completed += 1;
    }

    return summary;
  }, { total: 0, waiting: 0, inProgress: 0, completed: 0 });
}

export function renderLiveQueueHtml(queueItems = [], options = {}) {
  const items = Array.isArray(queueItems) ? queueItems : [];
  const summary = summarizeQueue(items);
  const updatedAt = options.updatedAt
    ? new Date(options.updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '';

  if (items.length === 0) {
    return `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small text-muted">Antrian Live Hari Ini</span>
        ${updatedAt ? `<span class="badge badge-light">Update ${escapeHtml(updatedAt)}</span>` : ''}
      </div>
      <div class="text-center text-muted py-4">
        <i class="fas fa-list-ol fa-2x mb-2"></i>
        <p class="mb-0">Belum ada antrian hari ini.</p>
      </div>
    `;
  }

  return `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small text-muted">Antrian Live Hari Ini</span>
      ${updatedAt ? `<span class="badge badge-light">Update ${escapeHtml(updatedAt)}</span>` : ''}
    </div>
    <div class="d-flex flex-wrap mb-2" style="gap:6px;">
      <span class="badge badge-secondary">Total ${summary.total}</span>
      <span class="badge badge-warning">Menunggu ${summary.waiting}</span>
      <span class="badge badge-info">Proses ${summary.inProgress}</span>
      <span class="badge badge-success">Selesai ${summary.completed}</span>
    </div>
    <div class="list-group list-group-flush">
      ${items.map((item, index) => renderQueueItem(item, index)).join('')}
    </div>
  `;
}

function renderQueueItem(item, index) {
  const statusConfig = getQueueStatusConfig(item && item.queue_status);
  const patientName = item && item.patient_name ? item.patient_name : '-';
  const sessionLabel = item && item.session_label ? item.session_label : `Sesi ${item?.session || '-'}`;
  const slotText = item && item.slot_time ? item.slot_time : `Slot ${item?.slot_number || '-'}`;
  const complaint = item && item.chief_complaint ? item.chief_complaint : 'Keluhan belum diisi';
  const mrId = item && item.mr_id ? item.mr_id : '';

  return `
    <div class="list-group-item px-0 py-2">
      <div class="d-flex align-items-start">
        <span class="badge badge-primary mr-2" style="min-width:28px;">${index + 1}</span>
        <div class="flex-grow-1" style="min-width:0;">
          <div class="d-flex justify-content-between align-items-start">
            <strong class="text-truncate mr-2">${escapeHtml(patientName)}</strong>
            <span class="badge ${statusConfig.badge}">${escapeHtml(statusConfig.label)}</span>
          </div>
          <div class="small text-muted">
            ${escapeHtml(sessionLabel)} &bull; ${escapeHtml(slotText)}
            ${mrId ? ` &bull; <span class="text-primary">${escapeHtml(mrId)}</span>` : ''}
          </div>
          <div class="small text-muted text-truncate">${escapeHtml(complaint)}</div>
        </div>
      </div>
    </div>
  `;
}
