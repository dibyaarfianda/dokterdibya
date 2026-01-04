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
      recordStatus: json['record_status'] ?? 'draft',
      category: json['category'] ?? 'Obstetri',
      anamnesaData: _parseJsonField(json['anamnesa_data']),
      physicalExamData: _parseJsonField(json['physical_exam_data']),
      obstetricsExamData: _parseJsonField(json['obstetrics_exam_data']),
      supportingData: _parseJsonField(json['supporting_data']),
      usgObstetriData: _parseJsonField(json['usg_obstetri_data']),
      usgGynecologyData: _parseJsonField(json['usg_gynecology_data']),
      diagnosisData: _parseJsonField(json['diagnosis_data']),
      planData: _parseJsonField(json['plan_data']),
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.tryParse(json['updated_at']) : null,
      createdBy: json['created_by'],
    );
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
  final int? patientAge;
  final String? category;
  final String status;
  final String? appointmentTime;
  final String? notes;
  final bool hasRecord;
  final String? recordStatus;
  final String? mrId;
  final DateTime? createdAt;

  QueueItem({
    required this.id,
    required this.patientId,
    required this.patientName,
    this.patientAge,
    this.category,
    required this.status,
    this.appointmentTime,
    this.notes,
    this.hasRecord = false,
    this.recordStatus,
    this.mrId,
    this.createdAt,
  });

  factory QueueItem.fromJson(Map<String, dynamic> json) {
    return QueueItem(
      id: json['id'] ?? 0,
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'] ?? '',
      patientAge: json['patient_age'],
      category: json['category'],
      status: json['status'] ?? 'pending',
      appointmentTime: json['appointment_time'],
      notes: json['notes'],
      hasRecord: json['has_record'] == true || json['has_record'] == 1,
      recordStatus: json['record_status'],
      mrId: json['mr_id'],
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
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
