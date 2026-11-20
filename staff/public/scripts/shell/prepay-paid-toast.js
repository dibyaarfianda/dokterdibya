/**
 * Bayar di muka (Tahap 2): a small panel toast when a patient's prepay order is paid.
 *
 * Backend: PremiumPaymentService → CheckupPrepayNotifier broadcasts 'checkup_prepay_paid' to
 * staff holding billing.view. The sidebar red dot for "Pembayaran di Muka" is refreshed by
 * shell/menu-new-badges.js on the same event. Panel only: no WhatsApp.
 */

const EVENT = 'checkup_prepay_paid';
const METHOD_LABELS = {
    qris: 'QRIS',
    va_bni: 'VA BNI',
    va_bri: 'VA BRI',
    va_mandiri: 'VA Mandiri',
    va_bca: 'VA BCA'
};

let socketBound = null;
let retryTimer = null;

function formatRupiah(amount) {
    const number = Math.round(Number(amount) || 0);
    return 'Rp ' + number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

export function prepayToastText(event = {}) {
    const method = METHOD_LABELS[event.payment_method] || event.payment_method || 'Duitku';
    return 'Pembayaran di muka diterima: '
        + `${event.patientName || 'Pasien'} ${formatRupiah(event.amount_idr)} (${method})`
        + (event.gateway_mode === 'sandbox' ? ' (uji)' : '');
}

function showToast(event) {
    const toast = document.createElement('div');
    toast.className = 'staff-prepay-toast';
    toast.setAttribute('role', 'status');
    toast.style.cssText = [
        'position:fixed', 'right:16px', 'bottom:88px', 'z-index:2000', 'max-width:340px',
        'background:#14532d', 'color:#fff', 'padding:10px 14px', 'border-radius:10px',
        'box-shadow:0 6px 20px rgba(0,0,0,.18)', 'font-size:13px', 'line-height:1.4', 'cursor:pointer'
    ].join(';');
    // textContent only: the patient name comes from the server.
    toast.textContent = prepayToastText(event);
    toast.addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 10000);
}

function bindSocket() {
    const socket = window.socket;
    if (!socket || socketBound === socket || typeof socket.on !== 'function') return;
    socketBound = socket;
    socket.on(EVENT, event => {
        try { showToast(event || {}); } catch (error) { console.warn('[prepay-toast] failed', error); }
    });
}

export function initPrepayPaidToast() {
    bindSocket();
    // The socket may connect (or reconnect as a new object) after the shell boots.
    if (!retryTimer) retryTimer = setInterval(bindSocket, 30000);
}
