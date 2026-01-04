import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/supplier_model.dart';

class SupplierRepository {
  final ApiClient _apiClient;

  SupplierRepository(this._apiClient);

  Future<List<Supplier>> getSuppliers() async {
    final response = await _apiClient.get(ApiEndpoints.suppliers);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((s) => Supplier.fromJson(s))
          .toList();
    }
    return [];
  }

  Future<Supplier> createSupplier(Map<String, dynamic> supplierData) async {
    final response = await _apiClient.post(
      ApiEndpoints.suppliers,
      data: supplierData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Supplier.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat supplier');
  }

  Future<Supplier> updateSupplier(int id, Map<String, dynamic> supplierData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.suppliers}/$id',
      data: supplierData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Supplier.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui supplier');
  }

  Future<void> deleteSupplier(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.suppliers}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus supplier');
    }
  }
}

final supplierRepositoryProvider = Provider<SupplierRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SupplierRepository(apiClient);
});
