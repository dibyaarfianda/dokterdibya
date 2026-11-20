// Home page: render the "Estimasi Biaya Kunjungan" cards from the active prepay packages.
// No login needed; prices come live from the clinic's tindakan prices on the server.
const ENDPOINT = '/api/public/checkup-estimates';
const PAY_PAGE = '/bayar-estimasi.html?kategori=';
const FALLBACK_TEXT = 'Estimasi segera tersedia. Hubungi klinik untuk informasi biaya.';

const GROUPS = [
    { category: 'obstetri', heading: 'Kehamilan' },
    { category: 'gyn_repro', heading: 'Program Hamil' },
    { category: 'gyn_special', heading: 'Ginekologi' }
];

function rupiah(value) {
    return 'Rp' + Number(value).toLocaleString('id-ID');
}

function itemLabel(item) {
    const quantity = Number(item.quantity) > 1 ? ` ×${item.quantity}` : '';
    const subtotal = Number.isFinite(Number(item.subtotal_idr)) && item.subtotal_idr !== null && item.subtotal_idr !== undefined
        ? ` · ${rupiah(item.subtotal_idr)}`
        : '';
    return `${item.name}${quantity}${subtotal}`;
}

function hasWeek(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function sortKey(value) {
    return hasWeek(value) ? Number(value) : Number.POSITIVE_INFINITY;
}

function compareEstimates(a, b) {
    const byWeek = sortKey(a.week_min) - sortKey(b.week_min);
    if (byWeek !== 0 && !Number.isNaN(byWeek)) return byWeek;
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
}

async function fetchEstimates() {
    try {
        const response = await fetch(`${ENDPOINT}?_t=${Date.now()}`, {
            cache: 'no-store',
            credentials: 'omit',
            headers: { 'Cache-Control': 'no-cache' }
        });
        const data = await response.json();
        return response.ok && data && Array.isArray(data.categories) ? data.categories : null;
    } catch (_error) {
        return null;
    }
}

function buildCard(estimate) {
    const card = document.createElement('article');
    card.className = 'ce-card';
    card.dataset.estimateCode = String(estimate.code);

    const title = document.createElement('h4');
    title.textContent = estimate.name;
    card.appendChild(title);

    if (hasWeek(estimate.week_min) && hasWeek(estimate.week_max)) {
        const weeks = document.createElement('p');
        weeks.className = 'ce-weeks';
        weeks.textContent = `${estimate.week_min}–${estimate.week_max} minggu`;
        card.appendChild(weeks);
    }

    const amount = document.createElement('p');
    amount.className = 'ce-amount';
    amount.textContent = rupiah(estimate.amount_idr);
    card.appendChild(amount);

    const items = document.createElement('ul');
    items.className = 'ce-items';
    (Array.isArray(estimate.items) ? estimate.items : []).forEach(item => {
        const li = document.createElement('li');
        li.textContent = itemLabel(item);
        items.appendChild(li);
    });
    card.appendChild(items);

    const cta = document.createElement('a');
    cta.className = 'ce-cta';
    cta.setAttribute('href', PAY_PAGE + encodeURIComponent(estimate.code));
    cta.textContent = 'Bayar di muka';
    card.appendChild(cta);

    return card;
}

export function renderGroups(container, estimates) {
    container.replaceChildren();
    let rendered = 0;

    GROUPS.forEach(group => {
        const cards = estimates
            .filter(entry => entry && entry.ready && entry.category === group.category)
            .sort(compareEstimates);
        if (!cards.length) return;

        const section = document.createElement('div');
        section.className = 'ce-group';
        section.dataset.estimateGroup = group.category;

        const heading = document.createElement('h3');
        heading.className = 'ce-group-title';
        heading.textContent = group.heading;
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'ce-grid';
        cards.forEach(estimate => grid.appendChild(buildCard(estimate)));
        section.appendChild(grid);

        container.appendChild(section);
        rendered += cards.length;
    });

    return rendered;
}

export async function init() {
    const section = document.getElementById('checkup-estimates');
    if (!section) return;
    const container = section.querySelector('[data-estimate-groups]');
    const fallback = section.querySelector('[data-estimate-fallback]');
    if (!container) return;

    const estimates = await fetchEstimates();
    const rendered = estimates ? renderGroups(container, estimates) : 0;
    if (fallback) {
        fallback.textContent = FALLBACK_TEXT;
        fallback.hidden = rendered > 0;
    }

    // The cards just changed height. Sections below that cache their scroll positions
    // (the sticky "Fitur Portal SW" stack) must re-measure, or their animation starts too early.
    window.dispatchEvent(new CustomEvent('landing:layout-changed', { detail: { source: 'checkup-estimates' } }));
}
