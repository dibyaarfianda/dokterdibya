const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer test-staff') {
            return res.status(401).json({ success: false });
        }
        req.user = { id: 'test-staff', name: 'Test Staff' };
        return next();
    }
}));

jest.mock('../../services/aiService', () => ({
    generateDailyGreeting: jest.fn().mockResolvedValue({
        success: true,
        data: { greeting: 'Legacy quote' }
    })
}));

const aiService = require('../../services/aiService');
const app = express();
app.use(require('../../routes/ai'));

test('old Staff clients cannot generate or receive daily AI quotes', async () => {
    const response = await request(app).get('/api/ai/daily-greeting')
        .set('Authorization', 'Bearer test-staff');

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ success: false, code: 'DAILY_GREETING_DISABLED' });
    expect(response.body.data?.greeting).toBeUndefined();
    expect(aiService.generateDailyGreeting).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toContain('no-store');
});

test('retired Staff greeting endpoint still requires authentication', async () => {
    const response = await request(app).get('/api/ai/daily-greeting');
    expect(response.status).toBe(401);
});
