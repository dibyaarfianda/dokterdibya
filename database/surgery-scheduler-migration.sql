-- Surgery Scheduler Migration
-- DocBoard extension for OB-GYN surgery scheduling

-- 1. Operation Types Reference Table
CREATE TABLE IF NOT EXISTS surgery_operation_types (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NULL,
    name VARCHAR(150) NOT NULL,
    name_id VARCHAR(150) NULL COMMENT 'Indonesian name',
    category ENUM('obstetri','ginekologi','onkologi_ginekologi') NOT NULL DEFAULT 'ginekologi',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. External Staff (non-dokterdibya staff)
CREATE TABLE IF NOT EXISTS surgery_external_staff (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL DEFAULT 'Asisten' COMMENT 'Operator, Asisten Operator, Dokter Anestesi, Perawat Instrumen, etc',
    phone VARCHAR(20) NULL,
    hospital_affiliation VARCHAR(255) NULL,
    notes TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Surgery Schedules (core table)
CREATE TABLE IF NOT EXISTS surgery_schedules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    -- Patient info
    patient_name VARCHAR(255) NOT NULL,
    patient_age INT NULL,
    patient_id VARCHAR(20) NULL COMMENT 'Link to patients table if available',
    mr_id VARCHAR(20) NULL COMMENT 'DRD number if exists',

    -- Clinical info
    diagnosis TEXT NOT NULL,
    lab_results TEXT NULL,
    radiology_results TEXT NULL,
    usg_results TEXT NULL,

    -- Surgery plan
    operation_type_id INT UNSIGNED NOT NULL,
    operation_type_other VARCHAR(255) NULL COMMENT 'If custom/not in list',
    location ENUM('klinik_private','rsia_melinda','rsud_gambiran','rs_bhayangkara') NOT NULL,
    surgery_date DATE NOT NULL,
    surgery_time TIME NULL,
    estimated_duration_min INT NULL,

    -- Team (JSON array of {id, name, role, is_external})
    team_members JSON NULL,

    -- Status
    status ENUM('planned','confirmed','in_progress','completed','cancelled','postponed') NOT NULL DEFAULT 'planned',
    cancellation_reason TEXT NULL,

    -- Notes
    special_notes TEXT NULL,
    post_op_notes TEXT NULL,

    -- Audit
    created_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (operation_type_id) REFERENCES surgery_operation_types(id),
    INDEX idx_surgery_date (surgery_date),
    INDEX idx_location (location),
    INDEX idx_status (status),
    INDEX idx_date_location (surgery_date, location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- SEED: Operation Types (84 types)
-- =====================================================

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order) VALUES
-- OBSTETRI
('SC', 'Sectio Caesarea', 'Operasi Caesar', 'obstetri', 1),
('SC-EM', 'Emergency Caesarean Section', 'SC Darurat / Cito', 'obstetri', 2),
('SC-EL', 'Elective Caesarean Section', 'SC Terencana / Elektif', 'obstetri', 3),
('ERACS', 'Enhanced Recovery After Caesarean Surgery', 'ERACS', 'obstetri', 4),
('RE-SC', 'Repeat Caesarean Section', 'SC Ulangan', 'obstetri', 5),
('VE', 'Vacuum Extraction', 'Ekstraksi Vakum', 'obstetri', 6),
('EF', 'Extraction Forceps', 'Ekstraksi Forceps / Cunam', 'obstetri', 7),
('EPIO', 'Episiotomy', 'Episiotomi', 'obstetri', 8),
('PR', 'Perineal Repair / Perineorrhaphy', 'Penjahitan Perineum', 'obstetri', 9),
('MRP', 'Manual Removal of Placenta', 'Pengeluaran Plasenta Manual', 'obstetri', 10),
('UE', 'Uterine Exploration Post-partum', 'Eksplorasi Uterus', 'obstetri', 11),
('CERC', 'Cervical Cerclage (McDonald/Shirodkar)', 'Cerclage Serviks', 'obstetri', 12),
('TAC', 'Transabdominal Cerclage', 'Cerclage Transabdominal', 'obstetri', 13),
('PH', 'Peripartum Hysterectomy', 'Histerektomi Peripartum', 'obstetri', 14),
('UIR', 'Uterine Inversion Repair', 'Reposisi Inversio Uteri', 'obstetri', 15),
('URR', 'Uterine Rupture Repair', 'Repair Ruptur Uteri', 'obstetri', 16),
('BLYN', 'B-Lynch Suture', 'Jahitan Kompresi B-Lynch', 'obstetri', 17),
('IIAL', 'Internal Iliac Artery Ligation', 'Ligasi Arteri Iliaka Interna', 'obstetri', 18),
('KET', 'Laparotomy for Ectopic Pregnancy', 'Laparotomi KET', 'obstetri', 19),
('KET-L', 'Laparoscopic Salpingectomy for Ectopic', 'Salpingektomi Laparoskopik KET', 'obstetri', 20),
('SALP-T', 'Salpingostomy (Linear)', 'Salpingostomi', 'obstetri', 21),
('DC-OBS', 'Dilatation & Curettage (Obstetric)', 'Kuretase Obstetri', 'obstetri', 22),
('MVA', 'Manual Vacuum Aspiration / Suction Curettage', 'MVA / Kuretase Hisap', 'obstetri', 23),

-- GINEKOLOGI
('TAH', 'Total Abdominal Hysterectomy', 'Histerektomi Total Abdominal', 'ginekologi', 30),
('STH', 'Subtotal / Supracervical Abdominal Hysterectomy', 'Histerektomi Subtotal Abdominal', 'ginekologi', 31),
('TVH', 'Total Vaginal Hysterectomy', 'Histerektomi Total Vaginal', 'ginekologi', 32),
('SVH', 'Subtotal Vaginal Hysterectomy', 'Histerektomi Subtotal Vaginal', 'ginekologi', 33),
('TLH', 'Total Laparoscopic Hysterectomy', 'Histerektomi Total Laparoskopik', 'ginekologi', 34),
('LAVH', 'Laparoscopic-Assisted Vaginal Hysterectomy', 'LAVH', 'ginekologi', 35),
('BSO', 'Bilateral Salpingo-Oophorectomy', 'Salpingo-Ooforektomi Bilateral', 'ginekologi', 36),
('USO', 'Unilateral Salpingo-Oophorectomy', 'Salpingo-Ooforektomi Unilateral', 'ginekologi', 37),
('TAH-BSO', 'TAH + Bilateral Salpingo-Oophorectomy', 'Histerektomi + BSO', 'ginekologi', 38),
('SO', 'Salpingo-Oophorectomy', 'Salpingo-Ooforektomi', 'ginekologi', 39),
('OOF', 'Oophorectomy', 'Ooforektomi', 'ginekologi', 40),
('SALP', 'Salpingectomy', 'Salpingektomi', 'ginekologi', 41),
('KIST', 'Ovarian Cystectomy', 'Kistektomi Ovarium', 'ginekologi', 42),
('KIST-L', 'Laparoscopic Ovarian Cystectomy', 'Kistektomi Ovarium Laparoskopik', 'ginekologi', 43),
('MIOM', 'Myomectomy (Open/Abdominal)', 'Miomektomi Terbuka', 'ginekologi', 44),
('MIOM-L', 'Laparoscopic Myomectomy', 'Miomektomi Laparoskopik', 'ginekologi', 45),
('MIOM-H', 'Hysteroscopic Myomectomy', 'Miomektomi Histeroskopik', 'ginekologi', 46),
('DC-GYN', 'Dilatation & Curettage (Gynecologic)', 'Kuretase Diagnostik', 'ginekologi', 47),
('POLIP', 'Hysteroscopic Polypectomy', 'Polipektomi Histeroskopik', 'ginekologi', 48),
('EA', 'Endometrial Ablation', 'Ablasi Endometrium', 'ginekologi', 49),
('HSC-D', 'Diagnostic Hysteroscopy', 'Histeroskopi Diagnostik', 'ginekologi', 50),
('HSC-O', 'Operative Hysteroscopy', 'Histeroskopi Operatif', 'ginekologi', 51),
('LAP-D', 'Diagnostic Laparoscopy', 'Laparoskopi Diagnostik', 'ginekologi', 52),
('ADHE', 'Adhesiolysis / Lysis of Adhesions', 'Adhesiolisis', 'ginekologi', 53),
('ENDO', 'Laparoscopic Endometriosis Excision/Ablation', 'Eksisi Endometriosis Laparoskopik', 'ginekologi', 54),
('AC', 'Anterior Colporrhaphy (Cystocele Repair)', 'Kolporafi Anterior', 'ginekologi', 55),
('PC', 'Posterior Colporrhaphy (Rectocele Repair)', 'Kolporafi Posterior', 'ginekologi', 56),
('AP-REP', 'Anterior-Posterior Colporrhaphy', 'Kolporafi Anterior-Posterior', 'ginekologi', 57),
('SACRO', 'Sacrocolpopexy', 'Sakrokolpopeksi', 'ginekologi', 58),
('VVS', 'Vaginal Vault Suspension', 'Suspensi Puncak Vagina', 'ginekologi', 59),
('LEFORT', 'Colpocleisis (LeFort)', 'Kolpokleisis LeFort', 'ginekologi', 60),
('MARS', 'Marsupialization (Bartholin Cyst)', 'Marsupialisasi Kista Bartholin', 'ginekologi', 61),
('BEX', 'Bartholin Cyst Excision', 'Eksisi Kista Bartholin', 'ginekologi', 62),
('IDB', 'Incision & Drainage (Bartholin Abscess)', 'Insisi & Drainase Abses Bartholin', 'ginekologi', 63),
('MOW', 'Tubectomy / Tubal Ligation', 'Tubektomi / MOW', 'ginekologi', 64),
('MOW-L', 'Laparoscopic Tubal Ligation', 'Tubektomi Laparoskopik', 'ginekologi', 65),
('TR', 'Tubal Reanastomosis (Reversal)', 'Rekanalisasi Tuba', 'ginekologi', 66),
('KOLPO', 'Colposcopy with Biopsy', 'Kolposkopi + Biopsi', 'ginekologi', 67),
('KULDO', 'Culdocentesis', 'Kuldosentesis', 'ginekologi', 68),
('IUD', 'IUD Insertion/Removal (including embedded)', 'Pemasangan/Pelepasan IUD', 'ginekologi', 69),
('SEPT', 'Hysteroscopic Septal Resection', 'Reseksi Septum Uterus', 'ginekologi', 70),
('ASHERM', 'Hysteroscopic Adhesiolysis (Asherman)', 'Sinekiolisis Histeroskopik', 'ginekologi', 71),
('TKANU', 'Tubal Cannulation', 'Kanulasi Tuba', 'ginekologi', 72),

-- ONKOLOGI GINEKOLOGI
('RH', 'Radical Hysterectomy (Wertheim)', 'Histerektomi Radikal Wertheim', 'onkologi_ginekologi', 80),
('RH-BPLND', 'Radical Hysterectomy + Bilateral Pelvic LND', 'Histerektomi Radikal + Diseksi KGB Pelvis', 'onkologi_ginekologi', 81),
('LEEP', 'Loop Electrosurgical Excision Procedure', 'LEEP / LLETZ', 'onkologi_ginekologi', 82),
('CKC', 'Cold Knife Conization', 'Konisasi Pisau Dingin', 'onkologi_ginekologi', 83),
('KONI', 'Cervical Conization (Cone Biopsy)', 'Konisasi Serviks', 'onkologi_ginekologi', 84),
('CRYO', 'Cervical Cryotherapy', 'Krioterapi Serviks', 'onkologi_ginekologi', 85),
('VULV-S', 'Simple Vulvectomy', 'Vulvektomi Simpel', 'onkologi_ginekologi', 86),
('VULV-R', 'Radical Vulvectomy', 'Vulvektomi Radikal', 'onkologi_ginekologi', 87),
('VULV-P', 'Partial Vulvectomy / Wide Local Excision', 'Vulvektomi Parsial', 'onkologi_ginekologi', 88),
('VAGIN', 'Vaginectomy', 'Vaginektomi', 'onkologi_ginekologi', 89),
('OMENT', 'Omentectomy', 'Omentektomi', 'onkologi_ginekologi', 90),
('DEBULK', 'Tumor Debulking / Cytoreductive Surgery', 'Debulking Tumor', 'onkologi_ginekologi', 91),
('PLND', 'Pelvic Lymph Node Dissection', 'Diseksi KGB Pelvis', 'onkologi_ginekologi', 92),
('PALND', 'Para-Aortic Lymph Node Dissection', 'Diseksi KGB Para-Aorta', 'onkologi_ginekologi', 93),
('SLN', 'Sentinel Lymph Node Biopsy', 'Biopsi KGB Sentinel', 'onkologi_ginekologi', 94),
('TRACH', 'Radical Trachelectomy', 'Trakelektomi Radikal', 'onkologi_ginekologi', 95),
('PELEX', 'Pelvic Exenteration', 'Eksentrasi Pelvis', 'onkologi_ginekologi', 96);
