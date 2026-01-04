import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/stock_movement_model.dart';

class StockMovementRepository {
  final ApiClient _apiClient;

  StockMovementRepository(this._apiClient);

  Future<StockMovementResponse> getActivityLog({
    String? startDate,
    String? endDate,
    String? movementType,
    String? createdBy,
    int? obatId,
    int limit = 50,
    int offset = 0,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
      'offset': offset,
    };

    if (startDate != null) queryParams['start_date'] = startDate;
    if (endDate != null) queryParams['end_date'] = endDate;
    if (movementType != null) queryParams['movement_type'] = movementType;
    if (createdBy != null) queryParams['created_by'] = createdBy;
    if (obatId != null) queryParams['obat_id'] = obatId;

    final response = await _apiClient.get(
      ApiEndpoints.inventoryActivityLog,
      queryParameters: queryParams,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      final movements = (data['data'] as List)
          .map((m) => StockMovement.fromJson(m))
          .toList();

      return StockMovementResponse(
        movements: movements,
        total: data['pagination']?['total'] ?? movements.length,
        users: (data['filters']?['users'] as List?)?.cast<String>() ?? [],
      );
    }
    return StockMovementResponse(movements: [], total: 0, users: []);
  }
}

class StockMovementResponse {
  final List<StockMovement> movements;
  final int total;
  final List<String> users;

  StockMovementResponse({
    required this.movements,
    required this.total,
    required this.users,
  });
}

final stockMovementRepositoryProvider = Provider<StockMovementRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return StockMovementRepository(apiClient);
});
