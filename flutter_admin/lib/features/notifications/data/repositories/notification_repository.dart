import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/notification_model.dart';

class NotificationRepository {
  final ApiClient _apiClient;

  NotificationRepository(this._apiClient);

  // Notifications
  Future<List<AppNotification>> getNotifications({
    int page = 1,
    int limit = 20,
    bool? unreadOnly,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (unreadOnly == true) queryParams['unread'] = true;

    final response = await _apiClient.get(
      ApiEndpoints.notifications,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true) {
      // API returns { notifications: [...], unread_count: N }
      final list = data['notifications'] ?? data['data'];
      if (list is List) {
        return list.map((n) => AppNotification.fromJson(n as Map<String, dynamic>)).toList();
      }
    }
    return [];
  }

  Future<void> markAsRead(int notificationId) async {
    await _apiClient.post('${ApiEndpoints.notifications}/$notificationId/read');
  }

  Future<void> markAllAsRead() async {
    await _apiClient.post('${ApiEndpoints.notifications}/read-all');
  }

  Future<NotificationCount> getUnreadCount() async {
    final response = await _apiClient.get('${ApiEndpoints.notifications}/count');

    final data = response.data;
    if (data['success'] == true) {
      // API returns { count, notifications, announcements } at root level
      return NotificationCount.fromJson(data);
    }
    return NotificationCount();
  }

  // Staff Announcements
  Future<List<StaffAnnouncement>> getAnnouncements({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.staffAnnouncements,
      queryParameters: {'page': page, 'limit': limit},
    );

    final data = response.data;
    if (data['success'] == true) {
      // API may return { announcements: [...] } or { data: [...] }
      final list = data['announcements'] ?? data['data'];
      if (list is List) {
        return list.map((a) => StaffAnnouncement.fromJson(a as Map<String, dynamic>)).toList();
      }
    }
    return [];
  }

  Future<void> markAnnouncementAsRead(int announcementId) async {
    await _apiClient.post('${ApiEndpoints.staffAnnouncements}/$announcementId/read');
  }

  // Online Users (from Socket.IO state)
  Future<List<OnlineUser>> getOnlineUsers() async {
    final response = await _apiClient.get('${ApiEndpoints.notifications}/online-users');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((u) => OnlineUser.fromJson(u)).toList();
    }
    return [];
  }
}

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return NotificationRepository(apiClient);
});
