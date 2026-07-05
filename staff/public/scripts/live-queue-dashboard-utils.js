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

export function renderOnlineQueuePageHtml(queueItems = [], options = {}) {
  const items = Array.isArray(queueItems) ? queueItems : [];
  const summary = summarizeQueue(items);
  const dateLabel = options.dateLabel || 'Hari ini';
  const updatedAt = options.updatedAt
    ? new Date(options.updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
    : '';
  const isQueueVisible = Boolean(options.isQueueVisible);
  const doctorArrived = Boolean(options.doctorArrived);

  return `
    <div class="card card-success card-outline">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
        <div class="mb-2 mb-md-0">
          <h3 class="card-title mb-1"><i class="fas fa-list-ol mr-2"></i>Antrian Online</h3>
          <div class="text-muted small">${escapeHtml(dateLabel)}${updatedAt ? ` &bull; Update ${escapeHtml(updatedAt)}` : ''}</div>
        </div>
        <div class="d-flex align-items-center flex-wrap" style="gap:6px;">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="antrian-online-refresh-btn" title="Refresh antrian">
            <i class="fas fa-sync-alt mr-1"></i>Refresh
          </button>
          <button type="button" class="btn btn-${isQueueVisible ? 'success' : 'outline-secondary'} btn-sm" id="antrian-online-visibility-btn" title="Tampilkan atau sembunyikan antrian di portal pasien">
            <i class="fas fa-users mr-1"></i>${isQueueVisible ? 'Portal tampil' : 'Portal sembunyi'}
          </button>
          <button type="button" class="btn btn-${doctorArrived ? 'success' : 'outline-secondary'} btn-sm" id="antrian-online-doctor-btn" title="Status dokter untuk portal pasien">
            <i class="fas fa-user-md mr-1"></i>${doctorArrived ? 'Dokter hadir' : 'Belum dimulai'}
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="row">
          ${renderSummaryBox('Total', summary.total, 'primary', 'fa-users')}
          ${renderSummaryBox('Menunggu', summary.waiting, 'warning', 'fa-hourglass-half')}
          ${renderSummaryBox('Proses', summary.inProgress, 'info', 'fa-stethoscope')}
          ${renderSummaryBox('Selesai', summary.completed, 'success', 'fa-check-circle')}
        </div>
        ${items.length ? renderOnlineQueueTable(items) : renderOnlineQueueEmptyState()}
      </div>
    </div>
  `;
}

function renderSummaryBox(label, value, color, icon) {
  return `
    <div class="col-lg-3 col-6">
      <div class="small-box bg-${color}" aria-label="${escapeHtml(label)} ${escapeHtml(value)}">
        <div class="inner">
          <h3>${escapeHtml(value)}</h3>
          <p>${escapeHtml(label)}</p>
        </div>
        <div class="icon"><i class="fas ${escapeHtml(icon)}"></i></div>
      </div>
    </div>
  `;
}

function renderOnlineQueueTable(items) {
  return `
    <div class="table-responsive">
      <table class="table table-hover table-sm mb-0">
        <thead class="thead-light">
          <tr>
            <th style="text-align: center !important; vertical-align: middle !important; width: 60px;">No</th>
            <th style="vertical-align: middle !important;">Pasien</th>
            <th style="vertical-align: middle !important; width: 160px;">Jam</th>
            <th style="vertical-align: middle !important;">Keluhan</th>
            <th style="text-align: center !important; vertical-align: middle !important; width: 150px;">Status</th>
            <th style="text-align: center !important; vertical-align: middle !important; width: 130px;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, index) => renderOnlineQueueRow(item, index)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderOnlineQueueRow(item, index) {
  const statusConfig = getQueueStatusConfig(item && item.queue_status);
  const patientName = item && item.patient_name ? item.patient_name : '-';
  const sessionLabel = item && item.session_label ? item.session_label : `Sesi ${item?.session || '-'}`;
  const slotText = item && item.slot_time ? item.slot_time : `Slot ${item?.slot_number || '-'}`;
  const complaint = item && item.chief_complaint ? item.chief_complaint : '-';
  const mrId = item && item.mr_id ? String(item.mr_id) : '';
  const appointmentId = item && item.id ? `#${item.id}` : '';
  const status = item && item.status ? item.status : '';

  return `
    <tr>
      <td class="text-center align-middle"><span class="badge badge-primary" style="min-width:32px;">${index + 1}</span></td>
      <td class="align-middle">
        <div class="font-weight-bold">${escapeHtml(patientName)}</div>
        <small class="text-muted">${escapeHtml(appointmentId)}${mrId ? ` &bull; ${escapeHtml(mrId)}` : ''}</small>
      </td>
      <td class="align-middle">
        <div class="font-weight-bold">${escapeHtml(slotText)}</div>
        <small class="text-muted">${escapeHtml(sessionLabel)}</small>
      </td>
      <td class="align-middle"><span class="text-muted">${escapeHtml(complaint)}</span></td>
      <td class="text-center align-middle">
        <span class="badge ${statusConfig.badge}">${escapeHtml(statusConfig.label)}</span>
        ${status ? `<br><small class="text-muted">${escapeHtml(status)}</small>` : ''}
      </td>
      <td class="text-center align-middle">
        ${mrId
          ? `<button type="button" class="btn btn-xs btn-primary" onclick="window.openSundayClinicWithMrId('${escapeJsString(mrId)}', 'identitas')" title="Buka rekam medis"><i class="fas fa-notes-medical mr-1"></i>Buka</button>`
          : '<button type="button" class="btn btn-xs btn-outline-secondary" disabled title="Belum ada DRD"><i class="fas fa-clock mr-1"></i>Belum DRD</button>'}
      </td>
    </tr>
  `;
}

function renderOnlineQueueEmptyState() {
  return `
    <div class="text-center text-muted py-5">
      <i class="fas fa-list-ol fa-3x mb-3"></i>
      <p class="mb-0">Belum ada antrian online hari ini.</p>
    </div>
  `;
}

function escapeJsString(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
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
