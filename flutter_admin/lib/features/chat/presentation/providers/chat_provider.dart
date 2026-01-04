import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/chat_model.dart';
import '../../data/repositories/chat_repository.dart';

class ChatState {
  final List<ChatUser> users;
  final List<ChatMessage> messages;
  final String? selectedUserId;
  final bool isLoading;
  final String? error;

  ChatState({
    this.users = const [],
    this.messages = const [],
    this.selectedUserId,
    this.isLoading = false,
    this.error,
  });

  ChatState copyWith({
    List<ChatUser>? users,
    List<ChatMessage>? messages,
    String? selectedUserId,
    bool? isLoading,
    String? error,
  }) {
    return ChatState(
      users: users ?? this.users,
      messages: messages ?? this.messages,
      selectedUserId: selectedUserId ?? this.selectedUserId,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final ChatRepository _repository;

  ChatNotifier(this._repository) : super(ChatState());

  Future<void> loadUsers() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final users = await _repository.getOnlineUsers();
      state = state.copyWith(users: users, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> selectUser(String userId) async {
    state = state.copyWith(selectedUserId: userId, isLoading: true);

    try {
      final messages = await _repository.getMessages(userId);
      await _repository.markAsRead(userId);
      state = state.copyWith(messages: messages, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> sendMessage(String message) async {
    if (state.selectedUserId == null) return false;

    try {
      final newMessage = await _repository.sendMessage(
        state.selectedUserId!,
        message,
      );
      state = state.copyWith(
        messages: [...state.messages, newMessage],
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  void clearSelection() {
    state = state.copyWith(selectedUserId: null, messages: []);
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final repository = ref.watch(chatRepositoryProvider);
  return ChatNotifier(repository);
});
