import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/supplier_model.dart';
import '../../data/repositories/supplier_repository.dart';

class SupplierState {
  final List<Supplier> suppliers;
  final bool isLoading;
  final String? error;

  SupplierState({
    this.suppliers = const [],
    this.isLoading = false,
    this.error,
  });

  SupplierState copyWith({
    List<Supplier>? suppliers,
    bool? isLoading,
    String? error,
  }) {
    return SupplierState(
      suppliers: suppliers ?? this.suppliers,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class SupplierNotifier extends StateNotifier<SupplierState> {
  final SupplierRepository _repository;

  SupplierNotifier(this._repository) : super(SupplierState());

  Future<void> loadSuppliers() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final suppliers = await _repository.getSuppliers();
      state = state.copyWith(suppliers: suppliers, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> createSupplier(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createSupplier(data);
      await loadSuppliers();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> updateSupplier(int id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.updateSupplier(id, data);
      await loadSuppliers();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteSupplier(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteSupplier(id);
      await loadSuppliers();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final supplierProvider =
    StateNotifierProvider<SupplierNotifier, SupplierState>((ref) {
  final repository = ref.watch(supplierRepositoryProvider);
  return SupplierNotifier(repository);
});
