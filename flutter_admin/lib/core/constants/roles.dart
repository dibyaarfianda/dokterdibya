enum UserRole {
  admin,
  dokter,
  bidan,
  frontOffice,
  managerial,
}

extension UserRoleExtension on UserRole {
  String get name {
    switch (this) {
      case UserRole.admin:
        return 'admin';
      case UserRole.dokter:
        return 'dokter';
      case UserRole.bidan:
        return 'bidan';
      case UserRole.frontOffice:
        return 'front_office';
      case UserRole.managerial:
        return 'managerial';
    }
  }

  String get displayName {
    switch (this) {
      case UserRole.admin:
        return 'Admin';
      case UserRole.dokter:
        return 'Dokter';
      case UserRole.bidan:
        return 'Bidan';
      case UserRole.frontOffice:
        return 'Front Office';
      case UserRole.managerial:
        return 'Managerial';
    }
  }

  static UserRole fromString(String role) {
    switch (role.toLowerCase()) {
      case 'admin':
        return UserRole.admin;
      case 'dokter':
        return UserRole.dokter;
      case 'bidan':
        return UserRole.bidan;
      case 'front_office':
        return UserRole.frontOffice;
      case 'managerial':
        return UserRole.managerial;
      default:
        return UserRole.frontOffice;
    }
  }
}

class RolePermissions {
  static const Map<String, List<UserRole>> menuAccess = {
    'dashboard': [UserRole.admin, UserRole.dokter, UserRole.bidan, UserRole.frontOffice, UserRole.managerial],
    'patients': [UserRole.admin, UserRole.dokter, UserRole.bidan, UserRole.frontOffice, UserRole.managerial],
    'sunday_clinic': [UserRole.dokter, UserRole.bidan],
    'billing': [UserRole.dokter, UserRole.bidan, UserRole.admin],
    'appointments': [UserRole.admin, UserRole.dokter, UserRole.bidan, UserRole.frontOffice, UserRole.managerial],
    'inventory': [UserRole.dokter, UserRole.admin],
    'finance': [UserRole.dokter],
    'settings': [UserRole.admin, UserRole.dokter],
    'users': [UserRole.admin],
    'reports': [UserRole.dokter, UserRole.admin, UserRole.managerial],
  };

  static bool hasAccess(UserRole role, String menu) {
    final allowedRoles = menuAccess[menu];
    if (allowedRoles == null) return false;
    return allowedRoles.contains(role);
  }
}
