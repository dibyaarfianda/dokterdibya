// Read-only operational status for the private clinic hospital monitor.
// Prints configuration, source verification and activation blockers ONLY.
// Patients, events and pending identity rows are deliberately never printed,
// so this output carries no PHI and can be shared in an operations log.
require('dotenv').config();

function tally(rows, key) {
    const counts = {};
    for (const row of rows) { const value = row[key] || 'unknown'; counts[value] = (counts[value] || 0) + 1; }
    // Codepoint order, not localeCompare: the tally must read identically on every
    // machine regardless of the ICU data the runtime happens to ship.
    return Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([value, count]) => `${value}=${count}`).join(', ') || '(none)';
}

function format(data) {
    const activation = data.activation;
    const lines = [
        `notifications enabled=${activation.enabled} ready=${activation.ready}`,
        `telegram configured=${data.telegram.configured} connected=${data.telegram.connected}`,
        `monitored hospitals: ${activation.active_facilities.join(', ') || '(none)'}`,
        `skipped hospitals: ${activation.skipped_facilities.join(', ') || '(none)'}`
    ];
    for (const source of data.sources) lines.push(`source ${source.facility}/${source.unit}: verified=${source.verified} status=${source.status} last_success=${source.last_success_at || '(never)'}`);
    // Configuration being clear does not mean patients are being matched. A source
    // can report ok for days while every patient it returns fails identity matching,
    // so print the outcome tallies next to the blockers. Counts and reason labels
    // only: never a name, birth date or hospital MR.
    const episodes = data.patients || [];
    lines.push(`episodes: ${episodes.length} total, ${episodes.filter(e => e.active).length} active, ${episodes.filter(e => e.discharge_at).length} discharged, ${episodes.filter(e => e.identity_conflict).length} identity conflict`);
    lines.push(`events by type: ${tally(data.events || [], 'event_type')}`);
    lines.push(`unmatched patients by reason: ${tally(data.pending_matches || [], 'reason')}`);
    lines.push(activation.blockers.length ? `blockers: ${activation.blockers.join(', ')}` : 'no activation blockers; this does not prove patients are being matched, so read the tallies above');
    return `${lines.join('\n')}\n`;
}

if (require.main === module) {
    (async () => {
        try {
            process.stdout.write(format(await require('../services/clinicMonitorRuntime').getService().dashboard()));
        } catch (error) {
            process.stderr.write(error.message === 'MONITOR_SCHEMA_NOT_READY'
                ? 'Monitor schema not ready; apply database/clinic-hospital-monitor-migration.sql after a backup.\n'
                : 'Monitor status unavailable; check database access and monitor configuration.\n');
            process.exitCode = 1;
        } finally {
            await require('../db').end();
        }
    })();
}

module.exports = { format };
