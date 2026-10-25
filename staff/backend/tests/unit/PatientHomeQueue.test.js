const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PatientQueueView = require('../../../../public/scripts/patient-queue-view');
const BookingBreakDisplay = require('../../../../public/scripts/booking-break-display');

const source = fs.readFileSync(path.resolve(__dirname, '../../../../public/scripts/patient-menu-shell.js'), 'utf8');
const functions = source.slice(source.indexOf('        function getQueueStatusLabel('), source.indexOf('        function initializeLiveQueueHome('));

function setup({ visible = true, status = 200, success = true, booking = { session: 2, slot_number: 7 } } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, { textContent: '', innerHTML: '', hidden: false, style: {},
                classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) } });
        }
        return elements.get(id);
    };
    const settings = { success: true, is_queue_visible: visible, doctor_arrived: false, is_on_break: false };
    const queue = { success, my_booking: booking, data: [
        { session: 2, session_label: 'Siang', slot_number: 7, queue_position: 1, slot_time: '14:00', masked_name: 'A***', queue_status: 'menunggu' }
    ] };
    const fetch = jest.fn(async url => ({ ok: url.includes('/settings') || status === 200,
        status: url.includes('/settings') ? 200 : status,
        json: async () => url.includes('/settings') ? settings : queue }));
    const ctx = vm.createContext({ document: { visibilityState: 'visible', getElementById: element },
        getToken: () => 'synthetic-local-only', fetch, Date, PatientQueueView, BookingBreakDisplay,
        escapeHtml: value => String(value), requestAnimationFrame: fn => fn(), updateHomeActionGap() {},
        queueBusy: false, queuePending: false });
    vm.runInContext(functions, ctx);
    return { ctx, element, settings, queue, fetch };
}

test('booked patient sees their own slot above the home content, including while queue is closed', async () => {
    const { ctx, element, fetch } = setup({ visible: false });
    await ctx.loadLiveQueueHome();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(element('live-queue-home-section').classList.contains('show')).toBe(true);
    expect(element('live-queue-my-booking').textContent).toContain('7');
    expect(element('live-queue-empty').textContent).toContain('belum dibuka');
    expect(element('live-queue-home-list').innerHTML).not.toContain('A***');
    expect(element('live-queue-meta').hidden).toBe(true);
});

test('open queue shows personal slot and current doctor state', async () => {
    const { ctx, element, settings } = setup();
    settings.doctor_arrived = true;
    await ctx.loadLiveQueueHome();
    expect(element('live-queue-home-section').classList.contains('show')).toBe(true);
    expect(element('live-queue-my-booking').textContent).toContain('7');
    expect(element('live-queue-my-booking').textContent).toContain('14:00');
    expect(element('live-queue-doctor-status').innerHTML).toContain('sudah datang');
    expect(element('live-queue-home-list').innerHTML).toContain('live-queue-number">7<');
    expect(element('live-queue-meta').hidden).toBe(false);
});

test.each([{ status: 403 }, { status: 401 }, { success: false }, { booking: null }])('removes stale home queue when access/booking is no longer valid: %j', async options => {
    const { ctx, element } = setup(options);
    element('live-queue-home-section').classList.add('show');
    await ctx.loadLiveQueueHome();
    expect(element('live-queue-home-section').classList.contains('show')).toBe(false);
});

test('doctor states have distinct backgrounds hooks and break takes precedence over arrival', () => {
    expect(typeof PatientQueueView.renderDoctorStatusHtml).toBe('function');
    const waiting = PatientQueueView.renderDoctorStatusHtml({ doctor_arrived: false });
    const arrived = PatientQueueView.renderDoctorStatusHtml({ doctor_arrived: true });
    const rest = PatientQueueView.renderDoctorStatusHtml({ doctor_arrived: true, is_on_break: true });
    expect(waiting).toContain('patient-doctor-status--waiting');
    expect(waiting).toContain('belum datang');
    expect(arrived).toContain('patient-doctor-status--arrived');
    expect(arrived).toContain('sudah datang');
    expect(rest).toContain('patient-doctor-status--break');
    expect(rest).toContain('sedang istirahat');
    expect(rest).not.toContain('sudah datang');
});
