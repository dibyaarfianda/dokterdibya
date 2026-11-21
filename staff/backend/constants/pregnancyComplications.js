'use strict';

const PREGNANCY_COMPLICATIONS = Object.freeze([
    { code: 'preeklamsia', label: 'Preeklamsia/PEB' },
    { code: 'eklamsia', label: 'Eklamsia' },
    { code: 'hipertensi_gestasional', label: 'Hipertensi gestasional' },
    { code: 'dm_gestasional', label: 'DM gestasional' },
    { code: 'hpp', label: 'HPP (perdarahan postpartum)' },
    { code: 'plasenta_previa', label: 'Plasenta previa' },
    { code: 'solusio_plasenta', label: 'Solusio plasenta' },
    { code: 'kpd', label: 'KPD' },
    { code: 'preterm', label: 'Persalinan preterm' },
    { code: 'iugr', label: 'IUGR/PJT' },
    { code: 'kelainan_letak', label: 'Kelainan letak' },
    { code: 'infeksi', label: 'Infeksi' },
    { code: 'lainnya', label: 'Lainnya' }
].map(item => Object.freeze(item)));

module.exports = { PREGNANCY_COMPLICATIONS };
