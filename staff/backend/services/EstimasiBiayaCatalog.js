'use strict';
const db = require('../db');
const { MANDATORY_SERVICE_IDS } = require('./EstimasiBiayaDraft');
async function catalogFor(draft) {
    const phases = Object.values(draft.trimesters);
    const read = async (table, fields, ids) => {
        const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
        if (!unique.length) return [];
        const [rows] = await db.query('SELECT ' + fields + ' FROM ' + table + ' WHERE id IN (' + unique.map(() => '?').join(',') + ')', unique);
        return rows;
    };
    const [medications, services, templates] = await Promise.all([
        read('obat', 'id, name, price, unit, is_active', phases.flatMap(p => p.medications.map(i => i.obat_id))),
        read('tindakan', 'id, name, price, category, is_active', [...Object.values(MANDATORY_SERVICE_IDS), ...phases.flatMap(p => p.services.map(i => i.tindakan_id))]),
        read('sunday_clinic_prescription_templates', 'id, is_active', phases.map(p => p.template_id))
    ]);
    return { medications, services, templates: templates.filter(t => Number(t.is_active) === 1) };
}
module.exports = { catalogFor };
