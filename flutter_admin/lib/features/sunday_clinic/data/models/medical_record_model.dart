class MedicalRecord {
  final int? id;
  final String? mrId;
  final String patientId;
  final String? patientName;
  final String visitLocation;
  final String recordStatus;
  final String category;
  final Map<String, dynamic>? anamnesaData;
  final Map<String, dynamic>? physicalExamData;
  final Map<String, dynamic>? obstetricsExamData;
  final Map<String, dynamic>? supportingData;
  final Map<String, dynamic>? usgObstetriData;
  final Map<String, dynamic>? usgGynecologyData;
  final Map<String, dynamic>? diagnosisData;
  final Map<String, dynamic>? planData;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? createdBy;

  MedicalRecord({
    this.id,
    this.mrId,
    required this.patientId,
    this.patientName,
    required this.visitLocation,
    this.recordStatus = 'draft',
    required this.category,
    this.anamnesaData,
    this.physicalExamData,
    this.obstetricsExamData,
    this.supportingData,
    this.usgObstetriData,
    this.usgGynecologyData,
    this.diagnosisData,
    this.planData,
    this.createdAt,
    this.updatedAt,
    this.createdBy,
  });

  factory MedicalRecord.fromJson(Map<String, dynamic> json) {
    return MedicalRecord(
      id: json['id'],
      mrId: json['mr_id'],
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'],
      visitLocation: json['visit_location'] ?? 'klinik_private',
      recordStatus: json['record_status'] ?? json['status'] ?? 'draft',
      category: _mapCategoryFromBackend(json['mr_category'] ?? json['category']),
      anamnesaData: _parseJsonField(json['anamnesa_data']),
      physicalExamData: _parseJsonField(json['physical_exam_data']),
      obstetricsExamData: _parseJsonField(json['obstetrics_exam_data']),
      supportingData: _parseJsonField(json['supporting_data']),
      usgObstetriData: _parseJsonField(json['usg_obstetri_data']),
      usgGynecologyData: _parseJsonField(json['usg_gynecology_data']),
      diagnosisData: _parseJsonField(json['diagnosis_data']),
      planData: _parseJsonField(json['plan_data']),
      createdAt: _parseDate(json['created_at'] ?? json['visit_date']),
      updatedAt: _parseDate(json['updated_at']),
      createdBy: json['created_by'],
    );
  }

  // Parse complex API response: { record, patient, appointment, intake, medicalRecords, summary }
  factory MedicalRecord.fromApiResponse(Map<String, dynamic> apiResponse) {
    final record = apiResponse['record'] as Map<String, dynamic>? ?? apiResponse;
    final patient = apiResponse['patient'] as Map<String, dynamic>?;
    final medicalRecords = apiResponse['medicalRecords'] as Map<String, dynamic>?;

    // Parse section data from medicalRecords
    Map<String, dynamic>? anamnesaData;
    Map<String, dynamic>? physicalExamData;
    Map<String, dynamic>? obstetricsExamData;
    Map<String, dynamic>? supportingData;
    Map<String, dynamic>? usgObstetriData;
    Map<String, dynamic>? usgGynecologyData;
    Map<String, dynamic>? diagnosisData;
    Map<String, dynamic>? planData;

    if (medicalRecords != null) {
      anamnesaData = _parseJsonField(medicalRecords['anamnesa']);
      physicalExamData = _parseJsonField(medicalRecords['physicalExam']);
      obstetricsExamData = _parseJsonField(medicalRecords['pemeriksaanObstetri']);
      supportingData = _parseJsonField(medicalRecords['penunjang']);
      usgObstetriData = _parseJsonField(medicalRecords['usgObstetri']);
      usgGynecologyData = _parseJsonField(medicalRecords['usg']);
      diagnosisData = _parseJsonField(medicalRecords['diagnosis']);
      planData = _parseJsonField(medicalRecords['plan']);
    }

    return MedicalRecord(
      id: record['id'],
      mrId: record['mrId'] ?? record['mr_id'],
      patientId: record['patientId']?.toString() ?? record['patient_id']?.toString() ?? '',
      patientName: patient?['fullName'] ?? patient?['full_name'] ?? record['patient_name'],
      visitLocation: record['visitLocation'] ?? record['visit_location'] ?? 'klinik_private',
      recordStatus: record['status'] ?? record['record_status'] ?? 'draft',
      category: _mapCategoryFromBackend(record['category'] ?? record['mr_category']),
      anamnesaData: anamnesaData,
      physicalExamData: physicalExamData,
      obstetricsExamData: obstetricsExamData,
      supportingData: supportingData,
      usgObstetriData: usgObstetriData,
      usgGynecologyData: usgGynecologyData,
      diagnosisData: diagnosisData,
      planData: planData,
      createdAt: _parseDate(record['createdAt'] ?? record['created_at']),
      updatedAt: _parseDate(record['updatedAt'] ?? record['updated_at']),
      createdBy: record['createdBy'] ?? record['created_by'],
    );
  }

  static String _mapCategoryFromBackend(String? category) {
    if (category == null) return 'Obstetri';
    switch (category.toLowerCase()) {
      case 'obstetri':
        return 'Obstetri';
      case 'gyn_repro':
        return 'Gyn/Repro';
      case 'gyn_special':
        return 'Ginekologi';
      default:
        return category;
    }
  }

  static DateTime? _parseDate(dynamic date) {
    if (date == null) return null;
    if (date is DateTime) return date;
    if (date is String) return DateTime.tryParse(date);
    return null;
  }

  static Map<String, dynamic>? _parseJsonField(dynamic field) {
    if (field == null) return null;
    if (field is Map<String, dynamic>) return field;
    if (field is String) {
      try {
        return Map<String, dynamic>.from(field as Map);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      if (mrId != null) 'mr_id': mrId,
      'patient_id': patientId,
      'visit_location': visitLocation,
      'record_status': recordStatus,
      'category': category,
      if (anamnesaData != null) 'anamnesa_data': anamnesaData,
      if (physicalExamData != null) 'physical_exam_data': physicalExamData,
      if (obstetricsExamData != null) 'obstetrics_exam_data': obstetricsExamData,
      if (supportingData != null) 'supporting_data': supportingData,
      if (usgObstetriData != null) 'usg_obstetri_data': usgObstetriData,
      if (usgGynecologyData != null) 'usg_gynecology_data': usgGynecologyData,
      if (diagnosisData != null) 'diagnosis_data': diagnosisData,
      if (planData != null) 'plan_data': planData,
    };
  }

  MedicalRecord copyWith({
    int? id,
    String? mrId,
    String? patientId,
    String? patientName,
    String? visitLocation,
    String? recordStatus,
    String? category,
    Map<String, dynamic>? anamnesaData,
    Map<String, dynamic>? physicalExamData,
    Map<String, dynamic>? obstetricsExamData,
    Map<String, dynamic>? supportingData,
    Map<String, dynamic>? usgObstetriData,
    Map<String, dynamic>? usgGynecologyData,
    Map<String, dynamic>? diagnosisData,
    Map<String, dynamic>? planData,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
  }) {
    return MedicalRecord(
      id: id ?? this.id,
      mrId: mrId ?? this.mrId,
      patientId: patientId ?? this.patientId,
      patientName: patientName ?? this.patientName,
      visitLocation: visitLocation ?? this.visitLocation,
      recordStatus: recordStatus ?? this.recordStatus,
      category: category ?? this.category,
      anamnesaData: anamnesaData ?? this.anamnesaData,
      physicalExamData: physicalExamData ?? this.physicalExamData,
      obstetricsExamData: obstetricsExamData ?? this.obstetricsExamData,
      supportingData: supportingData ?? this.supportingData,
      usgObstetriData: usgObstetriData ?? this.usgObstetriData,
      usgGynecologyData: usgGynecologyData ?? this.usgGynecologyData,
      diagnosisData: diagnosisData ?? this.diagnosisData,
      planData: planData ?? this.planData,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
    );
  }

  bool get isFinalized => recordStatus == 'finalized';
  bool get isDraft => recordStatus == 'draft';

  String get locationDisplayName {
    switch (visitLocation) {
      case 'klinik_private':
        return 'Klinik Privat';
      case 'rsia_melinda':
        return 'RSIA Melinda';
      case 'rsud_gambiran':
        return 'RSUD Gambiran';
      case 'rs_bhayangkara':
        return 'RS Bhayangkara';
      default:
        return visitLocation;
    }
  }
}

class QueueItem {
  final int id;
  final String patientId;
  final String patientName;
  final String? patientPhone;
  final int? patientAge;
  final int? session;
  final String? sessionLabel;
  final int? slotNumber;
  final String? slotTime;
  final String? chiefComplaint;
  final String? consultationCategory;
  final String? category;
  final String status;
  final String? appointmentDate;
  final bool hasRecord;
  final String? recordStatus;
  final String? mrId;
  final String? mrCategory;

  QueueItem({
    required this.id,
    required this.patientId,
    required this.patientName,
    this.patientPhone,
    this.patientAge,
    this.session,
    this.sessionLabel,
    this.slotNumber,
    this.slotTime,
    this.chiefComplaint,
    this.consultationCategory,
    this.category,
    required this.status,
    this.appointmentDate,
    this.hasRecord = false,
    this.recordStatus,
    this.mrId,
    this.mrCategory,
  });

  factory QueueItem.fromJson(Map<String, dynamic> json) {
    return QueueItem(
      id: json['id'] ?? 0,
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'] ?? '',
      patientPhone: json['patient_phone'],
      patientAge: json['patient_age'],
      session: json['session'],
      sessionLabel: json['session_label'],
      slotNumber: json['slot_number'],
      slotTime: json['slot_time'],
      chiefComplaint: json['chief_complaint'],
      consultationCategory: json['consultation_category'],
      category: json['mr_category'] ?? json['consultation_category'],
      status: json['status'] ?? 'pending',
      appointmentDate: json['appointment_date']?.toString(),
      hasRecord: json['has_record'] == true || json['has_record'] == 1,
      recordStatus: json['record_status'],
      mrId: json['mr_id'],
      mrCategory: json['mr_category'],
    );
  }

  String get initials {
    final parts = patientName.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return patientName.isNotEmpty ? patientName[0].toUpperCase() : '?';
  }

  String get displayAge => patientAge != null ? '$patientAge tahun' : '-';
  String get displayTime => slotTime ?? sessionLabel ?? '-';
  String get displayComplaint => chiefComplaint ?? '-';

  bool get isCompleted => recordStatus == 'finalized';
  bool get isInProgress => hasRecord && recordStatus == 'draft';
  bool get isPending => !hasRecord;

  String get statusText {
    if (isCompleted) return 'Selesai';
    if (isInProgress) return 'Sedang Diperiksa';
    return 'Menunggu';
  }
}

class VisitLocation {
  final String id;
  final String name;
  final bool hasBilling;

  const VisitLocation({
    required this.id,
    required this.name,
    this.hasBilling = false,
  });

  static const List<VisitLocation> all = [
    VisitLocation(id: 'klinik_private', name: 'Klinik Privat', hasBilling: true),
    VisitLocation(id: 'rsia_melinda', name: 'RSIA Melinda'),
    VisitLocation(id: 'rsud_gambiran', name: 'RSUD Gambiran'),
    VisitLocation(id: 'rs_bhayangkara', name: 'RS Bhayangkara'),
  ];

  static VisitLocation fromId(String id) {
    return all.firstWhere(
      (loc) => loc.id == id,
      orElse: () => all.first,
    );
  }
}

class PatientCategory {
  final String id;
  final String name;

  const PatientCategory({required this.id, required this.name});

  static const List<PatientCategory> all = [
    PatientCategory(id: 'Obstetri', name: 'Obstetri'),
    PatientCategory(id: 'Gyn/Repro', name: 'Gyn/Repro'),
    PatientCategory(id: 'Ginekologi', name: 'Ginekologi'),
  ];
}

// Billing Models
class Billing {
  final int? id;
  final String mrId;
  final String? patientId;
  final String? patientName;
  final List<BillingItem> items;
  final double subtotal;
  final double discount;
  final double tax;
  final double grandTotal;
  final String status;
  final String? confirmedBy;
  final DateTime? confirmedAt;
  final String? invoiceUrl;
  final String? etiketUrl;
  final DateTime? createdAt;

  Billing({
    this.id,
    required this.mrId,
    this.patientId,
    this.patientName,
    this.items = const [],
    this.subtotal = 0,
    this.discount = 0,
    this.tax = 0,
    this.grandTotal = 0,
    this.status = 'draft',
    this.confirmedBy,
    this.confirmedAt,
    this.invoiceUrl,
    this.etiketUrl,
    this.createdAt,
  });

  factory Billing.fromJson(Map<String, dynamic> json) {
    final itemsList = json['items'] as List? ?? [];
    return Billing(
      id: json['id'],
      mrId: json['mr_id']?.toString() ?? json['mrId']?.toString() ?? '',
      patientId: json['patient_id']?.toString(),
      patientName: json['patient_name'],
      items: itemsList.map((item) => BillingItem.fromJson(item)).toList(),
      subtotal: (json['subtotal'] ?? 0).toDouble(),
      discount: (json['discount'] ?? 0).toDouble(),
      tax: (json['tax'] ?? 0).toDouble(),
      grandTotal: (json['grand_total'] ?? json['grandTotal'] ?? 0).toDouble(),
      status: json['status'] ?? 'draft',
      confirmedBy: json['confirmed_by'],
      confirmedAt: json['confirmed_at'] != null
          ? DateTime.tryParse(json['confirmed_at'].toString())
          : null,
      invoiceUrl: json['invoice_url'],
      etiketUrl: json['etiket_url'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
    );
  }

  bool get isDraft => status == 'draft';
  bool get isConfirmed => status == 'confirmed';
  bool get isPaid => status == 'paid';
  bool get hasInvoice => invoiceUrl != null && invoiceUrl!.isNotEmpty;
  bool get hasEtiket => etiketUrl != null && etiketUrl!.isNotEmpty;

  String get statusDisplayName {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'confirmed':
        return 'Dikonfirmasi';
      case 'paid':
        return 'Lunas';
      default:
        return status;
    }
  }

  Billing copyWith({
    int? id,
    String? mrId,
    String? patientId,
    String? patientName,
    List<BillingItem>? items,
    double? subtotal,
    double? discount,
    double? tax,
    double? grandTotal,
    String? status,
    String? confirmedBy,
    DateTime? confirmedAt,
    String? invoiceUrl,
    String? etiketUrl,
    DateTime? createdAt,
  }) {
    return Billing(
      id: id ?? this.id,
      mrId: mrId ?? this.mrId,
      patientId: patientId ?? this.patientId,
      patientName: patientName ?? this.patientName,
      items: items ?? this.items,
      subtotal: subtotal ?? this.subtotal,
      discount: discount ?? this.discount,
      tax: tax ?? this.tax,
      grandTotal: grandTotal ?? this.grandTotal,
      status: status ?? this.status,
      confirmedBy: confirmedBy ?? this.confirmedBy,
      confirmedAt: confirmedAt ?? this.confirmedAt,
      invoiceUrl: invoiceUrl ?? this.invoiceUrl,
      etiketUrl: etiketUrl ?? this.etiketUrl,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class BillingItem {
  final int? id;
  final String type;
  final String? code;
  final String name;
  final int quantity;
  final double price;
  final double total;
  final String? notes;

  BillingItem({
    this.id,
    required this.type,
    this.code,
    required this.name,
    this.quantity = 1,
    required this.price,
    double? total,
    this.notes,
  }) : total = total ?? (price * quantity);

  factory BillingItem.fromJson(Map<String, dynamic> json) {
    final qty = (json['quantity'] ?? json['qty'] ?? 1).toInt();
    final price = (json['price'] ?? json['unit_price'] ?? 0).toDouble();
    return BillingItem(
      id: json['id'],
      type: json['type'] ?? json['item_type'] ?? 'tindakan',
      code: json['code'] ?? json['item_code'],
      name: json['name'] ?? json['item_name'] ?? '',
      quantity: qty,
      price: price,
      total: (json['total'] ?? json['subtotal'] ?? (price * qty)).toDouble(),
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'type': type,
      if (code != null) 'code': code,
      'name': name,
      'quantity': quantity,
      'price': price,
      'total': total,
      if (notes != null) 'notes': notes,
    };
  }

  String get typeDisplayName {
    switch (type) {
      case 'tindakan':
        return 'Tindakan';
      case 'obat':
        return 'Obat';
      case 'admin':
        return 'Admin';
      default:
        return type;
    }
  }
}

// Send to Patient Models
class SendToPatientRequest {
  final String mrId;
  final bool sendResumeMedis;
  final bool sendLabResults;
  final bool sendUsgPhotos;
  final String channel;
  final String? phoneNumber;
  final String? notes;

  SendToPatientRequest({
    required this.mrId,
    this.sendResumeMedis = true,
    this.sendLabResults = false,
    this.sendUsgPhotos = false,
    this.channel = 'portal',
    this.phoneNumber,
    this.notes,
  });

  Map<String, dynamic> toJson() {
    return {
      'mr_id': mrId,
      'send_resume_medis': sendResumeMedis,
      'send_lab_results': sendLabResults,
      'send_usg_photos': sendUsgPhotos,
      'channel': channel,
      if (phoneNumber != null) 'phone': phoneNumber,
      if (notes != null) 'notes': notes,
    };
  }
}

class DocumentsSent {
  final bool resumeMedis;
  final bool labResults;
  final bool usgPhotos;
  final DateTime? lastSentAt;
  final String? sentVia;

  DocumentsSent({
    this.resumeMedis = false,
    this.labResults = false,
    this.usgPhotos = false,
    this.lastSentAt,
    this.sentVia,
  });

  factory DocumentsSent.fromJson(Map<String, dynamic> json) {
    return DocumentsSent(
      resumeMedis: json['resume_medis'] == true,
      labResults: json['lab_results'] == true,
      usgPhotos: json['usg_photos'] == true,
      lastSentAt: json['last_sent_at'] != null
          ? DateTime.tryParse(json['last_sent_at'].toString())
          : null,
      sentVia: json['sent_via'],
    );
  }

  bool get hasSentAny => resumeMedis || labResults || usgPhotos;
}

// Patient Visit History Model (for directory)
class PatientVisit {
  final String mrId;
  final String patientId;
  final String patientName;
  final String visitLocation;
  final String category;
  final String status;
  final DateTime visitDate;
  final String? diagnosis;
  final bool hasInvoice;
  final bool documentsSent;

  PatientVisit({
    required this.mrId,
    required this.patientId,
    required this.patientName,
    required this.visitLocation,
    required this.category,
    required this.status,
    required this.visitDate,
    this.diagnosis,
    this.hasInvoice = false,
    this.documentsSent = false,
  });

  factory PatientVisit.fromJson(Map<String, dynamic> json) {
    return PatientVisit(
      mrId: json['mr_id']?.toString() ?? '',
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'] ?? '',
      visitLocation: json['visit_location'] ?? 'klinik_private',
      category: json['mr_category'] ?? json['category'] ?? 'Obstetri',
      status: json['status'] ?? json['record_status'] ?? 'draft',
      visitDate: DateTime.tryParse(json['visit_date']?.toString() ??
          json['created_at']?.toString() ?? '') ?? DateTime.now(),
      diagnosis: json['diagnosis'],
      hasInvoice: json['has_invoice'] == true,
      documentsSent: json['documents_sent'] == true,
    );
  }

  String get locationDisplayName {
    switch (visitLocation) {
      case 'klinik_private':
        return 'Klinik Privat';
      case 'rsia_melinda':
        return 'RSIA Melinda';
      case 'rsud_gambiran':
        return 'RSUD Gambiran';
      case 'rs_bhayangkara':
        return 'RS Bhayangkara';
      default:
        return visitLocation;
    }
  }

  bool get isFinalized => status == 'finalized';
}
