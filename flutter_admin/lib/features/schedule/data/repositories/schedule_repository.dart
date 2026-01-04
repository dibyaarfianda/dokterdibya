import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/schedule_model.dart';

class ScheduleRepository {
  final ApiClient _apiClient;

  ScheduleRepository(this._apiClient);

  Future<List<PracticeSchedule>> getSchedules() async {
    final response = await _apiClient.get(ApiEndpoints.practiceSchedules);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((s) => PracticeSchedule.fromJson(s))
          .toList();
    }
    return [];
  }

  Future<PracticeSchedule> createSchedule(Map<String, dynamic> scheduleData) async {
    final response = await _apiClient.post(
      ApiEndpoints.practiceSchedules,
      data: scheduleData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return PracticeSchedule.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat jadwal');
  }

  Future<PracticeSchedule> updateSchedule(int id, Map<String, dynamic> scheduleData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.practiceSchedules}/$id',
      data: scheduleData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return PracticeSchedule.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui jadwal');
  }

  Future<void> deleteSchedule(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.practiceSchedules}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus jadwal');
    }
  }
}

final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ScheduleRepository(apiClient);
});
