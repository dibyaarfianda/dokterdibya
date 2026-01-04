class AppNotification {
  final int id;
  final String type;
  final String title;
  final String message;
  final String? link;
  final Map<String, dynamic>? data;
  final bool isRead;
  final DateTime? createdAt;

  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    this.link,
    this.data,
    this.isRead = false,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] ?? 0,
      type: json['type'] ?? 'general',
      title: json['title'] ?? '',
      message: json['message'] ?? '',
      link: json['link'],
      data: json['data'] is Map ? Map<String, dynamic>.from(json['data']) : null,
      isRead: json['is_read'] ?? json['read'] ?? false,
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

  String get iconName {
    switch (type) {
      case 'appointment':
        return 'calendar_today';
      case 'billing':
        return 'receipt';
      case 'medical_record':
        return 'medical_services';
      case 'patient':
        return 'person';
      case 'announcement':
        return 'campaign';
      default:
        return 'notifications';
    }
  }
}

class StaffAnnouncement {
  final int id;
  final String title;
  final String content;
  final String? type;
  final String? priority;
  final String createdBy;
  final String? createdByName;
  final bool isRead;
  final DateTime? createdAt;
  final DateTime? expiresAt;

  StaffAnnouncement({
    required this.id,
    required this.title,
    required this.content,
    this.type,
    this.priority,
    required this.createdBy,
    this.createdByName,
    this.isRead = false,
    this.createdAt,
    this.expiresAt,
  });

  factory StaffAnnouncement.fromJson(Map<String, dynamic> json) {
    return StaffAnnouncement(
      id: json['id'] ?? 0,
      title: json['title'] ?? '',
      content: json['content'] ?? json['message'] ?? '',
      type: json['type'],
      priority: json['priority'],
      createdBy: json['created_by']?.toString() ?? '',
      createdByName: json['created_by_name'],
      isRead: json['is_read'] ?? false,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
      expiresAt: json['expires_at'] != null
          ? DateTime.tryParse(json['expires_at'])
          : null,
    );
  }

  bool get isHighPriority => priority == 'high' || priority == 'urgent';
  bool get isExpired => expiresAt != null && expiresAt!.isBefore(DateTime.now());

  String get timeAgo {
    if (createdAt == null) return '';
    final diff = DateTime.now().difference(createdAt!);
    if (diff.inDays > 0) return '${diff.inDays} hari lalu';
    if (diff.inHours > 0) return '${diff.inHours} jam lalu';
    if (diff.inMinutes > 0) return '${diff.inMinutes} menit lalu';
    return 'Baru saja';
  }
}

class OnlineUser {
  final String odId;
  final String name;
  final String? role;
  final DateTime? lastSeen;

  OnlineUser({
    required this.odId,
    required this.name,
    this.role,
    this.lastSeen,
  });

  factory OnlineUser.fromJson(Map<String, dynamic> json) {
    return OnlineUser(
      odId: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      role: json['role'],
      lastSeen: json['last_seen'] != null
          ? DateTime.tryParse(json['last_seen'])
          : null,
    );
  }
}

class NotificationCount {
  final int notifications;
  final int announcements;
  final int total;

  NotificationCount({
    this.notifications = 0,
    this.announcements = 0,
    this.total = 0,
  });

  factory NotificationCount.fromJson(Map<String, dynamic> json) {
    final notifs = json['notifications'] ?? json['unread_count'] ?? 0;
    final anncs = json['announcements'] ?? json['unread_announcements'] ?? 0;
    return NotificationCount(
      notifications: notifs,
      announcements: anncs,
      total: json['total'] ?? (notifs + anncs),
    );
  }
}
