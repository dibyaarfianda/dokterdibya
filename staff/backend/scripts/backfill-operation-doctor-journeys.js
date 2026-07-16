const db = require('../db');
const OperationDoctorJourneyService = require('../services/OperationDoctorJourneyService');

async function main() {
  const service = new OperationDoctorJourneyService({ db });
  const result = await service.backfill({
    batchSize: 50,
    concurrency: 2,
    onBatch(progress) {
      process.stdout.write(`Doctor journey backfill batches=${progress.batches} scanned=${progress.scanned} completed=${progress.completed} failed=${progress.failed}\n`);
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .then(() => db.end())
  .catch(async (error) => {
    process.stderr.write(`Doctor journey backfill failed: ${error.message}\n`);
    await db.end().catch(() => {});
    process.exit(1);
  });
