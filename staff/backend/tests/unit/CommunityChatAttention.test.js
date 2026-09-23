const attention = require('../../services/CommunityChatAttention');
const room = { id: 1, is_direct: 0 };
const member = { user_id: 'P2', user_type: 'patient', display_name: 'Buna' };
const mention = { user_id: 'P2', user_type: 'patient', start: 3, end: 8 };
test('member selection persists ID and label, with emoji-safe positions', async () => {
    const db = { query: jest.fn(async () => [[member]]) };
    const result = await attention.validateMetadata(db, room, { mentions: [mention] }, 'Hi @Buna');
    expect(result.mentions).toEqual([{ ...mention, label: 'Buna' }]);
    const transformed = attention.convertText(':fire: @Buna', [{ ...mention, start: 7, end: 12 }], text => text.replace(':fire:', '🔥'));
    expect(transformed).toMatchObject({ message: '🔥 @Buna', mentions: [{ start: 3, end: 8 }] });
});
test.each([
    [{ user_id: 'intruder', user_type: 'patient', start: 3, end: 8 }],
    [{ ...mention, start: -1 }],
    [{ ...mention, end: 200 }],
    [{ ...mention, user_type: 'staff' }],
    [mention, mention]
])('rejects nonexistent, mistyped or overlapping identities', async (...items) => {
    await expect(attention.validateMetadata({ query: async () => [[member]] }, room, { mentions: items }, 'Hi @Buna'))
        .rejects.toMatchObject({ status: 400 });
});
test('ordinary text and legacy quotes do not create recipients', async () => {
    const db = { query: jest.fn() };
    expect(await attention.validateMetadata(db, room, {}, '@Buna')).toEqual({ mentions: [], reply: null });
    expect(attention.recipients([], null, { userType: 'patient', userId: 'P1' })).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
});
test('quote recipient is resolved from stored message, not provided sender', async () => {
    const db = { query: jest.fn(async () => [[{ id: 9, sender_id: 'P2', sender_type: 'patient', sender_nickname: 'Buna', message: 'Halo' }]]) };
    const { reply } = await attention.validateMetadata(db, room, { reply_to_message_id: 9, sender_id: 'intruder' }, 'Hai');
    expect(reply).toMatchObject({ id: 9, sender_id: 'P2', sender: 'Buna', text: 'Halo' });
    expect(db.query.mock.calls[0][1]).toEqual([9, 1]);
});
test('missing or cross-room quote is rejected', async () => {
    await expect(attention.validateMetadata({ query: async () => [[]] }, room, { reply_to_message_id: 9 }, 'Hai'))
        .rejects.toMatchObject({ status: 400 });
});
test('mention and quote deduplicate recipients; only identical sender ID AND type is excluded', () => {
    const result = attention.recipients([mention, mention, { user_id: 'P1', user_type: 'staff' }, { user_id: 'P1', user_type: 'patient' }],
        { sender_id: 'P2', sender_type: 'patient' }, { userId: 'P1', userType: 'patient' });
    expect(result.map(item => item.user_type + ':' + item.user_id)).toEqual(['patient:P2', 'staff:P1']);
});
test('no patient name or email fallback when nickname is absent', () => {
    expect(attention.displayName({ userType: 'patient', defaultName: 'Private Name' })).toBe('Anggota');
    expect(attention.displayName({ userType: 'patient', nickname: 'secret@example.test' })).toBe('Anggota');
    expect(attention.displayName({ userType: 'staff', defaultName: 'Dr. Dibya' })).toBe('Dr. Dibya');
});
test('private-room member who no longer has access cannot be mentioned', async () => {
    await expect(attention.validateMetadata({ query: async () => [[member]] },
        { id: 2, is_direct: 1, direct_patient_id: 'P3' }, { mentions: [mention] }, 'Hi @Buna'))
        .rejects.toMatchObject({ status: 400 });
});
