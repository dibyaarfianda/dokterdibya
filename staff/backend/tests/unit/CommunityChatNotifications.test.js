const { createChatNotifications, previewText } = require('../../services/CommunityChatNotifications');

const room = { id: 1, slug: 'lobby', name: 'Lobby', is_direct: 0 };
const sender = { userId: 'P1', userType: 'patient', nickname: 'Buna', defaultName: 'Private name' };
const message = { id: 7, message: 'Halo semuanya' };

test('preview strips legacy quotes, HTML and controls, and truncates safely', () => {
    expect(previewText('[[q:YWJj]]\n<b>Halo</b>\nsemua\u0000')).toBe('Halo semua');
    expect([...previewText('😊'.repeat(160))]).toHaveLength(121);
});

test('settings default off and save only the authenticated patient', async () => {
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    const service = createChatNotifications({ db, push: {} });
    expect(await service.getSettings('P1')).toEqual({ enabled: false });
    await service.setSettings('P1', true);
    expect(db.query.mock.calls[1][1]).toEqual(['P1', 1]);
    await expect(service.setSettings('P1', 'false')).rejects.toMatchObject({ status: 400 });
});

test('ordinary messages push once to enabled joined patients, excluding sender', async () => {
    const db = { query: jest.fn().mockResolvedValue([[{ patient_id: 'P1', enabled: 1, joined: 1 },
        { patient_id: 'P2', enabled: 1, joined: 1 }, { patient_id: 'P2', enabled: 1, joined: 1 },
        { patient_id: 'P3', enabled: 0, joined: 1 },
        { patient_id: 'P5', enabled: 1, joined: 0 }]]) };
    const push = { sendToPatient: jest.fn().mockResolvedValue({ success: true }) };
    await createChatNotifications({ db, push }).notify(room, message, sender);
    expect(push.sendToPatient).toHaveBeenCalledTimes(1);
    expect(push.sendToPatient).toHaveBeenCalledWith('P2', 'Chat Komunitas · Lobby', 'Buna: Halo semuanya',
        expect.objectContaining({ type: 'community_chat', message_id: '7', url: '/community-chat.html?room=lobby&message=7' }));
});

test('direct rooms never push through chat opt-in (patient is sender, staff goes via inbox); archived rooms never push', async () => {
    const db = { query: jest.fn().mockResolvedValue([[{ patient_id: 'P2', enabled: 1, joined: 0 }, { patient_id: 'P3', enabled: 1, joined: 1 }]]) };
    const push = { sendToPatient: jest.fn().mockResolvedValue({ success: true }) };
    const service = createChatNotifications({ db, push });
    await service.notify({ ...room, is_direct: 1, direct_patient_id: 'P2' }, message, { ...sender, userId: 'P2' });
    expect(push.sendToPatient).not.toHaveBeenCalled();
    // Staff direct messages are pushed by the patient inbox notification instead.
    await service.notify({ ...room, is_direct: 1, direct_patient_id: 'P2' }, message, { ...sender, userType: 'staff' });
    expect(push.sendToPatient).not.toHaveBeenCalled();
    push.sendToPatient.mockClear();
    await service.notify({ ...room, is_archived: 1 }, message, sender);
    expect(push.sendToPatient).not.toHaveBeenCalled();
});

test('one failed recipient does not suppress later recipients', async () => {
    const db = { query: jest.fn().mockResolvedValue([[{ patient_id: 'P2', enabled: 1, joined: 1 }, { patient_id: 'P3', enabled: 1, joined: 1 }]]) };
    const push = { sendToPatient: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true }) };
    await createChatNotifications({ db, push }).notify(room, message, sender);
    expect(push.sendToPatient).toHaveBeenCalledTimes(2);
});
