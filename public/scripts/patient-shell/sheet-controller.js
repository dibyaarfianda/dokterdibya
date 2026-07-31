const RUANG_BACA_BADGE_KEY = 'patient_ruang_baca_opened_v1';

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
}

export function createPatientSheetController(options = {}) {
    const menuData = options.menuData || {};

    function hasOpenedRuangBaca() {
        try {
            return localStorage.getItem(RUANG_BACA_BADGE_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    function updateBadges() {
        const isOpened = hasOpenedRuangBaca();
        document.querySelectorAll('[data-ruang-baca-badge]').forEach((badge) => {
            badge.style.display = isOpened ? 'none' : 'grid';
        });
    }

    function markRuangBacaOpened() {
        try {
            localStorage.setItem(RUANG_BACA_BADGE_KEY, '1');
        } catch (error) {}
        updateBadges();
    }

    function open(category) {
        const data = menuData[category];
        const title = document.getElementById('sheet-title');
        const menu = document.getElementById('sheet-menu');
        const overlay = document.getElementById('sheet-overlay');
        const sheet = document.getElementById('bottom-sheet');
        if (!data || !title || !menu || !overlay || !sheet) return;

        if (category === 'edukasi') markRuangBacaOpened();
        title.textContent = data.title;
        menu.innerHTML = data.items.map((item) => (
            '<a class="sheet-item soundable" href="' + escapeHtml(item[2])
            + '" data-shell-action="go" data-shell-href="' + escapeHtml(item[2]) + '">'
            + '<i class="' + escapeHtml(item[0]) + '"></i>'
            + '<span>' + escapeHtml(item[1]) + '</span>'
            + (item[3] ? '<em class="feature-new-badge">' + escapeHtml(item[3]) + '</em>' : '')
            + '</a>'
        )).join('');
        overlay.classList.add('active');
        sheet.classList.add('active');
    }

    function close() {
        document.getElementById('sheet-overlay')?.classList.remove('active');
        document.getElementById('bottom-sheet')?.classList.remove('active');
    }

    return Object.freeze({
        close,
        open,
        updateBadges
    });
}
