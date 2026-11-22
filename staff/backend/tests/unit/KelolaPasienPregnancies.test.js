const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/legacy/patient-tools.js'), 'utf8');
    const elements = {};
    const el = id => (elements[id] = elements[id] || { innerHTML: '', textContent: '', dataset: {} });
    const context = {
        __elements: elements,
        console, setTimeout, clearTimeout,
        hasAccountPermission: () => true,
        document: { readyState: 'loading', addEventListener: jest.fn(), getElementById: el },
        addEventListener: jest.fn(),
        location: { hostname: 'dokterdibya.com', origin: 'https://dokterdibya.com' },
        fetch: jest.fn(),
        Swal: { fire: jest.fn(async () => ({})) },
        getAuthToken: () => 'tok'
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'patient-tools.js' });
    return { ctx: context, el };
}
const ok = data => ({ ok: true, json: async () => ({ success: true, data }) });
const evil = '<img src=x onerror=alert(1)>';

test('earlier pregnancies escape hostile text, skip ongoing, and external has no resume button', () => {
    const { ctx } = load();
    const html = ctx.renderEarlierPregnanciesHtml([
        { id: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2020, delivery_method: 'SC', delivery_indication: evil, complications: ['a'], needs_review: true, latest_mr_id: "DRD'1" },
        { id: 2, source: 'clinic', status: 'ongoing', outcome: null, year: 2099, latest_mr_id: 'DRD0099' },
        { id: 3, source: 'external', status: 'ended', outcome: 'abortus', year: 2018, latest_mr_id: 'DRD0050' }
    ]);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Lahir hidup');
    expect(html).toContain('Perlu dicek');
    expect(html).not.toContain('2099');
    expect(html).toContain('Abortus');
    expect(html).toContain('Luar');
    expect((html.match(/Lihat resume/g) || []).length).toBe(1);
    expect(html).toContain('showPregnancyResume(&#39;DRD\\&#39;1&#39;)');
});

test('review rows escape names and the empty state is shown', () => {
    const { ctx } = load();
    const html = ctx.renderPregnancyReviewRows([{ patient_id: 'P1', full_name: evil, reason: '<b>x</b>' }]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('showPatientMRList');
    expect(ctx.renderPregnancyReviewRows([])).toContain('Tidak ada riwayat yang perlu dicek.');
});

test('loadPregnancyReviewList fills tbody and count; failure leaves a neutral row', async () => {
    const { ctx, el } = load();
    ctx.fetch.mockResolvedValueOnce(ok([{ patient_id: 'P1', full_name: 'Ani', reason: 'r' }]));
    await ctx.loadPregnancyReviewList();
    expect(el('pregnancy-review-count').textContent).toBe('1');
    expect(el('pregnancy-review-tbody').innerHTML).toContain('Ani');
    ctx.fetch.mockRejectedValueOnce(new Error('net'));
    await ctx.loadPregnancyReviewList();
    expect(el('pregnancy-review-tbody').innerHTML).toContain('tidak dapat dimuat');
});

test('showPregnancyResume shows escaped text or "Belum ada resume"', async () => {
    const { ctx } = load();
    ctx.fetch.mockResolvedValueOnce(ok({ resume: evil + '\nbaris2' }));
    await ctx.showPregnancyResume('DRD0001');
    expect(ctx.Swal.fire.mock.calls[0][0].html).toContain('white-space:pre-wrap');
    expect(ctx.Swal.fire.mock.calls[0][0].html).not.toContain('<img');
    ctx.fetch.mockResolvedValueOnce(ok(null));
    await ctx.showPregnancyResume('DRD0002');
    expect(ctx.Swal.fire.mock.calls[1][0].html).toContain('Belum ada resume');
});

test('loadEarlierPregnancies failure does not throw and clears the block', async () => {
    const { ctx, el } = load();
    el('patient-earlier-pregnancies').innerHTML = 'x';
    ctx.fetch.mockRejectedValueOnce(new Error('net'));
    await expect(ctx.loadEarlierPregnancies('P1')).resolves.toBeUndefined();
    expect(el('patient-earlier-pregnancies').innerHTML).toBe('');
});

test('markup and wiring exist', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../public/index-adminlte.html'), 'utf8');
    expect(html).toContain('id="pregnancy-review-tbody"');
    expect(html).toContain('id="pregnancy-review-count"');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/legacy/patient-tools.js'), 'utf8');
    expect(src).toContain('<div id="patient-earlier-pregnancies"></div>');
    expect(src).toContain('window.loadPregnancyReviewList();');
});

test('#13 "Lihat resume" uses latest_resume_mr_id, falling back to latest_mr_id', () => {
    const { ctx } = load();
    const html = ctx.renderEarlierPregnanciesHtml([
        { id: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2020, latest_mr_id: 'DRD0009', latest_resume_mr_id: 'DRD0007' },
        { id: 2, source: 'clinic', status: 'ended', outcome: 'abortus', year: 2018, latest_mr_id: 'DRD0003', latest_resume_mr_id: null }
    ]);
    expect(html).toContain('showPregnancyResume(&#39;DRD0007&#39;)');
    expect(html).not.toContain('DRD0009');
    expect(html).toContain('showPregnancyResume(&#39;DRD0003&#39;)');
});

test('#11 a stale response for another patient is not rendered', async () => {
    const { ctx, el } = load();
    let resolveA;
    ctx.fetch.mockImplementationOnce(() => new Promise(r => { resolveA = r; }));
    const first = ctx.loadEarlierPregnancies('PA');
    // The modal now shows patient PB (new box element, as the modal body is replaced).
    delete ctx.__elements['patient-earlier-pregnancies'];
    ctx.fetch.mockResolvedValueOnce(ok({ pregnancies: [{ id: 2, source: 'clinic', status: 'ended', outcome: 'abortus', year: 2018 }] }));
    await ctx.loadEarlierPregnancies('PB');
    expect(el('patient-earlier-pregnancies').innerHTML).toContain('2018');
    resolveA(ok({ pregnancies: [{ id: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2011 }] }));
    await first;
    expect(el('patient-earlier-pregnancies').innerHTML).toContain('2018');
    expect(el('patient-earlier-pregnancies').innerHTML).not.toContain('2011');
    expect(el('patient-earlier-pregnancies').dataset.patientId).toBe('PB');
});

test('list badge labels a generic ended pregnancy (selesai) as "Kehamilan selesai"', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/legacy/patient-tools.js'), 'utf8');
    expect(source).toMatch(/PREGNANCY_OUTCOME_LABELS = \{[^}]*selesai: 'Kehamilan selesai'/);
});

test('earlier pregnancies mark patient reports and escape the place', () => {
    const { ctx } = load();
    const html = ctx.renderEarlierPregnanciesHtml([
        { id: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2026, ended_by_patient: 1, delivery_place: evil },
        { id: 2, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2020, delivery_place: 'RS Lama' }
    ]);
    expect(html).toContain('(dilaporkan pasien)');
    expect(html).toContain('di &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html.match(/dilaporkan pasien/g)).toHaveLength(1);
    expect(html).toContain('di RS Lama');
});
