// Home page: fill the "Estimasi Biaya Kunjungan" cards from the public estimate endpoint.
// No login needed; prices come live from the clinic's tindakan prices on the server.
const ENDPOINT = '/api/public/checkup-estimates';

function rupiah(value) {
    return 'Rp' + Number(value).toLocaleString('id-ID');
}

function itemLabel(item) {
    return item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
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

function renderCard(card, estimate, loaded) {
    const amount = card.querySelector('[data-estimate-amount]');
    const items = card.querySelector('[data-estimate-items]');
    const cta = card.querySelector('.ce-cta');

    if (estimate) {
        amount.textContent = rupiah(estimate.amount_idr);
        items.replaceChildren(...estimate.items.map(item => {
            const li = document.createElement('li');
            li.textContent = itemLabel(item);
            return li;
        }));
        card.classList.remove('is-unavailable');
        cta.removeAttribute('aria-disabled');
        cta.removeAttribute('tabindex');
        return;
    }

    amount.textContent = loaded ? 'Estimasi segera tersedia' : 'Hubungi kami untuk estimasi biaya';
    items.replaceChildren();
    card.classList.add('is-unavailable');
    cta.setAttribute('aria-disabled', 'true');
    cta.setAttribute('tabindex', '-1');
}

export async function init() {
    const section = document.getElementById('checkup-estimates');
    if (!section) return;

    section.addEventListener('click', event => {
        const cta = event.target.closest('.ce-cta[aria-disabled="true"]');
        if (cta) event.preventDefault();
    });

    const categories = await fetchEstimates();
    section.querySelectorAll('[data-estimate-card]').forEach(card => {
        const estimate = categories && categories.find(entry => entry.code === card.dataset.estimateCard && entry.ready);
        renderCard(card, estimate || null, Array.isArray(categories));
    });

    // The cards just changed height. Sections below that cache their scroll positions
    // (the sticky "Fitur Portal SW" stack) must re-measure, or their animation starts too early.
    window.dispatchEvent(new CustomEvent('landing:layout-changed', { detail: { source: 'checkup-estimates' } }));
}
