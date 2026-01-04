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
      name: json['name'] ?? '',
      email: json['email'],
      phone: json['phone'],
      whatsapp: json['whatsapp'],
      age: json['age'] is int ? json['age'] : int.tryParse(json['age']?.toString() ?? ''),
      birthDate: json['birth_date'] != null ? DateTime.tryParse(json['birth_date']) : null,
      address: json['address'],
      category: json['category'],
      husbandName: json['husband_name'],
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.tryParse(json['updated_at']) : null,
      totalVisits: json['total_visits'] is int ? json['total_visits'] : int.tryParse(json['total_visits']?.toString() ?? ''),
      lastVisit: json['last_visit'] != null ? DateTime.tryParse(json['last_visit']) : null,
    );
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
    final data = json['data'];
    final patients = (data['patients'] as List? ?? [])
        .map((p) => Patient.fromJson(p))
        .toList();

    return PatientListResponse(
      patients: patients,
      total: data['total'] ?? 0,
      page: data['page'] ?? 1,
      limit: data['limit'] ?? 20,
      totalPages: data['totalPages'] ?? 1,
    );
  }
}
