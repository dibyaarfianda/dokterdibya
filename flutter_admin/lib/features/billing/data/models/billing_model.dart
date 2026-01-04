class Billing {
  final int? id;
  final String? mrId;
  final String patientId;
  final String? patientName;
  final double subtotal;
  final double discount;
  final double total;
  final String status;
  final String? paymentMethod;
  final String? notes;
  final String? invoiceUrl;
  final String? etiketUrl;
  final Map<String, dynamic>? billingData;
  final List<ChangeRequest>? changeRequests;
  final List<BillingItem> items;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? createdBy;
  final DateTime? confirmedAt;
  final String? confirmedBy;

  Billing({
    this.id,
    this.mrId,
    required this.patientId,
    this.patientName,
    this.subtotal = 0,
    this.discount = 0,
    this.total = 0,
    this.status = 'draft',
    this.paymentMethod,
    this.notes,
    this.invoiceUrl,
    this.etiketUrl,
    this.billingData,
    this.changeRequests,
    this.items = const [],
    this.createdAt,
    this.updatedAt,
    this.createdBy,
    this.confirmedAt,
    this.confirmedBy,
  });

  factory Billing.fromJson(Map<String, dynamic> json) {
    return Billing(
      id: json['id'],
      mrId: json['mr_id'],
      patientId: json['patient_id']?.toString() ?? '',
      patientName: json['patient_name'],
      subtotal: _parseDouble(json['subtotal']),
      discount: _parseDouble(json['discount']),
      total: _parseDouble(json['total']),
      status: json['status'] ?? 'draft',
      paymentMethod: json['payment_method'],
      notes: json['notes'],
      invoiceUrl: json['invoice_url'],
      etiketUrl: json['etiket_url'],
      billingData: json['billing_data'] is Map
          ? Map<String, dynamic>.from(json['billing_data'])
          : null,
      changeRequests: json['change_requests'] is List
          ? (json['change_requests'] as List)
              .map((r) => ChangeRequest.fromJson(r))
              .toList()
          : null,
      items: json['items'] is List
          ? (json['items'] as List)
              .map((i) => BillingItem.fromJson(i))
              .toList()
          : [],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'])
          : null,
      createdBy: json['created_by'],
      confirmedAt: json['confirmed_at'] != null
          ? DateTime.tryParse(json['confirmed_at'])
          : null,
      confirmedBy: json['confirmed_by'],
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      if (mrId != null) 'mr_id': mrId,
      'patient_id': patientId,
      'subtotal': subtotal,
      'discount': discount,
      'total': total,
      'status': status,
      if (paymentMethod != null) 'payment_method': paymentMethod,
      if (notes != null) 'notes': notes,
      'items': items.map((i) => i.toJson()).toList(),
      if (billingData != null) 'billing_data': billingData,
    };
  }

  bool get isDraft => status == 'draft';
  bool get isConfirmed => status == 'confirmed';
  bool get isPaid => status == 'paid';
  bool get hasPendingChanges =>
      changeRequests?.any((r) => r.status == 'pending') ?? false;

  String get statusDisplayName {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'confirmed':
        return 'Menunggu Pembayaran';
      case 'paid':
        return 'Lunas';
      case 'cancelled':
        return 'Dibatalkan';
      default:
        return status;
    }
  }

  Billing copyWith({
    int? id,
    String? mrId,
    String? patientId,
    String? patientName,
    double? subtotal,
    double? discount,
    double? total,
    String? status,
    String? paymentMethod,
    String? notes,
    String? invoiceUrl,
    String? etiketUrl,
    Map<String, dynamic>? billingData,
    List<ChangeRequest>? changeRequests,
    List<BillingItem>? items,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
    DateTime? confirmedAt,
    String? confirmedBy,
  }) {
    return Billing(
      id: id ?? this.id,
      mrId: mrId ?? this.mrId,
      patientId: patientId ?? this.patientId,
      patientName: patientName ?? this.patientName,
      subtotal: subtotal ?? this.subtotal,
      discount: discount ?? this.discount,
      total: total ?? this.total,
      status: status ?? this.status,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      notes: notes ?? this.notes,
      invoiceUrl: invoiceUrl ?? this.invoiceUrl,
      etiketUrl: etiketUrl ?? this.etiketUrl,
      billingData: billingData ?? this.billingData,
      changeRequests: changeRequests ?? this.changeRequests,
      items: items ?? this.items,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
      confirmedAt: confirmedAt ?? this.confirmedAt,
      confirmedBy: confirmedBy ?? this.confirmedBy,
    );
  }
}

class BillingItem {
  final int? id;
  final int? billingId;
  final String itemType; // 'obat' or 'tindakan'
  final String? itemCode;
  final String itemName;
  final int quantity;
  final double price;
  final double total;
  final Map<String, dynamic>? itemData;

  BillingItem({
    this.id,
    this.billingId,
    required this.itemType,
    this.itemCode,
    required this.itemName,
    this.quantity = 1,
    this.price = 0,
    this.total = 0,
    this.itemData,
  });

  factory BillingItem.fromJson(Map<String, dynamic> json) {
    return BillingItem(
      id: json['id'],
      billingId: json['billing_id'],
      itemType: json['item_type'] ?? 'obat',
      itemCode: json['item_code'],
      itemName: json['item_name'] ?? '',
      quantity: json['quantity'] ?? 1,
      price: Billing._parseDouble(json['price']),
      total: Billing._parseDouble(json['total']),
      itemData: json['item_data'] is Map
          ? Map<String, dynamic>.from(json['item_data'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'item_type': itemType,
      if (itemCode != null) 'item_code': itemCode,
      'item_name': itemName,
      'quantity': quantity,
      'price': price,
      'total': total,
      if (itemData != null) 'item_data': itemData,
    };
  }

  BillingItem copyWith({
    int? id,
    int? billingId,
    String? itemType,
    String? itemCode,
    String? itemName,
    int? quantity,
    double? price,
    double? total,
    Map<String, dynamic>? itemData,
  }) {
    return BillingItem(
      id: id ?? this.id,
      billingId: billingId ?? this.billingId,
      itemType: itemType ?? this.itemType,
      itemCode: itemCode ?? this.itemCode,
      itemName: itemName ?? this.itemName,
      quantity: quantity ?? this.quantity,
      price: price ?? this.price,
      total: total ?? this.total,
      itemData: itemData ?? this.itemData,
    );
  }

  bool get isObat => itemType == 'obat';
  bool get isTindakan => itemType == 'tindakan';
}

class ChangeRequest {
  final String id;
  final String type;
  final String description;
  final String status;
  final String? requestedBy;
  final DateTime? requestedAt;
  final String? resolvedBy;
  final DateTime? resolvedAt;

  ChangeRequest({
    required this.id,
    required this.type,
    required this.description,
    this.status = 'pending',
    this.requestedBy,
    this.requestedAt,
    this.resolvedBy,
    this.resolvedAt,
  });

  factory ChangeRequest.fromJson(Map<String, dynamic> json) {
    return ChangeRequest(
      id: json['id']?.toString() ?? '',
      type: json['type'] ?? '',
      description: json['description'] ?? '',
      status: json['status'] ?? 'pending',
      requestedBy: json['requested_by'],
      requestedAt: json['requested_at'] != null
          ? DateTime.tryParse(json['requested_at'])
          : null,
      resolvedBy: json['resolved_by'],
      resolvedAt: json['resolved_at'] != null
          ? DateTime.tryParse(json['resolved_at'])
          : null,
    );
  }

  bool get isPending => status == 'pending';
  bool get isResolved => status == 'resolved';
}

class Medication {
  final int id;
  final String code;
  final String name;
  final String? category;
  final double price;
  final int stock;
  final String? unit;
  final String? description;

  Medication({
    required this.id,
    required this.code,
    required this.name,
    this.category,
    this.price = 0,
    this.stock = 0,
    this.unit,
    this.description,
  });

  factory Medication.fromJson(Map<String, dynamic> json) {
    return Medication(
      id: json['id'] ?? 0,
      code: json['kode'] ?? json['code'] ?? '',
      name: json['nama'] ?? json['name'] ?? '',
      category: json['kategori'] ?? json['category'],
      price: Billing._parseDouble(json['harga_jual'] ?? json['price']),
      stock: json['stok'] ?? json['stock'] ?? 0,
      unit: json['satuan'] ?? json['unit'],
      description: json['keterangan'] ?? json['description'],
    );
  }
}

class Service {
  final int id;
  final String code;
  final String name;
  final String? category;
  final double price;
  final String? description;

  Service({
    required this.id,
    required this.code,
    required this.name,
    this.category,
    this.price = 0,
    this.description,
  });

  factory Service.fromJson(Map<String, dynamic> json) {
    return Service(
      id: json['id'] ?? 0,
      code: json['kode'] ?? json['code'] ?? '',
      name: json['nama'] ?? json['name'] ?? '',
      category: json['kategori'] ?? json['category'],
      price: Billing._parseDouble(json['harga'] ?? json['price']),
      description: json['keterangan'] ?? json['description'],
    );
  }
}
