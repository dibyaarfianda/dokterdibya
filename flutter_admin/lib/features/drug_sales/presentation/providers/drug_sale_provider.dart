import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/drug_sale_model.dart';
import '../../data/repositories/drug_sale_repository.dart';

class DrugSaleState {
  final List<DrugSale> sales;
  final bool isLoading;
  final String? error;

  DrugSaleState({
    this.sales = const [],
    this.isLoading = false,
    this.error,
  });

  DrugSaleState copyWith({
    List<DrugSale>? sales,
    bool? isLoading,
    String? error,
  }) {
    return DrugSaleState(
      sales: sales ?? this.sales,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class DrugSaleNotifier extends StateNotifier<DrugSaleState> {
  final DrugSaleRepository _repository;

  DrugSaleNotifier(this._repository) : super(DrugSaleState());

  Future<void> loadSales({String? startDate, String? endDate, String? paymentStatus}) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final sales = await _repository.getSales(
        startDate: startDate,
        endDate: endDate,
        paymentStatus: paymentStatus,
      );
      state = state.copyWith(sales: sales, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> createSale(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createSale(data);
      await loadSales();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> markAsPaid(int id, String paymentMethod) async {
    try {
      await _repository.markAsPaid(id, paymentMethod);
      await loadSales();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> deleteSale(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteSale(id);
      await loadSales();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final drugSaleProvider =
    StateNotifierProvider<DrugSaleNotifier, DrugSaleState>((ref) {
  final repository = ref.watch(drugSaleRepositoryProvider);
  return DrugSaleNotifier(repository);
});
