-- Reclassify future Weekend Clinic bookings created while that session was
-- exempt from attendance confirmation. Historical and non-active rows remain
-- unchanged. The migration is idempotent.

START TRANSACTION;

CREATE TEMPORARY TABLE weekend_confirmation_targets (
    id BIGINT NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO weekend_confirmation_targets (id)
SELECT sa.id
FROM sunday_appointments sa
INNER JOIN booking_settings bs ON bs.session_number = sa.session
WHERE LOWER(TRIM(bs.session_name)) = 'weekend clinic'
  AND sa.appointment_date > CURDATE()
  AND sa.status = 'confirmed'
FOR UPDATE;

SET @weekend_confirmation_selected = (
    SELECT COUNT(*) FROM weekend_confirmation_targets
);

UPDATE sunday_appointments sa
INNER JOIN weekend_confirmation_targets target ON target.id = sa.id
SET sa.status = 'pending_confirmation',
    sa.confirmed_at = NULL,
    sa.confirmation_popup_enabled_at = NULL,
    sa.updated_at = NOW()
WHERE sa.status = 'confirmed';

SET @weekend_confirmation_updated = ROW_COUNT();

SELECT
    @weekend_confirmation_selected AS selected_count,
    @weekend_confirmation_updated AS updated_count;

DROP TEMPORARY TABLE weekend_confirmation_targets;

COMMIT;
