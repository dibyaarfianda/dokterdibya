import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/patient_model.dart';

class PatientRepository {
  final ApiClient _apiClient;

  PatientRepository(this._apiClient);

  Future<PatientListResponse> getPatients({
    int page = 1,
    int limit = 20,
    String? search,
    String? category,
    String? sortBy,
    String? sortOrder,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };

    if (search != null && search.isNotEmpty) {
      queryParams['search'] = search;
    }
    if (category != null && category.isNotEmpty) {
      queryParams['category'] = category;
    }
    if (sortBy != null) {
      queryParams['sortBy'] = sortBy;
    }
    if (sortOrder != null) {
      queryParams['sortOrder'] = sortOrder;
    }

    final response = await _apiClient.get(
      ApiEndpoints.patients,
      queryParameters: queryParams,
    );

    return PatientListResponse.fromJson(response.data);
  }

  Future<Patient> getPatientById(String id) async {
    final response = await _apiClient.get('${ApiEndpoints.patients}/$id');
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return Patient.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal mengambil data pasien');
  }

  Future<List<Patient>> searchPatients({
    String? name,
    String? mrId,
    String? phone,
    String? email,
    String? husbandName,
    int? minAge,
    int? maxAge,
    String? category,
    String? examDate,
  }) async {
    final queryParams = <String, dynamic>{};

    if (name != null && name.isNotEmpty) queryParams['name'] = name;
    if (mrId != null && mrId.isNotEmpty) queryParams['mr_id'] = mrId;
    if (phone != null && phone.isNotEmpty) queryParams['phone'] = phone;
    if (email != null && email.isNotEmpty) queryParams['email'] = email;
    if (husbandName != null && husbandName.isNotEmpty) queryParams['husband_name'] = husbandName;
    if (minAge != null) queryParams['min_age'] = minAge;
    if (maxAge != null) queryParams['max_age'] = maxAge;
    if (category != null && category.isNotEmpty) queryParams['category'] = category;
    if (examDate != null && examDate.isNotEmpty) queryParams['exam_date'] = examDate;

    final response = await _apiClient.get(
      ApiEndpoints.patientSearch,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List).map((p) => Patient.fromJson(p)).toList();
    }
    return [];
  }

  Future<Patient> createPatient(Map<String, dynamic> patientData) async {
    final response = await _apiClient.post(
      ApiEndpoints.patients,
      data: patientData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Patient.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal menambahkan pasien');
  }

  Future<Patient> updatePatient(String id, Map<String, dynamic> patientData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.patients}/$id',
      data: patientData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Patient.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui pasien');
  }

  Future<void> deletePatient(String id) async {
    final response = await _apiClient.delete('${ApiEndpoints.patients}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus pasien');
    }
  }

  Future<Map<String, dynamic>> getPatientHistory(String id) async {
    // Use sunday-clinic endpoint for patient visits
    final response = await _apiClient.get('${ApiEndpoints.sundayClinic}/patient-visits/$id');
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      // Wrap in 'visits' key to match expected format
      return {'visits': data['data']};
    }
    return {'visits': []};
  }
}

final patientRepositoryProvider = Provider<PatientRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PatientRepository(apiClient);
});
