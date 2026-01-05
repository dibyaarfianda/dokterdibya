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
    final queryParams = <String, dynamic>{};
    if (search != null && search.isNotEmpty) queryParams['search'] = search;

    final response = await _apiClient.get(
      ApiEndpoints.sundayClinicDirectory,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      // API returns { data: { patients: [...], totalPatients, totalRecords } }
      final directoryData = data['data'] as Map<String, dynamic>;
      final patients = directoryData['patients'] as List? ?? [];

      // Flatten patients with visits into QueueItem list
      final List<QueueItem> items = [];
      int index = 0;
      for (final patient in patients) {
        final patientMap = patient as Map<String, dynamic>;
        final visits = patientMap['visits'] as List? ?? [];

        for (final visit in visits) {
          final visitMap = visit as Map<String, dynamic>;
          items.add(QueueItem(
            id: index++, // Generate sequential ID for directory items
            patientId: patientMap['patientId']?.toString() ?? '',
            patientName: patientMap['fullName']?.toString() ?? '',
            patientAge: patientMap['age'] is int ? patientMap['age'] : null,
            patientPhone: patientMap['phone']?.toString() ?? patientMap['whatsapp']?.toString(),
            mrId: visitMap['mrId']?.toString(),
            appointmentDate: visitMap['appointmentDate']?.toString(),
            category: null, // Not available in directory response
            chiefComplaint: visitMap['chiefComplaint']?.toString(),
            status: visitMap['recordStatus']?.toString() ?? visitMap['appointmentStatus']?.toString() ?? 'completed',
            hasRecord: visitMap['mrId'] != null,
          ));
        }
      }
      return items;
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

  // ========== BILLING ==========

  Future<Billing?> getBilling(String mrId) async {
    final response = await _apiClient.get(ApiEndpoints.sundayClinicBilling(mrId));

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Billing.fromJson(data['data']);
    }
    return null;
  }

  Future<Billing> addBillingItem({
    required String mrId,
    required String type,
    required String name,
    String? code,
    int quantity = 1,
    required double price,
    String? notes,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.sundayClinicBilling(mrId),
      data: {
        'type': type,
        'name': name,
        if (code != null) 'code': code,
        'quantity': quantity,
        'price': price,
        if (notes != null) 'notes': notes,
      },
    );

    final data = response.data;
    if (data['success'] == true) {
      final billing = await getBilling(mrId);
      if (billing != null) return billing;
    }
    throw Exception(data['message'] ?? 'Gagal menambahkan item');
  }

  Future<void> deleteBillingItem(String mrId, int itemId) async {
    final response = await _apiClient.delete(
      '${ApiEndpoints.sundayClinicBilling(mrId)}/items/$itemId',
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus item');
    }
  }

  Future<Billing> confirmBilling(String mrId) async {
    final response = await _apiClient.post(ApiEndpoints.sundayClinicBillingConfirm(mrId));

    final data = response.data;
    if (data['success'] == true) {
      final billing = await getBilling(mrId);
      if (billing != null) return billing;
    }
    throw Exception(data['message'] ?? 'Gagal konfirmasi billing');
  }

  Future<Billing> markBillingPaid(String mrId) async {
    final response = await _apiClient.post(ApiEndpoints.sundayClinicBillingPaid(mrId));

    final data = response.data;
    if (data['success'] == true) {
      final billing = await getBilling(mrId);
      if (billing != null) return billing;
    }
    throw Exception(data['message'] ?? 'Gagal update status pembayaran');
  }

  Future<String> printInvoice(String mrId) async {
    final response = await _apiClient.post(ApiEndpoints.sundayClinicPrintInvoice(mrId));

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      // Returns download URL
      return data['data']['downloadUrl'] ?? data['data']['url'] ?? '';
    }
    throw Exception(data['message'] ?? 'Gagal mencetak invoice');
  }

  Future<String> printEtiket(String mrId) async {
    final response = await _apiClient.post(ApiEndpoints.sundayClinicPrintEtiket(mrId));

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return data['data']['downloadUrl'] ?? data['data']['url'] ?? '';
    }
    throw Exception(data['message'] ?? 'Gagal mencetak etiket');
  }

  // ========== SEND TO PATIENT ==========

  Future<String> generateResumeMedisPdf(String mrId) async {
    final response = await _apiClient.post(
      ApiEndpoints.sundayClinicResumeMedisPdf,
      data: {'mr_id': mrId},
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return data['data']['downloadUrl'] ?? data['data']['url'] ?? '';
    }
    throw Exception(data['message'] ?? 'Gagal generate PDF');
  }

  Future<void> sendToWhatsApp({
    required String mrId,
    required String phone,
    bool sendResumeMedis = true,
    bool sendLabResults = false,
    bool sendUsgPhotos = false,
    String? message,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.sundayClinicResumeMedisSendWhatsApp,
      data: {
        'mr_id': mrId,
        'phone': phone,
        'send_resume_medis': sendResumeMedis,
        'send_lab_results': sendLabResults,
        'send_usg_photos': sendUsgPhotos,
        if (message != null) 'message': message,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal mengirim ke WhatsApp');
    }
  }

  Future<void> sendToPatientPortal({
    required String mrId,
    bool sendResumeMedis = true,
    bool sendLabResults = false,
    bool sendUsgPhotos = false,
    String? notes,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.sundayClinicSendToPatient(mrId),
      data: {
        'send_resume_medis': sendResumeMedis,
        'send_lab_results': sendLabResults,
        'send_usg_photos': sendUsgPhotos,
        if (notes != null) 'notes': notes,
      },
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal mengirim ke portal pasien');
    }
  }

  Future<DocumentsSent?> getDocumentsSentStatus(String mrId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/records/$mrId/documents-sent',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return DocumentsSent.fromJson(data['data']);
    }
    return null;
  }

  // ========== USG UPLOAD ==========

  Future<Map<String, dynamic>> uploadUsgImage({
    required String mrId,
    required List<int> imageBytes,
    required String filename,
    String? description,
  }) async {
    // Note: For image upload, we'd typically use multipart/form-data
    // This is a placeholder - actual implementation depends on backend
    final response = await _apiClient.post(
      ApiEndpoints.sundayClinicUsgUpload(mrId),
      data: {
        'filename': filename,
        'image_base64': imageBytes.isNotEmpty ? _bytesToBase64(imageBytes) : null,
        if (description != null) 'description': description,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return data['data'];
    }
    throw Exception(data['message'] ?? 'Gagal upload gambar USG');
  }

  String _bytesToBase64(List<int> bytes) {
    // Simple base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    final encoded = StringBuffer();
    int padding = 0;

    for (int i = 0; i < bytes.length; i += 3) {
      final b1 = bytes[i];
      final b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      final b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;

      encoded.write(chars[(b1 >> 2) & 0x3F]);
      encoded.write(chars[((b1 << 4) | (b2 >> 4)) & 0x3F]);
      encoded.write(i + 1 < bytes.length ? chars[((b2 << 2) | (b3 >> 6)) & 0x3F] : '=');
      encoded.write(i + 2 < bytes.length ? chars[b3 & 0x3F] : '=');
    }

    return encoded.toString();
  }

  // Get list of uploaded USG images for a record
  Future<List<Map<String, dynamic>>> getUsgImages(String mrId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.sundayClinic}/records/$mrId/usg-images',
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return [];
  }

  Future<void> deleteUsgImage(String mrId, String imageId) async {
    final response = await _apiClient.delete(
      '${ApiEndpoints.sundayClinic}/records/$mrId/usg-images/$imageId',
    );

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus gambar');
    }
  }

  // ========== TINDAKAN & OBAT (for billing items) ==========

  Future<List<Map<String, dynamic>>> searchTindakan(String query) async {
    final response = await _apiClient.get(
      ApiEndpoints.tindakan,
      queryParameters: {'search': query, 'limit': 20},
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return [];
  }

  Future<List<Map<String, dynamic>>> searchObat(String query) async {
    final response = await _apiClient.get(
      ApiEndpoints.obat,
      queryParameters: {'search': query, 'limit': 20},
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return [];
  }
}

final sundayClinicRepositoryProvider = Provider<SundayClinicRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SundayClinicRepository(apiClient);
});
