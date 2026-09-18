// Run only after reviewing real all-DPJP source coverage and case identities.
// Evidence reference is an operational report filename, never PHI or credentials.
require('dotenv').config();
const { getService } = require('../services/clinicMonitorRuntime');
const [facility, unit, verifiedBy, evidenceRef] = process.argv.slice(2);
(async () => {
    try {
        await getService().verifySource(facility, unit, { verified_by: verifiedBy, evidence_ref: evidenceRef });
        process.stdout.write('Source verification recorded. Notification activation still requires all six sources and explicit enable.\n');
    } catch (_) { process.stderr.write('Source verification failed; provide facility, IGD|RI, operator and reviewed evidence reference.\n'); process.exitCode = 1; }
    finally { await require('../db').end(); }
})();
