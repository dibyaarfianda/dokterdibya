const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const baseUrl = process.env.DOCBOARD_TEST_URL || 'http://127.0.0.1:5174/docboard/audit';
const outputDir = process.env.UI_TEST_OUTPUT || path.join(os.tmpdir(), 'docboard-gambiran-journey');

function token() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    id: 'UDZAQUCQWZ',
    email: 'nanda.arfianda@gmail.com',
    name: 'Audit Test',
    role: 'dokter',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.test`;
}

function journey(status = 'unknown') {
  const visits = Array.from({ length: 9 }, (_, index) => ({
    date: `2025-${String(Math.min(index + 1, 4)).padStart(2, '0')}-${String(3 + index).padStart(2, '0')}`,
    time: `${String(8 + (index % 4)).padStart(2, '0')}:15`,
    case_id: `med${String(426896 + index).padStart(10, '0')}`,
    diagnosis: index === 8 ? 'O82 - Delivery by caesarean section' : 'Z35.9 - Supervision of high-risk pregnancy, unspecified',
    location: index < 8 ? 'Rawat Jalan - BKIA' : 'Rawat Inap - Kirana - Ruang III',
    visit_type: index < 8 ? 'Rawat Jalan' : 'Rawat Inap',
    doctor_name: index < 5 ? 'dr. Dokter Awal Dengan Nama Panjang' : 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.',
    doctor_key: index < 5 ? 'dokter awal' : 'dibya arfianda',
    doctor_source: index === 4 ? 'cppt_author_fallback' : 'visit_record',
    confidence: index === 4 ? 'supported' : 'verified',
    resolution_status: index === 4 ? 'ambiguous' : 'resolved',
    doctor_candidates: index === 4 ? [
      { name: 'dr. Dokter Awal Dengan Nama Panjang' },
      { name: 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.' },
    ] : [],
    is_operation_visit: index === 8,
    procedure_doctor: index === 8 ? { name: 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.', key: 'dibya arfianda', source: 'operation_registration' } : null,
    note: index === 4 ? 'Dokter kunjungan berbeda dengan penulis CPPT.' : null,
  }));
  return {
    id: 90,
    model_version: 2,
    transfer_status: status,
    confidence: status === 'unknown' ? 'unknown' : 'verified',
    origin_doctor: { name: 'dr. Dokter Awal Dengan Nama Panjang', key: 'dokter awal', source: 'visit_record' },
    last_visit_doctor: { name: 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.', key: 'dibya arfianda', source: 'visit_record' },
    procedure_doctor: { name: 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.', key: 'dibya arfianda', source: 'operation_registration' },
    final_doctor: { name: 'dr. Dibya Arfianda, Sp.OG, M.Ked.Klin.', key: 'dibya arfianda', source: 'operation_operator' },
    transition_count: status === 'yes' ? 1 : 0,
    visit_count: visits.length,
    visits,
    timeline: visits,
    consultants: [],
    checked_at: '2026-07-16T04:30:00.000Z',
    analysis_status: 'ready',
  };
}

const baseRows = [
  {
    id: 1,
    operation_date: '2025-04-21',
    operation_time: '10:50:00',
    operation_name: 'Kuretase',
    patient_name: 'Pasien Audit Satu Dengan Nama Panjang',
    mr_id: '512995',
    patient_age: '26 tahun',
    doctor_key: 'dibya',
    diagnosis: 'Abortus inkomplit',
    repeat_within_30d: false,
    doctor_journey: journey('unknown'),
    doctor_journey_status: 'ready',
  },
  {
    id: 2,
    operation_date: '2025-05-05',
    operation_time: '08:00:00',
    operation_name: 'Sectio Caesarea',
    patient_name: 'Pasien Audit Gagal',
    mr_id: '500002',
    doctor_key: 'tri_aji',
    repeat_within_30d: false,
    doctor_journey: null,
    doctor_journey_status: 'failed',
  },
  {
    id: 3,
    operation_date: '2025-05-06',
    operation_time: '09:00:00',
    operation_name: 'Laparotomi',
    patient_name: 'Pasien Belum Dianalisis',
    mr_id: '500003',
    doctor_key: 'latifa',
    repeat_within_30d: false,
    doctor_journey: null,
    doctor_journey_status: 'not_analyzed',
  },
];

async function installApiMocks(page, auditRequests) {
  await page.route('**/api/docboard/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/docboard/audit/gambiran') {
      auditRequests.push(url.toString());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            total: 3,
            repeat_count: 0,
            transfer_count: 1,
            by_doctor: [],
            by_operation: [{ operation_name: 'Kuretase', count: 1 }],
          },
          data: baseRows,
          pagination: { page: 1, limit: 50, total: 3, has_more: false },
        }),
      });
    }

    const detailMatch = pathname.match(/\/api\/docboard\/audit\/gambiran\/(\d+)\/doctor-journey$/);
    if (detailMatch && request.method() === 'GET') {
      await new Promise(resolve => setTimeout(resolve, 220));
      const id = Number(detailMatch[1]);
      if (id === 2) {
        return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'SIMRS sementara tidak tersedia' }) });
      }
      if (id === 3) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, analysis_status: 'not_analyzed', doctor_journey: null }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, analysis_status: 'ready', doctor_journey: journey('unknown') }) });
    }

    const refreshMatch = pathname.match(/\/api\/docboard\/audit\/gambiran\/(\d+)\/doctor-journey\/refresh$/);
    if (refreshMatch && request.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, analysis_status: 'ready', doctor_journey: journey('yes') }) });
    }

    if (/\/pathology$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, results: [], files: [], summary: { total: 0, done: 0, files: 0 } }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, count: 0 }) });
  });
}

async function assertLayout(page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    badButtons: [...document.querySelectorAll('button')]
      .filter(button => button.offsetParent !== null)
      .filter(button => button.scrollWidth > button.clientWidth + 2)
      .map(button => button.textContent.trim()),
  }));
  assert.ok(metrics.bodyWidth <= metrics.viewport + 1, `body overflows: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.documentWidth <= metrics.viewport + 1, `document overflows: ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.badButtons, []);
}

async function assertModalAboveNavigation(page) {
  const result = await page.evaluate(() => {
    const overlay = document.querySelector('.audit-pa-overlay');
    const navigation = document.querySelector('.bottom-nav');
    const bottomElement = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 8);
    return {
      overlayZ: Number(getComputedStyle(overlay).zIndex || 0),
      navigationZ: Number(getComputedStyle(navigation).zIndex || 0),
      bottomIsNavigation: Boolean(bottomElement?.closest?.('.bottom-nav')),
    };
  });
  assert.ok(result.overlayZ > result.navigationZ, `modal z-index is too low: ${JSON.stringify(result)}`);
  assert.equal(result.bottomIsNavigation, false, `navigation overlaps modal: ${JSON.stringify(result)}`);
}

async function assertScreenshotHasContent(page, filename) {
  const buffer = await page.screenshot({ path: filename, fullPage: false });
  const stats = await sharp(buffer).stats();
  assert.ok(stats.channels.some(channel => channel.stdev > 5), 'screenshot is visually blank');
}

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const auditRequests = [];
  await page.addInitScript(value => localStorage.setItem('docboard_token', value), token());
  await installApiMocks(page, auditRequests);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Pasien Audit Satu Dengan Nama Panjang').waitFor();
  await assertLayout(page);

  await page.locator('.audit-filter-row select').nth(2).selectOption('yes');
  await page.waitForTimeout(80);
  assert.ok(auditRequests.some(url => url.includes('transfer=yes')));

  const firstRow = page.locator('.audit-row').nth(0);
  await firstRow.getByRole('button', { name: 'Riwayat' }).click();
  await page.getByText('Memuat riwayat kunjungan...').waitFor();
  await page.getByText('Bukti belum cukup untuk menyatakan pasien pindah atau tidak pindah dokter.').waitFor();
  await assertModalAboveNavigation(page);
  const panel = page.locator('.audit-journey-panel');
  const panelBox = await panel.boundingBox();
  assert.ok(panelBox && panelBox.y <= 20, `modal is not top-aligned: ${JSON.stringify(panelBox)}`);
  await assertScreenshotHasContent(page, path.join(outputDir, `${name}-summary.png`));
  const scrollMetrics = await panel.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight, `modal is not scrollable: ${JSON.stringify(scrollMetrics)}`);
  await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator('.audit-journey-event').last().scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.audit-journey-event').last().isVisible());
  await assertLayout(page);
  await assertScreenshotHasContent(page, path.join(outputDir, `${name}-timeline.png`));
  await page.getByRole('button', { name: 'Tutup' }).click();

  const secondRow = page.locator('.audit-row').nth(1);
  await secondRow.getByRole('button', { name: 'Riwayat' }).click();
  await page.getByText('SIMRS sementara tidak tersedia').waitFor();
  await page.getByRole('button', { name: 'Tutup' }).click();

  const thirdRow = page.locator('.audit-row').nth(2);
  await thirdRow.getByRole('button', { name: 'Riwayat' }).click();
  await page.getByText('Riwayat kunjungan belum dianalisis.').waitFor();
  await page.getByRole('button', { name: 'Analisis sekarang' }).click();
  await page.getByText('Pindah dokter', { exact: true }).last().waitFor();
  await page.getByRole('button', { name: 'Tutup' }).click();

  await firstRow.getByRole('button', { name: 'PA' }).click();
  await page.getByText('Belum ada hasil Patologi Anatomi pada pemeriksaan penunjang.').waitFor();
  await assertModalAboveNavigation(page);
  await assertLayout(page);
  await page.getByRole('button', { name: 'Tutup' }).click();

  await context.close();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'desktop', { width: 1440, height: 900 });
    await runViewport(browser, 'mobile', { width: 390, height: 844 });
  } finally {
    await browser.close();
  }
  process.stdout.write(`UI checks passed; screenshots: ${outputDir}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
