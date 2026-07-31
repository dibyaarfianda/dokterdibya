let initialized = false;

export function init() {
    if (initialized) return;
    initialized = true;

    let touchStartY = 0;
    let touchEndY = 0;
    const pullIndicator = document.getElementById('pullIndicator');

    document.addEventListener('touchstart', event => {
        if (window.scrollY === 0) touchStartY = event.touches[0]?.clientY || 0;
    }, { passive: true });

    document.addEventListener('touchmove', event => {
        if (window.scrollY !== 0 || touchStartY <= 0 || !pullIndicator) return;
        touchEndY = event.touches[0]?.clientY || 0;
        pullIndicator.classList.toggle('visible', touchEndY - touchStartY > 80);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (window.scrollY === 0 && touchStartY > 0 && touchEndY - touchStartY > 80) {
            if (pullIndicator) {
                pullIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';
            }
            window.setTimeout(() => window.location.reload(), 300);
        }
        touchStartY = 0;
        touchEndY = 0;
        pullIndicator?.classList.remove('visible');
    }, { passive: true });

    document.addEventListener('click', event => {
        const link = event.target?.closest?.('.doc-cta-link');
        if (!link || link.dataset?.promoSrc) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (link.target === '_blank') return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (link.dataset.animating === '1') return;

        link.dataset.animating = '1';
        link.classList.add('is-animating');
        link.style.pointerEvents = 'none';
        window.setTimeout(() => {
            window.location.href = link.href || href;
        }, 760);
    }, true);
}
