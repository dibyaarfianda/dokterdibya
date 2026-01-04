class Article {
  final int id;
  final String title;
  final String content;
  final String? summary;
  final String? imageUrl;
  final String? category;
  final bool isPublished;
  final int likes;
  final int views;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final DateTime? updatedAt;

  Article({
    required this.id,
    required this.title,
    required this.content,
    this.summary,
    this.imageUrl,
    this.category,
    this.isPublished = false,
    this.likes = 0,
    this.views = 0,
    this.publishedAt,
    required this.createdAt,
    this.updatedAt,
  });

  factory Article.fromJson(Map<String, dynamic> json) {
    return Article(
      id: json['id'] ?? 0,
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      summary: json['summary'],
      imageUrl: json['image_url'],
      category: json['category'],
      isPublished: json['is_published'] == 1 || json['is_published'] == true,
      likes: json['likes'] ?? json['like_count'] ?? 0,
      views: json['views'] ?? json['view_count'] ?? 0,
      publishedAt: _parseDate(json['published_at']),
      createdAt: _parseDate(json['created_at']) ?? DateTime.now(),
      updatedAt: _parseDate(json['updated_at']),
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
      'summary': summary,
      'image_url': imageUrl,
      'category': category,
      'is_published': isPublished ? 1 : 0,
    };
  }
}
