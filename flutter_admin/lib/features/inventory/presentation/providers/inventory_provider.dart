import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/inventory_model.dart';
import '../../data/repositories/inventory_repository.dart';

// Obat List State
class ObatListState {
  final List<Obat> items;
  final bool isLoading;
  final String? error;
  final String? searchQuery;
  final String? selectedKategori;
  final bool showLowStockOnly;

  ObatListState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.searchQuery,
    this.selectedKategori,
    this.showLowStockOnly = false,
  });

  ObatListState copyWith({
    List<Obat>? items,
    bool? isLoading,
    String? error,
    String? searchQuery,
    String? selectedKategori,
    bool? showLowStockOnly,
  }) {
    return ObatListState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
      selectedKategori: selectedKategori ?? this.selectedKategori,
      showLowStockOnly: showLowStockOnly ?? this.showLowStockOnly,
    );
  }

  List<Obat> get lowStockItems => items.where((o) => o.isLowStock).toList();
  List<Obat> get outOfStockItems => items.where((o) => o.isOutOfStock).toList();
  List<Obat> get expiringItems => items.where((o) => o.isExpiringSoon).toList();
}

class ObatListNotifier extends StateNotifier<ObatListState> {
  final InventoryRepository _repository;

  ObatListNotifier(this._repository) : super(ObatListState());

  Future<void> loadItems({
    String? search,
    String? kategori,
    bool? lowStock,
  }) async {
    state = state.copyWith(
      isLoading: true,
      error: null,
      searchQuery: search,
      selectedKategori: kategori,
      showLowStockOnly: lowStock ?? false,
    );

    try {
      final items = await _repository.getObatList(
        search: search,
        kategori: kategori,
        lowStock: lowStock,
      );
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() async {
    await loadItems(
      search: state.searchQuery,
      kategori: state.selectedKategori,
      lowStock: state.showLowStockOnly ? true : null,
    );
  }

  void setSearch(String? query) {
    loadItems(
      search: query,
      kategori: state.selectedKategori,
      lowStock: state.showLowStockOnly ? true : null,
    );
  }

  void setKategori(String? kategori) {
    loadItems(
      search: state.searchQuery,
      kategori: kategori,
      lowStock: state.showLowStockOnly ? true : null,
    );
  }

  void toggleLowStockFilter() {
    final newValue = !state.showLowStockOnly;
    loadItems(
      search: state.searchQuery,
      kategori: state.selectedKategori,
      lowStock: newValue ? true : null,
    );
  }

  Future<bool> deleteItem(int id) async {
    try {
      await _repository.deleteObat(id);
      await refresh();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> adjustStock(int id, int quantity, String type, {String? reason}) async {
    try {
      await _repository.adjustStock(id, quantity, type, reason: reason);
      await refresh();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final obatListProvider = StateNotifierProvider<ObatListNotifier, ObatListState>((ref) {
  final repository = ref.watch(inventoryRepositoryProvider);
  return ObatListNotifier(repository);
});

// Tindakan List State
class TindakanListState {
  final List<Tindakan> items;
  final bool isLoading;
  final String? error;
  final String? searchQuery;

  TindakanListState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.searchQuery,
  });

  TindakanListState copyWith({
    List<Tindakan>? items,
    bool? isLoading,
    String? error,
    String? searchQuery,
  }) {
    return TindakanListState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

class TindakanListNotifier extends StateNotifier<TindakanListState> {
  final InventoryRepository _repository;

  TindakanListNotifier(this._repository) : super(TindakanListState());

  Future<void> loadItems({String? search}) async {
    state = state.copyWith(isLoading: true, error: null, searchQuery: search);

    try {
      final items = await _repository.getTindakanList(search: search);
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() async {
    await loadItems(search: state.searchQuery);
  }

  void setSearch(String? query) {
    loadItems(search: query);
  }

  Future<bool> deleteItem(int id) async {
    try {
      await _repository.deleteTindakan(id);
      await refresh();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final tindakanListProvider = StateNotifierProvider<TindakanListNotifier, TindakanListState>((ref) {
  final repository = ref.watch(inventoryRepositoryProvider);
  return TindakanListNotifier(repository);
});

// Inventory Stats
final inventoryStatsProvider = FutureProvider<InventoryStats>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getStats();
});

// Kategori List
final kategoriListProvider = FutureProvider<List<String>>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getKategoriList();
});
