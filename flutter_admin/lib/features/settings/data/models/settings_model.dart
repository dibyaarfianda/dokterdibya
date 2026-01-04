class UserProfile {
  final String id;
  final String name;
  final String email;
  final String? phone;
  final String role;
  final int? roleId;
  final String? avatar;
  final DateTime? createdAt;
  final DateTime? lastLogin;

  UserProfile({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    required this.role,
    this.roleId,
    this.avatar,
    this.createdAt,
    this.lastLogin,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'],
      role: json['role'] ?? '',
      roleId: json['role_id'],
      avatar: json['avatar'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
      lastLogin: json['last_login'] != null
          ? DateTime.tryParse(json['last_login'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'email': email,
      if (phone != null) 'phone': phone,
    };
  }

  String get roleDisplayName {
    switch (role.toLowerCase()) {
      case 'dokter':
        return 'Dokter';
      case 'admin':
        return 'Admin';
      case 'bidan':
        return 'Bidan';
      case 'front_office':
        return 'Front Office';
      case 'managerial':
        return 'Managerial';
      default:
        return role;
    }
  }

  String get initials {
    if (name.isEmpty) return '?';
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name[0].toUpperCase();
  }
}

class SystemSettings {
  final String clinicName;
  final String clinicAddress;
  final String? clinicPhone;
  final String? clinicEmail;
  final String? clinicLogo;
  final Map<String, dynamic>? billingSettings;
  final Map<String, dynamic>? appointmentSettings;

  SystemSettings({
    this.clinicName = 'Klinik Dokter Dibya',
    this.clinicAddress = '',
    this.clinicPhone,
    this.clinicEmail,
    this.clinicLogo,
    this.billingSettings,
    this.appointmentSettings,
  });

  factory SystemSettings.fromJson(Map<String, dynamic> json) {
    return SystemSettings(
      clinicName: json['clinic_name'] ?? 'Klinik Dokter Dibya',
      clinicAddress: json['clinic_address'] ?? '',
      clinicPhone: json['clinic_phone'],
      clinicEmail: json['clinic_email'],
      clinicLogo: json['clinic_logo'],
      billingSettings: json['billing_settings'] is Map
          ? Map<String, dynamic>.from(json['billing_settings'])
          : null,
      appointmentSettings: json['appointment_settings'] is Map
          ? Map<String, dynamic>.from(json['appointment_settings'])
          : null,
    );
  }
}

class RoleVisibility {
  final String menuKey;
  final String menuName;
  final bool isVisible;
  final List<String> allowedRoles;

  RoleVisibility({
    required this.menuKey,
    required this.menuName,
    this.isVisible = true,
    this.allowedRoles = const [],
  });

  factory RoleVisibility.fromJson(Map<String, dynamic> json) {
    return RoleVisibility(
      menuKey: json['menu_key'] ?? '',
      menuName: json['menu_name'] ?? json['menu_key'] ?? '',
      isVisible: json['is_visible'] ?? true,
      allowedRoles: json['allowed_roles'] is List
          ? List<String>.from(json['allowed_roles'])
          : [],
    );
  }
}

class ActivityLog {
  final int id;
  final String userId;
  final String? userName;
  final String action;
  final String? description;
  final String? targetType;
  final String? targetId;
  final Map<String, dynamic>? metadata;
  final DateTime? createdAt;

  ActivityLog({
    required this.id,
    required this.userId,
    this.userName,
    required this.action,
    this.description,
    this.targetType,
    this.targetId,
    this.metadata,
    this.createdAt,
  });

  factory ActivityLog.fromJson(Map<String, dynamic> json) {
    return ActivityLog(
      id: json['id'] ?? 0,
      userId: json['user_id']?.toString() ?? '',
      userName: json['user_name'],
      action: json['action'] ?? '',
      description: json['description'],
      targetType: json['target_type'],
      targetId: json['target_id']?.toString(),
      metadata: json['metadata'] is Map
          ? Map<String, dynamic>.from(json['metadata'])
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }

  String get timeAgo {
    if (createdAt == null) return '';
    final diff = DateTime.now().difference(createdAt!);
    if (diff.inDays > 0) return '${diff.inDays}h lalu';
    if (diff.inHours > 0) return '${diff.inHours}j lalu';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m lalu';
    return 'Baru saja';
  }

  String get actionDisplayName {
    switch (action) {
      case 'login':
        return 'Login';
      case 'logout':
        return 'Logout';
      case 'create_patient':
        return 'Tambah Pasien';
      case 'update_patient':
        return 'Update Pasien';
      case 'create_medical_record':
        return 'Buat Rekam Medis';
      case 'update_medical_record':
        return 'Update Rekam Medis';
      case 'confirm_billing':
        return 'Konfirmasi Billing';
      case 'create_appointment':
        return 'Buat Janji Temu';
      default:
        return action.replaceAll('_', ' ').toUpperCase();
    }
  }
}

class AppPreferences {
  final bool darkMode;
  final String language;
  final bool notificationsEnabled;
  final bool soundEnabled;

  AppPreferences({
    this.darkMode = false,
    this.language = 'id',
    this.notificationsEnabled = true,
    this.soundEnabled = true,
  });

  factory AppPreferences.fromJson(Map<String, dynamic> json) {
    return AppPreferences(
      darkMode: json['dark_mode'] ?? false,
      language: json['language'] ?? 'id',
      notificationsEnabled: json['notifications_enabled'] ?? true,
      soundEnabled: json['sound_enabled'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'dark_mode': darkMode,
      'language': language,
      'notifications_enabled': notificationsEnabled,
      'sound_enabled': soundEnabled,
    };
  }

  AppPreferences copyWith({
    bool? darkMode,
    String? language,
    bool? notificationsEnabled,
    bool? soundEnabled,
  }) {
    return AppPreferences(
      darkMode: darkMode ?? this.darkMode,
      language: language ?? this.language,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      soundEnabled: soundEnabled ?? this.soundEnabled,
    );
  }
}
