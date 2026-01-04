class ChatMessage {
  final int id;
  final String senderId;
  final String? senderName;
  final String? receiverId;
  final String message;
  final bool isRead;
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.senderId,
    this.senderName,
    this.receiverId,
    required this.message,
    this.isRead = false,
    required this.createdAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] ?? 0,
      senderId: json['sender_id']?.toString() ?? '',
      senderName: json['sender_name'],
      receiverId: json['receiver_id']?.toString(),
      message: json['message'] ?? '',
      isRead: json['is_read'] == 1 || json['is_read'] == true,
      createdAt: _parseDate(json['created_at']) ?? DateTime.now(),
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  Map<String, dynamic> toJson() {
    return {
      'receiver_id': receiverId,
      'message': message,
    };
  }
}

class ChatUser {
  final String id;
  final String name;
  final String? role;
  final bool isOnline;
  final DateTime? lastSeen;
  final int unreadCount;

  ChatUser({
    required this.id,
    required this.name,
    this.role,
    this.isOnline = false,
    this.lastSeen,
    this.unreadCount = 0,
  });

  factory ChatUser.fromJson(Map<String, dynamic> json) {
    return ChatUser(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      role: json['role'],
      isOnline: json['is_online'] == 1 || json['is_online'] == true,
      lastSeen: _parseDate(json['last_seen']),
      unreadCount: json['unread_count'] ?? 0,
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }
}
