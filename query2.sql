SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('patients','sunday_appointments','sunday_clinic_records','medical_records');
