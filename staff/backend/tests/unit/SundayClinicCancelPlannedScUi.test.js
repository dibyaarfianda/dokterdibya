const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/planned-sc.js'), 'utf8')
    .replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const schedule = { id: 91, surgery_date: '2027-01-05', surgery_time: '16:00', location: 'rsia_melinda', status: 'planned', operation: 'SC + IUD' };

function fixture() {
    const state = { currentMrId: 'DRD200', activeSection: 'plan' };
    const button = { disabled: false, dataset: { cancelPlannedSc: '91' }, addEventListener: jest.fn() };
    const panel = { innerHTML: '', hidden: true, querySelectorAll: () => [button] };
    const root = { isConnected: true, dataset: { planningMrId: 'DRD200' }, querySelector: () => panel };
    const storage = new Map();
    const window = { Swal: { fire: jest.fn().mockResolvedValue({ isConfirmed: true, value: 'Pilihan pasien berubah' }) },
        localStorage: { setItem: jest.fn((key, value) => storage.set(key, value)) }, showSundayClinicNotice: jest.fn() };
    const apiClient = { request: jest.fn().mockResolvedValue({ success: true, data: [] }) };
    const hasPermission = jest.fn().mockResolvedValue(true);
    const context = { DibyaDateTime: require('../../../../public/scripts/date-time-format'), apiClient, stateManager: { getState: () => state }, hasPermission,
        window, Date, Math, escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
    vm.runInNewContext(source, context);
    return { ...context, state, button, panel, root, storage };
}

test('shows and binds cancellation only with the DocBoard scheduling grant', async () => {
    const f = fixture();
    f.apiClient.request.mockResolvedValue({ success: true, data: [schedule] });
    await f.loadPlannedSc(f.state, f.root);
    expect(f.panel.innerHTML).toContain('Batalkan rencana SC');
    expect(f.button.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    f.hasPermission.mockResolvedValue(false);
    await f.loadPlannedSc(f.state, f.root);
    expect(f.panel.innerHTML).not.toContain('data-cancel-planned-sc');
});

test('an explicit cancellation sends the exact DRD/schedule and reason, refreshes the card, and invalidates DocBoard', async () => {
    const f = fixture();
    f.apiClient.request.mockResolvedValueOnce({ success: true, data: { id: 91, status: 'cancelled' } })
        .mockResolvedValueOnce({ success: true, data: [] });
    await f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    expect(f.apiClient.request).toHaveBeenNthCalledWith(1, '/api/sunday-clinic/records/DRD200/planned-sc/91/cancel',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Pilihan pasien berubah' }) }));
    expect(f.apiClient.request.mock.calls[1][1].method).toBe('GET');
    expect(f.panel.hidden).toBe(true);
    expect(JSON.parse(f.storage.get('docboard_schedule_revision_v1'))).toMatchObject({ surgery_id: '91', revision: expect.any(String) });
    expect(f.window.showSundayClinicNotice).toHaveBeenCalledWith('success', expect.stringContaining('DocBoard'));
    expect(f.button.disabled).toBe(false);
    expect(f.apiClient.request.mock.calls.some(([url]) => /medical-records/.test(url))).toBe(false);
});

test.each(['dismiss', 'empty reason', 'no grant', 'patient changed during confirmation'])('%s prevents any clinical write', async mode => {
    const f = fixture();
    if (mode === 'dismiss') f.window.Swal.fire.mockResolvedValue({ isConfirmed: false });
    if (mode === 'empty reason') f.window.Swal.fire.mockResolvedValue({ isConfirmed: true, value: '  ' });
    if (mode === 'no grant') f.hasPermission.mockResolvedValue(false);
    if (mode === 'patient changed during confirmation') f.window.Swal.fire.mockImplementation(async () => {
        f.state.currentMrId = 'DRD201'; return { isConfirmed: true, value: 'Alasan' };
    });
    await f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    expect(f.apiClient.request).not.toHaveBeenCalled();
    expect(f.button.disabled).toBe(false);
});

test('a double click cannot submit cancellation twice while confirmation is pending', async () => {
    const f = fixture();
    let confirm;
    f.window.Swal.fire.mockReturnValue(new Promise(resolve => { confirm = resolve; }));
    const first = f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    expect(f.window.Swal.fire).toHaveBeenCalledTimes(1);
    confirm({ isConfirmed: false });
    await first;
    expect(f.apiClient.request).not.toHaveBeenCalled();
});

test('an uncertain POST response is never retried automatically or reported as successful', async () => {
    const f = fixture();
    f.apiClient.request.mockRejectedValueOnce(new Error('Network interrupted'));
    await f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    expect(f.apiClient.request).toHaveBeenCalledTimes(1);
    expect(f.window.showSundayClinicNotice).toHaveBeenCalledWith('warning', expect.stringContaining('belum dapat dipastikan'));
    expect(f.window.localStorage.setItem).not.toHaveBeenCalled();
});

test('a committed cancellation with failed list refresh reports the saved result distinctly', async () => {
    const f = fixture();
    f.apiClient.request.mockResolvedValueOnce({ success: true, data: { id: 91, status: 'cancelled' } })
        .mockRejectedValueOnce(new Error('Refresh unavailable'));
    await f.cancelPlannedSc(f.state, f.root, schedule, f.button);
    expect(f.window.showSundayClinicNotice).toHaveBeenCalledWith('warning', expect.stringContaining('tersimpan'));
    expect(f.window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(f.panel.innerHTML).toContain('Jadwal rencana SC belum termuat');
});
