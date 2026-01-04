import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/appointment_model.dart';

class AppointmentRepository {
  final ApiClient _apiClient;

  AppointmentRepository(this._apiClient);

  Future<List<Appointment>> getAppointments({
    String? location,
    DateTime? date,
    String? status,
    int page = 1,
    int limit = 50,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (location != null) queryParams['location'] = location;
    if (date != null) queryParams['date'] = date.toIso8601String().split('T').first;
    if (status != null) queryParams['status'] = status;

    final response = await _apiClient.get(
      ApiEndpoints.appointments,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((a) => Appointment.fromJson(a)).toList();
    }
    return [];
  }

  Future<List<Appointment>> getTodayAppointments({String? location}) async {
    return getAppointments(location: location, date: DateTime.now());
  }

  Future<List<Appointment>> getUpcomingAppointments({String? location, int days = 7}) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.appointments}/upcoming',
      queryParameters: {
        if (location != null) 'location': location,
        'days': days,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((a) => Appointment.fromJson(a)).toList();
    }
    return [];
  }

  Future<Appointment> createAppointment({
    required String patientId,
    required DateTime appointmentDate,
    String? appointmentTime,
    required String location,
    String? category,
    String? notes,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.appointments,
      data: {
        'patient_id': patientId,
        'appointment_date': appointmentDate.toIso8601String().split('T').first,
        if (appointmentTime != null) 'appointment_time': appointmentTime,
        'location': location,
        if (category != null) 'category': category,
        if (notes != null) 'notes': notes,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Appointment.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat janji');
  }

  Future<Appointment> updateAppointment(int id, Map<String, dynamic> updates) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.appointments}/$id',
      data: updates,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Appointment.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal update janji');
  }

  Future<void> cancelAppointment(int id, {String? reason}) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.appointments}/$id/cancel',
      data: {
        if (reason != null) 'reason': reason,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal membatalkan janji');
    }
  }

  Future<void> confirmAppointment(int id) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.appointments}/$id/confirm',
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal konfirmasi janji');
    }
  }

  Future<void> markAsCompleted(int id) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.appointments}/$id/complete',
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menyelesaikan janji');
    }
  }

  Future<List<BookingSettings>> getBookingSettings() async {
    final response = await _apiClient.get('/api/booking-settings');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((s) => BookingSettings.fromJson(s)).toList();
    }
    return [];
  }

  Future<void> updateBookingSettings(String location, Map<String, dynamic> settings) async {
    final response = await _apiClient.put(
      '/api/booking-settings/$location',
      data: settings,
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal update pengaturan');
    }
  }

  Future<List<Appointment>> getHospitalAppointments(String location, String date) async {
    final response = await _apiClient.get(
      ApiEndpoints.hospitalAppointments,
      queryParameters: {
        'location': location,
        'date': date,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((a) => Appointment.fromJson(a)).toList();
    }
    return [];
  }
}

final appointmentRepositoryProvider = Provider<AppointmentRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AppointmentRepository(apiClient);
});
