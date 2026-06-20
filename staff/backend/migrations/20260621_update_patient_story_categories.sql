ALTER TABLE patient_stories
    MODIFY category ENUM(
        'kehamilan',
        'persalinan',
        'program_hamil',
        'pemulihan',
        'lainnya',
        'kesuburan',
        'penyakit_kandungan'
    ) NOT NULL DEFAULT 'kehamilan';

UPDATE patient_stories
SET category = CASE
    WHEN category = 'program_hamil' THEN 'kesuburan'
    WHEN category = 'lainnya' THEN 'penyakit_kandungan'
    ELSE 'kehamilan'
END
WHERE category IN ('persalinan', 'program_hamil', 'pemulihan', 'lainnya');

ALTER TABLE patient_stories
    MODIFY category ENUM('kehamilan', 'kesuburan', 'penyakit_kandungan') NOT NULL DEFAULT 'kehamilan';
