import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repositories/dashboard_repository.dart';

class DashboardState {
  final DashboardStats stats;
  final List<DailyVisit> chartData;
  final List<Map<String, dynamic>> recentActivity;
  final bool isLoading;
  final String? error;
  final DateTime? lastUpdated;

  DashboardState({
    DashboardStats? stats,
    this.chartData = const [],
    this.recentActivity = const [],
    this.isLoading = false,
    this.error,
    this.lastUpdated,
  }) : stats = stats ?? DashboardStats();

  DashboardState copyWith({
    DashboardStats? stats,
    List<DailyVisit>? chartData,
    List<Map<String, dynamic>>? recentActivity,
    bool? isLoading,
    String? error,
    DateTime? lastUpdated,
  }) {
    return DashboardState(
      stats: stats ?? this.stats,
      chartData: chartData ?? this.chartData,
      recentActivity: recentActivity ?? this.recentActivity,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

class DashboardNotifier extends StateNotifier<DashboardState> {
  final DashboardRepository _repository;

  DashboardNotifier(this._repository) : super(DashboardState());

  Future<void> loadDashboard() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      // Load stats and chart data in parallel
      final results = await Future.wait([
        _repository.getStats(),
        _repository.getVisitsChart(days: 30),
        _repository.getRecentActivity(limit: 10),
      ]);

      state = state.copyWith(
        stats: results[0] as DashboardStats,
        chartData: results[1] as List<DailyVisit>,
        recentActivity: results[2] as List<Map<String, dynamic>>,
        isLoading: false,
        lastUpdated: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> refresh() async {
    await loadDashboard();
  }
}

final dashboardProvider =
    StateNotifierProvider<DashboardNotifier, DashboardState>((ref) {
  final repository = ref.watch(dashboardRepositoryProvider);
  return DashboardNotifier(repository);
});

// Quick stats provider that auto-refreshes periodically
final quickStatsProvider = FutureProvider.autoDispose<DashboardStats>((ref) async {
  final repository = ref.watch(dashboardRepositoryProvider);
  return repository.getStats();
});

// Chart data provider
final chartDataProvider = FutureProvider.autoDispose<List<DailyVisit>>((ref) async {
  final repository = ref.watch(dashboardRepositoryProvider);
  return repository.getVisitsChart(days: 30);
});
