const fs = require('fs');
const path = require('path');

function validateLinuxRoot(value) {
    if (typeof value !== 'string' || !/^\/[A-Za-z0-9/._-]+$/.test(value) ||
        value.split('/').some(segment => segment === '.' || segment === '..')) {
        throw new Error('Invalid absolute Linux Staff asset root');
    }
    const normalized = path.posix.normalize(value).replace(/\/$/, '');
    if (!normalized) throw new Error('Staff asset root cannot be filesystem root');
    return normalized;
}

function renderStaffAssetNginx({ releaseBase, currentRoot }) {
    const release = validateLinuxRoot(releaseBase);
    const current = validateLinuxRoot(currentRoot);
    if (release === current) throw new Error('Staff release and current roots must differ');
    const templates = path.resolve(__dirname, '../../../deployment/nginx');
    function render(name) {
        const text = fs.readFileSync(path.join(templates, name), 'utf8')
            .replaceAll('__STAFF_RELEASE_BASE__', release)
            .replaceAll('__DOKTERDIBYA_CURRENT_ROOT__', current);
        if (/__[^\s]*__/.test(text)) throw new Error('Unresolved Staff Nginx template token');
        return `${text.replace(/\r\n/g, '\n').trimEnd()}\n`;
    }
    return {
        mapConfig: render('dokterdibya-staff-assets-map.conf.template'),
        locationConfig: render('dokterdibya-staff-assets-location.conf.template')
    };
}

module.exports = { renderStaffAssetNginx };
