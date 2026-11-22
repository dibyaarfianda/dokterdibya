'use strict';

const fs = require('fs');
const path = require('path');
const { resolveBirthCard, MULTI_BIRTH_CARD_MESSAGE } = require('../../services/BirthCardTarget');

function fakeDb(rows) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            return [rows.filter(r => r.patient_id === params[0])];
        }
    };
}

const cards = [
    { id: 11, patient_id: 'P1', photo_r2_key: 'a' },
    { id: 12, patient_id: 'P1', photo_r2_key: null },
    { id: 21, patient_id: 'P2', photo_r2_key: null }
];

describe('resolveBirthCard', () => {
    test('birth_id picks only that card of this patient', async () => {
        expect(await resolveBirthCard(fakeDb(cards), 'P1', '12')).toEqual({ row: cards[1] });
        expect(await resolveBirthCard(fakeDb(cards), 'P1', 11)).toEqual({ row: cards[0] });
    });

    test("another patient's card id is not found", async () => {
        expect(await resolveBirthCard(fakeDb(cards), 'P1', '21')).toEqual({ status: 404, message: 'Kartu kelahiran tidak ditemukan' });
    });

    test('invalid birth_id is 400', async () => {
        for (const bad of ['abc', '0', '-1', '1.5', {}]) {
            expect((await resolveBirthCard(fakeDb(cards), 'P1', bad)).status).toBe(400);
        }
    });

    test('without birth_id: several cards refuse (409), one card is used, none gives null', async () => {
        expect(await resolveBirthCard(fakeDb(cards), 'P1')).toEqual({ status: 409, message: MULTI_BIRTH_CARD_MESSAGE });
        expect(await resolveBirthCard(fakeDb(cards), 'P2', '')).toEqual({ row: cards[2] });
        expect(await resolveBirthCard(fakeDb(cards), 'P3', null)).toEqual({ row: null });
    });

    test('query is scoped to the patient', async () => {
        const db = fakeDb(cards);
        await resolveBirthCard(db, 'P1', '11');
        expect(db.calls[0].sql).toMatch(/WHERE patient_id = \?/);
        expect(db.calls[0].params).toEqual(['P1']);
    });
});

describe('staff birth-card routes act on one card only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/patients.js'), 'utf8');
    function routeBody(marker) {
        const start = src.indexOf(marker);
        expect(start).toBeGreaterThan(-1);
        const next = src.indexOf('\nrouter.', start + marker.length);
        return src.slice(start, next === -1 ? undefined : next);
    }

    test('upsert: update and photo/delete are keyed by the card id, never patient-wide', () => {
        const upsert = routeBody("router.post('/api/patients/:patientId/birth-congratulations',");
        expect(upsert).toMatch(/resolveBirthCard\(/);
        expect(upsert).toMatch(/WHERE id = \? AND patient_id = \?/);
        expect(upsert).not.toMatch(/WHERE patient_id = \?\s*`/);
        expect(upsert).toMatch(/req\.body\.new === true/);
        expect(upsert).toMatch(/child_number/);
        expect(upsert).toMatch(/birth_id: insertResult\.insertId/);

        const photo = routeBody("router.post('/api/patients/:patientId/birth-congratulations/photo'");
        expect(photo).toMatch(/resolveBirthCard\(/);
        expect(photo).toMatch(/UPDATE birth_congratulations SET photo_url = \?, photo_r2_key = \? WHERE id = \? AND patient_id = \?/);

        const del = routeBody("router.delete('/api/patients/:patientId/birth-congratulations'");
        expect(del).toMatch(/resolveBirthCard\(/);
        expect(del).toMatch(/DELETE FROM birth_congratulations WHERE id = \? AND patient_id = \?/);
        expect(del).not.toMatch(/DELETE FROM birth_congratulations WHERE patient_id = \?'/);
    });

    test('staff page sends the card id (edit/photo/delete) and new:true for Tambah', () => {
        const page = fs.readFileSync(path.join(__dirname, '../../../public/scripts/pages/birth-content-page.js'), 'utf8');
        expect(page).toMatch(/birthCongratsData\.set\(String\(item\.id\), item\)/);
        expect(page).toMatch(/data-birth-id="\$\{escapeAttribute\(birthId\)\}"/);
        expect(page).toMatch(/editingBirthId \? \{ birth_id: editingBirthId \} : \{ new: true \}/);
        expect(page).toMatch(/formData\.append\('birth_id', savedBirthId\)/);
        expect(page).toMatch(/\?birth_id=\$\{encodeURIComponent\(birthId\)\}/);
        expect(page).toMatch(/editBirthCongrats\(target\.dataset\.patientId, null, target\.dataset\.birthId \|\| null\)/);
        expect(page).toMatch(/deleteBirthCongrats\(target\.dataset\.patientId, target\.dataset\.birthId \|\| null\)/);
    });
});
