import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/storage/local_storage.dart';
import '../models/settings_model.dart';

class SettingsRepository {
  final ApiClient _apiClient;
  final LocalStorage _localStorage;

  SettingsRepository(this._apiClient, this._localStorage);

  // Profile
  Future<UserProfile> getProfile() async {
    final response = await _apiClient.get('/api/staff/profile');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return UserProfile.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memuat profil');
  }

  Future<UserProfile> updateProfile(Map<String, dynamic> updates) async {
    final response = await _apiClient.put(
      '/api/staff/profile',
      data: updates,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return UserProfile.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal update profil');
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await _apiClient.post(
      '/api/staff/change-password',
      data: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal ubah password');
    }
  }

  // System Settings (Admin only)
  Future<SystemSettings> getSystemSettings() async {
    final response = await _apiClient.get('/api/admin/settings');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return SystemSettings.fromJson(data['data']);
    }
    return SystemSettings();
  }

  Future<void> updateSystemSettings(Map<String, dynamic> settings) async {
    final response = await _apiClient.put(
      '/api/admin/settings',
      data: settings,
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal update pengaturan');
    }
  }

  // Role Visibility (Admin only)
  Future<List<RoleVisibility>> getRoleVisibility() async {
    final response = await _apiClient.get('/api/admin/role-visibility');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((r) => RoleVisibility.fromJson(r))
          .toList();
    }
    return [];
  }

  Future<void> updateRoleVisibility(String menuKey, List<String> roles) async {
    final response = await _apiClient.put(
      '/api/admin/role-visibility/$menuKey',
      data: {'roles': roles},
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal update visibilitas');
    }
  }

  // Activity Logs
  Future<List<ActivityLog>> getActivityLogs({
    int page = 1,
    int limit = 50,
    String? userId,
    String? action,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (userId != null) queryParams['user_id'] = userId;
    if (action != null) queryParams['action'] = action;
    if (startDate != null) {
      queryParams['start_date'] =
          startDate.toIso8601String().split('T').first;
    }
    if (endDate != null) {
      queryParams['end_date'] = endDate.toIso8601String().split('T').first;
    }

    final response = await _apiClient.get(
      '/api/admin/activity-logs',
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      final list = data['data'] is List ? data['data'] : data['data']['items'];
      if (list is List) {
        return list.map((l) => ActivityLog.fromJson(l)).toList();
      }
    }
    return [];
  }

  // App Preferences (Local)
  Future<AppPreferences> getPreferences() async {
    final data = _localStorage.getMap('app_preferences');
    if (data != null) {
      return AppPreferences.fromJson(data);
    }
    return AppPreferences();
  }

  Future<void> savePreferences(AppPreferences preferences) async {
    await _localStorage.setMap('app_preferences', preferences.toJson());
  }
}

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final localStorage = ref.watch(localStorageProvider);
  return SettingsRepository(apiClient, localStorage);
});
