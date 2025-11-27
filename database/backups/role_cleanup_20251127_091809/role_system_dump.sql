/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.13-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: dibyaklinik
-- ------------------------------------------------------
-- Server version	10.11.13-MariaDB-0ubuntu0.24.04.1-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `is_system` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_role_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES
(1,'dokter','Dokter','Medical doctor with full clinical and administrative access',1,'2025-11-04 18:33:13','2025-11-22 19:55:46'),
(2,'admin','Administrator','Administrative access to most system features',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(3,'doctor','Dokter','Medical staff with patient care and clinical permissions',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(4,'nurse','Perawat','Nursing staff with limited clinical permissions',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(5,'receptionist','Resepsionis','Front desk staff for appointments and registration',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(6,'pharmacist','Apoteker','Pharmacy staff for medication management',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(7,'managerial','Managerial','Managerial staff for administrative and operational tasks',1,'2025-11-04 18:33:13','2025-11-22 19:55:58'),
(8,'viewer','Viewer','Read-only access to system data',1,'2025-11-04 18:33:13','2025-11-04 18:33:13'),
(19,'manager','Front Manager','Jobdesc:\n- Penjadwalan pasien\n- Stok awal, penjualan, stok pulang\n- Isi data awal pasien\n- Terima resep dan menyiapkan obat\n- Kasir',0,'2025-11-05 17:49:58','2025-11-05 17:49:58'),
(20,'doctorassistant','Asisten Dokter','Jobdesc:\n- Memilah obstetri/ginekologi\n- Anamnesa\n- Pemeriksaan fisik umum\n- Mempersiapkan kebutuhan tindakan medis (USG, VT, Stripping, Pap smear, dll)\n- Membantu mencatat hasil USG, surat keterangan, dll',0,'2025-11-05 17:54:43','2025-11-05 21:35:27'),
(21,'observer','Observer',NULL,0,'2025-11-05 18:03:39','2025-11-05 18:03:39'),
(22,'bidan','Bidan','Midwife with obstetric care and patient support responsibilities',1,'2025-11-22 19:56:12','2025-11-22 19:56:12');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_role_permission` (`role_id`,`permission_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=763 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES
(436,2,7,'2025-11-07 02:03:09'),
(437,2,8,'2025-11-07 02:03:09'),
(438,2,6,'2025-11-07 02:03:09'),
(439,2,26,'2025-11-07 02:03:09'),
(440,2,28,'2025-11-07 02:03:09'),
(441,2,27,'2025-11-07 02:03:09'),
(442,2,25,'2025-11-07 02:03:09'),
(443,2,23,'2025-11-07 02:03:09'),
(444,2,24,'2025-11-07 02:03:09'),
(445,2,22,'2025-11-07 02:03:09'),
(446,2,1,'2025-11-07 02:03:09'),
(447,2,16,'2025-11-07 02:03:09'),
(448,2,17,'2025-11-07 02:03:09'),
(449,2,15,'2025-11-07 02:03:09'),
(450,2,40,'2025-11-07 02:03:09'),
(451,2,21,'2025-11-07 02:03:09'),
(452,2,20,'2025-11-07 02:03:09'),
(453,2,3,'2025-11-07 02:03:09'),
(454,2,4,'2025-11-07 02:03:09'),
(455,2,2,'2025-11-07 02:03:09'),
(456,2,10,'2025-11-07 02:03:09'),
(457,2,11,'2025-11-07 02:03:09'),
(458,2,9,'2025-11-07 02:03:09'),
(459,2,19,'2025-11-07 02:03:09'),
(460,2,18,'2025-11-07 02:03:09'),
(461,2,30,'2025-11-07 02:03:09'),
(462,2,29,'2025-11-07 02:03:09'),
(463,2,39,'2025-11-07 02:03:09'),
(464,2,13,'2025-11-07 02:03:09'),
(465,2,14,'2025-11-07 02:03:09'),
(466,2,12,'2025-11-07 02:03:09'),
(494,2,34,'2025-11-08 20:30:59'),
(495,2,35,'2025-11-08 20:30:59'),
(496,2,36,'2025-11-08 20:30:59'),
(497,2,37,'2025-11-08 20:30:59'),
(498,2,38,'2025-11-08 20:30:59'),
(570,20,7,'2025-11-09 01:38:46'),
(571,20,8,'2025-11-09 01:38:46'),
(572,20,6,'2025-11-09 01:38:46'),
(573,20,26,'2025-11-09 01:38:46'),
(574,20,28,'2025-11-09 01:38:46'),
(575,20,27,'2025-11-09 01:38:46'),
(576,20,25,'2025-11-09 01:38:46'),
(577,20,1,'2025-11-09 01:38:46'),
(578,20,3,'2025-11-09 01:38:46'),
(579,20,4,'2025-11-09 01:38:46'),
(580,20,2,'2025-11-09 01:38:46'),
(581,20,40,'2025-11-09 01:38:46'),
(582,20,20,'2025-11-09 01:38:46'),
(583,20,10,'2025-11-09 01:38:46'),
(584,20,11,'2025-11-09 01:38:46'),
(585,20,9,'2025-11-09 01:38:46'),
(586,20,16,'2025-11-09 01:38:46'),
(587,20,17,'2025-11-09 01:38:46'),
(588,20,15,'2025-11-09 01:38:46'),
(589,20,13,'2025-11-09 01:38:46'),
(590,20,14,'2025-11-09 01:38:46'),
(591,20,12,'2025-11-09 01:38:46'),
(592,20,32,'2025-11-09 01:38:46'),
(593,20,23,'2025-11-09 01:38:46'),
(594,20,24,'2025-11-09 01:38:46'),
(595,20,22,'2025-11-09 01:38:46'),
(596,20,18,'2025-11-09 01:38:46'),
(597,19,6,'2025-11-09 12:22:17'),
(598,19,26,'2025-11-09 12:22:17'),
(599,19,27,'2025-11-09 12:22:17'),
(600,19,25,'2025-11-09 12:22:17'),
(601,19,2,'2025-11-09 12:22:17'),
(602,19,34,'2025-11-09 12:22:17'),
(603,19,40,'2025-11-09 12:22:17'),
(604,19,20,'2025-11-09 12:22:17'),
(605,19,10,'2025-11-09 12:22:17'),
(606,19,11,'2025-11-09 12:22:17'),
(607,19,9,'2025-11-09 12:22:17'),
(608,19,15,'2025-11-09 12:22:17'),
(609,19,12,'2025-11-09 12:22:17'),
(610,19,32,'2025-11-09 12:22:17'),
(611,19,24,'2025-11-09 12:22:17'),
(612,19,22,'2025-11-09 12:22:17'),
(613,19,30,'2025-11-09 12:22:17'),
(614,19,29,'2025-11-09 12:22:17'),
(615,19,18,'2025-11-09 12:22:17'),
(616,22,1,'2025-11-22 20:37:35'),
(617,22,6,'2025-11-22 20:37:35'),
(618,22,7,'2025-11-22 20:37:35'),
(619,22,8,'2025-11-22 20:37:35'),
(620,22,9,'2025-11-22 20:37:35'),
(621,22,10,'2025-11-22 20:37:35'),
(622,22,11,'2025-11-22 20:37:35'),
(623,22,12,'2025-11-22 20:37:35'),
(624,22,13,'2025-11-22 20:37:35'),
(625,22,14,'2025-11-22 20:37:35'),
(626,22,15,'2025-11-22 20:37:35'),
(627,22,16,'2025-11-22 20:37:35'),
(628,22,17,'2025-11-22 20:37:35'),
(629,22,18,'2025-11-22 20:37:35'),
(630,22,19,'2025-11-22 20:37:35'),
(631,22,20,'2025-11-22 20:37:35'),
(632,22,21,'2025-11-22 20:37:35'),
(633,22,25,'2025-11-22 20:37:35'),
(634,22,26,'2025-11-22 20:37:35'),
(635,22,27,'2025-11-22 20:37:35'),
(636,22,29,'2025-11-22 20:37:35'),
(637,7,6,'2025-11-23 05:54:15'),
(638,7,7,'2025-11-23 05:54:15'),
(639,7,8,'2025-11-23 05:54:15'),
(640,7,25,'2025-11-23 05:54:15'),
(641,7,26,'2025-11-23 05:54:15'),
(642,7,27,'2025-11-23 05:54:15'),
(643,7,28,'2025-11-23 05:54:15'),
(644,7,1,'2025-11-23 05:54:15'),
(645,7,34,'2025-11-23 05:54:15'),
(646,7,35,'2025-11-23 05:54:15'),
(647,7,36,'2025-11-23 05:54:15'),
(648,7,37,'2025-11-23 05:54:15'),
(649,7,38,'2025-11-23 05:54:15'),
(650,7,39,'2025-11-23 05:54:15'),
(651,7,40,'2025-11-23 05:54:15'),
(652,7,20,'2025-11-23 05:54:15'),
(653,7,21,'2025-11-23 05:54:15'),
(654,7,9,'2025-11-23 05:54:15'),
(655,7,10,'2025-11-23 05:54:15'),
(656,7,11,'2025-11-23 05:54:15'),
(657,7,15,'2025-11-23 05:54:15'),
(658,7,16,'2025-11-23 05:54:15'),
(659,7,17,'2025-11-23 05:54:15'),
(660,7,12,'2025-11-23 05:54:15'),
(661,7,13,'2025-11-23 05:54:15'),
(662,7,14,'2025-11-23 05:54:15'),
(663,7,31,'2025-11-23 05:54:15'),
(664,7,32,'2025-11-23 05:54:15'),
(665,7,33,'2025-11-23 05:54:15'),
(666,7,22,'2025-11-23 05:54:15'),
(667,7,23,'2025-11-23 05:54:15'),
(668,7,24,'2025-11-23 05:54:15'),
(669,7,29,'2025-11-23 05:54:15'),
(670,7,30,'2025-11-23 05:54:15'),
(671,7,18,'2025-11-23 05:54:15'),
(672,7,19,'2025-11-23 05:54:15'),
(700,1,6,'2025-11-23 06:08:28'),
(701,1,7,'2025-11-23 06:08:28'),
(702,1,8,'2025-11-23 06:08:28'),
(703,1,25,'2025-11-23 06:08:28'),
(704,1,26,'2025-11-23 06:08:28'),
(705,1,27,'2025-11-23 06:08:28'),
(706,1,28,'2025-11-23 06:08:28'),
(707,1,1,'2025-11-23 06:08:28'),
(708,1,2,'2025-11-23 06:08:28'),
(709,1,3,'2025-11-23 06:08:28'),
(710,1,4,'2025-11-23 06:08:28'),
(711,1,5,'2025-11-23 06:08:28'),
(712,1,34,'2025-11-23 06:08:28'),
(713,1,35,'2025-11-23 06:08:28'),
(714,1,36,'2025-11-23 06:08:28'),
(715,1,37,'2025-11-23 06:08:28'),
(716,1,38,'2025-11-23 06:08:28'),
(717,1,39,'2025-11-23 06:08:28'),
(718,1,40,'2025-11-23 06:08:28'),
(719,1,20,'2025-11-23 06:08:28'),
(720,1,21,'2025-11-23 06:08:28'),
(721,1,9,'2025-11-23 06:08:28'),
(722,1,10,'2025-11-23 06:08:28'),
(723,1,11,'2025-11-23 06:08:28'),
(724,1,15,'2025-11-23 06:08:28'),
(725,1,16,'2025-11-23 06:08:28'),
(726,1,17,'2025-11-23 06:08:28'),
(727,1,12,'2025-11-23 06:08:28'),
(728,1,13,'2025-11-23 06:08:28'),
(729,1,14,'2025-11-23 06:08:28'),
(730,1,31,'2025-11-23 06:08:28'),
(731,1,32,'2025-11-23 06:08:28'),
(732,1,33,'2025-11-23 06:08:28'),
(733,1,22,'2025-11-23 06:08:28'),
(734,1,23,'2025-11-23 06:08:28'),
(735,1,24,'2025-11-23 06:08:28'),
(736,1,29,'2025-11-23 06:08:28'),
(737,1,30,'2025-11-23 06:08:28'),
(738,1,18,'2025-11-23 06:08:28'),
(739,1,19,'2025-11-23 06:08:28');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `display_name` varchar(150) NOT NULL,
  `category` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_permission_name` (`name`),
  KEY `idx_permission_category` (`category`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES
(1,'dashboard.view','Akses Dashboard','Dashboard','View dashboard analytics and statistics','2025-11-07 02:02:25'),
(2,'patients.view','Lihat Data Pasien','Data Pasien','View patient list and details','2025-11-07 02:02:25'),
(3,'patients.create','Tambah Pasien','Data Pasien','Register new patients','2025-11-07 02:02:25'),
(4,'patients.edit','Edit Pasien','Data Pasien','Edit patient information','2025-11-07 02:02:25'),
(5,'patients.delete','Hapus Pasien','Data Pasien','Delete patient records','2025-11-07 02:02:25'),
(6,'anamnesa.view','Lihat Anamnesa','Anamnesa','View patient anamnesis/medical history','2025-11-07 02:02:25'),
(7,'anamnesa.create','Buat Anamnesa','Anamnesa','Create anamnesis records','2025-11-07 02:02:25'),
(8,'anamnesa.edit','Edit Anamnesa','Anamnesa','Edit anamnesis records','2025-11-07 02:02:25'),
(9,'physical_exam.view','Lihat Pemeriksaan Fisik','Pemeriksaan Fisik','View physical examination records','2025-11-07 02:02:25'),
(10,'physical_exam.create','Buat Pemeriksaan Fisik','Pemeriksaan Fisik','Create physical examination records','2025-11-07 02:02:25'),
(11,'physical_exam.edit','Edit Pemeriksaan Fisik','Pemeriksaan Fisik','Edit physical examination records','2025-11-07 02:02:25'),
(12,'usg_exam.view','Lihat Pemeriksaan USG','Pemeriksaan USG','View USG examination records','2025-11-07 02:02:25'),
(13,'usg_exam.create','Buat Pemeriksaan USG','Pemeriksaan USG','Create USG examination records','2025-11-07 02:02:25'),
(14,'usg_exam.edit','Edit Pemeriksaan USG','Pemeriksaan USG','Edit USG examination records','2025-11-07 02:02:25'),
(15,'lab_exam.view','Lihat Pemeriksaan Penunjang','Pemeriksaan Penunjang','View lab/supporting examination records','2025-11-07 02:02:25'),
(16,'lab_exam.create','Buat Pemeriksaan Penunjang','Pemeriksaan Penunjang','Create lab examination records','2025-11-07 02:02:25'),
(17,'lab_exam.edit','Edit Pemeriksaan Penunjang','Pemeriksaan Penunjang','Edit lab examination records','2025-11-07 02:02:25'),
(18,'services.view','Lihat Tindakan','Tindakan','View medical services/procedures','2025-11-07 02:02:25'),
(19,'services.select','Pilih Tindakan','Tindakan','Select services for billing','2025-11-07 02:02:25'),
(20,'medications.view','Lihat Obat','Obat','View medication inventory','2025-11-07 02:02:25'),
(21,'medications.select','Pilih Obat','Obat','Select medications for billing','2025-11-07 02:02:25'),
(22,'billing.view','Lihat Rincian Tagihan','Rincian Tagihan','View billing details','2025-11-07 02:02:25'),
(23,'billing.create','Buat Tagihan','Rincian Tagihan','Create bills','2025-11-07 02:02:25'),
(24,'billing.process_payment','Proses Pembayaran','Rincian Tagihan','Process payments and print receipts','2025-11-07 02:02:25'),
(25,'appointments.view','Lihat Appointment','Appointment','View appointments','2025-11-07 02:02:25'),
(26,'appointments.create','Tambah Appointment','Appointment','Create new appointments','2025-11-07 02:02:25'),
(27,'appointments.edit','Edit Appointment','Appointment','Edit appointments','2025-11-07 02:02:25'),
(28,'appointments.delete','Hapus Appointment','Appointment','Cancel/delete appointments','2025-11-07 02:02:25'),
(29,'stock.view','Lihat Stok Opname','Stok Opname','View stock opname/inventory','2025-11-07 02:02:25'),
(30,'stock.update','Update Stok','Stok Opname','Update stock levels','2025-11-07 02:02:25'),
(31,'settings.services_manage','Kelola Tindakan','Pengaturan','Manage medical services/procedures list','2025-11-07 02:02:25'),
(32,'settings.medications_manage','Kelola Obat','Pengaturan','Manage medications inventory','2025-11-07 02:02:25'),
(33,'settings.system','Pengaturan Sistem','Pengaturan','Manage system settings','2025-11-07 02:02:25'),
(34,'roles.view','Lihat Role','Kelola Role','View roles and permissions','2025-11-07 02:02:25'),
(35,'roles.create','Tambah Role','Kelola Role','Create new roles','2025-11-07 02:02:25'),
(36,'roles.edit','Edit Role','Kelola Role','Edit existing roles','2025-11-07 02:02:25'),
(37,'roles.delete','Hapus Role','Kelola Role','Delete custom roles','2025-11-07 02:02:25'),
(38,'roles.manage_permissions','Kelola Permission','Kelola Role','Assign permissions to roles','2025-11-07 02:02:25'),
(39,'users.manage_roles','Assign Role ke User','Kelola Role','Assign roles to users','2025-11-07 02:02:25'),
(40,'logs.view','Lihat Log Aktivitas','Log Aktivitas','View system activity logs','2025-11-07 02:02:25');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-27  9:18:09
