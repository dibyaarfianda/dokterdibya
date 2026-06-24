const express = require('express');
const request = require('supertest');

const labResultsRoutes = require('../../routes/lab-results');
const usgPhotosRoutes = require('../../routes/usg-photos');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/lab-results', labResultsRoutes);
    app.use('/api/usg-photos', usgPhotosRoutes);
    return app;
}

describe('medical upload route protection', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test('rejects unauthenticated lab upload before accepting files', async () => {
        const response = await request(app)
            .post('/api/lab-results/upload')
            .attach('files', Buffer.from('fake image'), {
                filename: 'lab.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({ success: false }));
    });

    test('rejects unauthenticated lab interpretation', async () => {
        const response = await request(app)
            .post('/api/lab-results/interpret')
            .send({ files: [{ type: 'image/png', filename: 'lab.png' }] });

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({ success: false }));
    });

    test('rejects unauthenticated lab deletion', async () => {
        const response = await request(app).delete('/api/lab-results/lab.png');

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({ success: false }));
    });

    test('rejects unauthenticated USG upload before accepting files', async () => {
        const response = await request(app)
            .post('/api/usg-photos/upload')
            .attach('files', Buffer.from('fake image'), {
                filename: 'usg.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({ success: false }));
    });

    test('rejects unauthenticated USG deletion', async () => {
        const response = await request(app).delete('/api/usg-photos/usg.png');

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({ success: false }));
    });
});
