import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/billing_model.dart';

class BillingRepository {
  final ApiClient _apiClient;

  BillingRepository(this._apiClient);

  /// Get billing for a medical record
  Future<Billing?> getBillingByMrId(String mrId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/billing/$mrId',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Billing.fromJson(data['data']);
    }
    return null;
  }

  /// Create or update billing for a medical record
  Future<Billing> saveBilling({
    required String mrId,
    required List<BillingItem> items,
    String status = 'draft',
    Map<String, dynamic>? billingData,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId',
      data: {
        'items': items.map((i) => i.toJson()).toList(),
        'status': status,
        if (billingData != null) 'billingData': billingData,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Billing.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menyimpan billing');
  }

  /// Confirm billing
  Future<Billing> confirmBilling(String mrId) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId/confirm',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Billing.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal konfirmasi billing');
  }

  /// Mark billing as paid
  Future<Billing> markAsPaid(String mrId, {String? paymentMethod}) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId/pay',
      data: {
        if (paymentMethod != null) 'payment_method': paymentMethod,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Billing.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal update status pembayaran');
  }

  /// Generate invoice PDF
  Future<String> generateInvoice(String mrId) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId/invoice',
    );

    final data = response.data;
    if (data['success'] == true && data['downloadUrl'] != null) {
      return data['downloadUrl'];
    }
    throw Exception(data['message'] ?? 'Gagal generate invoice');
  }

  /// Generate etiket PDF
  Future<String> generateEtiket(String mrId) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId/etiket',
    );

    final data = response.data;
    if (data['success'] == true && data['downloadUrl'] != null) {
      return data['downloadUrl'];
    }
    throw Exception(data['message'] ?? 'Gagal generate etiket');
  }

  /// Request change to billing
  Future<void> requestChange({
    required String mrId,
    required String type,
    required String description,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/billing/$mrId/change-request',
      data: {
        'type': type,
        'description': description,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal submit permintaan perubahan');
    }
  }

  /// Get list of medications for billing
  Future<List<Medication>> searchMedications({
    String? query,
    int limit = 20,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.obat,
      queryParameters: {
        if (query != null && query.isNotEmpty) 'search': query,
        'limit': limit,
        'in_stock': true,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((m) => Medication.fromJson(m)).toList();
    }
    return [];
  }

  /// Get list of services for billing
  Future<List<Service>> searchServices({
    String? query,
    int limit = 20,
  }) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.obat}/tindakan',
      queryParameters: {
        if (query != null && query.isNotEmpty) 'search': query,
        'limit': limit,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((s) => Service.fromJson(s)).toList();
    }
    return [];
  }

  /// Get billing history for a patient
  Future<List<Billing>> getPatientBillingHistory(String patientId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/patients/$patientId/billings',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((b) => Billing.fromJson(b)).toList();
    }
    return [];
  }
}

final billingRepositoryProvider = Provider<BillingRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return BillingRepository(apiClient);
});
