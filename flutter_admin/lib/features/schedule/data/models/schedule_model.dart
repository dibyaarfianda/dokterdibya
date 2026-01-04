class PracticeSchedule {
  final int id;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final String location;
  final bool isActive;
  final String? notes;

  PracticeSchedule({
    required this.id,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.location,
    this.isActive = true,
    this.notes,
  });

  factory PracticeSchedule.fromJson(Map<String, dynamic> json) {
    return PracticeSchedule(
      id: json['id'] ?? 0,
      dayOfWeek: json['day_of_week'] ?? json['day'] ?? '',
      startTime: json['start_time'] ?? '',
      endTime: json['end_time'] ?? '',
      location: json['location'] ?? 'klinik_private',
      isActive: json['is_active'] == 1 || json['is_active'] == true,
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'day_of_week': dayOfWeek,
      'start_time': startTime,
      'end_time': endTime,
      'location': location,
      'is_active': isActive ? 1 : 0,
      'notes': notes,
    };
  }

  String get dayName {
    switch (dayOfWeek.toLowerCase()) {
      case 'monday':
      case 'senin':
        return 'Senin';
      case 'tuesday':
      case 'selasa':
        return 'Selasa';
      case 'wednesday':
      case 'rabu':
        return 'Rabu';
      case 'thursday':
      case 'kamis':
        return 'Kamis';
      case 'friday':
      case 'jumat':
        return 'Jumat';
      case 'saturday':
      case 'sabtu':
        return 'Sabtu';
      case 'sunday':
      case 'minggu':
        return 'Minggu';
      default:
        return dayOfWeek;
    }
  }

  String get locationName {
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
}
