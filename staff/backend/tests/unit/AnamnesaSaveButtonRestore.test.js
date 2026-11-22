'use strict';

// The Private Clinic anamnesa save restores its button as soon as the anamnesa is saved,
// before the pregnancy step (which can open the "Lengkapi kehamilan sebelumnya" dialog).

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'sunday-clinic', 'main.js'),
    'utf8'
);

describe('anamnesa save button', () => {
    test('is restored after the save and before the pregnancy step', () => {
        const saved = source.indexOf("this.showSuccess('Anamnesa berhasil disimpan!');");
        const pregnancy = source.indexOf('await window.PregnancyHistoryCard.runAfterSave(', saved);
        expect(saved).toBeGreaterThan(-1);
        expect(pregnancy).toBeGreaterThan(saved);
        const between = source.slice(saved, pregnancy);
        expect(between).toContain('btn.disabled = false;');
        expect(between).toContain("btn.innerHTML = '<i class=\"fas fa-save\"></i> Simpan';");
    });

    test('the duplicate-save guard is still released only in finally', () => {
        const start = source.indexOf("this.showSuccess('Anamnesa berhasil disimpan!');");
        const fin = source.indexOf('} finally {', start);
        expect(source.slice(start, fin)).not.toContain('this._savingAnamnesa = false');
        expect(source.slice(fin, fin + 80)).toContain('this._savingAnamnesa = false');
    });
});
