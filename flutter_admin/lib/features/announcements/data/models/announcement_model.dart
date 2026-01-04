class Announcement {
  final int id;
  final String title;
  final String content;
  final String? imageUrl;
  final String? category;
  final bool isActive;
  final int likes;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? createdBy;

  Announcement({
    required this.id,
    required this.title,
    required this.content,
    this.imageUrl,
    this.category,
    this.isActive = true,
    this.likes = 0,
    this.publishedAt,
    required this.createdAt,
    this.updatedAt,
    this.createdBy,
  });

  factory Announcement.fromJson(Map<String, dynamic> json) {
    return Announcement(
      id: json['id'] ?? 0,
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      imageUrl: json['image_url'],
      category: json['category'],
      isActive: json['is_active'] == 1 || json['is_active'] == true,
      likes: json['likes'] ?? 0,
      publishedAt: _parseDate(json['published_at']),
      createdAt: _parseDate(json['created_at']) ?? DateTime.now(),
      updatedAt: _parseDate(json['updated_at']),
      createdBy: json['created_by']?.toString(),
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
      'title': title,
      'content': content,
      'image_url': imageUrl,
      'category': category,
      'is_active': isActive ? 1 : 0,
    };
  }
}

class StaffAnnouncement {
  final int id;
  final String title;
  final String content;
  final String priority;
  final bool isRead;
  final DateTime createdAt;
  final String? createdByName;

  StaffAnnouncement({
    required this.id,
    required this.title,
    required this.content,
    this.priority = 'normal',
    this.isRead = false,
    required this.createdAt,
    this.createdByName,
  });

  factory StaffAnnouncement.fromJson(Map<String, dynamic> json) {
    return StaffAnnouncement(
      id: json['id'] ?? 0,
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      priority: json['priority'] ?? 'normal',
      isRead: json['is_read'] == 1 || json['is_read'] == true,
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      createdByName: json['created_by_name'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'content': content,
      'priority': priority,
    };
  }
}
