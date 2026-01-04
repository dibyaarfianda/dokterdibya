class MedicalService {
  final int id;
  final String code;
  final String name;
  final String? description;
  final double price;
  final String? category;
  final bool isActive;
  final DateTime? createdAt;

  MedicalService({
    required this.id,
    required this.code,
    required this.name,
    this.description,
    required this.price,
    this.category,
    this.isActive = true,
    this.createdAt,
  });

  factory MedicalService.fromJson(Map<String, dynamic> json) {
    return MedicalService(
      id: json['id'] ?? 0,
      code: json['code'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      price: _parseDouble(json['price']) ?? 0,
      category: json['category'],
      isActive: json['is_active'] == 1 || json['is_active'] == true,
      createdAt: _parseDate(json['created_at']),
    );
  }

  static double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  Map<String, dynamic> toJson() {
    return {
      'code': code,
      'name': name,
      'description': description,
      'price': price,
      'category': category,
      'is_active': isActive ? 1 : 0,
    };
  }

  String get formattedPrice {
    return 'Rp ${price.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]}.',
    )}';
  }
}
