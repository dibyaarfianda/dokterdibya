const fs = require('fs');
const path = require('path');
const { createStaffMenuBadges } = require('../../services/StaffMenuBadges');
const { MENU_ACTIVITY_SOURCES } = require('../../config/menu-activity-sources');

const SOURCES = {
    'nav-a': [{ table: 'tbl_a' }],
    'nav-b': [{ table: 'tbl_b', columns: ['created_at'] }],
    'nav-missing': [{ table: 'tbl_missing' }],
    'nav-broken': [{ table: 'tbl_broken' }]
};

function fakeDb({ seen = [], latest = {} } = {}) {
    const store = new Map(seen.map(r => [`${r.user_id}|${r.nav_key}`, r.seen_at]));
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        calls.push(sql);
        if (/CREATE TABLE/.test(sql)) return [[]];
        if (/information_schema/.test(sql)) {
            return [[
                { table_name: 'tbl_a', column_name: 'created_at' },
                { table_name: 'tbl_a', column_name: 'updated_at' },
                { table_name: 'tbl_b', column_name: 'created_at' },
                { table_name: 'tbl_broken', column_name: 'created_at' }
            ]];
        }
        if (/FROM `tbl_broken`/.test(sql)) throw new Error('boom');
        const m = sql.match(/FROM `(tbl_[a-z]+)`/);
        if (m) return [[{ latest: latest[m[1]] || null }]];
        if (/SELECT nav_key, seen_at FROM staff_menu_seen/.test(sql)) {
            return [[...store.entries()]
                .filter(([k]) => k.startsWith(`${params[0]}|`))
                .map(([k, v]) => ({ nav_key: k.split('|')[1], seen_at: v }))];
        }
        if (/INSERT IGNORE INTO staff_menu_seen/.test(sql)) {
            for (let i = 0; i < params.length; i += 2) {
                const key = `${params[i]}|${params[i + 1]}`;
                if (!store.has(key)) store.set(key, new Date('2026-11-04T10:00:00'));
            }
            return [{}];
        }
        if (/ON DUPLICATE KEY UPDATE/.test(sql)) {
            store.set(`${params[0]}|${params[1]}`, new Date('2026-11-04T12:00:00'));
            return [{}];
        }
        return [[]];
    });
    return { query, calls, store };
}

const quiet = { warn: jest.fn() };

test('first call baselines every menu as seen (no dots on rollout)', async () => {
    const db = fakeDb({ latest: { tbl_a: new Date('2026-11-04T09:00:00') } });
    const svc = createStaffMenuBadges({ db, sources: SOURCES, logger: quiet });
    const badges = await svc.getBadges('U1');
    expect(badges).toEqual({ 'nav-a': false, 'nav-b': false, 'nav-missing': false, 'nav-broken': false });
    expect(db.store.size).toBe(4);
});

test('activity newer than seen_at lights the dot; marking seen clears it', async () => {
    const db = fakeDb({
        seen: Object.keys(SOURCES).map(k => ({ user_id: 'U1', nav_key: k, seen_at: new Date('2026-11-04T08:00:00') })),
        latest: { tbl_a: new Date('2026-11-04T09:00:00'), tbl_b: new Date('2026-11-04T07:00:00') }
    });
    const svc = createStaffMenuBadges({ db, sources: SOURCES, logger: quiet });
    expect(await svc.getBadges('U1')).toMatchObject({ 'nav-a': true, 'nav-b': false });

    expect(await svc.markSeen('U1', 'nav-a')).toBe(true);
    expect(await svc.getBadges('U1')).toMatchObject({ 'nav-a': false });
});

test('seen state is per staff member', async () => {
    const db = fakeDb({
        seen: [
            ...Object.keys(SOURCES).map(k => ({ user_id: 'U1', nav_key: k, seen_at: new Date('2026-11-04T08:00:00') })),
            ...Object.keys(SOURCES).map(k => ({ user_id: 'U2', nav_key: k, seen_at: new Date('2026-11-04T08:00:00') }))
        ],
        latest: { tbl_a: new Date('2026-11-04T09:00:00') }
    });
    const svc = createStaffMenuBadges({ db, sources: SOURCES, logger: quiet });
    await svc.markSeen('U1', 'nav-a');
    expect((await svc.getBadges('U1'))['nav-a']).toBe(false);
    expect((await svc.getBadges('U2'))['nav-a']).toBe(true);
});

test('missing tables and failing queries are skipped, never thrown', async () => {
    const db = fakeDb();
    const logger = { warn: jest.fn() };
    const svc = createStaffMenuBadges({ db, sources: SOURCES, logger });
    await expect(svc.getBadges('U1')).resolves.toMatchObject({ 'nav-missing': false, 'nav-broken': false });
    expect(logger.warn).toHaveBeenCalled();
});

test('only existing timestamp columns are used', () => {
    const svc = createStaffMenuBadges({ db: fakeDb(), sources: SOURCES, logger: quiet });
    const columns = new Map([['tbl_a', new Set(['created_at', 'updated_at'])], ['tbl_b', new Set(['created_at'])]]);
    expect(svc.buildSourceSql({ table: 'tbl_a' }, columns)).toContain('GREATEST(');
    expect(svc.buildSourceSql({ table: 'tbl_b' }, columns)).toBe('SELECT MAX(`created_at`) AS latest FROM `tbl_b`');
    expect(svc.buildSourceSql({ table: 'tbl_b', columns: ['nope'] }, columns)).toBeNull();
});

test('unknown nav keys cannot be marked seen', async () => {
    const svc = createStaffMenuBadges({ db: fakeDb(), sources: SOURCES, logger: quiet });
    expect(await svc.markSeen('U1', 'nav-evil')).toBe(false);
    expect(await svc.markSeen('', 'nav-a')).toBe(false);
});

test('every sidebar menu in index-adminlte.html has an activity source (global rule)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../../public/index-adminlte.html'), 'utf8');
    const start = html.indexOf('nav-sidebar');
    const end = html.indexOf('</nav>', start);
    const sidebar = html.slice(start, end);
    const ids = [...sidebar.matchAll(/<li[^>]*\bid="([^"]+)"[^>]*>\s*<a[^>]*data-(?:staff-call|shell-action)=/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThan(40);
    const missing = ids.filter(id => !MENU_ACTIVITY_SOURCES[id]);
    expect(missing).toEqual([]);
});
