import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/drug_sale_model.dart';

class DrugSaleRepository {
  final ApiClient _apiClient;

  DrugSaleRepository(this._apiClient);

  Future<List<DrugSale>> getSales({
    String? startDate,
    String? endDate,
    String? paymentStatus,
  }) async {
    final queryParams = <String, dynamic>{};
    if (startDate != null) queryParams['start_date'] = startDate;
    if (endDate != null) queryParams['end_date'] = endDate;
    if (paymentStatus != null) queryParams['payment_status'] = paymentStatus;

    final response = await _apiClient.get(
      ApiEndpoints.obatSales,
      queryParameters: queryParams.isNotEmpty ? queryParams : null,
    );
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((s) => DrugSale.fromJson(s))
          .toList();
    }
    return [];
  }

  Future<DrugSale> getSaleById(int id) async {
    final response = await _apiClient.get('${ApiEndpoints.obatSales}/$id');
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return DrugSale.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Penjualan tidak ditemukan');
  }

  Future<DrugSale> createSale(Map<String, dynamic> saleData) async {
    final response = await _apiClient.post(
      ApiEndpoints.obatSales,
      data: saleData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return DrugSale.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat penjualan');
  }

  Future<void> markAsPaid(int id, String paymentMethod) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.obatSales}/$id/pay',
      data: {'payment_method': paymentMethod},
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal update pembayaran');
    }
  }

  Future<void> deleteSale(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.obatSales}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus penjualan');
    }
  }
}

final drugSaleRepositoryProvider = Provider<DrugSaleRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DrugSaleRepository(apiClient);
});
