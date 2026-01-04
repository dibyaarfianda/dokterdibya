import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/announcement_model.dart';

class AnnouncementRepository {
  final ApiClient _apiClient;

  AnnouncementRepository(this._apiClient);

  // Patient-facing announcements
  Future<List<Announcement>> getAnnouncements() async {
    final response = await _apiClient.get(ApiEndpoints.announcements);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((a) => Announcement.fromJson(a))
          .toList();
    }
    return [];
  }

  Future<Announcement> createAnnouncement(Map<String, dynamic> announcementData) async {
    final response = await _apiClient.post(
      ApiEndpoints.announcements,
      data: announcementData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Announcement.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat pengumuman');
  }

  Future<Announcement> updateAnnouncement(int id, Map<String, dynamic> announcementData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.announcements}/$id',
      data: announcementData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Announcement.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui pengumuman');
  }

  Future<void> deleteAnnouncement(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.announcements}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus pengumuman');
    }
  }

  // Staff announcements
  Future<List<StaffAnnouncement>> getStaffAnnouncements() async {
    final response = await _apiClient.get(ApiEndpoints.staffAnnouncements);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((a) => StaffAnnouncement.fromJson(a))
          .toList();
    }
    return [];
  }

  Future<StaffAnnouncement> createStaffAnnouncement(Map<String, dynamic> announcementData) async {
    final response = await _apiClient.post(
      ApiEndpoints.staffAnnouncements,
      data: announcementData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return StaffAnnouncement.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat pengumuman staff');
  }

  Future<void> markStaffAnnouncementRead(int id) async {
    await _apiClient.post('${ApiEndpoints.staffAnnouncements}/$id/read');
  }
}

final announcementRepositoryProvider = Provider<AnnouncementRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AnnouncementRepository(apiClient);
});
