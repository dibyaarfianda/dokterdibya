class ApiEndpoints {
  static const String baseUrl = 'https://dokterdibya.com';

  // Auth
  static const String login = '/api/auth/login';
  static const String logout = '/api/auth/logout';
  static const String profile = '/api/auth/profile';

  // Patients
  static const String patients = '/api/patients';
  static const String patientSearch = '/api/patients/search';

  // Sunday Clinic
  static const String sundayClinic = '/api/sunday-clinic';
  static const String sundayClinicQueue = '/api/sunday-clinic/queue/today';
  static const String sundayClinicDirectory = '/api/sunday-clinic/directory';

  // Sunday Clinic - Billing
  static String sundayClinicBilling(String mrId) => '/api/sunday-clinic/billing/$mrId';
  static String sundayClinicBillingConfirm(String mrId) => '/api/sunday-clinic/billing/$mrId/confirm';
  static String sundayClinicBillingPaid(String mrId) => '/api/sunday-clinic/billing/$mrId/mark-paid';
  static String sundayClinicPrintInvoice(String mrId) => '/api/sunday-clinic/billing/$mrId/print-invoice';
  static String sundayClinicPrintEtiket(String mrId) => '/api/sunday-clinic/billing/$mrId/print-etiket';

  // Sunday Clinic - Resume Medis & Send to Patient
  static const String sundayClinicResumeMedisPdf = '/api/sunday-clinic/resume-medis/pdf';
  static const String sundayClinicResumeMedisSendWhatsApp = '/api/sunday-clinic/resume-medis/send-whatsapp';
  static String sundayClinicSendToPatient(String mrId) => '/api/sunday-clinic/send-to-patient/$mrId';

  // Sunday Clinic - USG Upload
  static const String usgBulkUpload = '/api/usg-bulk-upload';
  static String sundayClinicUsgUpload(String mrId) => '/api/sunday-clinic/records/$mrId/usg-upload';

  // Appointments
  static const String appointments = '/api/sunday-appointments';
  static const String hospitalAppointments = '/api/hospital-appointments';

  // Inventory
  static const String obat = '/api/obat';
  static const String tindakan = '/api/tindakan';
  static const String inventoryActivityLog = '/api/inventory/activity-log';

  // Notifications
  static const String notifications = '/api/notifications';
  static const String staffAnnouncements = '/api/staff-announcements';

  // Dashboard
  static const String dashboardStats = '/api/dashboard-stats';
  static const String visits = '/api/visits';

  // Users
  static const String users = '/api/users';

  // Articles (Ruang Membaca)
  static const String articles = '/api/articles';
  static const String articlesAdmin = '/api/articles/admin/all';

  // Activity Logs
  static const String activityLogs = '/api/logs/activity';

  // Announcements (Patient-facing)
  static const String announcements = '/api/announcements';

  // Practice Schedules (Jadwal)
  static const String practiceSchedules = '/api/practice-schedules';

  // Booking Settings
  static const String bookingSettings = '/api/booking-settings';

  // Suppliers
  static const String suppliers = '/api/suppliers';

  // Drug Sales (Penjualan Obat)
  static const String obatSales = '/api/obat-sales';

  // Chat
  static const String chat = '/api/chat';

  // Analytics
  static const String analytics = '/api/analytics';
}
