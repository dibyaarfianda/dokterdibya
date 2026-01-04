import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/medical_record_model.dart';

class SundayClinicRepository {
  final ApiClient _apiClient;

  SundayClinicRepository(this._apiClient);

  // Queue/Directory
  Future<List<QueueItem>> getTodayQueue({String? location}) async {
    final queryParams = <String, dynamic>{};
    if (location != null) {
      queryParams['location'] = location;
    }

    final response = await _apiClient.get(
      ApiEndpoints.sundayClinicQueue,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((q) => QueueItem.fromJson(q)).toList();
    }
    return [];
  }

  Future<List<QueueItem>> getDirectory({
    String? location,
    String? search,
    String? date,
    int page = 1,
    int limit = 20,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (location != null) queryParams['location'] = location;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (date != null) queryParams['date'] = date;

    final response = await _apiClient.get(
      ApiEndpoints.sundayClinicDirectory,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((q) => QueueItem.fromJson(q)).toList();
    }
    return [];
  }

  // Medical Records
  Future<MedicalRecord?> getRecord(int recordId) async {
    final response = await _apiClient.get('${ApiEndpoints.sundayClinic}/records/$recordId');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalRecord.fromJson(data['data']);
    }
    return null;
  }

  Future<MedicalRecord?> getRecordByPatient(String patientId, {String? location}) async {
    final queryParams = <String, dynamic>{
      'patient_id': patientId,
    };
    if (location != null) queryParams['location'] = location;

    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/records/by-patient',
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalRecord.fromJson(data['data']);
    }
    return null;
  }

  Future<MedicalRecord> createRecord({
    required String patientId,
    required String category,
    required String visitLocation,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/records',
      data: {
        'patient_id': patientId,
        'category': category,
        'visit_location': visitLocation,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalRecord.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat rekam medis');
  }

  Future<MedicalRecord> updateRecordSection({
    required int recordId,
    required String section,
    required Map<String, dynamic> sectionData,
  }) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.sundayClinic}/records/$recordId/sections/$section',
      data: sectionData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalRecord.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menyimpan data');
  }

  Future<MedicalRecord> finalizeRecord(int recordId) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/records/$recordId/finalize',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return MedicalRecord.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menyelesaikan rekam medis');
  }

  // Patient visits history
  Future<List<MedicalRecord>> getPatientVisits(String patientId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/patients/$patientId/visits',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((r) => MedicalRecord.fromJson(r)).toList();
    }
    return [];
  }

  // Add patient to queue
  Future<QueueItem> addToQueue({
    required String patientId,
    required String location,
    String? appointmentTime,
    String? notes,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/queue',
      data: {
        'patient_id': patientId,
        'location': location,
        if (appointmentTime != null) 'appointment_time': appointmentTime,
        if (notes != null) 'notes': notes,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return QueueItem.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menambahkan ke antrian');
  }

  // Remove from queue
  Future<void> removeFromQueue(int queueId) async {
    final response = await _apiClient.delete('${ApiEndpoints.sundayClinic}/queue/$queueId');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus dari antrian');
    }
  }
}

final sundayClinicRepositoryProvider = Provider<SundayClinicRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SundayClinicRepository(apiClient);
});
