class BookingSession {
  final int id;
  final int sessionNumber;
  final String sessionName;
  final String startTime;
  final String endTime;
  final int slotDuration;
  final int maxSlots;
  final bool isActive;
  final String? label;

  BookingSession({
    required this.id,
    required this.sessionNumber,
    required this.sessionName,
    required this.startTime,
    required this.endTime,
    required this.slotDuration,
    required this.maxSlots,
    required this.isActive,
    this.label,
  });

  factory BookingSession.fromJson(Map<String, dynamic> json) {
    return BookingSession(
      id: json['id'],
      sessionNumber: json['session_number'] ?? 0,
      sessionName: json['session_name'] ?? '',
      startTime: json['start_time'] ?? '09:00',
      endTime: json['end_time'] ?? '12:00',
      slotDuration: json['slot_duration'] ?? 15,
      maxSlots: json['max_slots'] ?? 10,
      isActive: json['is_active'] == true || json['is_active'] == 1,
      label: json['label'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'session_number': sessionNumber,
      'session_name': sessionName,
      'start_time': startTime,
      'end_time': endTime,
      'slot_duration': slotDuration,
      'max_slots': maxSlots,
      'is_active': isActive,
    };
  }
}

class Booking {
  final int id;
  final String patientId;
  final String patientName;
  final String? patientPhone;
  final DateTime appointmentDate;
  final int session;
  final int slotNumber;
  final String? chiefComplaint;
  final String? consultationCategory;
  final String status;
  final DateTime createdAt;
  final String? sessionName;
  final String? slotTime;
  final String? sessionLabel;

  Booking({
    required this.id,
    required this.patientId,
    required this.patientName,
    this.patientPhone,
    required this.appointmentDate,
    required this.session,
    required this.slotNumber,
    this.chiefComplaint,
    this.consultationCategory,
    required this.status,
    required this.createdAt,
    this.sessionName,
    this.slotTime,
    this.sessionLabel,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    return Booking(
      id: json['id'],
      patientId: json['patient_id'] ?? '',
      patientName: json['patient_name'] ?? '',
      patientPhone: json['patient_phone'],
      appointmentDate: DateTime.parse(json['appointment_date']),
      session: json['session'] ?? 1,
      slotNumber: json['slot_number'] ?? 1,
      chiefComplaint: json['chief_complaint'],
      consultationCategory: json['consultation_category'],
      status: json['status'] ?? 'pending',
      createdAt: DateTime.parse(json['created_at']),
      sessionName: json['session_name'],
      slotTime: json['slot_time'],
      sessionLabel: json['session_label'],
    );
  }

  String get statusDisplay {
    switch (status) {
      case 'pending':
        return 'Menunggu';
      case 'confirmed':
        return 'Dikonfirmasi';
      case 'completed':
        return 'Selesai';
      case 'cancelled':
        return 'Dibatalkan';
      default:
        return status;
    }
  }
}
