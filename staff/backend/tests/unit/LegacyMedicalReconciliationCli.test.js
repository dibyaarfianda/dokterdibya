'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const script = path.resolve(__dirname, '../../scripts/reconcile-legacy-medical-records.js');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const { writePublicReceipt } = require('../../scripts/reconcile-legacy-medical-records');

test('CLI fails closed before database access and never echoes identifier-bearing backup or manifest paths', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const marker = 'TEST-PATIENT-SECRET-NEVER-PRINT';
    const missingBackup = path.join(directory, `${marker}.sql.gz`);
    const manifest = path.join(directory, `${marker}-manifest.json`);
    try {
        const result = spawnSync(process.execPath, [script, '--backup', missingBackup,
            '--backup-sha256', hash('synthetic'), '--manifest', manifest], { encoding: 'utf8', timeout: 10000 });
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('BACKUP_UNAVAILABLE');
        expect(result.stderr).not.toContain(marker);
        expect(result.stderr).not.toContain(directory);
        expect(fs.existsSync(manifest)).toBe(false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('apply CLI requires exact manifest hash and confirmation phrase before DB access', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const backup = path.join(directory, 'synthetic.sql');
    const manifest = path.join(directory, 'synthetic-manifest.json');
    fs.writeFileSync(backup, 'synthetic backup');
    try {
        const result = spawnSync(process.execPath, [script, '--apply', '--backup', backup,
            '--backup-sha256', hash('synthetic backup'), '--manifest', manifest],
        { encoding: 'utf8', timeout: 10000 });
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('APPLY_CONFIRMATION_REQUIRED');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('public receipt publication cannot overwrite a destination won by another writer', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const file = path.join(directory, 'receipt.json');
    const rename = fs.renameSync, link = fs.linkSync;
    const competitor = () => { if (!fs.existsSync(file)) fs.writeFileSync(file, 'competing receipt'); };
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => { competitor(); return rename(from, to); });
    const linkSpy = jest.spyOn(fs, 'linkSync').mockImplementation((from, to) => { competitor(); return link(from, to); });
    try {
        expect(() => writePublicReceipt(file, { counts: { safe: 3 } })).toThrow('RECEIPT_EXISTS');
        expect(fs.readFileSync(file, 'utf8')).toBe('competing receipt');
        expect(fs.readdirSync(directory)).toEqual(['receipt.json']);
    } finally {
        linkSpy.mockRestore(); renameSpy.mockRestore();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
