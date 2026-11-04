/**
 * Staff menu "new" dots: per-staff last-seen vs. newest activity per menu.
 * Sources are declared in config/menu-activity-sources.js.
 */
const { MENU_ACTIVITY_SOURCES, DEFAULT_COLUMNS } = require('../config/menu-activity-sources');

const LATEST_TTL_MS = 30 * 1000;
const COLUMNS_TTL_MS = 10 * 60 * 1000;
const IDENT_RE = /^[a-z0-9_]+$/i;

// Table staff_menu_seen is owned by migrations/20261104_staff_menu_seen.sql
// (no runtime schema mutation, see StaffPanelWave6StartupSchema.test.js).
const MIGRATION_NAME = '20261104_staff_menu_seen.sql';

function isMissingTable(error) {
    return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

function createStaffMenuBadges({ db, sources = MENU_ACTIVITY_SOURCES, logger = console, now = () => Date.now() }) {
    let columnsCache = { at: 0, map: null };
    let latestCache = { at: 0, map: null, pending: null };
    const warned = new Set();

    function warnOnce(key, message) {
        if (warned.has(key)) return;
        warned.add(key);
        logger.warn(`[StaffMenuBadges] ${message}`);
    }

    function sourceTables() {
        const tables = new Set();
        Object.values(sources).forEach(list => list.forEach(src => tables.add(src.table)));
        return [...tables].filter(t => IDENT_RE.test(t));
    }

    async function loadColumns() {
        if (columnsCache.map && now() - columnsCache.at < COLUMNS_TTL_MS) return columnsCache.map;
        const tables = sourceTables();
        const map = new Map();
        if (tables.length) {
            const [rows] = await db.query(
                `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
                   FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
                [tables]
            );
            (rows || []).forEach(row => {
                const t = row.table_name || row.TABLE_NAME;
                const c = row.column_name || row.COLUMN_NAME;
                if (!map.has(t)) map.set(t, new Set());
                map.get(t).add(c);
            });
        }
        columnsCache = { at: now(), map };
        return map;
    }

    function buildSourceSql(src, columns) {
        const existing = columns.get(src.table);
        if (!existing) {
            warnOnce(`table:${src.table}`, `table ${src.table} not found, source skipped`);
            return null;
        }
        const wanted = (src.columns && src.columns.length ? src.columns : DEFAULT_COLUMNS)
            .filter(c => IDENT_RE.test(c) && existing.has(c));
        if (!wanted.length) {
            warnOnce(`cols:${src.table}`, `table ${src.table} has no usable timestamp column, source skipped`);
            return null;
        }
        const alias = src.alias && IDENT_RE.test(src.alias) ? src.alias : null;
        const prefix = alias ? `${alias}.` : '';
        const maxExpr = wanted.map(c => `MAX(${prefix}\`${c}\`)`);
        const select = maxExpr.length === 1 ? maxExpr[0] : `GREATEST(${maxExpr.map(e => `COALESCE(${e}, '1970-01-01')`).join(', ')})`;
        return `SELECT ${select} AS latest FROM \`${src.table}\`${alias ? ` ${alias}` : ''}`
            + `${src.join ? ` ${src.join}` : ''}${src.where ? ` WHERE ${src.where}` : ''}`;
    }

    async function computeLatest() {
        const columns = await loadColumns();
        const result = {};
        await Promise.all(Object.entries(sources).map(async ([navKey, list]) => {
            let latest = null;
            for (const src of list) {
                const sql = buildSourceSql(src, columns);
                if (!sql) continue;
                try {
                    const [rows] = await db.query(sql);
                    const value = rows && rows[0] ? rows[0].latest : null;
                    const time = value ? new Date(value).getTime() : NaN;
                    if (Number.isFinite(time) && time > 0 && (latest === null || time > latest)) latest = time;
                } catch (error) {
                    warnOnce(`query:${navKey}:${src.table}`, `query for ${navKey} (${src.table}) failed: ${error.message}`);
                }
            }
            result[navKey] = latest;
        }));
        return result;
    }

    async function getLatest() {
        if (latestCache.map && now() - latestCache.at < LATEST_TTL_MS) return latestCache.map;
        if (!latestCache.pending) {
            latestCache.pending = computeLatest()
                .then(map => {
                    latestCache = { at: now(), map, pending: null };
                    return map;
                })
                .catch(error => {
                    latestCache.pending = null;
                    throw error;
                });
        }
        return latestCache.pending;
    }

    /** Returns { navKey: boolean } for the given staff user. */
    async function getBadges(userId) {
        const uid = String(userId || '');
        if (!uid) return {};
        let latest;
        let seenRows;
        try {
            [latest, [seenRows]] = await Promise.all([
                getLatest(),
                db.query('SELECT nav_key, seen_at FROM staff_menu_seen WHERE user_id = ?', [uid])
            ]);
        } catch (error) {
            if (!isMissingTable(error)) throw error;
            warnOnce('missing-seen-table', `table staff_menu_seen missing; run migrations/${MIGRATION_NAME}`);
            return Object.fromEntries(Object.keys(sources).map(key => [key, false]));
        }
        const seen = new Map((seenRows || []).map(r => [r.nav_key, new Date(r.seen_at).getTime()]));
        const missing = Object.keys(sources).filter(key => !seen.has(key));
        if (missing.length) {
            // Baseline: a menu never tracked for this staff starts as "seen now",
            // so the rollout (or a new menu) doesn't light up every dot at once.
            const values = missing.map(key => [uid, key]);
            await db.query(
                'INSERT IGNORE INTO staff_menu_seen (user_id, nav_key, seen_at) VALUES '
                    + values.map(() => '(?, ?, NOW())').join(', '),
                values.flat()
            );
        }
        const badges = {};
        Object.keys(sources).forEach(key => {
            const last = latest[key];
            const seenAt = seen.get(key);
            badges[key] = Boolean(seenAt !== undefined && last !== null && last !== undefined && last > seenAt);
        });
        return badges;
    }

    async function markSeen(userId, navKey) {
        const uid = String(userId || '');
        const key = String(navKey || '');
        if (!uid || !Object.prototype.hasOwnProperty.call(sources, key)) return false;
        try {
            await db.query(
                `INSERT INTO staff_menu_seen (user_id, nav_key, seen_at) VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE seen_at = NOW()`,
                [uid, key]
            );
        } catch (error) {
            if (!isMissingTable(error)) throw error;
            warnOnce('missing-seen-table', `table staff_menu_seen missing; run migrations/${MIGRATION_NAME}`);
        }
        return true;
    }

    return { getBadges, markSeen, buildSourceSql, _reset: () => { latestCache = { at: 0, map: null, pending: null }; columnsCache = { at: 0, map: null }; } };
}

module.exports = { createStaffMenuBadges, MIGRATION_NAME };
