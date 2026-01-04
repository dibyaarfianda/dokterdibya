import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/service_model.dart';

class ServiceRepository {
  final ApiClient _apiClient;

  ServiceRepository(this._apiClient);

  Future<List<MedicalService>> getServices() async {
    final response = await _apiClient.get(ApiEndpoints.tindakan);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((s) => MedicalService.fromJson(s))
          .toList();
    }
    return [];
  }

  Future<MedicalService> createService(Map<String, dynamic> serviceData) async {
    final response = await _apiClient.post(
      ApiEndpoints.tindakan,
      data: serviceData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalService.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat layanan');
  }

  Future<MedicalService> updateService(int id, Map<String, dynamic> serviceData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.tindakan}/$id',
      data: serviceData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalService.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui layanan');
  }

  Future<void> deleteService(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.tindakan}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus layanan');
    }
  }
}

final serviceRepositoryProvider = Provider<ServiceRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ServiceRepository(apiClient);
});
