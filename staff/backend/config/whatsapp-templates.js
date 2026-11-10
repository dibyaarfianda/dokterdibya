// Meta WhatsApp template registry. Names/param order must match the templates
// approved in WhatsApp Manager (see spec section 6).
const WHATSAPP_TEMPLATES = Object.freeze({
    janji_h1: Object.freeze({
        name: 'janji_h1',
        language: 'id',
        params: Object.freeze(['nama', 'tanggal', 'jam'])
    }),
    janji_belum_konfirmasi: Object.freeze({
        name: 'janji_belum_konfirmasi',
        language: 'id',
        params: Object.freeze(['nama', 'jam'])
    }),
    kontrol_h3: Object.freeze({
        name: 'kontrol_h3',
        language: 'id',
        params: Object.freeze(['nama', 'tanggal'])
    })
});

// "test_" prefix is stripped so test sends use the same template but a distinct
// purpose (and therefore a distinct idempotency key).
function resolveTemplate(purpose) {
    if (typeof purpose !== 'string') return null;
    const base = purpose.replace(/^test_/, '');
    return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, base)
        ? WHATSAPP_TEMPLATES[base]
        : null;
}

function buildBodyComponents(template, values = {}) {
    const parameters = template.params.map((key) => {
        const raw = values[key];
        const text = raw === undefined || raw === null ? '' : String(raw).trim();
        if (!text) throw new Error(`missing_param:${key}`);
        return { type: 'text', text };
    });
    return [{ type: 'body', parameters }];
}

module.exports = { WHATSAPP_TEMPLATES, resolveTemplate, buildBodyComponents };
