// Read-only operational status for the private clinic hospital monitor.
// Prints configuration, source verification and activation blockers ONLY.
// Patients, events and pending identity rows are deliberately never printed,
// so this output carries no PHI and can be shared in an operations log.
require('dotenv').config();

function format(data) {
    const activation = data.activation;
    const lines = [
        `notifications enabled=${activation.enabled} ready=${activation.ready}`,
        `telegram configured=${data.telegram.configured} connected=${data.telegram.connected}`,
        `monitored hospitals: ${activation.active_facilities.join(', ') || '(none)'}`,
        `skipped hospitals: ${activation.skipped_facilities.join(', ') || '(none)'}`
    ];
    for (const source of data.sources) lines.push(`source ${source.facility}/${source.unit}: verified=${source.verified} status=${source.status} last_success=${source.last_success_at || '(never)'}`);
    lines.push(activation.blockers.length ? `blockers: ${activation.blockers.join(', ')}` : 'no blockers; activation conditions are met');
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
