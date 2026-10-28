const { hydrateStaffMessages } = require('../../services/CommunityChatStaffProfile');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');

const dibyaId = 'UDZAQUCQWZ';
const staffAccount = (new_id, name = 'dr. Dibya') => ({
    new_id, name, role_id: ROLE_IDS.DOKTER, role: ROLE_NAMES.DOKTER, is_superadmin: 1
});
const message = (sender_id, sender_type = 'staff') => ({
    sender_id, sender_type, sender_name: 'dr. Dibya', sender_nickname: 'dr. Dibya'
});

test('marks only the verified dr Dibya account, even after its display name changes', async () => {
    const db = { query: jest.fn().mockResolvedValue([[staffAccount(dibyaId, 'Nama Profil Baru'), staffAccount('OTHER-DOCTOR')]]) };
    const rows = await hydrateStaffMessages(db, [message(dibyaId), message('OTHER-DOCTOR')]);
    expect(rows.map(row => row.sender_is_dr_dibya)).toEqual([true, false]);
    expect(rows[0].sender_name).toBe('Nama Profil Baru');
});

test('patient nicknames and forged identity flags cannot receive the dr Dibya highlight', async () => {
    const db = { query: jest.fn() };
    const rows = await hydrateStaffMessages(db, [
        { ...message('PATIENT', 'patient'), sender_is_dr_dibya: true },
        message(dibyaId, 'patient')
    ]);
    expect(rows.map(row => row.sender_is_dr_dibya)).toEqual([false, false]);
    expect(db.query).not.toHaveBeenCalled();
});

test('missing staff account cannot receive the dr Dibya highlight', async () => {
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    const rows = await hydrateStaffMessages(db, [{ ...message(dibyaId), sender_is_dr_dibya: true }]);
    expect(rows[0].sender_is_dr_dibya).toBe(false);
});
