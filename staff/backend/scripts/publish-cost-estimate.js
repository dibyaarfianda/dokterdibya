// Run explicitly after the clinician has approved the staff draft.
require('dotenv').config({ quiet: true });
const db = require('../db');
const crypto = require('crypto');
const { DRAFT_KEY, PUBLISHED_KEY, normalizeDraft, buildPreview } = require('../services/EstimasiBiayaDraft');
const { catalogFor } = require('../services/EstimasiBiayaCatalog');
(async () => {
    try {
        const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [DRAFT_KEY]);
        if (!rows.length) throw new Error('Draft is missing');
        const raw = rows[0].setting_value;
        const draft = normalizeDraft(JSON.parse(raw));
        if (!buildPreview(draft, await catalogFor(draft)).configuration_ready) throw new Error('Draft configuration is incomplete');
        const published = { ...draft, published_at: new Date().toISOString() };
        // Publish only the exact version just validated, without writing to the draft.
        const [result] = await db.query('INSERT INTO settings (setting_key, setting_value, description) SELECT ?, ?, ? FROM settings WHERE setting_key = ? AND setting_value = ? ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [PUBLISHED_KEY, JSON.stringify(published), 'Approved patient cost estimate snapshot', DRAFT_KEY, raw]);
        if (!result.affectedRows) throw new Error('Draft changed during publication; review again');
        console.log(JSON.stringify({ published: true, fingerprint: crypto.createHash('sha256').update(JSON.stringify(draft)).digest('hex'), trimesters: Object.keys(draft.trimesters) }));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { await db.end(); }
})();
