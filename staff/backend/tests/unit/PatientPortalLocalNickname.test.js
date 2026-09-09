const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

const MIN_PORTAL_NICKNAME_LENGTH = 3;
const MAX_PORTAL_NICKNAME_LENGTH = 40;
const PORTAL_SETTINGS_CACHE_KEY = 'patient_portal_settings';
const PORTAL_NICKNAME_KEY_PREFIX = 'patient_portal_nickname:';

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

function createNicknameHelpers(storage) {
    function normalizePortalNickname(value) {
        return String(value == null ? '' : value).trim();
    }

    function isValidPortalNickname(value) {
        const nickname = normalizePortalNickname(value);
        return nickname.length >= MIN_PORTAL_NICKNAME_LENGTH && nickname.length <= MAX_PORTAL_NICKNAME_LENGTH;
    }

    function readStoredSettingsCache() {
        try {
            return JSON.parse(storage.getItem(PORTAL_SETTINGS_CACHE_KEY) || 'null');
        } catch (error) {
            return null;
        }
    }

    function writeLocalNickname(patientId, nickname) {
        const id = String(patientId || '').trim();
        const value = normalizePortalNickname(nickname);
        if (!id || !isValidPortalNickname(value)) return '';
        storage.setItem(PORTAL_NICKNAME_KEY_PREFIX + id, value);
        return value;
    }

    function readLocalNickname(patientId) {
        const id = String(patientId || '').trim();
        if (id) {
            const keyed = normalizePortalNickname(storage.getItem(PORTAL_NICKNAME_KEY_PREFIX + id));
            if (keyed) return keyed;
        }
        const cached = readStoredSettingsCache();
        const cachedNickname = normalizePortalNickname(cached && cached.nickname);
        if (!cachedNickname) return '';
        const cachedId = String(cached && cached.patient_id || '').trim();
        if (id && cachedNickname && (!cachedId || cachedId === id)) {
            writeLocalNickname(id, cachedNickname);
            return cachedNickname;
        }
        return '';
    }

    function settingsFromCache(cached, patientId) {
        if (!cached) return null;
        const copy = Object.assign({}, cached);
        const cachedId = String(cached.patient_id || '').trim();
        const currentId = String(patientId || '').trim();
        if (!cachedId || (currentId && cachedId !== currentId)) {
            copy.nickname = null;
        }
        return copy;
    }

    function mergePortalSettingsPreserveLocalNickname(current, incoming, patientId) {
        const next = Object.assign({}, current || {}, incoming || {});
        const incomingPatientId = String(next.patient_id || '').trim();
        const currentId = String(patientId || '').trim();
        let incomingNickname = normalizePortalNickname(next.nickname);
        if (incomingNickname && incomingPatientId && currentId && incomingPatientId !== currentId) {
            incomingNickname = '';
        }
        if (incomingNickname && isValidPortalNickname(incomingNickname)) {
            writeLocalNickname(currentId, incomingNickname);
            next.nickname = incomingNickname;
        } else {
            const localNickname = readLocalNickname(currentId);
            next.nickname = localNickname || null;
        }
        next.patient_id = currentId || incomingPatientId || null;
        return next;
    }

    function loadAndMerge(patientId, cached, serverSettings) {
        let portalSettings = { nickname: null, notification_sound: 'default' };
        const safeCache = settingsFromCache(cached, patientId);
        const localNickname = readLocalNickname(patientId);
        if (safeCache) {
            portalSettings = mergePortalSettingsPreserveLocalNickname(portalSettings, safeCache, patientId);
        }
        if (localNickname) {
            portalSettings = mergePortalSettingsPreserveLocalNickname(portalSettings, { nickname: localNickname }, patientId);
        }
        if (serverSettings) {
            portalSettings = mergePortalSettingsPreserveLocalNickname(portalSettings, serverSettings, patientId);
        }
        storage.setItem(PORTAL_SETTINGS_CACHE_KEY, JSON.stringify(portalSettings));
        return portalSettings;
    }

    return {
        isValidPortalNickname,
        writeLocalNickname,
        readLocalNickname,
        loadAndMerge
    };
}

describe('patient portal local nickname', () => {
    test('home shell saves nickname locally before the API and keeps it when the API fails', () => {
        const shell = read('public', 'scripts', 'patient-menu-shell.js');

        expect(shell).toContain("const PORTAL_NICKNAME_KEY_PREFIX = 'patient_portal_nickname:'");
        expect(shell).toContain('function mergePortalSettingsPreserveLocalNickname');
        expect(shell).toContain('function settingsFromCache');
        expect(shell).toContain("applyPortalSettings({ nickname: candidate })");
        expect(shell).toContain('await savePortalNicknameOnly(candidate, portalSettings.notification_sound || \'default\')');
        expect(shell.indexOf('applyPortalSettings({ nickname: candidate })'))
            .toBeLessThan(shell.indexOf('savePortalNicknameOnly(candidate'));
        expect(shell).toContain("showToast('Pengaturan disimpan di perangkat ini')");
        expect(shell).toContain('if (isValidPortalNickname(existingNickname))');
    });

    test('tool shell merges portal settings without overwriting a local nickname with null', () => {
        const shell = read('public', 'scripts', 'patient-tool-shell.js');

        expect(shell).toContain("var PORTAL_NICKNAME_KEY_PREFIX = 'patient_portal_nickname:'");
        expect(shell).toContain('function mergePortalSettingsPreserveLocalNickname');
        expect(shell).toContain('applyPortalSettings(data.settings)');
        expect(shell).not.toMatch(/state\.portalSettings = Object\.assign\(\{\}, state\.portalSettings, data\.settings\)/);
        expect(shell).toContain("showShellToast('Pengaturan disimpan di perangkat ini')");
    });

    test('patient cache version is shared by the home shell, service worker, and tool assets', () => {
        const sw = read('public', 'sw.js');
        const menu = read('public', 'patient-menu.html');
        const toolShell = read('public', 'scripts', 'patient-tool-shell.js');
        const version = sw.match(/const CACHE_VERSION = '([^']+)';/)?.[1];

        expect(version).toBeTruthy();
        expect(menu).toContain(`/scripts/patient-menu-shell.js?v=${version}`);
        expect(menu).toContain(`window.PATIENT_SHELL_VERSION = '${version}'`);
        expect(read('public', 'kick-counter.html')).toContain(`/scripts/patient-tool-shell.js?v=${version}`);
        expect(toolShell).toContain('mergePortalSettingsPreserveLocalNickname');
    });

    test('local nickname survives a null server payload and stays isolated per patient', () => {
        const storage = createMemoryStorage();
        const helpers = createNicknameHelpers(storage);

        helpers.writeLocalNickname('P2026001', 'Bunda');
        const afterReload = helpers.loadAndMerge('P2026001', {
            nickname: null,
            notification_sound: 'default',
            patient_id: 'P2026001'
        }, { nickname: null, notification_sound: 'default' });

        expect(afterReload.nickname).toBe('Bunda');
        expect(helpers.isValidPortalNickname(afterReload.nickname)).toBe(true);
        expect(helpers.readLocalNickname('P2026002')).toBe('');

        const otherPatient = helpers.loadAndMerge('P2026002', afterReload, { nickname: null });
        expect(otherPatient.nickname).toBeNull();
        expect(helpers.readLocalNickname('P2026001')).toBe('Bunda');
    });

    test('legacy unscoped cache nickname migrates once to the current patient', () => {
        const storage = createMemoryStorage();
        const helpers = createNicknameHelpers(storage);
        storage.setItem(PORTAL_SETTINGS_CACHE_KEY, JSON.stringify({
            nickname: 'Nanda',
            notification_sound: 'chime'
        }));

        const migrated = helpers.loadAndMerge('P2026273', JSON.parse(storage.getItem(PORTAL_SETTINGS_CACHE_KEY)), {
            nickname: null
        });

        expect(migrated.nickname).toBe('Nanda');
        expect(storage.getItem(PORTAL_NICKNAME_KEY_PREFIX + 'P2026273')).toBe('Nanda');
        expect(helpers.readLocalNickname('P2026009')).toBe('');
    });
});
