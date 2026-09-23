'use strict';
const { TRIMESTERS, validRepeat, calculateEstimate } = require('../../../public/scripts/cost-estimate-engine');
const MANDATORY_SERVICE_IDS = { admin: 1, obstetri: 3, ginekologi: 59 };
const PUBLISHED_KEY = 'pregnancy_cost_estimate_published_v2';
const DRAFT_KEY = 'pregnancy_cost_estimate_staff_draft_v2';
const text = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';
const number = value => value === '' || value == null ? null : Number(value);
function normalizeDraft(input = {}) {
    const aliases = {};
    for (const [id, label] of Object.entries(input.aliases || {})) {
        if (Number.isSafeInteger(Number(id)) && Number(id) > 0) aliases[id] = text(label);
    }
    const trimesters = {};
    TRIMESTERS.forEach(key => {
        const source = input.trimesters?.[key] || {};
        trimesters[key] = {
            template_id: number(source.template_id),
            template_name: text(source.template_name),
            repeats: number(source.repeats === undefined ? 1 : source.repeats),
            medications: (Array.isArray(source.medications) ? source.medications : []).slice(0, 200).map(item => ({
                obat_id: number(item.obat_id), name: text(item.name), quantity: number(item.quantity), unit: text(item.unit)
            })),
            services: (Array.isArray(source.services) ? source.services : []).slice(0, 200).map(item => ({
                tindakan_id: number(item.tindakan_id), quantity: number(item.quantity), repeats: number(item.repeats === undefined ? 1 : item.repeats)
            }))
        };
    });
    return { version: 2, updated_at: input.updated_at || null, aliases, trimesters };
}
function buildPreview(input, catalog, now = new Date()) {
    const draft = normalizeDraft(input);
    const medications = new Map(catalog.medications.map(item => [Number(item.id), item]));
    const services = new Map(catalog.services.map(item => [Number(item.id), item]));
    const mandatoryPrice = (id, label) => {
        const row = services.get(id);
        const ready = !!row && Number(row.is_active) === 1 && row.price != null && row.price !== '' && Number.isFinite(Number(row.price)) && Number(row.price) >= 0;
        return { label, price: ready ? Number(row.price) : null, ready };
    };
    const mandatoryCosts = {
        admin: mandatoryPrice(MANDATORY_SERVICE_IDS.admin, 'Biaya Admin'),
        books: {
            obstetri: mandatoryPrice(MANDATORY_SERVICE_IDS.obstetri, 'Buku Kontrol Obstetri'),
            ginekologi: mandatoryPrice(MANDATORY_SERVICE_IDS.ginekologi, 'Buku Kontrol Ginekologi')
        }
    };
    const templateIds = new Set(catalog.templates.map(item => Number(item.id)));
    const trimesters = {};
    TRIMESTERS.forEach(key => {
        const phase = draft.trimesters[key], issues = [], items = [];
        let medicationReady = true, serviceReady = true;
        if (phase.template_id && !templateIds.has(phase.template_id)) issues.push('Template sumber tidak tersedia. Pilih ulang di pengaturan staff.');
        if (phase.medications.length && !phase.template_id) issues.push('Template sumber belum dipilih.');
        if (!validRepeat(phase.repeats)) issues.push('Jumlah pengulangan resep harus bilangan bulat nol atau lebih.');
        if (issues.length) medicationReady = false;
        const validateItem = (row, master, index, kind) => {
            const prefix = (kind === 'medication' ? 'Obat ' : 'Layanan ') + (index + 1);
            const problems = [];
            if (!master || Number(master.is_active) !== 1) problems.push('item master tidak tersedia atau nonaktif');
            if (!Number.isFinite(row.quantity) || row.quantity <= 0) problems.push('jumlah tidak valid');
            if (!master || master.price == null || master.price === '' || !Number.isFinite(Number(master.price)) || Number(master.price) < 0) problems.push('harga belum tersedia');
            let label = master?.name || '';
            if (kind === 'medication') {
                label = draft.aliases[String(row.obat_id)] || '';
                if (!label) problems.push('nama tampilan belum diisi');
                if (!row.unit || row.unit.toLowerCase() !== text(master?.unit).toLowerCase()) problems.push('satuan resep berbeda dari satuan master; periksa jumlah dan satuan');
            } else {
                if (!['LAYANAN', 'TINDAKAN MEDIS'].includes(master?.category)) problems.push('kategori layanan tidak sesuai');
                if (!validRepeat(row.repeats)) problems.push('pengulangan tidak valid');
            }
            if (problems.length) {
                if (kind === 'medication') medicationReady = false; else serviceReady = false;
                issues.push(prefix + ': ' + problems.join('; ') + '.'); return;
            }
            items.push({ key: key + '-' + kind + '-' + index, kind, label, quantity: row.quantity,
                unit: kind === 'medication' ? row.unit : 'kali', price: Number(master.price),
                repeats: kind === 'medication' ? phase.repeats : row.repeats });
        };
        phase.medications.forEach((row, i) => validateItem(row, medications.get(row.obat_id), i, 'medication'));
        // These charges are calculated once through the mandatory-cost section.
        phase.services.filter(row => !Object.values(MANDATORY_SERVICE_IDS).includes(row.tindakan_id))
            .forEach((row, i) => validateItem(row, services.get(row.tindakan_id), i, 'service'));
        if (!phase.medications.length && !phase.services.length) {
            issues.push('Trimester ini belum dikonfigurasi.');
            medicationReady = false; serviceReady = false;
        }
        trimesters[key] = { repeats: phase.repeats, ready: issues.length === 0, medication_ready: medicationReady, service_ready: serviceReady, issues, items };
    });
    return calculateEstimate({ version: 2, is_dummy: false, prices_loaded_at: now.toISOString(), mandatory_costs: mandatoryCosts,
        configuration_ready: TRIMESTERS.every(key => trimesters[key].ready) && mandatoryCosts.admin.ready && Object.values(mandatoryCosts.books).every(book => book.ready), trimesters });
}
module.exports = { PUBLISHED_KEY, DRAFT_KEY, MANDATORY_SERVICE_IDS, normalizeDraft, buildPreview };
