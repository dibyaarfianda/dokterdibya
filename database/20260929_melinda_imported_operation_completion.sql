START TRANSACTION;

CREATE TEMPORARY TABLE melinda_imported_completion_ids AS
SELECT DISTINCT s.id
FROM surgery_schedules s
JOIN surgery_external_refs r ON r.surgery_id = s.id
WHERE r.source_system = 'COMM'
  AND r.facility = 'rsia_melinda'
  AND r.source_key NOT LIKE 'COMM_MANUAL:%'
  AND s.created_by = 'COMM cron'
  AND s.status IN ('planned', 'confirmed', 'postponed')
  AND s.surgery_date <= CURDATE();

INSERT INTO surgery_audit_log (surgery_id, action, user_id, changes)
SELECT id, 'status_changed', 'COMM backfill',
       JSON_OBJECT('status', 'completed', 'source', 'Medify Melinda import')
FROM melinda_imported_completion_ids;

UPDATE surgery_schedules s
JOIN melinda_imported_completion_ids m ON m.id = s.id
SET s.status = 'completed';

DROP TEMPORARY TABLE melinda_imported_completion_ids;

COMMIT;
