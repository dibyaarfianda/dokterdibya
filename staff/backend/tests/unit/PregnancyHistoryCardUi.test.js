const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../../../public/scripts/sunday-clinic/components');

function context() {
    const elements = new Map();
    const node = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', dataset: {}, addEventListener() {} });
        return elements.get(id);
    };
    const swalResults = [];
    const ctx = vm.createContext({
        window: { hasAccountPermission: () => true, getAuthToken: () => 'fake', showToast: jest.fn() },
        document: { getElementById: node },
        Swal: { fire: jest.fn(async () => swalResults.shift() || { isConfirmed: false }) },
        fetch: jest.fn(),
        console, Date
    });
    const source = fs.readFileSync(path.join(root, 'shared/pregnancy-history-card.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export default PregnancyHistoryCard;', 'globalThis.Card = PregnancyHistoryCard;');
    vm.runInContext(source, ctx);
    return { ctx, node, swalResults, Card: ctx.Card };
}

const clinicPregnancy = {
    id: 1, sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', year: 2020, ended_on: '2020-05-01',
    ga_weeks_at_end: 39, delivery_method: 'SC (Caesar)', delivery_indication: '<img src=x onerror=alert(1)>',
    complications: ['preeklamsia'], babies: [{ weight_g: 3100, sex: 'L', alive: true }], needs_review: true
};
const ongoing = { id: 2, sequence: 2, source: 'clinic', status: 'ongoing', hpht: '2026-05-01', outcome: null };
const externalOnly = { id: 3, sequence: 1, source: 'external', status: 'ended', outcome: 'abortus', year: 2018 };
const ok = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const state = { currentMrId: 'DRD0005', recordData: { record: { patientId: 'P000000001' } } };

test('rows escape hostile indication and show labels and badges', () => {
    const { Card } = context();
    const html = Card.render(state, [clinicPregnancy, ongoing]);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Preeklamsia/PEB');
    expect(html).toContain('Perlu dicek');
    expect(html).toContain('Lahir hidup');
    expect(html).toContain('3100 g L');
});

test('card is hidden on gyn visits when only external history exists, shown when a clinic pregnancy exists', async () => {
    const { ctx, node, Card } = context();
    ctx.fetch.mockResolvedValueOnce(ok({ pregnancies: [externalOnly], totals: {}, riwayat_persalinan: [] }));
    await Card.mount(state, { category: 'gyn', readOnly: true });
    expect(node('pregnancy-history-card').innerHTML).toBe('');
    ctx.fetch.mockResolvedValueOnce(ok({ pregnancies: [clinicPregnancy], totals: {}, riwayat_persalinan: [] }));
    await Card.mount(state, { category: 'gyn', readOnly: true });
    expect(node('pregnancy-history-card').innerHTML).toContain('Riwayat Kehamilan (Private Clinic)');
    expect(node('pregnancy-history-card').innerHTML).not.toContain('data-preg-action="edit"');
});

test('load failure shows a neutral line and does not throw', async () => {
    const { ctx, node, Card } = context();
    ctx.fetch.mockRejectedValueOnce(new Error('offline'));
    await Card.mount(state, { category: 'obstetri' });
    expect(node('pregnancy-history-card').innerHTML).toContain('Riwayat kehamilan belum dapat dimuat');
});

test('totals prefill only empty inputs', () => {
    const { node, Card } = context();
    node('anamnesa-gravida').value = '';
    node('anamnesa-para').value = '3';
    node('anamnesa-abortus').value = '  ';
    Card.prefillTotals({ gravida: 4, para: 1, abortus: 2, anak_hidup: 1 });
    expect(node('anamnesa-gravida').value).toBe('4');
    expect(node('anamnesa-para').value).toBe('3');
    expect(node('anamnesa-abortus').value).toBe('2');
    expect(node('anamnesa-anak-hidup').value).toBe('1');
});

test('resolve calls start only after the previous-pregnancy form is confirmed', async () => {
    const { ctx, swalResults, Card } = context();
    const resolveReply = () => ok({ action: 'start_needs_previous_end', previous: { hpht: '2026-01-01' } });
    // cancelled: only resolve was called
    ctx.fetch.mockResolvedValueOnce(resolveReply());
    swalResults.push({ isConfirmed: false });
    expect(await Card.runAfterSave(state)).toBe('cancelled');
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
    expect(ctx.fetch.mock.calls[0][0]).toContain('/resolve');
    expect(ctx.window.showToast).toHaveBeenCalledWith('info', expect.stringContaining('Kehamilan baru belum dibuat'));

    // confirmed: start is called with the form payload
    ctx.fetch.mockReset();
    ctx.fetch.mockResolvedValueOnce(resolveReply());
    swalResults.push({ isConfirmed: true, value: { outcome: 'abortus', ended_on: '2026-03-01', complications: [] } });
    ctx.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: {}, warning: 'peringatan' }) });
    ctx.fetch.mockResolvedValue(ok({ pregnancies: [], totals: {}, riwayat_persalinan: [] }));
    expect(await Card.runAfterSave(state)).toBe('started');
    expect(ctx.fetch.mock.calls[1][0]).toContain('/start');
    expect(JSON.parse(ctx.fetch.mock.calls[1][1].body)).toEqual({ mr_id: 'DRD0005', previous_end: { outcome: 'abortus', ended_on: '2026-03-01', complications: [] } });
    expect(ctx.window.showToast).toHaveBeenCalledWith('info', 'peringatan');
});

test('resolve error is reported without throwing and without opening the form', async () => {
    const { ctx, Card } = context();
    ctx.fetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ success: false, message: 'Bukan kunjungan terbaru' }) });
    expect(await Card.runAfterSave(state)).toBe('resolve_failed');
    expect(ctx.Swal.fire).not.toHaveBeenCalled();
});

test('loss suggestion follows the 20 week rule', () => {
    const { Card } = context();
    expect(Card.lossSuggestion('2026-01-01', '2026-03-01')).toBe('abortus');
    expect(Card.lossSuggestion('2026-01-01', '2026-06-01')).toBe('lahir_mati');
    expect(Card.lossSuggestion(null, '2026-06-01')).toBeNull();
});

test('component sources wire the card, prefill rule and null delivery method', () => {
    const obs = fs.readFileSync(path.join(root, 'obstetri/anamnesa-obstetri.js'), 'utf8');
    expect(obs).toContain('id="pregnancy-history-card"');
    expect(obs).toContain("entry._fromPregnancy ? null : 'Spt B (Spontan)'");
    for (const f of ['gyn_special/anamnesa-gyn_special.js', 'gyn_repro/anamnesa-gyn_repro.js']) {
        expect(fs.readFileSync(path.join(root, f), 'utf8')).toContain("category: 'gyn', readOnly: true");
    }
    const main = fs.readFileSync(path.join(root, '../main.js'), 'utf8');
    expect(main).toContain('window.PregnancyHistoryCard.runAfterSave');
});

function fakeRoot(fields) {
    const els = {
        '#peg-date': { value: fields.date || '' }, '#peg-method': { value: fields.method || '' },
        '#peg-indication': { value: fields.indication || '' }, '#peg-comp-notes': { value: fields.notes || '' },
        '#peg-kuretase': { value: fields.kuretase || '' }, '#peg-year': { value: fields.year || '' },
        '#peg-term': { value: fields.term || '' }
    };
    return {
        querySelector: sel => sel === 'input[name="peg-outcome"]:checked' ? (fields.outcome ? { value: fields.outcome } : null) : (els[sel] || null),
        querySelectorAll: sel => sel === 'input[name="peg-comp"]:checked' ? (fields.comps || []).map(value => ({ value })) : []
    };
}

test('delete button only for external rows', () => {
    const { Card } = context();
    const clinicEnded = Object.assign({}, clinicPregnancy);
    const html = Card.render(state, [clinicEnded, externalOnly]);
    expect(html.match(/data-preg-action="delete"/g)).toHaveLength(1);
    expect(html).toContain('data-preg-action="delete" data-preg-id="3"');
});

test('history change overwrites G/P/A from server totals, initial load does not', () => {
    const { node, Card } = context();
    node('anamnesa-gravida').value = '9';
    Card.prefillTotals({ gravida: 2, para: 1, abortus: 0, anak_hidup: 0 });
    expect(node('anamnesa-gravida').value).toBe('9');
    Card.prefillTotals({ gravida: 2, para: 1, abortus: 0, anak_hidup: 0 }, true);
    expect(node('anamnesa-gravida').value).toBe('2');
    expect(node('anamnesa-anak-hidup').value).toBe('0');
});

test('edit payload sends every editable key with null for cleared values', () => {
    const { Card } = context();
    const { payload } = Card.readEndForm(fakeRoot({ outcome: 'lahir_hidup', date: '2020-05-01', method: 'Spt B (Spontan)', indication: '' }), { edit: true });
    expect(payload.delivery_indication).toBeNull();
    expect(payload.complication_notes).toBeNull();
    expect(payload.kuretase).toBeNull();
    expect(payload.complications).toEqual([]);
    expect(payload.babies).toEqual([]);
});

test('abortus is pre-selected only when GA is under 20 weeks', async () => {
    const { ctx, Card } = context();
    await Card.openEndForm({ hpht: '2026-01-01', values: { ended_on: '2026-05-07' } });
    const html18 = ctx.Swal.fire.mock.calls[0][0].html;
    expect(html18).toContain('value="abortus" checked');
    await Card.openEndForm({ hpht: '2026-01-01', values: { ended_on: '2026-08-06' } });
    const html30 = ctx.Swal.fire.mock.calls[1][0].html;
    expect(html30).not.toMatch(/name="peg-outcome" value="\w+" checked/);
    expect(html30).toContain('≥20 minggu: bila bayi meninggal, catat sebagai Lahir mati');
});

test('#2 birth form has a term select; payload carries term and edits clear it with null', () => {
    const { Card } = context();
    const html = Card.endFormHtml({ external: true, values: { outcome: 'lahir_hidup', term: 'preterm' } });
    expect(html).toContain('id="peg-term"');
    expect(html).toContain('<option value="preterm" selected>Preterm</option>');
    expect(html).toContain('<option value="postterm" >Postterm</option>');
    const { payload } = Card.readEndForm(fakeRoot({ outcome: 'lahir_hidup', year: '2019', method: 'Spt B (Spontan)', term: 'aterm' }), { external: true });
    expect(payload.term).toBe('aterm');
    const edit = Card.readEndForm(fakeRoot({ outcome: 'lahir_hidup', year: '2019', method: 'Spt B (Spontan)' }), { external: true, edit: true }).payload;
    expect(edit.term).toBeNull();
    const loss = Card.readEndForm(fakeRoot({ outcome: 'abortus', date: '2020-01-01', term: 'aterm' }), {}).payload;
    expect(loss.term).toBeUndefined();
});

function loadAnamnesa(swalAnswer) {
    const source = fs.readFileSync(path.join(root, 'obstetri/anamnesa-obstetri.js'), 'utf8')
        .replace('export default {', 'globalThis.Comp = {');
    const ctx = vm.createContext({
        window: {}, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        Swal: { fire: jest.fn(async () => swalAnswer) }, console, Date, AbortController, setTimeout
    });
    vm.runInContext(source, ctx);
    const comp = ctx.Comp;
    comp.renderAllRPCards = jest.fn();
    return { ctx, comp };
}

const freshList = [{ type: 'DELIVERY', tahun: 2019, persalinan: null, metode_persalinan: 'SC (Caesar)', jenis_kelamin: 'L' }];

test('#10 replacing the riwayat asks first when typed entries would be lost; cancel keeps them', async () => {
    const { ctx, comp } = loadAnamnesa({ isConfirmed: false });
    const typed = [{ type: 'ABORTUS', tahun: 2021, kuretase: 'Ya', _id: 1 }];
    comp._rpEntries = typed.slice();
    expect(await comp.replaceRPFromPregnancies(freshList)).toBe(false);
    expect(ctx.Swal.fire).toHaveBeenCalledTimes(1);
    expect(ctx.Swal.fire.mock.calls[0][0].text).toBe('Riwayat yang diketik di kunjungan ini akan diganti dengan riwayat kehamilan. Lanjutkan?');
    expect(comp._rpEntries).toEqual(typed);

    const ok2 = loadAnamnesa({ isConfirmed: true });
    ok2.comp._rpEntries = typed.slice();
    expect(await ok2.comp.replaceRPFromPregnancies(freshList)).toBe(true);
    expect(ok2.comp._rpEntries).toHaveLength(1);
    expect(ok2.comp._rpEntries[0]).toMatchObject({ type: 'DELIVERY', jenis_kelamin: 'Laki-laki', _fromPregnancy: true });
});

test('#10 no question when nothing typed would be lost', async () => {
    const { ctx, comp } = loadAnamnesa({ isConfirmed: false });
    comp._rpEntries = [
        { type: 'DELIVERY', tahun: 2019, _id: 1 },
        { type: 'ABORTUS', tahun: 2015, _fromPregnancy: true, _id: 2 }
    ];
    expect(await comp.replaceRPFromPregnancies(freshList)).toBe(true);
    expect(ctx.Swal.fire).not.toHaveBeenCalled();
});

test('#2 anamnesa keeps an unknown term from the pregnancy table as null', () => {
    const obs = fs.readFileSync(path.join(root, 'obstetri/anamnesa-obstetri.js'), 'utf8');
    expect(obs).toContain("clean.persalinan = entry.persalinan || (entry._fromPregnancy ? null : 'Aterm');");
});

test('cancelling the riwayat replace keeps the typed G/P/A', () => {
    const obs = fs.readFileSync(path.join(root, 'obstetri/anamnesa-obstetri.js'), 'utf8');
    const start = obs.indexOf('onHistoryChanged: async (data) => {');
    const handler = obs.slice(start, obs.indexOf('}', obs.indexOf('prefillTotals', start)) + 1);
    expect(handler).toContain('const replaced = await this.replaceRPFromPregnancies(');
    expect(handler).toContain('if (replaced) Card.prefillTotals(data.totals, true);');
});
