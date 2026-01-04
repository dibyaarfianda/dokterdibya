import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../models/staff_activity_model.dart';

class StaffActivityRepository {
  final ApiClient _apiClient;

  StaffActivityRepository(this._apiClient);

  Future<List<OnlineUser>> getOnlineUsers() async {
    final response = await _apiClient.get('/api/status/online');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((u) => OnlineUser.fromJson(u))
          .toList();
    }
    return [];
  }

  Future<List<ActivityLog>> getActivityLogs({
    String? userId,
    String? action,
    String? startDate,
    String? endDate,
    int limit = 100,
    int offset = 0,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
      'offset': offset,
    };

    if (userId != null) queryParams['user_id'] = userId;
    if (action != null) queryParams['action'] = action;
    if (startDate != null) queryParams['start_date'] = startDate;
    if (endDate != null) queryParams['end_date'] = endDate;

    final response = await _apiClient.get(
      '/api/logs',
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((l) => ActivityLog.fromJson(l))
          .toList();
    }
    return [];
  }

  Future<ActivitySummary?> getActivitySummary({int days = 7}) async {
    final response = await _apiClient.get(
      '/api/logs/summary',
      queryParameters: {'days': days},
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return ActivitySummary.fromJson(data['data']);
    }
    return null;
  }

  Future<List<String>> getActions() async {
    final response = await _apiClient.get('/api/logs/actions');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).cast<String>();
    }
    return [];
  }
}

final staffActivityRepositoryProvider = Provider<StaffActivityRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return StaffActivityRepository(apiClient);
});
