class ActivityLog {
  final int? id;
  final String userId;
  final String userName;
  final String action;
  final String? details;
  final DateTime timestamp;

  ActivityLog({
    this.id,
    required this.userId,
    required this.userName,
    required this.action,
    this.details,
    required this.timestamp,
  });

  factory ActivityLog.fromJson(Map<String, dynamic> json) {
    return ActivityLog(
      id: json['id'],
      userId: json['user_id'] ?? '',
      userName: json['user_name'] ?? '',
      action: json['action'] ?? '',
      details: json['details'],
      timestamp: DateTime.parse(json['timestamp']),
    );
  }
}

class OnlineUser {
  final String id;
  final String name;
  final String? role;
  final bool isOnline;
  final DateTime lastSeen;

  OnlineUser({
    required this.id,
    required this.name,
    this.role,
    required this.isOnline,
    required this.lastSeen,
  });

  factory OnlineUser.fromJson(Map<String, dynamic> json) {
    return OnlineUser(
      id: json['user_id'] ?? '',
      name: json['user_name'] ?? '',
      role: json['role'],
      isOnline: json['is_online'] == true || json['is_online'] == 1,
      lastSeen: DateTime.parse(json['last_seen']),
    );
  }
}

class ActivitySummary {
  final int periodDays;
  final int totalActivities;
  final int uniqueUsers;
  final List<ActionCount> byAction;
  final List<ActiveUser> mostActiveUsers;

  ActivitySummary({
    required this.periodDays,
    required this.totalActivities,
    required this.uniqueUsers,
    required this.byAction,
    required this.mostActiveUsers,
  });

  factory ActivitySummary.fromJson(Map<String, dynamic> json) {
    return ActivitySummary(
      periodDays: json['period_days'] ?? 7,
      totalActivities: json['total_activities'] ?? 0,
      uniqueUsers: json['unique_users'] ?? 0,
      byAction: (json['by_action'] as List?)
          ?.map((a) => ActionCount.fromJson(a))
          .toList() ?? [],
      mostActiveUsers: (json['most_active_users'] as List?)
          ?.map((u) => ActiveUser.fromJson(u))
          .toList() ?? [],
    );
  }
}

class ActionCount {
  final String action;
  final int count;

  ActionCount({required this.action, required this.count});

  factory ActionCount.fromJson(Map<String, dynamic> json) {
    return ActionCount(
      action: json['action'] ?? '',
      count: json['count'] ?? 0,
    );
  }
}

class ActiveUser {
  final String userId;
  final String userName;
  final int actionCount;
  final DateTime lastActivity;

  ActiveUser({
    required this.userId,
    required this.userName,
    required this.actionCount,
    required this.lastActivity,
  });

  factory ActiveUser.fromJson(Map<String, dynamic> json) {
    return ActiveUser(
      userId: json['user_id'] ?? '',
      userName: json['user_name'] ?? '',
      actionCount: json['action_count'] ?? 0,
      lastActivity: DateTime.parse(json['last_activity']),
    );
  }
}
