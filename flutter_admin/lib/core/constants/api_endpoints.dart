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

  // Appointments
  static const String appointments = '/api/sunday-appointments';
  static const String hospitalAppointments = '/api/hospital-appointments';

  // Inventory
  static const String obat = '/api/obat';
  static const String tindakan = '/api/tindakan';

  // Notifications
  static const String notifications = '/api/notifications';
  static const String staffAnnouncements = '/api/staff-announcements';

  // Dashboard
  static const String dashboardStats = '/api/dashboard/stats';
  static const String visits = '/api/visits';

  // Users
  static const String users = '/api/users';

  // Articles
  static const String articles = '/api/articles';

  // Activity Logs
  static const String activityLogs = '/api/logs/activity';
}
