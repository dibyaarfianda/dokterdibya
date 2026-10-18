const { renderLabPdf } = require('../../services/lab-report/pdf');

test('an 18-parameter standard report fits two pages including authorization', async () => {
    const panels = [['Darah Lengkap',8],['Fungsi Hati',2],['Fungsi Ginjal',2],['Gula Darah',1],['Golongan Darah',2],['Serologi',3]];
    const parameters = panels.flatMap(([panel,count]) => Array.from({ length:count }, (_,i) => ({ name:`Pemeriksaan ${i+1}`, panel, raw_value:'10.0', unit:'mg/dL', reference:'12.0-15.5' })));
    const buffer = await renderLabPdf({ data: { examined_at:'2026-10-18T10:00', technician:'PETUGAS UJI', license:'IZIN UJI', doctor:'DOKTER UJI', parameters, notes:'DATA FIKTIF UNTUK PENGUJIAN PERANGKAT LUNAK' }, patient: { name:'PASIEN UJI SATU', patient_id:'UJI01', mr_id:'DRDTEST01', birth_date:'1998-01-01' } });
    expect((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeLessThanOrEqual(2);
});
