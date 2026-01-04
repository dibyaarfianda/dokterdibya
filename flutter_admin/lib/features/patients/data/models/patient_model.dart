class Patient {
  final String id;
  final String? mrId;
  final String name;
  final String? email;
  final String? phone;
  final String? whatsapp;
  final int? age;
  final DateTime? birthDate;
  final String? address;
  final String? category;
  final String? husbandName;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final int? totalVisits;
  final DateTime? lastVisit;

  Patient({
    required this.id,
    this.mrId,
    required this.name,
    this.email,
    this.phone,
    this.whatsapp,
    this.age,
    this.birthDate,
    this.address,
    this.category,
    this.husbandName,
    this.createdAt,
    this.updatedAt,
    this.totalVisits,
    this.lastVisit,
  });

  factory Patient.fromJson(Map<String, dynamic> json) {
    return Patient(
      id: json['id']?.toString() ?? '',
      mrId: json['mr_id']?.toString(),
      name: json['full_name'] ?? json['name'] ?? '',
      email: json['email'],
      phone: json['phone'],
      whatsapp: json['whatsapp'],
      age: _parseAge(json['age']),
      birthDate: _parseDate(json['birth_date'] ?? json['tanggal_lahir']),
      address: json['address'] ?? json['alamat'],
      category: json['category'] ?? json['mr_category'],
      husbandName: json['husband_name'] ?? json['nama_suami'],
      createdAt: _parseDate(json['created_at']),
      updatedAt: _parseDate(json['updated_at']),
      totalVisits: _parseAge(json['total_visits']),
      lastVisit: _parseDate(json['last_visit'] ?? json['last_visit_date']),
    );
  }

  static int? _parseAge(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is String) return int.tryParse(value);
    return null;
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
    return null;
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'mr_id': mrId,
      'name': name,
      'email': email,
      'phone': phone,
      'whatsapp': whatsapp,
      'age': age,
      'birth_date': birthDate?.toIso8601String().split('T')[0],
      'address': address,
      'category': category,
      'husband_name': husbandName,
    };
  }

  Patient copyWith({
    String? id,
    String? mrId,
    String? name,
    String? email,
    String? phone,
    String? whatsapp,
    int? age,
    DateTime? birthDate,
    String? address,
    String? category,
    String? husbandName,
    DateTime? createdAt,
    DateTime? updatedAt,
    int? totalVisits,
    DateTime? lastVisit,
  }) {
    return Patient(
      id: id ?? this.id,
      mrId: mrId ?? this.mrId,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      whatsapp: whatsapp ?? this.whatsapp,
      age: age ?? this.age,
      birthDate: birthDate ?? this.birthDate,
      address: address ?? this.address,
      category: category ?? this.category,
      husbandName: husbandName ?? this.husbandName,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      totalVisits: totalVisits ?? this.totalVisits,
      lastVisit: lastVisit ?? this.lastVisit,
    );
  }

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String get displayAge {
    if (age != null) return '$age tahun';
    if (birthDate != null) {
      final now = DateTime.now();
      final years = now.year - birthDate!.year;
      return '$years tahun';
    }
    return '-';
  }
}

class PatientListResponse {
  final List<Patient> patients;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  PatientListResponse({
    required this.patients,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  factory PatientListResponse.fromJson(Map<String, dynamic> json) {
    // API returns: { success, data: [...patients...], count, pagination: {...} }
    final patientList = json['data'] ?? [];
    final patients = (patientList as List)
        .map((p) => Patient.fromJson(p))
        .toList();

    // Pagination is in separate object
    final pagination = json['pagination'] as Map<String, dynamic>? ?? {};

    return PatientListResponse(
      patients: patients,
      total: _parseInt(pagination['total'] ?? json['count']) ?? patients.length,
      page: _parseInt(pagination['page']) ?? 1,
      limit: _parseInt(pagination['limit']) ?? 20,
      totalPages: _parseInt(pagination['totalPages']) ?? 1,
    );
  }

  static int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is String) return int.tryParse(value);
    return null;
  }
}
