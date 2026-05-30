const FACILITIES = ['melinda', 'gambiran', 'bhayangkara'];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'operation-data-fetcher' });
      }

      if (url.pathname === '/daily') {
        const date = url.searchParams.get('date') || wibDateString(new Date());
        const result = await runDaily(env, date);
        return json({ success: true, result });
      }

      if (url.pathname === '/backfill/start') {
        const startDate = url.searchParams.get('start') || '2020-01-01';
        const endDate = url.searchParams.get('end') || wibDateString(new Date());
        const result = await backend(env, '/api/integration/operation-data/backfill/start', {
          method: 'POST',
          body: { start_date: startDate, end_date: endDate, facilities: FACILITIES },
        });
        return json({ success: true, result });
      }

      if (url.pathname === '/backfill/process') {
        const limit = Number(url.searchParams.get('limit') || env.BACKFILL_JOBS_PER_RUN || 1);
        const result = await processBackfill(env, limit);
        return json({ success: true, result });
      }

      return json({ success: false, message: 'Not found' }, 404);
    } catch (error) {
      return json({ success: false, message: error.message }, 500);
    }
  },
};

async function runScheduled(env) {
  const date = wibDateString(new Date());
  const daily = await runDaily(env, date);
  const backfill = await processBackfill(env, Number(env.BACKFILL_JOBS_PER_RUN || 1));
  return { daily, backfill };
}

async function runDaily(env, date) {
  const lookbackDays = Math.max(1, Number(env.DAILY_LOOKBACK_DAYS || 2));
  const dates = [];
  const base = parseDate(date);
  for (let i = lookbackDays - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(dateOnly(d));
  }

  const summaries = [];
  for (const day of dates) {
    for (const facility of FACILITIES) {
      summaries.push(await processRange(env, facility, day, day));
    }
  }
  await writeLatestManifest(env, summaries);
  return summaries;
}

async function processBackfill(env, limit) {
  const claimed = await backend(env, '/api/integration/operation-data/backfill/claim', {
    method: 'POST',
    body: { limit },
  });
  const jobs = claimed.jobs || [];
  const results = [];

  for (const job of jobs) {
    try {
      const summary = await processRange(env, job.facility, dateOnly(job.period_start), dateOnly(job.period_end));
      await backend(env, `/api/integration/operation-data/backfill/jobs/${job.id}/complete`, {
        method: 'POST',
        body: { summary },
      });
      results.push({ job_id: job.id, success: true, summary });
    } catch (error) {
      await backend(env, `/api/integration/operation-data/backfill/jobs/${job.id}/fail`, {
        method: 'POST',
        body: { message: error.message, summary: { facility: job.facility, period_start: job.period_start, period_end: job.period_end } },
      });
      results.push({ job_id: job.id, success: false, message: error.message });
    }
  }

  return { claimed: jobs.length, results };
}

async function processRange(env, facility, startDate, endDate) {
  const startedAt = new Date().toISOString();
  const errors = [];
  const items = [];

  try {
    const list = await listOperations(env, facility, startDate, endDate);
    for (const item of list) {
      try {
        const detail = await getOperationDetail(env, facility, item);
        const normalized = normalizeOperation(facility, item, detail);
        if (!normalized.operation_date) continue;
        const payload = {
          facility,
          fetched_at: new Date().toISOString(),
          patient: {
            name: normalized.patient_name,
            mr_id: normalized.mr_id,
            case_id: normalized.case_id,
          },
          operation: normalized,
          report: detail,
          raw_patient: item,
        };
        const r2Key = makeR2Key(facility, normalized.operation_date, normalized.source_key);
        await env.OPERATION_DATA_BUCKET.put(r2Key, JSON.stringify(payload, null, 2), {
          httpMetadata: { contentType: 'application/json; charset=utf-8' },
        });
        items.push({ ...normalized, r2_key: r2Key, fetched_at: payload.fetched_at });
      } catch (error) {
        errors.push({ source: item?.source_key || item?.id || null, message: error.message });
      }
    }
  } catch (error) {
    errors.push({ facility, message: error.message });
  }

  await writeManifests(env, facility, startDate, endDate, items, errors, startedAt);
  if (items.length > 0) {
    await backend(env, '/api/integration/operation-data/index', {
      method: 'POST',
      body: { items },
    });
  }

  return {
    facility,
    period_start: startDate,
    period_end: endDate,
    items_found: items.length + errors.length,
    items_saved: items.length,
    errors,
  };
}

async function listOperations(env, facility, startDate, endDate) {
  const config = facilityConfig(env, facility);
  if (!config.listUrl) throw new Error(`Missing ${facility.toUpperCase()}_OPERATION_LIST_URL`);
  const url = fillTemplate(config.listUrl, { facility, start: startDate, end: endDate, date: startDate });
  const data = await fetchJson(url, config);
  if (Array.isArray(data)) return data;
  return data.items || data.results || data.operations || data.data || [];
}

async function getOperationDetail(env, facility, item) {
  const config = facilityConfig(env, facility);
  const detailUrl = item.detail_url || item.detailUrl || item.url || (
    config.detailUrl ? fillTemplate(config.detailUrl, {
      id: item.id || item.operasiId || item.operation_id,
      source_key: item.source_key || item.sourceKey,
      case_id: item.case_id || item.caseId,
      operation_id: item.operasiId || item.operation_id || item.id,
    }) : null
  );
  if (!detailUrl) return item.report || item.detail || item;
  const data = await fetchJson(detailUrl, config);
  return data.report || data.detail || data.operation || data;
}

function facilityConfig(env, facility) {
  const prefix = facility.toUpperCase();
  return {
    listUrl: env[`${prefix}_OPERATION_LIST_URL`],
    detailUrl: env[`${prefix}_OPERATION_DETAIL_URL`],
    authHeader: env[`${prefix}_AUTH_HEADER`] || 'Authorization',
    authToken: env[`${prefix}_AUTH_TOKEN`] || '',
  };
}

async function fetchJson(url, config) {
  const headers = { Accept: 'application/json' };
  if (config.authToken) headers[config.authHeader] = config.authToken;
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response is not JSON: ${text.slice(0, 200)}`);
  }
}

function normalizeOperation(facility, item, detail) {
  const sourceKey = first(
    item.source_key, item.sourceKey, detail.source_key, detail.sourceKey,
    detail.operasiId, item.operasiId, item.id, detail.id
  );
  const operationDate = normalizeDate(first(
    detail.tanggalOperasi, detail.operation_date, detail.date,
    item.operation_date, item.date, item.tanggalOperasi
  ));
  const operationName = first(
    detail.operation_name, detail.operationName, detail.namaOperasi,
    detail.tindakanOperasi, item.operation_name, item.operationName, item.tindakanOperasi
  );
  const diagnosis = first(
    detail.diagnosaAwal, detail.diagnosaAkhir, detail.diagnosis,
    item.diagnosis, item.diagnosaAwal
  );

  return {
    facility,
    source_key: `${facility}:${sourceKey || `${operationDate}:${first(item.mr_id, item.no_rm, detail.no_rm, detail.mr_id)}`}`,
    case_id: first(item.case_id, item.caseId, detail.case_id, detail.caseId),
    simrs_operasi_id: first(detail.operasiId, item.operasiId, item.operation_id, detail.operation_id),
    mr_id: first(item.mr_id, item.no_rm, item.medicalRecordNo, detail.mr_id, detail.no_rm),
    patient_name: first(item.patient_name, item.patientName, item.namaPasien, detail.patient_name, detail.namaPasien) || 'Pasien',
    operation_date: operationDate,
    operation_time: normalizeTime(first(detail.waktuMulai, detail.operation_time, item.operation_time)),
    operation_name: operationName,
    diagnosis,
    status: first(detail.statusPasien, detail.status, item.status),
  };
}

async function writeManifests(env, facility, startDate, endDate, items, errors, startedAt) {
  const byDate = new Map();
  for (const item of items) {
    if (!byDate.has(item.operation_date)) byDate.set(item.operation_date, []);
    byDate.get(item.operation_date).push(item);
  }

  for (const [date, dateItems] of byDate.entries()) {
    const facilityIndex = {
      facility,
      date,
      fetched_at: startedAt,
      total: dateItems.length,
      items: dateItems,
      errors: errors.filter(error => error.date === date),
    };
    await env.OPERATION_DATA_BUCKET.put(
      `operation-data/${facility}/${date}/index.json`,
      JSON.stringify(facilityIndex, null, 2),
      { httpMetadata: { contentType: 'application/json; charset=utf-8' } }
    );
  }

  const rangeIndex = { facility, start_date: startDate, end_date: endDate, fetched_at: startedAt, total: items.length, items, errors };
  await env.OPERATION_DATA_BUCKET.put(
    `operation-data/${facility}/${startDate}_${endDate}/index.json`,
    JSON.stringify(rangeIndex, null, 2),
    { httpMetadata: { contentType: 'application/json; charset=utf-8' } }
  );
}

async function writeLatestManifest(env, summaries) {
  await env.OPERATION_DATA_BUCKET.put(
    'operation-data/latest.json',
    JSON.stringify({ fetched_at: new Date().toISOString(), summaries }, null, 2),
    { httpMetadata: { contentType: 'application/json; charset=utf-8' } }
  );
}

async function backend(env, path, { method = 'GET', body } = {}) {
  if (!env.BACKEND_API_URL || !env.BACKEND_API_KEY) {
    throw new Error('BACKEND_API_URL and BACKEND_API_KEY are required');
  }
  const response = await fetch(`${env.BACKEND_API_URL.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': env.BACKEND_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Backend error ${response.status}`);
  return data;
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function normalizeDate(value) {
  const raw = first(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (local) return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return dateOnly(date);
}

function normalizeTime(value) {
  const raw = first(value);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : null;
}

function makeR2Key(facility, date, sourceKey) {
  return `operation-data/${facility}/${date}/${safeKey(sourceKey)}.json`;
}

function safeKey(value) {
  return String(value || 'operation')
    .replace(/[^a-zA-Z0-9._=-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'operation';
}

function fillTemplate(template, values) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => encodeURIComponent(values[key] || ''));
}

function wibDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
