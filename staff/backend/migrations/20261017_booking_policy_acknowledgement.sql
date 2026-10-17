-- Historical bookings remain NULL: never invent an acknowledgement for them.
ALTER TABLE sunday_appointments
    ADD COLUMN IF NOT EXISTS booking_policy_acknowledged_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS booking_policy_version VARCHAR(64) NULL;
