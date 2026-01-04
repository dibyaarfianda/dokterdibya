import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/staff_activity_model.dart';
import '../../data/repositories/staff_activity_repository.dart';

class StaffActivityState {
  final List<OnlineUser> onlineUsers;
  final List<ActivityLog> logs;
  final ActivitySummary? summary;
  final List<String> actions;
  final bool isLoading;
  final String? error;
  final String? selectedAction;
  final String? selectedUserId;

  StaffActivityState({
    this.onlineUsers = const [],
    this.logs = const [],
    this.summary,
    this.actions = const [],
    this.isLoading = false,
    this.error,
    this.selectedAction,
    this.selectedUserId,
  });

  StaffActivityState copyWith({
    List<OnlineUser>? onlineUsers,
    List<ActivityLog>? logs,
    ActivitySummary? summary,
    List<String>? actions,
    bool? isLoading,
    String? error,
    String? selectedAction,
    String? selectedUserId,
  }) {
    return StaffActivityState(
      onlineUsers: onlineUsers ?? this.onlineUsers,
      logs: logs ?? this.logs,
      summary: summary ?? this.summary,
      actions: actions ?? this.actions,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      selectedAction: selectedAction ?? this.selectedAction,
      selectedUserId: selectedUserId ?? this.selectedUserId,
    );
  }
}

class StaffActivityNotifier extends StateNotifier<StaffActivityState> {
  final StaffActivityRepository _repository;

  StaffActivityNotifier(this._repository) : super(StaffActivityState());

  Future<void> loadAll() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final onlineUsers = await _repository.getOnlineUsers();
      final summary = await _repository.getActivitySummary();
      final actions = await _repository.getActions();
      final logs = await _repository.getActivityLogs();

      state = state.copyWith(
        onlineUsers: onlineUsers,
        summary: summary,
        actions: actions,
        logs: logs,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadOnlineUsers() async {
    try {
      final onlineUsers = await _repository.getOnlineUsers();
      state = state.copyWith(onlineUsers: onlineUsers);
    } catch (e) {
      // Silent fail for online users
    }
  }

  Future<void> loadLogs({bool reset = false}) async {
    if (reset) {
      state = state.copyWith(logs: [], isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final logs = await _repository.getActivityLogs(
        userId: state.selectedUserId,
        action: state.selectedAction,
        offset: reset ? 0 : state.logs.length,
      );

      state = state.copyWith(
        logs: reset ? logs : [...state.logs, ...logs],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setFilter({String? action, String? userId}) {
    state = state.copyWith(
      selectedAction: action,
      selectedUserId: userId,
    );
  }

  void clearFilters() {
    state = StaffActivityState(
      onlineUsers: state.onlineUsers,
      actions: state.actions,
      summary: state.summary,
    );
  }
}

final staffActivityProvider =
    StateNotifierProvider<StaffActivityNotifier, StaffActivityState>((ref) {
  final repository = ref.watch(staffActivityRepositoryProvider);
  return StaffActivityNotifier(repository);
});
