-- Add trigger to decrement MR counter when record is deleted
-- WARNING: This is NOT standard medical practice
-- Medical records should maintain sequence gaps for audit trails
-- Use this only if business requirements specifically demand it

USE dibyaklinik;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS decrement_mr_counter_on_delete;

DELIMITER $$

CREATE TRIGGER decrement_mr_counter_on_delete
AFTER DELETE ON sunday_clinic_records
FOR EACH ROW
BEGIN
    -- Only decrement if this was the latest record in the sequence
    DECLARE latest_sequence INT;

    -- Get the current counter for this category
    SELECT current_sequence INTO latest_sequence
    FROM sunday_clinic_mr_counters
    WHERE category = OLD.mr_category;

    -- Only decrement if the deleted record was the last one created
    -- This prevents gaps from being "filled" which would cause ID reuse
    IF OLD.mr_sequence = latest_sequence THEN
        UPDATE sunday_clinic_mr_counters
        SET current_sequence = current_sequence - 1
        WHERE category = OLD.mr_category
        AND current_sequence > 0;
    END IF;
END$$

DELIMITER ;

SELECT 'Trigger created: decrement_mr_counter_on_delete' AS status;
