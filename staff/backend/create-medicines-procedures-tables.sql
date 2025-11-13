-- Create medicines table
CREATE TABLE IF NOT EXISTS medicines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_obat VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) DEFAULT NULL,
    stok INT DEFAULT 0,
    satuan VARCHAR(50) DEFAULT NULL,
    harga DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    keterangan TEXT DEFAULT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nama_obat (nama_obat),
    INDEX idx_kategori (kategori),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create procedures table
CREATE TABLE IF NOT EXISTS procedures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_tindakan VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) DEFAULT NULL,
    harga DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    durasi INT DEFAULT NULL COMMENT 'Durasi dalam menit',
    keterangan TEXT DEFAULT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nama_tindakan (nama_tindakan),
    INDEX idx_kategori (kategori),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample medicines data
INSERT INTO medicines (nama_obat, kategori, stok, satuan, harga, keterangan) VALUES
('Paracetamol 500mg', 'Analgesik', 100, 'Tablet', 5000, 'Obat pereda nyeri dan penurun panas'),
('Amoxicillin 500mg', 'Antibiotik', 80, 'Kapsul', 8000, 'Antibiotik untuk infeksi bakteri'),
('OBH Combi', 'Obat Batuk', 50, 'Botol', 15000, 'Obat batuk dan flu'),
('Antasida', 'Obat Maag', 60, 'Tablet', 3000, 'Obat untuk mengurangi asam lambung'),
('Vitamin C 500mg', 'Vitamin', 120, 'Tablet', 2500, 'Suplemen vitamin C'),
('Ibuprofen 400mg', 'Analgesik', 90, 'Tablet', 6000, 'Obat antiinflamasi dan pereda nyeri'),
('CTM 4mg', 'Antihistamin', 75, 'Tablet', 1500, 'Obat alergi'),
('Alkohol 70%', 'Antiseptik', 30, 'Botol', 12000, 'Cairan antiseptik'),
('Betadine', 'Antiseptik', 40, 'Botol', 18000, 'Larutan antiseptik'),
('Kasa Steril', 'Alkes', 100, 'Pack', 5000, 'Kasa steril untuk luka');

-- Insert sample procedures data
INSERT INTO procedures (nama_tindakan, kategori, harga, durasi, keterangan) VALUES
('Konsultasi Umum', 'Konsultasi', 50000, 15, 'Konsultasi dokter umum'),
('Konsultasi Spesialis', 'Konsultasi', 150000, 30, 'Konsultasi dokter spesialis'),
('Pemeriksaan Tekanan Darah', 'Pemeriksaan', 10000, 5, 'Pengukuran tekanan darah'),
('Suntik Vitamin', 'Injeksi', 75000, 10, 'Suntikan vitamin'),
('Infus', 'Injeksi', 100000, 60, 'Pemasangan infus'),
('Perawatan Luka Kecil', 'Perawatan', 30000, 15, 'Pembersihan dan perawatan luka ringan'),
('Perawatan Luka Sedang', 'Perawatan', 75000, 30, 'Pembersihan dan perawatan luka sedang'),
('Jahit Luka', 'Tindakan', 200000, 45, 'Penjahitan luka'),
('Cabut Gigi', 'Gigi', 150000, 30, 'Pencabutan gigi'),
('Tambal Gigi', 'Gigi', 100000, 45, 'Penambalan gigi'),
('Scaling Gigi', 'Gigi', 250000, 60, 'Pembersihan karang gigi'),
('USG', 'Pemeriksaan', 200000, 30, 'Pemeriksaan ultrasonografi'),
('EKG', 'Pemeriksaan', 150000, 20, 'Pemeriksaan elektrokardiogram'),
('Rontgen', 'Pemeriksaan', 100000, 15, 'Pemeriksaan foto rontgen'),
('Tes Darah Lengkap', 'Laboratorium', 80000, 15, 'Pemeriksaan darah lengkap');
