const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function runNode(scriptPath, cwd, env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} exited with ${signal || `code ${code}`}`));
    });
  });
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const commRoot = process.env.COMM_ROOT || path.join(workspaceRoot, 'COMM');
  const backendRoot = process.env.DOKTERDIBYA_BACKEND_ROOT || path.resolve(__dirname, '..');
  const crawlScript = path.join(commRoot, 'server', 'scripts', 'crawl-operation-registrations-until-date.js');
  const backfillScript = path.join(backendRoot, 'scripts', 'backfill-operation-doctor-journeys.js');

  for (const requiredPath of [crawlScript, backfillScript]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`Required rollout script not found: ${requiredPath}`);
  }

  const crawlEnv = {
    ...process.env,
    OPERATION_REGISTRATION_CRAWL_FACILITY: process.env.OPERATION_REGISTRATION_CRAWL_FACILITY || 'gambiran',
    OPERATION_REGISTRATION_CRAWL_BATCH: process.env.OPERATION_REGISTRATION_CRAWL_BATCH || '500',
    OPERATION_REGISTRATION_CRAWL_MIN_DATE: process.env.OPERATION_REGISTRATION_CRAWL_MIN_DATE || '2021-01-01',
    OPERATION_REGISTRATION_CRAWL_OLD_STOP: process.env.OPERATION_REGISTRATION_CRAWL_OLD_STOP || '100',
    OPERATION_REGISTRATION_CRAWL_MAX_BATCHES: process.env.OPERATION_REGISTRATION_CRAWL_MAX_BATCHES || '100',
  };

  process.stdout.write('ROLLOUT_STAGE crawl_start\n');
  await runNode(crawlScript, commRoot, crawlEnv, 'Gambiran registration crawl');
  process.stdout.write('ROLLOUT_STAGE crawl_complete\n');

  process.stdout.write('ROLLOUT_STAGE journey_backfill_start\n');
  await runNode(backfillScript, backendRoot, process.env, 'Doctor journey backfill');
  process.stdout.write('ROLLOUT_STAGE journey_backfill_complete\n');
}

main().catch((error) => {
  process.stderr.write(`ROLLOUT_FATAL ${error.message}\n`);
  process.exit(1);
});
