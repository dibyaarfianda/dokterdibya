const express = require('express');
const request = require('supertest');
const attach = require('../../routes/community-chat-notifications');
const { createChatNotifications } = require('../../services/CommunityChatNotifications');
const { isPatientAllowedRoute } = require('../../security/patientRouteAccess');

function fixture() {
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    const app = express();
    app.use(express.json());
    const router = express.Router();
    attach(router, {
        verifyToken(req, res, next) {
            if (!req.headers.authorization) return res.sendStatus(401);
            req.user = { id: 'P1', user_type: req.headers.authorization === 'staff' ? 'staff' : 'patient' };
            next();
        },
        isPatientUser: user => user.user_type === 'patient',
        chatNotifications: createChatNotifications({ db, push: {} })
    });
    // Include the production patient route boundary, not just the feature router.
    app.use('/api/community-chat', (req, res, next) => {
        if (req.headers.authorization === 'patient' && !isPatientAllowedRoute(req.method, req.originalUrl)) return res.sendStatus(403);
        next();
    }, router);
    return { app, db };
}

test('settings require authentication and reject staff', async () => {
    const { app, db } = fixture();
    expect((await request(app).get('/api/community-chat/me/notifications')).status).toBe(401);
    expect((await request(app).get('/api/community-chat/me/notifications').set('Authorization', 'staff')).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
});
test('saves only own patient setting and strictly rejects malformed booleans', async () => {
    const { app, db } = fixture();
    const loaded = await request(app).get('/api/community-chat/me/notifications').set('Authorization', 'patient');
    expect(loaded.status).toBe(200);
    expect(loaded.body.settings.enabled).toBe(false);
    db.query.mockClear();
    const saved = await request(app).put('/api/community-chat/me/notifications').set('Authorization', 'patient').send({ enabled: true, patient_id: 'P2' });
    expect(saved.status).toBe(200);
    expect(saved.body.settings.enabled).toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual(['P1', 1]);
    db.query.mockClear();
    expect((await request(app).put('/api/community-chat/me/notifications').set('Authorization', 'patient').send({ enabled: 'false' })).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
});

test('notification preference access does not open other methods or staff chat routes', () => {
    expect(isPatientAllowedRoute('POST', '/api/community-chat/me/notifications')).toBe(false);
    expect(isPatientAllowedRoute('DELETE', '/api/community-chat/me/notifications')).toBe(false);
    expect(isPatientAllowedRoute('PUT', '/api/community-chat/me/notifications/other-patient')).toBe(false);
    expect(isPatientAllowedRoute('POST', '/api/community-chat/direct-rooms')).toBe(false);
});

jest.mock('../../routes/patient-notifications', () => ({ createPatientNotification: jest.fn().mockResolvedValue({ success: true }) }));
test('mention/quote inbox notification explicitly suppresses its old push dispatch', async () => {
    const attention = require('../../services/CommunityChatAttention');
    const patientNotifications = require('../../routes/patient-notifications');
    await attention.notify({ slug: 'lobby', name: 'Lobby' }, { id: 7 },
        { userId: 'P1', userType: 'patient', nickname: 'Buna' }, [{ user_id: 'P2', user_type: 'patient', reason: 'mention' }]);
    expect(patientNotifications.createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({ patient_id: 'P2', send_push: false }));
});
