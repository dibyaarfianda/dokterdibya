class Appointment {
  final int id;
  final String patientId;
  final String patientName;
  final String? patientPhone;
  final DateTime appointmentDate;
  final String? appointmentTime;
  final String location;
  final String? category;
  final String status;
  final String? notes;
  final String? createdBy;
  final DateTime? createdAt;

  Appointment({
    required this.id,
    required this.patientId,
    required this.patientName,
    this.patientPhone,
    required this.appointmentDate,
    this.appointmentTime,
    required this.location,
    this.category,
    this.status = 'scheduled',
    this.notes,
    this.createdBy,
    this.createdAt,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: json['id'] ?? 0,
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'] ?? json['nama_pasien'] ?? '',
      patientPhone: json['patient_phone'] ?? json['whatsapp'],
      appointmentDate: DateTime.tryParse(json['appointment_date'] ?? json['tanggal'] ?? '') ?? DateTime.now(),
      appointmentTime: json['appointment_time'] ?? json['waktu'],
      location: json['location'] ?? json['lokasi'] ?? 'klinik_private',
      category: json['category'] ?? json['kategori'],
      status: json['status'] ?? 'scheduled',
      notes: json['notes'] ?? json['catatan'],
      createdBy: json['created_by'],
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'patient_id': patientId,
      'appointment_date': appointmentDate.toIso8601String().split('T').first,
      if (appointmentTime != null) 'appointment_time': appointmentTime,
      'location': location,
      if (category != null) 'category': category,
      'status': status,
      if (notes != null) 'notes': notes,
    };
  }

  String get locationDisplayName {
    switch (location) {
      case 'klinik_private':
        return 'Klinik Privat';
      case 'rsia_melinda':
        return 'RSIA Melinda';
      case 'rsud_gambiran':
        return 'RSUD Gambiran';
      case 'rs_bhayangkara':
        return 'RS Bhayangkara';
      default:
        return location;
    }
  }

  String get statusDisplayName {
    switch (status) {
      case 'scheduled':
        return 'Terjadwal';
      case 'confirmed':
        return 'Dikonfirmasi';
      case 'completed':
        return 'Selesai';
      case 'cancelled':
        return 'Dibatalkan';
      case 'no_show':
        return 'Tidak Hadir';
      default:
        return status;
    }
  }

  bool get isUpcoming => appointmentDate.isAfter(DateTime.now().subtract(const Duration(days: 1)));
  bool get isPast => !isUpcoming;
  bool get isToday {
    final now = DateTime.now();
    return appointmentDate.year == now.year &&
           appointmentDate.month == now.month &&
           appointmentDate.day == now.day;
  }

  Appointment copyWith({
    int? id,
    String? patientId,
    String? patientName,
    String? patientPhone,
    DateTime? appointmentDate,
    String? appointmentTime,
    String? location,
    String? category,
    String? status,
    String? notes,
    String? createdBy,
    DateTime? createdAt,
  }) {
    return Appointment(
      id: id ?? this.id,
      patientId: patientId ?? this.patientId,
      patientName: patientName ?? this.patientName,
      patientPhone: patientPhone ?? this.patientPhone,
      appointmentDate: appointmentDate ?? this.appointmentDate,
      appointmentTime: appointmentTime ?? this.appointmentTime,
      location: location ?? this.location,
      category: category ?? this.category,
      status: status ?? this.status,
      notes: notes ?? this.notes,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class BookingSettings {
  final String location;
  final bool isOpen;
  final List<String> availableDays;
  final String? startTime;
  final String? endTime;
  final int slotDuration;
  final int maxBookingsPerSlot;

  BookingSettings({
    required this.location,
    this.isOpen = true,
    this.availableDays = const ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    this.startTime,
    this.endTime,
    this.slotDuration = 30,
    this.maxBookingsPerSlot = 1,
  });

  factory BookingSettings.fromJson(Map<String, dynamic> json) {
    return BookingSettings(
      location: json['location'] ?? '',
      isOpen: json['is_open'] ?? true,
      availableDays: json['available_days'] is List
          ? List<String>.from(json['available_days'])
          : const ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
      startTime: json['start_time'],
      endTime: json['end_time'],
      slotDuration: json['slot_duration'] ?? 30,
      maxBookingsPerSlot: json['max_bookings_per_slot'] ?? 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'location': location,
      'is_open': isOpen,
      'available_days': availableDays,
      if (startTime != null) 'start_time': startTime,
      if (endTime != null) 'end_time': endTime,
      'slot_duration': slotDuration,
      'max_bookings_per_slot': maxBookingsPerSlot,
    };
  }
}
