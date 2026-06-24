const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('obstetri clinical component TODO completion', () => {
    test('USG obstetri save delegates persistence to the existing Sunday Clinic save flow', () => {
        const usg = readNormalizedFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'obstetri',
            'usg-obstetri.js'
        );

        expect(usg).not.toContain('// TODO: Send to API');
        expect(usg).toContain('if (state && typeof state.saveRecord === \'function\')');
        expect(usg).toContain("await state.saveRecord('usg', data)");
        expect(usg).toContain('persistResult.success === false');
    });

    test('anamnesa obstetri collects and mutates dynamic pregnancy and medication lists', () => {
        const anamnesa = readNormalizedFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'obstetri',
            'anamnesa-obstetri.js'
        );

        expect(anamnesa).not.toContain('previousPregnancies: [] // TODO: Collect from dynamic list');
        expect(anamnesa).not.toContain('return []; // TODO: Collect from dynamic list');
        expect(anamnesa).not.toContain('// TODO: Add new pregnancy entry');
        expect(anamnesa).not.toContain('// TODO: Remove pregnancy entry');
        expect(anamnesa).not.toContain('// TODO: Add new medication entry');
        expect(anamnesa).not.toContain('// TODO: Remove medication entry');

        expect(anamnesa).toContain('collectPreviousPregnancies()');
        expect(anamnesa).toContain('collectMedicationList()');
        expect(anamnesa).toContain('function renderPreviousPregnancyEntries()');
        expect(anamnesa).toContain('function renderMedicationEntries()');
        expect(anamnesa).toContain('window.addPreviousPregnancy = function()');
        expect(anamnesa).toContain('window.removePreviousPregnancy = function(index)');
        expect(anamnesa).toContain('window.addMedication = function()');
        expect(anamnesa).toContain('window.removeMedication = function(index)');
    });
});
