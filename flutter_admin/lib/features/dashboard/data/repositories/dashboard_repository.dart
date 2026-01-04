import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';

class DashboardStats {
  final int totalPatients;
  final int gynaeCases;
  final int nextSundayAppointments;
  final String? nextSundayDate;
  final List<UpcomingAppointment> upcomingAppointments;

  DashboardStats({
    this.totalPatients = 0,
    this.gynaeCases = 0,
    this.nextSundayAppointments = 0,
    this.nextSundayDate,
    this.upcomingAppointments = const [],
  });

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    // API returns { stats: {...}, appointments: [...] }
    final stats = json['stats'] ?? json;
    final appointments = json['appointments'] ?? [];

    List<UpcomingAppointment> upcomingList = [];
    if (appointments is List) {
      upcomingList = appointments
          .map((a) => UpcomingAppointment.fromJson(a as Map<String, dynamic>))
          .toList();
    }

    return DashboardStats(
      totalPatients: stats['totalPatients'] ?? 0,
      gynaeCases: stats['gynaeCases'] ?? 0,
      nextSundayAppointments: stats['nextSundayAppointments'] ?? 0,
      nextSundayDate: stats['nextSundayDate'],
      upcomingAppointments: upcomingList,
    );
  }
}

class UpcomingAppointment {
  final int id;
  final String nama;
  final String? whatsapp;
  final String? keluhan;
  final String? slotWaktu;

  UpcomingAppointment({
    required this.id,
    required this.nama,
    this.whatsapp,
    this.keluhan,
    this.slotWaktu,
  });

  factory UpcomingAppointment.fromJson(Map<String, dynamic> json) {
    return UpcomingAppointment(
      id: json['id'] ?? 0,
      nama: json['nama'] ?? '',
      whatsapp: json['whatsapp'],
      keluhan: json['keluhan'],
      slotWaktu: json['slotWaktu'],
    );
  }
}

class DailyVisit {
  final DateTime date;
  final int count;

  DailyVisit({required this.date, required this.count});

  factory DailyVisit.fromJson(Map<String, dynamic> json) {
    return DailyVisit(
      date: DateTime.parse(json['date']),
      count: json['count'] ?? 0,
    );
  }
}

class CategoryCount {
  final String category;
  final int count;

  CategoryCount({required this.category, required this.count});

  factory CategoryCount.fromJson(Map<String, dynamic> json) {
    return CategoryCount(
      category: json['category'] ?? 'Lainnya',
      count: json['count'] ?? 0,
    );
  }
}

class DashboardRepository {
  final ApiClient _apiClient;

  DashboardRepository(this._apiClient);

  Future<DashboardStats> getStats() async {
    try {
      final response = await _apiClient.get(ApiEndpoints.dashboardStats);
      final data = response.data;

      if (data['success'] == true) {
        return DashboardStats.fromJson(data);
      }
      return DashboardStats();
    } catch (e) {
      print('Dashboard stats error: $e');
      return DashboardStats();
    }
  }

  Future<List<DailyVisit>> getVisitsChart({int days = 30}) async {
    try {
      final response = await _apiClient.get(
        ApiEndpoints.visits,
        queryParameters: {
          'exclude_dummy': true,
          'days': days,
        },
      );

      final data = response.data;
      if (data['success'] == true && data['data'] != null) {
        return (data['data'] as List)
            .map((v) => DailyVisit.fromJson(v))
            .toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  Future<int> getTodayAppointmentsCount() async {
    try {
      final response = await _apiClient.get(
        ApiEndpoints.appointments,
        queryParameters: {
          'date': DateTime.now().toIso8601String().split('T')[0],
        },
      );

      final data = response.data;
      if (data['success'] == true && data['data'] != null) {
        return (data['data'] as List).length;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  Future<List<Map<String, dynamic>>> getRecentActivity({int limit = 10}) async {
    try {
      final response = await _apiClient.get(
        ApiEndpoints.activityLogs,
        queryParameters: {'limit': limit},
      );

      final data = response.data;
      if (data['success'] == true && data['data'] != null) {
        return List<Map<String, dynamic>>.from(data['data']);
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DashboardRepository(apiClient);
});
