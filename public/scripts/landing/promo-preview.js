const DEFAULT_PROMO_IMAGE_URL = '../images/antrian-live-promo-fake.png';
const DEFAULT_PROMO_IMAGE_ALT = 'Preview Antrian Live dengan data simulasi';
const CLOSE_ANIMATION_MS = 1000;

let previousBodyOverflow = '';
let previousBodyPaddingRight = '';
let bodyScrollLocked = false;

function getModal() {
    return document.getElementById('queue-promo-modal');
}

function lockBodyScroll() {
    if (bodyScrollLocked) return;

    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    bodyScrollLocked = true;
}

function unlockBodyScroll() {
    if (!bodyScrollLocked) return;

    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
    bodyScrollLocked = false;
}

export function open({ event, trigger } = {}) {
    event?.preventDefault();

    const modal = getModal();
    const modalImage = document.getElementById('queue-promo-modal-img');
    if (!modal || !modalImage) return false;

    if (modal._queuePromoHideTimer) {
        window.clearTimeout(modal._queuePromoHideTimer);
        modal._queuePromoHideTimer = null;
    }

    modalImage.src = trigger?.dataset?.promoSrc || DEFAULT_PROMO_IMAGE_URL;
    modalImage.alt = trigger?.dataset?.promoAlt || DEFAULT_PROMO_IMAGE_ALT;
    modal.classList.add('is-mounted');
    modal.classList.remove('active');
    void modal.offsetWidth;
    window.requestAnimationFrame(() => {
        modal.classList.add('active');
    });
    lockBodyScroll();
    return false;
}

export function close() {
    const modal = getModal();
    if (!modal) return;

    modal.classList.remove('active');
    if (modal._queuePromoHideTimer) {
        window.clearTimeout(modal._queuePromoHideTimer);
    }
    modal._queuePromoHideTimer = window.setTimeout(() => {
        modal.classList.remove('is-mounted');
        modal._queuePromoHideTimer = null;
    }, CLOSE_ANIMATION_MS);
    unlockBodyScroll();
}

export function closeBackdrop({ event, trigger } = {}) {
    if (!event || event.target !== trigger) return;
    close();
}

export function stop({ event } = {}) {
    event?.stopPropagation();
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        close();
    }
});
