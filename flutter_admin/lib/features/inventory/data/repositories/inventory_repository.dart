import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/inventory_model.dart';

class InventoryRepository {
  final ApiClient _apiClient;

  InventoryRepository(this._apiClient);

  // Obat (Medications)
  Future<List<Obat>> getObatList({
    String? search,
    String? kategori,
    bool? inStock,
    bool? lowStock,
    int page = 1,
    int limit = 50,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (kategori != null) queryParams['kategori'] = kategori;
    if (inStock != null) queryParams['in_stock'] = inStock;
    if (lowStock != null) queryParams['low_stock'] = lowStock;

    final response = await _apiClient.get(
      ApiEndpoints.obat,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((o) => Obat.fromJson(o)).toList();
    }
    return [];
  }

  Future<Obat?> getObatById(int id) async {
    final response = await _apiClient.get('${ApiEndpoints.obat}/$id');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Obat.fromJson(data['data']);
    }
    return null;
  }

  Future<Obat> createObat(Obat obat) async {
    final response = await _apiClient.post(
      ApiEndpoints.obat,
      data: obat.toJson(),
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Obat.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menambah obat');
  }

  Future<Obat> updateObat(int id, Map<String, dynamic> updates) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.obat}/$id',
      data: updates,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Obat.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal update obat');
  }

  Future<void> deleteObat(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.obat}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus obat');
    }
  }

  Future<void> adjustStock(int obatId, int quantity, String type, {String? reason}) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.obat}/$obatId/adjust-stock',
      data: {
        'quantity': quantity,
        'type': type,
        if (reason != null) 'reason': reason,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal update stok');
    }
  }

  // Tindakan (Services)
  Future<List<Tindakan>> getTindakanList({
    String? search,
    String? kategori,
    int page = 1,
    int limit = 50,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (kategori != null) queryParams['kategori'] = kategori;

    final response = await _apiClient.get(
      '${ApiEndpoints.obat}/tindakan',
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((t) => Tindakan.fromJson(t)).toList();
    }
    return [];
  }

  Future<Tindakan> createTindakan(Tindakan tindakan) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.obat}/tindakan',
      data: tindakan.toJson(),
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Tindakan.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menambah tindakan');
  }

  Future<Tindakan> updateTindakan(int id, Map<String, dynamic> updates) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.obat}/tindakan/$id',
      data: updates,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Tindakan.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal update tindakan');
  }

  Future<void> deleteTindakan(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.obat}/tindakan/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus tindakan');
    }
  }

  // Stats
  Future<InventoryStats> getStats() async {
    final response = await _apiClient.get('${ApiEndpoints.obat}/stats');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return InventoryStats.fromJson(data['data']);
    }
    return InventoryStats();
  }

  // Categories
  Future<List<String>> getKategoriList() async {
    final response = await _apiClient.get('${ApiEndpoints.obat}/kategori');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return List<String>.from(data['data']);
    }
    return [];
  }
}

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return InventoryRepository(apiClient);
});
