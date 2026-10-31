const { createPatientInbox } = require('../../services/PatientInbox');

const isPatientUser = user => user.user_type === 'patient';
const patient = { id: 'P2', user_type: 'patient' };
const staff = { id: 'S1', user_type: 'staff' };

const row = (overrides = {}) => ({
    slug: 'direct-S1-P2-abc', direct_patient_id: 'P2', created_at: '2026-10-31 10:00:00',
    patient_name: 'Ibu Contoh', patient_phone: '0812', last_message_id: 9,
    last_message: '[[q:YWJj]]\nKapan kontrol?', last_sender_type: 'patient', last_sender_name: 'Anggota',
    last_message_at: '2026-10-31 11:00:00', unread_count: 2, ...overrides
});

test('patients are scoped to their own direct room and never receive identity fields', async () => {
    const db = { query: jest.fn().mockResolvedValue([[row({ last_sender_type: 'staff', last_sender_name: 'Bidan Ani' })]]) };
    const result = await createPatientInbox({ db }).listConversations(patient, isPatientUser, { search: 'ignored' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('r.direct_patient_id = ?');
    expect(sql).toContain('r.is_direct = 1');
    expect(params).toEqual(['patient', 'P2', 'patient', 'P2']);
    expect(result.conversations[0]).toMatchObject({ last_sender_name: 'Bidan Ani', unread_count: 2, awaiting_reply: false });
    expect(result.conversations[0].patient_name).toBeUndefined();
    expect(result.conversations[0].patient_id).toBeUndefined();
});

test('staff see every direct room, can search, and get awaiting-reply flags', async () => {
    const db = { query: jest.fn().mockResolvedValue([[row(), row({ slug: 'b', last_sender_type: 'staff', unread_count: 0 })]]) };
    const result = await createPatientInbox({ db }).listConversations(staff, isPatientUser, { search: 'Ibu' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('r.direct_patient_id = ?');
    expect(params).toEqual(['staff', 'S1', 'staff', '%Ibu%', '%Ibu%', '%Ibu%']);
    expect(result.conversations[0]).toMatchObject({ patient_name: 'Ibu Contoh', last_message: 'Kapan kontrol?', awaiting_reply: true, last_sender_name: null });
    expect(result).toMatchObject({ unread_total: 2, awaiting_reply: 1 });
});

test('counts: staff badge is shared awaiting-reply, patient badge is own unread staff messages', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([[{ awaiting: 3 }]]).mockResolvedValueOnce([[{ unread: 4 }]]) };
    const inbox = createPatientInbox({ db });
    expect(await inbox.counts(staff, isPatientUser)).toEqual({ awaiting_reply: 3, unread_total: 3 });
    expect(await inbox.counts(patient, isPatientUser)).toEqual({ unread_total: 4, awaiting_reply: 0 });
    expect(db.query.mock.calls[1][1]).toEqual(['P2', 'P2']);
});

test('only staff messages in an active direct room notify the patient inbox', async () => {
    const createPatientNotification = jest.fn().mockResolvedValue({ success: true });
    const inbox = createPatientInbox({ db: {}, createPatientNotification });
    const room = { slug: 'direct-S1-P2-abc', is_direct: 1, is_archived: 0, direct_patient_id: 'P2' };
    await inbox.notifyPatient(room, { message: 'Hasil lab sudah keluar' }, { userType: 'patient' });
    await inbox.notifyPatient({ ...room, is_direct: 0 }, { message: 'x' }, { userType: 'staff' });
    await inbox.notifyPatient({ ...room, is_archived: 1 }, { message: 'x' }, { userType: 'staff' });
    expect(createPatientNotification).not.toHaveBeenCalled();
    await inbox.notifyPatient(room, { message: 'Hasil lab sudah keluar' }, { userType: 'staff' });
    expect(createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 'P2', type: 'direct_message', message: 'Hasil lab sudah keluar',
        link: '/pesan.html?room=direct-S1-P2-abc'
    }));
});
