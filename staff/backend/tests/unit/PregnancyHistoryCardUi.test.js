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
        window: { hasAccountPermission: () => true, getToken: () => 'fake', showToast: jest.fn() },
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
