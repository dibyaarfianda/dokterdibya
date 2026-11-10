#!/usr/bin/env node
'use strict';

/**
 * Send one approved WhatsApp template to one phone number (operator smoke test).
 * Usage: node scripts/whatsapp-send-test-template.js <nomor> <janji_h1|janji_belum_konfirmasi|kontrol_h3>
 * Exit codes: 0 sent, 1 skipped/failed, 2 usage error. Never prints tokens.
 */

const DibyaDateTime = require('../../../public/scripts/date-time-format.js');
const { WHATSAPP_TEMPLATES } = require('../config/whatsapp-templates');

function usage(out) {
    const names = Object.keys(WHATSAPP_TEMPLATES).join('|');
    out.error(`Usage: node scripts/whatsapp-send-test-template.js <nomor> <${names}>`);
}

function buildSampleValues(template) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sample = {
        nama: 'Uji Coba',
        tanggal: DibyaDateTime.date(tomorrow, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        jam: '09:00'
    };
    const values = {};
    for (const key of template.params) values[key] = sample[key];
    return values;
}

async function main(argv, deps = {}) {
    const out = deps.out || console;
    const [phone, templateName] = argv || [];
    const template = templateName && Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, templateName)
        ? WHATSAPP_TEMPLATES[templateName]
        : null;
    if (!phone || !template) {
        usage(out);
        return 2;
    }

    const sender = deps.sender || require('../services/WhatsAppTemplateSender').createWhatsAppTemplateSender();
    const result = await sender.send({
        purpose: `test_${templateName}`,
        refType: 'test',
        refId: String(Date.now()),
        patientId: null,
        phone,
        values: buildSampleValues(template)
    });

    out.log(`status=${result.status} reason=${result.reason || '-'} messageId=${result.messageId || '-'}`);
    return result.status === 'sent' ? 0 : 1;
}

module.exports = { main };

if (require.main === module) {
    main(process.argv.slice(2))
        .catch((err) => {
            console.error(`error=${err && err.message ? err.message : 'unknown'}`);
            return 1;
        })
        .then(async (code) => {
            try {
                const pool = require('../db');
                if (pool && typeof pool.end === 'function') await pool.end();
            } catch (_) { /* ignore */ }
            process.exit(code);
        });
}
