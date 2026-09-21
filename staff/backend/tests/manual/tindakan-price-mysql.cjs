// Run against a disposable MariaDB database on the deployment host. No patient data.
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');

async function main() {
    const database = process.env.TINDAKAN_TEST_DB;
    assert.match(database || '', /^qa_tindakan_[a-z0-9_]+$/);
    const pool = mysql.createPool({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', database, timezone: '+07:00' });
    require.cache[require.resolve('../../db')] = { exports: pool };
    require.cache[require.resolve('../../middleware/auth')] = { exports: {
        verifyToken: (req, res, next) => next(), requireSuperadmin: (req, res, next) => next()
    } };
    require.cache[require.resolve('../../utils/pdf-generator')] = { exports: {} };
    let server;
    try {
        await pool.query(`CREATE TABLE tindakan (
            id INT PRIMARY KEY, name VARCHAR(255), category VARCHAR(50), price DECIMAL(10,2),
            previous_price DECIMAL(10,2), price_changed_at DATETIME(3), is_active INT DEFAULT 1,
            updated_by VARCHAR(255)) ENGINE=InnoDB`);
        await pool.query("INSERT INTO tindakan(id,name,category,price) VALUES(1,'Test','LAYANAN',110000)");
        const app = express();
        app.use(express.json(), require('../../routes/02-tindakan-api'));
        server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
        const url = `http://127.0.0.1:${server.address().port}/api/tindakan/1`;
        async function save(price, name = 'Test') {
            const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category: 'LAYANAN', price }) });
            assert.equal(res.status, 200, await res.text());
        }
        async function read() { return (await (await fetch(url)).json()).data; }
        await save(140000);
        let row = await read();
        assert.equal(row.price_change.previous_price, 110000);
        assert.equal(row.price_change.direction, 'up');
        assert.equal(row.price_change.expires_at - row.price_change.changed_at, 259200000);
        assert.ok(Math.abs(row.price_change.changed_at - Date.now()) < 5000, 'DB timezone must match server epoch');
        const changed = row.price_change.changed_at;
        await save(140000, 'Renamed');
        row = await read();
        assert.equal(row.name, 'Renamed');
        assert.equal(row.price_change.changed_at, changed);
        assert.equal(row.price_change.previous_price, 110000);
        await save(100000);
        row = await read();
        assert.equal(row.price_change.direction, 'down');
        assert.equal(row.price_change.previous_price, 140000);
        await Promise.all([save(150000), save(175000)]);
        row = await read();
        assert.ok([150000, 175000].includes(Number(row.price)));
        assert.equal(row.price_change.previous_price, Number(row.price) === 150000 ? 175000 : 150000);
        const invalid = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test', category: 'LAYANAN', price: -1 }) });
        assert.equal(invalid.status, 400);
        assert.equal((await read()).price, row.price);
        console.log('PASS: real MariaDB transaction, repeated/no-op edits, timezone, concurrent updates, invalid price');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await pool.end();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
