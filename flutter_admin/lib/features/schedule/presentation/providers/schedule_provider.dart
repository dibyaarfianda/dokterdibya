import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/schedule_model.dart';
import '../../data/repositories/schedule_repository.dart';

class ScheduleState {
  final List<PracticeSchedule> schedules;
  final bool isLoading;
  final String? error;

  ScheduleState({
    this.schedules = const [],
    this.isLoading = false,
    this.error,
  });

  ScheduleState copyWith({
    List<PracticeSchedule>? schedules,
    bool? isLoading,
    String? error,
  }) {
    return ScheduleState(
      schedules: schedules ?? this.schedules,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ScheduleNotifier extends StateNotifier<ScheduleState> {
  final ScheduleRepository _repository;

  ScheduleNotifier(this._repository) : super(ScheduleState());

  Future<void> loadSchedules() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final schedules = await _repository.getSchedules();
      state = state.copyWith(schedules: schedules, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> createSchedule(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createSchedule(data);
      await loadSchedules();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> updateSchedule(int id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.updateSchedule(id, data);
      await loadSchedules();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteSchedule(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteSchedule(id);
      await loadSchedules();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final scheduleProvider =
    StateNotifierProvider<ScheduleNotifier, ScheduleState>((ref) {
  final repository = ref.watch(scheduleRepositoryProvider);
  return ScheduleNotifier(repository);
});
