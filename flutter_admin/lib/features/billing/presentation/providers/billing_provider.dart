import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/billing_model.dart';
import '../../data/repositories/billing_repository.dart';

// Billing State
class BillingState {
  final Billing? billing;
  final bool isLoading;
  final bool isSaving;
  final String? error;
  final String? successMessage;
  final List<BillingItem> pendingItems;

  BillingState({
    this.billing,
    this.isLoading = false,
    this.isSaving = false,
    this.error,
    this.successMessage,
    this.pendingItems = const [],
  });

  BillingState copyWith({
    Billing? billing,
    bool? isLoading,
    bool? isSaving,
    String? error,
    String? successMessage,
    List<BillingItem>? pendingItems,
  }) {
    return BillingState(
      billing: billing ?? this.billing,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
      successMessage: successMessage,
      pendingItems: pendingItems ?? this.pendingItems,
    );
  }

  double get subtotal {
    final items = billing?.items ?? pendingItems;
    return items.fold(0.0, (sum, item) => sum + item.total);
  }

  double get total => subtotal; // Can add discount/tax logic here
}

class BillingNotifier extends StateNotifier<BillingState> {
  final BillingRepository _repository;

  BillingNotifier(this._repository) : super(BillingState());

  Future<void> loadBilling(String mrId) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final billing = await _repository.getBillingByMrId(mrId);
      state = state.copyWith(
        billing: billing,
        pendingItems: billing?.items ?? [],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void addItem(BillingItem item) {
    final newItem = item.copyWith(
      total: item.price * item.quantity,
    );

    state = state.copyWith(
      pendingItems: [...state.pendingItems, newItem],
    );
  }

  void updateItemQuantity(int index, int quantity) {
    if (index < 0 || index >= state.pendingItems.length) return;

    final items = List<BillingItem>.from(state.pendingItems);
    final item = items[index];
    items[index] = item.copyWith(
      quantity: quantity,
      total: item.price * quantity,
    );

    state = state.copyWith(pendingItems: items);
  }

  void removeItem(int index) {
    if (index < 0 || index >= state.pendingItems.length) return;

    final items = List<BillingItem>.from(state.pendingItems);
    items.removeAt(index);

    state = state.copyWith(pendingItems: items);
  }

  Future<bool> saveBilling(String mrId, {String status = 'draft'}) async {
    state = state.copyWith(isSaving: true, error: null, successMessage: null);

    try {
      final billing = await _repository.saveBilling(
        mrId: mrId,
        items: state.pendingItems,
        status: status,
      );

      state = state.copyWith(
        billing: billing,
        pendingItems: billing.items,
        isSaving: false,
        successMessage: 'Billing berhasil disimpan',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  Future<bool> confirmBilling(String mrId) async {
    state = state.copyWith(isSaving: true, error: null, successMessage: null);

    try {
      final billing = await _repository.confirmBilling(mrId);
      state = state.copyWith(
        billing: billing,
        isSaving: false,
        successMessage: 'Billing berhasil dikonfirmasi',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  Future<bool> markAsPaid(String mrId, {String? paymentMethod}) async {
    state = state.copyWith(isSaving: true, error: null, successMessage: null);

    try {
      final billing = await _repository.markAsPaid(mrId, paymentMethod: paymentMethod);
      state = state.copyWith(
        billing: billing,
        isSaving: false,
        successMessage: 'Pembayaran berhasil dicatat',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  Future<String?> generateInvoice(String mrId) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final url = await _repository.generateInvoice(mrId);
      state = state.copyWith(isSaving: false);
      return url;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return null;
    }
  }

  Future<String?> generateEtiket(String mrId) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final url = await _repository.generateEtiket(mrId);
      state = state.copyWith(isSaving: false);
      return url;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return null;
    }
  }

  void clearMessages() {
    state = state.copyWith(error: null, successMessage: null);
  }

  void clear() {
    state = BillingState();
  }
}

final billingProvider =
    StateNotifierProvider<BillingNotifier, BillingState>((ref) {
  final repository = ref.watch(billingRepositoryProvider);
  return BillingNotifier(repository);
});

// Item Search Provider
class ItemSearchState {
  final List<Medication> medications;
  final List<Service> services;
  final bool isLoading;
  final String? error;
  final String activeTab; // 'obat' or 'tindakan'

  ItemSearchState({
    this.medications = const [],
    this.services = const [],
    this.isLoading = false,
    this.error,
    this.activeTab = 'obat',
  });

  ItemSearchState copyWith({
    List<Medication>? medications,
    List<Service>? services,
    bool? isLoading,
    String? error,
    String? activeTab,
  }) {
    return ItemSearchState(
      medications: medications ?? this.medications,
      services: services ?? this.services,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      activeTab: activeTab ?? this.activeTab,
    );
  }
}

class ItemSearchNotifier extends StateNotifier<ItemSearchState> {
  final BillingRepository _repository;

  ItemSearchNotifier(this._repository) : super(ItemSearchState());

  void setActiveTab(String tab) {
    state = state.copyWith(activeTab: tab);
  }

  Future<void> searchMedications(String query) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final medications = await _repository.searchMedications(query: query);
      state = state.copyWith(medications: medications, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> searchServices(String query) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final services = await _repository.searchServices(query: query);
      state = state.copyWith(services: services, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadInitialItems() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final results = await Future.wait([
        _repository.searchMedications(limit: 50),
        _repository.searchServices(limit: 50),
      ]);

      state = state.copyWith(
        medications: results[0] as List<Medication>,
        services: results[1] as List<Service>,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void clear() {
    state = ItemSearchState();
  }
}

final itemSearchProvider =
    StateNotifierProvider<ItemSearchNotifier, ItemSearchState>((ref) {
  final repository = ref.watch(billingRepositoryProvider);
  return ItemSearchNotifier(repository);
});
