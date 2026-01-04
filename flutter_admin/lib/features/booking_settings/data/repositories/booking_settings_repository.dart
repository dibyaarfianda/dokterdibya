import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/booking_settings_model.dart';

class BookingSettingsRepository {
  final ApiClient _apiClient;

  BookingSettingsRepository(this._apiClient);

  Future<List<BookingSession>> getSettings() async {
    final response = await _apiClient.get(ApiEndpoints.bookingSettings);

    final data = response.data;
    if (data['success'] == true && data['settings'] != null) {
      return (data['settings'] as List)
          .map((s) => BookingSession.fromJson(s))
          .toList();
    }
    return [];
  }

  Future<bool> updateSession(int id, Map<String, dynamic> updates) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.bookingSettings}/$id',
      data: updates,
    );

    final data = response.data;
    return data['success'] == true;
  }

  Future<bool> createSession(Map<String, dynamic> sessionData) async {
    final response = await _apiClient.post(
      ApiEndpoints.bookingSettings,
      data: sessionData,
    );

    final data = response.data;
    return data['success'] == true;
  }

  Future<bool> deleteSession(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.bookingSettings}/$id');

    final data = response.data;
    return data['success'] == true;
  }

  Future<List<Booking>> getBookings({
    String? date,
    int? session,
    String? status,
  }) async {
    final queryParams = <String, dynamic>{};
    if (date != null) queryParams['date'] = date;
    if (session != null) queryParams['session'] = session;
    if (status != null && status != 'all') queryParams['status'] = status;

    final response = await _apiClient.get(
      '${ApiEndpoints.bookingSettings}/bookings',
      queryParameters: queryParams.isNotEmpty ? queryParams : null,
    );

    final data = response.data;
    if (data['success'] == true && data['bookings'] != null) {
      return (data['bookings'] as List)
          .map((b) => Booking.fromJson(b))
          .toList();
    }
    return [];
  }

  Future<bool> cancelBooking(int id, String reason, bool notifyPatient) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.bookingSettings}/force-cancel/$id',
      data: {
        'reason': reason,
        'notify_patient': notifyPatient,
      },
    );

    final data = response.data;
    return data['success'] == true;
  }
}

final bookingSettingsRepositoryProvider = Provider<BookingSettingsRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return BookingSettingsRepository(apiClient);
});
