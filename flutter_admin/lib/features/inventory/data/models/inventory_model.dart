class Obat {
  final int id;
  final String kode;
  final String nama;
  final String? kategori;
  final double hargaBeli;
  final double hargaJual;
  final int stok;
  final int stokMinimum;
  final String? satuan;
  final String? keterangan;
  final DateTime? expiredDate;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Obat({
    required this.id,
    required this.kode,
    required this.nama,
    this.kategori,
    this.hargaBeli = 0,
    this.hargaJual = 0,
    this.stok = 0,
    this.stokMinimum = 0,
    this.satuan,
    this.keterangan,
    this.expiredDate,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  factory Obat.fromJson(Map<String, dynamic> json) {
    return Obat(
      id: json['id'] ?? 0,
      kode: json['code'] ?? json['kode'] ?? '',
      nama: json['name'] ?? json['nama'] ?? '',
      kategori: json['category'] ?? json['kategori'],
      hargaBeli: _parseDouble(json['default_cost_price'] ?? json['harga_beli']),
      hargaJual: _parseDouble(json['price'] ?? json['harga_jual']),
      stok: _parseInt(json['stock'] ?? json['stok']) ?? 0,
      stokMinimum: _parseInt(json['min_stock'] ?? json['stok_minimum']) ?? 0,
      satuan: json['unit'] ?? json['satuan'],
      keterangan: json['keterangan'] ?? json['description'],
      expiredDate: _parseDate(json['expired_date']),
      isActive: json['is_active'] ?? true,
      createdAt: _parseDate(json['created_at']),
      updatedAt: _parseDate(json['updated_at']),
    );
  }

  static int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is String) return int.tryParse(value);
    return null;
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
    return null;
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
      'kode': kode,
      'nama': nama,
      if (kategori != null) 'kategori': kategori,
      'harga_beli': hargaBeli,
      'harga_jual': hargaJual,
      'stok': stok,
      'stok_minimum': stokMinimum,
      if (satuan != null) 'satuan': satuan,
      if (keterangan != null) 'keterangan': keterangan,
      if (expiredDate != null) 'expired_date': expiredDate!.toIso8601String().split('T').first,
      'is_active': isActive,
    };
  }

  bool get isLowStock => stok <= stokMinimum;
  bool get isOutOfStock => stok <= 0;
  bool get isExpiringSoon {
    if (expiredDate == null) return false;
    return expiredDate!.difference(DateTime.now()).inDays <= 30;
  }
  bool get isExpired {
    if (expiredDate == null) return false;
    return expiredDate!.isBefore(DateTime.now());
  }

  Obat copyWith({
    int? id,
    String? kode,
    String? nama,
    String? kategori,
    double? hargaBeli,
    double? hargaJual,
    int? stok,
    int? stokMinimum,
    String? satuan,
    String? keterangan,
    DateTime? expiredDate,
    bool? isActive,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Obat(
      id: id ?? this.id,
      kode: kode ?? this.kode,
      nama: nama ?? this.nama,
      kategori: kategori ?? this.kategori,
      hargaBeli: hargaBeli ?? this.hargaBeli,
      hargaJual: hargaJual ?? this.hargaJual,
      stok: stok ?? this.stok,
      stokMinimum: stokMinimum ?? this.stokMinimum,
      satuan: satuan ?? this.satuan,
      keterangan: keterangan ?? this.keterangan,
      expiredDate: expiredDate ?? this.expiredDate,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class Tindakan {
  final int id;
  final String kode;
  final String nama;
  final String? kategori;
  final double harga;
  final String? keterangan;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Tindakan({
    required this.id,
    required this.kode,
    required this.nama,
    this.kategori,
    this.harga = 0,
    this.keterangan,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  factory Tindakan.fromJson(Map<String, dynamic> json) {
    return Tindakan(
      id: json['id'] ?? 0,
      kode: json['kode'] ?? '',
      nama: json['nama'] ?? '',
      kategori: json['kategori'],
      harga: Obat._parseDouble(json['harga']),
      keterangan: json['keterangan'],
      isActive: json['is_active'] ?? true,
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.tryParse(json['updated_at']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kode': kode,
      'nama': nama,
      if (kategori != null) 'kategori': kategori,
      'harga': harga,
      if (keterangan != null) 'keterangan': keterangan,
      'is_active': isActive,
    };
  }

  Tindakan copyWith({
    int? id,
    String? kode,
    String? nama,
    String? kategori,
    double? harga,
    String? keterangan,
    bool? isActive,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Tindakan(
      id: id ?? this.id,
      kode: kode ?? this.kode,
      nama: nama ?? this.nama,
      kategori: kategori ?? this.kategori,
      harga: harga ?? this.harga,
      keterangan: keterangan ?? this.keterangan,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class StockAdjustment {
  final int id;
  final int obatId;
  final String type; // 'in', 'out', 'adjustment'
  final int quantity;
  final String? reason;
  final String? reference;
  final String? createdBy;
  final DateTime? createdAt;

  StockAdjustment({
    required this.id,
    required this.obatId,
    required this.type,
    required this.quantity,
    this.reason,
    this.reference,
    this.createdBy,
    this.createdAt,
  });

  factory StockAdjustment.fromJson(Map<String, dynamic> json) {
    return StockAdjustment(
      id: json['id'] ?? 0,
      obatId: json['obat_id'] ?? 0,
      type: json['type'] ?? 'adjustment',
      quantity: json['quantity'] ?? 0,
      reason: json['reason'],
      reference: json['reference'],
      createdBy: json['created_by'],
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
    );
  }
}

class InventoryStats {
  final int totalObat;
  final int totalTindakan;
  final int lowStockCount;
  final int outOfStockCount;
  final int expiringSoonCount;
  final double totalValue;

  InventoryStats({
    this.totalObat = 0,
    this.totalTindakan = 0,
    this.lowStockCount = 0,
    this.outOfStockCount = 0,
    this.expiringSoonCount = 0,
    this.totalValue = 0,
  });

  factory InventoryStats.fromJson(Map<String, dynamic> json) {
    return InventoryStats(
      totalObat: json['total_obat'] ?? 0,
      totalTindakan: json['total_tindakan'] ?? 0,
      lowStockCount: json['low_stock_count'] ?? 0,
      outOfStockCount: json['out_of_stock_count'] ?? 0,
      expiringSoonCount: json['expiring_soon_count'] ?? 0,
      totalValue: Obat._parseDouble(json['total_value']),
    );
  }
}
