// Optional real-provider smoke. Contains synthetic values only; no database access.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { renderLabPdf } = require('../../services/lab-report/pdf');
const { extractLab } = require('../../services/lab-report/ocr');
const output = process.argv.find(x => x.startsWith('--output='))?.slice(9);
const envPath = process.argv.find(x => x.startsWith('--env='))?.slice(6);
if (!output || !path.isAbsolute(output)) throw new Error('Absolute output directory required');
if (envPath) require('dotenv').config({ path: envPath });
const values = [
    ['hb','Hemoglobin','10.0','g/dL','12.0-15.5','Darah Lengkap'],['rbc','Eritrosit','3.4','10^6/uL','3.5-5.6','Darah Lengkap'],
    ['wbc','Leukosit','9.370','/uL','4000-10000','Darah Lengkap'],['hct','Hematokrit','27.8','%','35-47','Darah Lengkap'],
    ['platelets','Trombosit','338.000','/uL','150000-350000','Darah Lengkap'],['mcv','MCV','82.2','fL','80-97','Darah Lengkap'],
    ['mch','MCH','29.2','pg','26.5-33.5','Darah Lengkap'],['mchc','MCHC','35.2','g/dL','31.5-35.0','Darah Lengkap'],
    ['ast','SGOT','22','U/L','0-35','Fungsi Hati'],['alt','SGPT','18','U/L','0-35','Fungsi Hati'],
    ['bun','BUN','12','mg/dL','','Fungsi Ginjal'],['creatinine','Kreatinin serum (SK)','0.7','mg/dL','','Fungsi Ginjal'],
    ['glucose_random','GDA','104','mg/dL','','Gula Darah'],['blood_group','Golongan darah','O','','','Golongan Darah'],['rhesus','Rhesus','Positif','','','Golongan Darah'],
    ['hbsag','HBsAg','NEGATIF','','NEGATIF','Serologi'],['hiv','HIV','NR','','NON REAKTIF','Serologi'],['syphilis','Sifilis','NR','','NON REAKTIF','Serologi']
];
async function main() {
    fs.mkdirSync(output, { recursive: true });
    const parameters = values.map(([code,name,raw_value,unit,reference,panel]) => ({ code,name,raw_value,unit,reference,panel,origin:'manual',reviewed:true }));
    const data = { examined_at: '2026-10-18T10:00', doctor: 'DOKTER UJI', technician: 'PETUGAS UJI', license: 'IZIN UJI', parameters, notes: 'DATA FIKTIF UNTUK PENGUJIAN PERANGKAT LUNAK' };
    const pdf = await renderLabPdf({ data, patient: { name: 'PASIEN UJI SATU', patient_id: 'UJI01', mr_id: 'DRDTEST01', birth_date:'1998-01-01' }, draft: true });
    fs.writeFileSync(path.join(output, 'ocr-fixture.pdf'), pdf);
    const canvas = createCanvas(1400, 1300); const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,1400,1300); ctx.fillStyle='#193d60'; ctx.font='bold 34px sans-serif'; ctx.fillText('LABORATORIUM - DATA FIKTIF UNTUK UJI',50,65);
    ctx.font='26px sans-serif'; ctx.fillText('Pasien: PASIEN UJI SATU',50,115); ctx.fillText('Tanggal pemeriksaan: 2026-10-18',50,155);
    ctx.font='bold 24px sans-serif'; ['PEMERIKSAAN','HASIL','SATUAN','RUJUKAN'].forEach((v,i)=>ctx.fillText(v,[50,540,760,1000][i],215));
    ctx.font='24px sans-serif'; values.forEach((v,i)=>[v[1],v[2],v[3],v[4]].forEach((cell,j)=>ctx.fillText(cell,[50,540,760,1000][j],265+i*49)));
    const png = canvas.toBuffer('image/png'); fs.writeFileSync(path.join(output, 'ocr-fixture.png'), png);
    if (process.argv.includes('--generate-only')) return console.log(JSON.stringify({ generated: true, parameters: values.length }));
    if (!process.env.OPENAI_API_KEY) throw new Error('Existing OCR provider key is unavailable');
    const checks = [];
    for (const [name, buffer, mimetype] of [['image',png,'image/png'],['pdf',pdf,'application/pdf']]) {
        const result = await extractLab({ files: [{ buffer, mimetype, originalname: `fixture.${name==='image'?'png':'pdf'}` }], patientName:'PASIEN UJI SATU', examinedAt:data.examined_at });
        const found = new Map(result.parameters.map(p=>[p.code,p.raw_value]));
        for (const [code,,raw] of values) assert.equal(found.get(code)?.toLowerCase(), raw.toLowerCase(), `${name}: ${code} exact transcription`);
        assert.ok(result.parameters.every(p=>p.origin==='ocr' && !p.reviewed));
        fs.writeFileSync(path.join(output, `ocr-${name}-result.json`), JSON.stringify(result,null,2));
        checks.push({ input:name, parameters:result.parameters.length, exact_values:values.length, warnings:result.source_warnings.length });
    }
    console.log(JSON.stringify({ success:true, model:process.env.LAB_OCR_MODEL||'gpt-4o', checks }));
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
