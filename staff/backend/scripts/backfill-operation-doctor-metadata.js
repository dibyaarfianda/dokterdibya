const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../db');
const operationData = require('../services/OperationDataService');

async function main() {
  const facility = process.env.OPERATION_DOCTOR_BACKFILL_FACILITY || process.argv[2] || 'gambiran';
  const limit = parseInt(process.env.OPERATION_DOCTOR_BACKFILL_LIMIT || process.argv[3] || '100', 10);
  const maxBatches = parseInt(process.env.OPERATION_DOCTOR_BACKFILL_MAX_BATCHES || process.argv[4] || '20', 10);

  const totals = {
    facility,
    batches: 0,
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let batch = 0; batch < maxBatches; batch++) {
    const result = await operationData.backfillDoctorMetadataFromPayload({ facility, limit });
    totals.batches += 1;
    totals.scanned += result.scanned;
    totals.updated += result.updated;
    totals.skipped += result.skipped;
    totals.errors.push(...result.errors);

    console.log(JSON.stringify({
      batch: batch + 1,
      ...result,
    }));

    if (result.scanned === 0 || result.updated === 0) break;
  }

  console.log(JSON.stringify(totals, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.end === 'function') {
      await db.end().catch(() => {});
    }
  });
