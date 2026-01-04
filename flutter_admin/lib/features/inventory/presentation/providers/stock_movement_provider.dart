import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/stock_movement_model.dart';
import '../../data/repositories/stock_movement_repository.dart';

class StockMovementState {
  final List<StockMovement> movements;
  final bool isLoading;
  final String? error;
  final int total;
  final List<String> users;
  final String? selectedMovementType;
  final String? selectedUser;
  final String? startDate;
  final String? endDate;

  StockMovementState({
    this.movements = const [],
    this.isLoading = false,
    this.error,
    this.total = 0,
    this.users = const [],
    this.selectedMovementType,
    this.selectedUser,
    this.startDate,
    this.endDate,
  });

  StockMovementState copyWith({
    List<StockMovement>? movements,
    bool? isLoading,
    String? error,
    int? total,
    List<String>? users,
    String? selectedMovementType,
    String? selectedUser,
    String? startDate,
    String? endDate,
  }) {
    return StockMovementState(
      movements: movements ?? this.movements,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      total: total ?? this.total,
      users: users ?? this.users,
      selectedMovementType: selectedMovementType ?? this.selectedMovementType,
      selectedUser: selectedUser ?? this.selectedUser,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
    );
  }
}

class StockMovementNotifier extends StateNotifier<StockMovementState> {
  final StockMovementRepository _repository;

  StockMovementNotifier(this._repository) : super(StockMovementState());

  Future<void> loadActivityLog({bool reset = false}) async {
    if (reset) {
      state = state.copyWith(movements: [], isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getActivityLog(
        startDate: state.startDate,
        endDate: state.endDate,
        movementType: state.selectedMovementType,
        createdBy: state.selectedUser,
        offset: reset ? 0 : state.movements.length,
      );

      state = state.copyWith(
        movements: reset ? response.movements : [...state.movements, ...response.movements],
        total: response.total,
        users: response.users.isNotEmpty ? response.users : state.users,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setFilter({
    String? movementType,
    String? user,
    String? startDate,
    String? endDate,
  }) {
    state = state.copyWith(
      selectedMovementType: movementType,
      selectedUser: user,
      startDate: startDate,
      endDate: endDate,
    );
  }

  void clearFilters() {
    state = StockMovementState(users: state.users);
  }
}

final stockMovementProvider =
    StateNotifierProvider<StockMovementNotifier, StockMovementState>((ref) {
  final repository = ref.watch(stockMovementRepositoryProvider);
  return StockMovementNotifier(repository);
});
