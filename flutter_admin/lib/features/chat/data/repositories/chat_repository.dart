import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/chat_model.dart';

class ChatRepository {
  final ApiClient _apiClient;

  ChatRepository(this._apiClient);

  Future<List<ChatUser>> getOnlineUsers() async {
    final response = await _apiClient.get('${ApiEndpoints.chat}/users');
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((u) => ChatUser.fromJson(u))
          .toList();
    }
    return [];
  }

  Future<List<ChatMessage>> getMessages(String otherUserId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.chat}/messages/$otherUserId',
    );
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((m) => ChatMessage.fromJson(m))
          .toList();
    }
    return [];
  }

  Future<ChatMessage> sendMessage(String receiverId, String message) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.chat}/messages',
      data: {
        'receiver_id': receiverId,
        'message': message,
      },
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return ChatMessage.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal mengirim pesan');
  }

  Future<void> markAsRead(String senderId) async {
    await _apiClient.post('${ApiEndpoints.chat}/messages/$senderId/read');
  }
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ChatRepository(apiClient);
});
