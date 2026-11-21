const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '../../../public/scripts/sunday-clinic/utils/diagnosis-generator.js');

function load(totalsHolder) {
    const win = {};
    if (totalsHolder) win.__pregnancyHistoryTotals = totalsHolder;
    const ctx = vm.createContext({ window: win, console });
    const source = fs.readFileSync(file, 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace('export function generateObstetricDiagnosis', 'function generateObstetricDiagnosis')
        + '\nglobalThis.gen = generateObstetricDiagnosis;';
    vm.runInContext(source, ctx);
    return ctx.gen;
}

const visitState = {
    recordData: {
        record: { patientId: 'P000000001' },
        anamnesa: {
            gravida: '2', para: '1', abortus: '0', anak_hidup: '1',
            usia_kehamilan: '30 minggu 6 hari',
            riwayat_persalinan: [
                { type: 'DELIVERY', persalinan: 'Aterm', metode_persalinan: 'SC (Caesar)' }
            ]
        },
        usg: {}
    }
};

const holder = (patientId, extra) => ({
    patient_id: patientId,
    totals: Object.assign({ gravida: 5, para: 3, abortus: 1, anak_hidup: 2, aterm: 2, preterm: 1, sc_count: 2 }, extra),
    sc_count: 2
});

test('totals for this patient drive G, P string and Bekas SC', () => {
    const gen = load(holder('P000000001'));
    expect(gen(visitState)).toBe('G5 P2112 30+6 T/H\nBekas SC 2x');
});

test('single previous SC prints plain Bekas SC', () => {
    const h = holder('P000000001'); h.sc_count = 1;
    expect(load(h)(visitState)).toBe('G5 P2112 30+6 T/H\nBekas SC');
});

test('SC count 0 omits Bekas SC even when the visit list has an SC', () => {
    const h = holder('P000000001'); h.sc_count = 0;
    expect(load(h)(visitState)).toBe('G5 P2112 30+6 T/H');
});

test('totals of another patient are ignored (per-visit fallback)', () => {
    expect(load(holder('P000000999'))(visitState)).toBe('G2 P1001 30+6 T/H\nBekas SC');
});

test('no totals keeps the per-visit output', () => {
    expect(load(null)(visitState)).toBe('G2 P1001 30+6 T/H\nBekas SC');
});

test('totals without gravida fall back to the per-visit logic', () => {
    const h = holder('P000000001', { gravida: 0 });
    expect(load(h)(visitState)).toBe('G2 P1001 30+6 T/H\nBekas SC');
});
