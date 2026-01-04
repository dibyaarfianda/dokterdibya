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

  // Medical Records - uses MR ID (e.g., "DRD0001"), not numeric ID
  Future<MedicalRecord?> getRecord(int recordId) async {
    // Note: This method is deprecated, use getRecordByMrId instead
    // For backwards compatibility, we try to find by numeric ID in the queue
    return null;
  }

  Future<MedicalRecord?> getRecordByMrId(String mrId) async {
    final response = await _apiClient.get('${ApiEndpoints.sundayClinic}/records/$mrId');

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      // Backend returns { record, patient, appointment, intake, medicalRecords, summary }
      final recordData = data['data'];
      return MedicalRecord.fromApiResponse(recordData);
    }
    return null;
  }

  Future<MedicalRecord> createRecord({
    required String patientId,
    required String category,
    required String visitLocation,
  }) async {
    // Map category to backend format
    String backendCategory;
    switch (category.toLowerCase()) {
      case 'obstetri':
        backendCategory = 'obstetri';
        break;
      case 'gyn/repro':
      case 'ginekologi':
        backendCategory = 'gyn_repro';
        break;
      default:
        backendCategory = 'obstetri';
    }

    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/start-walk-in',
      data: {
        'patient_id': patientId,
        'category': backendCategory,
        'location': visitLocation,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      // Response contains mrId, category, location, etc.
      final mrId = data['data']['mrId'];
      // Fetch the full record
      final fullRecord = await getRecordByMrId(mrId);
      if (fullRecord != null) {
        return fullRecord;
      }
      // Fallback: create a minimal record from the response
      return MedicalRecord(
        mrId: mrId,
        patientId: patientId,
        category: category,
        visitLocation: visitLocation,
        recordStatus: 'draft',
      );
    }
    throw Exception(data['message'] ?? 'Gagal membuat rekam medis');
  }

  Future<MedicalRecord> updateRecordSection({
    required int recordId,
    required String section,
    required Map<String, dynamic> sectionData,
    String? mrId,
  }) async {
    // Use MR ID if available
    final id = mrId ?? recordId.toString();

    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/records/$id/$section',
      data: sectionData,
    );

    final data = response.data;
    if (data['success'] == true) {
      // Backend may return updated record or just success
      if (data['data'] != null) {
        return MedicalRecord.fromApiResponse({'record': data['data']});
      }
      // Fetch the updated record
      final updated = await getRecordByMrId(id);
      if (updated != null) return updated;
    }
    throw Exception(data['message'] ?? 'Gagal menyimpan data');
  }

  Future<MedicalRecord> finalizeRecord(int recordId, {String? mrId}) async {
    final id = mrId ?? recordId.toString();

    final response = await _apiClient.post(
      '${ApiEndpoints.sundayClinic}/records/$id/finalize',
    );

    final data = response.data;
    if (data['success'] == true) {
      if (data['data'] != null) {
        return MedicalRecord.fromApiResponse({'record': data['data']});
      }
      final updated = await getRecordByMrId(id);
      if (updated != null) return updated;
    }
    throw Exception(data['message'] ?? 'Gagal menyelesaikan rekam medis');
  }

  // Patient visits history
  Future<List<MedicalRecord>> getPatientVisits(String patientId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/patient-visits/$patientId',
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
