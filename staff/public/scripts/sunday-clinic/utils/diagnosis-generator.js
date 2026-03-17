/**
 * Auto-generate obstetric diagnosis text from anamnesa + USG data
 * Called after saveAnamnesa() and saveUSGExam()
 *
 * Output format:
 *   G5 P2112 30 6/7 minggu T/H
 *   Letak Sungsang
 */

export function generateObstetricDiagnosis(state) {
    const anamnesa = state.recordData?.anamnesa || {};
    const usg = state.recordData?.usg || {};
    const t3 = usg.trimester_3 || {};
    const t2 = usg.trimester_2 || {};
    const t1 = usg.trimester_1 || {};

    // --- GPAPAL ---
    const rp = anamnesa.riwayat_persalinan;
    let gravida, aterm, preterm, abortusCount, living;

    if (Array.isArray(rp) && rp.length > 0) {
        aterm = rp.filter(e => e.type === 'DELIVERY' && e.persalinan === 'Aterm').length;
        preterm = rp.filter(e => e.type === 'DELIVERY' && e.persalinan === 'Preterm').length;
        abortusCount = rp.filter(e => e.type === 'ABORTUS').length;
        living = parseInt(anamnesa.anak_hidup) || 0;
        gravida = parseInt(anamnesa.gravida) || 0;
    } else {
        // Fallback: legacy fields, treat all para as aterm
        aterm = parseInt(anamnesa.para) || 0;
        preterm = 0;
        abortusCount = parseInt(anamnesa.abortus) || 0;
        living = parseInt(anamnesa.anak_hidup) || 0;
        gravida = parseInt(anamnesa.gravida) || 0;
    }

    if (!gravida) return null;

    const isPrimigravida = gravida === 1 && aterm === 0 && preterm === 0 && abortusCount === 0 && living === 0;
    const parityStr = isPrimigravida ? 'Primigravida' : `G${gravida} P${aterm}${preterm}${abortusCount}${living}`;

    // --- Gestational Age (optional — omitted if no HPHT) ---
    let gaStr = '';
    const gaMatch = (anamnesa.usia_kehamilan || '').match(/(\d+)\s*minggu\s*(\d+)\s*hari/);
    if (gaMatch) {
        const weeks = parseInt(gaMatch[1]);
        const days = parseInt(gaMatch[2]);
        const fetusCount = t3.fetus_count || t2.fetus_count || t1.embryo_count;
        const fetusStr = fetusCount === 'multiple' ? 'G/H/H' : 'T/H';
        gaStr = ` ${weeks} ${days}/7 minggu ${fetusStr}`;
    }

    // --- Line 1 ---
    let result = parityStr + gaStr;

    // --- Line 2: Presentation (if USG has data) ---
    const presentation = t3.presentation || t2.presentation;
    const fetusLie = t3.fetus_lie || t2.fetus_lie;
    let presentationStr = '';
    if (presentation === 'cephalic') presentationStr = 'Letak Kepala';
    else if (presentation === 'breech') presentationStr = 'Letak Sungsang';
    else if (presentation === 'shoulder' || fetusLie === 'transverse') presentationStr = 'Letak Lintang';

    if (presentationStr) result += '\n' + presentationStr;

    return result;
}
