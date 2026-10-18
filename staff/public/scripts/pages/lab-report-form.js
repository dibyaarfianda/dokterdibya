export function mergeOcrCandidates(current, candidates) {
    const result = current.map(row => ({ ...row }));
    candidates.forEach(candidate => {
        const index = result.findIndex(row => row.code === candidate.code);
        if (index < 0) result.push({ ...candidate, reviewed: false });
        else if (!result[index].raw_value) result[index] = { ...candidate, note: result[index].note || '', reviewed: false };
    });
    return result;
}
export function statusLabel(report) {
    if (!report.published_version) return 'Draf';
    return Number(report.version) === Number(report.published_version) ? 'Terbit' : 'Ada koreksi';
}
export function removeLabSource(parameters, sourceId) {
    return parameters.map(parameter => parameter.source_id === sourceId ? { ...parameter, source_id: '', reviewed: false } : { ...parameter });
}
export function sameLabContext(report, visit, options) {
    if (options.reportId) return Number(report?.id) === Number(options.reportId);
    if (options.mrId) return visit?.mr_id === options.mrId && (!options.patientId || visit?.patient_id === options.patientId);
    return true;
}
export function mergeSourceWarnings(existing = [], incoming = []) { return [...new Set([...existing, ...incoming])]; }
export function labSourceBytes(...groups) { return groups.flat().reduce((sum, source) => sum + Number(source.size || 0), 0); }
export function labPrincipal(token, user) {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(part));
        if (!claims.id || claims.user_type !== 'staff' || (user?.id && String(user.id) !== String(claims.id))) return '';
        return `staff:${claims.id}`;
    } catch (_) { return ''; }
}
export function currentWib() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = key => parts.find(p => p.type === key).value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export const PANELS = {
    'Darah Lengkap': [['hb','Hemoglobin','g/dL'],['rbc','Eritrosit','10^6/uL'],['wbc','Leukosit','/uL'],['hct','Hematokrit','%'],['platelets','Trombosit','/uL'],['mcv','MCV','fL'],['mch','MCH','pg'],['mchc','MCHC','g/dL']],
    'Fungsi Hati': [['ast','SGOT / AST','U/L'],['alt','SGPT / ALT','U/L']],
    'Fungsi Ginjal': [['bun','BUN','mg/dL'],['creatinine','Kreatinin serum (SK)','mg/dL']],
    'Gula Darah': [['glucose_random','GDA','mg/dL']],
    'Golongan Darah': [['blood_group','Golongan darah',''],['rhesus','Rhesus','']],
    'Serologi': [['hbsag','HBsAg',''],['hiv','HIV',''],['syphilis','Sifilis','']]
};
