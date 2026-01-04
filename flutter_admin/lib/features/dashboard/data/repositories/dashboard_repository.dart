import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';

class DashboardStats {
  final int totalPatients;
  final int todayVisits;
  final int weekVisits;
  final int monthVisits;
  final int pendingAppointments;
  final int confirmedAppointments;
  final List<DailyVisit> dailyVisits;
  final List<CategoryCount> categoryBreakdown;

  DashboardStats({
    this.totalPatients = 0,
    this.todayVisits = 0,
    this.weekVisits = 0,
    this.monthVisits = 0,
    this.pendingAppointments = 0,
    this.confirmedAppointments = 0,
    this.dailyVisits = const [],
    this.categoryBreakdown = const [],
  });

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    final data = json['data'] ?? json;

    List<DailyVisit> dailyVisits = [];
    if (data['dailyVisits'] != null) {
      dailyVisits = (data['dailyVisits'] as List)
          .map((v) => DailyVisit.fromJson(v))
          .toList();
    }

    List<CategoryCount> categoryBreakdown = [];
    if (data['categoryBreakdown'] != null) {
      categoryBreakdown = (data['categoryBreakdown'] as List)
          .map((c) => CategoryCount.fromJson(c))
          .toList();
    }

    return DashboardStats(
      totalPatients: data['totalPatients'] ?? 0,
      todayVisits: data['todayVisits'] ?? 0,
      weekVisits: data['weekVisits'] ?? 0,
      monthVisits: data['monthVisits'] ?? 0,
      pendingAppointments: data['pendingAppointments'] ?? 0,
      confirmedAppointments: data['confirmedAppointments'] ?? 0,
      dailyVisits: dailyVisits,
      categoryBreakdown: categoryBreakdown,
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
      // Return empty stats on error
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
