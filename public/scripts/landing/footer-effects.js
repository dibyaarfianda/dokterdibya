let initialized = false;

export function init() {
    if (initialized) return;
    initialized = true;

    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    let ticking = false;

    function updateFooterParallax() {
        ticking = false;
        const frame = footer.querySelector('.footer-card-frame') || footer;
        const rect = frame.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const startTop = viewportHeight;
        const endTop = Math.max(0, viewportHeight - rect.height);
        const rawProgress = (startTop - rect.top) / Math.max(1, startTop - endTop);
        let progress = Math.max(0, Math.min(1, rawProgress));
        progress = progress * progress * (3 - (2 * progress));

        footer.style.setProperty('--footer-progress', progress.toFixed(3));
        footer.style.setProperty('--footer-shift-photo', (-200 + (106 * progress)).toFixed(2) + 'px');
        footer.style.setProperty('--footer-shift-a', '0.00px');
        footer.style.setProperty('--footer-shift-b', '0.00px');
        footer.style.setProperty('--footer-shift-c', '0.00px');
        footer.style.setProperty('--footer-shift-d', '0.00px');
    }

    function scheduleFooterParallax() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateFooterParallax);
    }

    window.addEventListener('scroll', scheduleFooterParallax, { passive: true });
    window.addEventListener('resize', scheduleFooterParallax, { passive: true });
    scheduleFooterParallax();
    window.setTimeout(scheduleFooterParallax, 180);

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                document.body.classList.toggle('footer-visible', entry.isIntersecting);
            });
        }, { root: null, threshold: 0.01, rootMargin: '0px 0px -40px 0px' });
        observer.observe(footer);
    }
}
