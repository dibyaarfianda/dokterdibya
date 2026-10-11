const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const generatorFile = path.resolve(
    __dirname,
    '../../../public/scripts/sunday-clinic/utils/diagnosis-generator.js'
);

function generateDiagnosis(state) {
    const source = fs.readFileSync(generatorFile, 'utf8');
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const runner = `
        const { generateObstetricDiagnosis } = await import(process.env.DIAGNOSIS_MODULE_URL);
        const state = JSON.parse(process.env.DIAGNOSIS_STATE);
        process.stdout.write(JSON.stringify(generateObstetricDiagnosis(state)));
    `;

    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', runner], {
        encoding: 'utf8',
        env: {
            ...process.env,
            DIAGNOSIS_MODULE_URL: moduleUrl,
            DIAGNOSIS_STATE: JSON.stringify(state)
        }
    }));
}

describe('Sunday Clinic obstetric diagnosis generator', () => {
    test('writes primigravida gestational age as weeks plus days followed by T/H', () => {
        const diagnosis = generateDiagnosis({
            recordData: {
                anamnesa: {
                    gravida: '1',
                    para: '0',
                    abortus: '0',
                    anak_hidup: '0',
                    usia_kehamilan: '36 minggu 5 hari'
                }
            }
        });

        expect(diagnosis).toBe('Primigravida 36+5 T/H');
    });

    test('keeps the Gx Pxxxx parity formula before the new gestational-age notation', () => {
        const diagnosis = generateDiagnosis({
            recordData: {
                anamnesa: {
                    gravida: '3',
                    para: '1',
                    abortus: '1',
                    anak_hidup: '1',
                    usia_kehamilan: '28 minggu 0 hari'
                }
            }
        });

        expect(diagnosis).toBe('G3 P1011 28+0 T/H');
    });
});
