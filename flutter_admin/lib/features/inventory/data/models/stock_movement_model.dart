class StockMovement {
  final int id;
  final DateTime createdAt;
  final String movementType;
  final int quantity;
  final double? costPrice;
  final String? referenceType;
  final int? referenceId;
  final String? notes;
  final String? createdBy;
  final int obatId;
  final String? obatCode;
  final String obatName;
  final String? batchNumber;
  final DateTime? expiryDate;
  final String? supplierName;

  StockMovement({
    required this.id,
    required this.createdAt,
    required this.movementType,
    required this.quantity,
    this.costPrice,
    this.referenceType,
    this.referenceId,
    this.notes,
    this.createdBy,
    required this.obatId,
    this.obatCode,
    required this.obatName,
    this.batchNumber,
    this.expiryDate,
    this.supplierName,
  });

  factory StockMovement.fromJson(Map<String, dynamic> json) {
    return StockMovement(
      id: json['id'],
      createdAt: DateTime.parse(json['created_at']),
      movementType: json['movement_type'] ?? '',
      quantity: json['quantity'] ?? 0,
      costPrice: json['cost_price'] != null ? double.tryParse(json['cost_price'].toString()) : null,
      referenceType: json['reference_type'],
      referenceId: json['reference_id'],
      notes: json['notes'],
      createdBy: json['created_by'],
      obatId: json['obat_id'],
      obatCode: json['obat_code'],
      obatName: json['obat_name'] ?? '',
      batchNumber: json['batch_number'],
      expiryDate: json['expiry_date'] != null ? DateTime.tryParse(json['expiry_date']) : null,
      supplierName: json['supplier_name'],
    );
  }

  String get movementTypeDisplay {
    switch (movementType) {
      case 'stock_in':
        return 'Stok Masuk';
      case 'stock_out':
        return 'Stok Keluar';
      case 'sale':
        return 'Penjualan';
      case 'adjustment':
        return 'Penyesuaian';
      case 'return':
        return 'Retur';
      case 'billing':
        return 'Tagihan';
      default:
        return movementType;
    }
  }

  bool get isIncoming => movementType == 'stock_in' || movementType == 'return';
}
