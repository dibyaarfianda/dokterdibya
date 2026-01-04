class DrugSale {
  final int id;
  final String? invoiceNumber;
  final String? customerName;
  final String? customerPhone;
  final double totalAmount;
  final double? discount;
  final double finalAmount;
  final String paymentStatus;
  final String? paymentMethod;
  final String? notes;
  final List<DrugSaleItem> items;
  final DateTime createdAt;
  final String? createdByName;

  DrugSale({
    required this.id,
    this.invoiceNumber,
    this.customerName,
    this.customerPhone,
    required this.totalAmount,
    this.discount,
    required this.finalAmount,
    this.paymentStatus = 'pending',
    this.paymentMethod,
    this.notes,
    this.items = const [],
    required this.createdAt,
    this.createdByName,
  });

  factory DrugSale.fromJson(Map<String, dynamic> json) {
    List<DrugSaleItem> items = [];
    if (json['items'] != null) {
      items = (json['items'] as List)
          .map((i) => DrugSaleItem.fromJson(i))
          .toList();
    }

    return DrugSale(
      id: json['id'] ?? 0,
      invoiceNumber: json['invoice_number'],
      customerName: json['customer_name'],
      customerPhone: json['customer_phone'],
      totalAmount: _parseDouble(json['total_amount']) ?? 0,
      discount: _parseDouble(json['discount']),
      finalAmount: _parseDouble(json['final_amount']) ?? 0,
      paymentStatus: json['payment_status'] ?? 'pending',
      paymentMethod: json['payment_method'],
      notes: json['notes'],
      items: items,
      createdAt: _parseDate(json['created_at']) ?? DateTime.now(),
      createdByName: json['created_by_name'],
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

  String get formattedTotal {
    return 'Rp ${finalAmount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]}.',
    )}';
  }
}

class DrugSaleItem {
  final int id;
  final int obatId;
  final String? obatName;
  final int quantity;
  final double price;
  final double subtotal;

  DrugSaleItem({
    required this.id,
    required this.obatId,
    this.obatName,
    required this.quantity,
    required this.price,
    required this.subtotal,
  });

  factory DrugSaleItem.fromJson(Map<String, dynamic> json) {
    return DrugSaleItem(
      id: json['id'] ?? 0,
      obatId: json['obat_id'] ?? 0,
      obatName: json['obat_name'] ?? json['name'],
      quantity: json['quantity'] ?? 1,
      price: _parseDouble(json['price']) ?? 0,
      subtotal: _parseDouble(json['subtotal']) ?? 0,
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}
