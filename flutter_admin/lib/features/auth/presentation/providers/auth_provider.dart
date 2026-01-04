import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/constants/roles.dart';

class AuthState {
  final bool isLoggedIn;
  final bool isLoading;
  final String? error;
  final Map<String, dynamic>? user;
  final UserRole? role;

  AuthState({
    this.isLoggedIn = false,
    this.isLoading = false,
    this.error,
    this.user,
    this.role,
  });

  AuthState copyWith({
    bool? isLoggedIn,
    bool? isLoading,
    String? error,
    Map<String, dynamic>? user,
    UserRole? role,
  }) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      user: user ?? this.user,
      role: role ?? this.role,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final SecureStorageService _storage;
  final ApiClient _apiClient;

  AuthNotifier(this._storage, this._apiClient) : super(AuthState()) {
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    state = state.copyWith(isLoading: true);
    try {
      final isLoggedIn = await _storage.isLoggedIn();
      if (isLoggedIn) {
        final user = await _storage.getUser();
        final roleStr = await _storage.getRole();
        final role = roleStr != null ? UserRoleExtension.fromString(roleStr) : null;
        state = AuthState(
          isLoggedIn: true,
          user: user,
          role: role,
        );
      } else {
        state = AuthState(isLoggedIn: false);
      }
    } catch (e) {
      state = AuthState(isLoggedIn: false, error: e.toString());
    }
  }

  Future<bool> login(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _apiClient.post(
        ApiEndpoints.login,
        data: {
          'email': email,
          'password': password,
        },
      );

      final data = response.data;
      if (data['success'] == true && data['data'] != null) {
        final token = data['data']['token'];
        final user = data['data']['user'];
        final roleStr = user['role'] ?? 'front_office';

        await _storage.saveToken(token);
        await _storage.saveUser(user);
        await _storage.saveRole(roleStr);

        state = AuthState(
          isLoggedIn: true,
          user: user,
          role: UserRoleExtension.fromString(roleStr),
        );
        return true;
      } else {
        state = state.copyWith(
          isLoading: false,
          error: data['message'] ?? 'Login gagal',
        );
        return false;
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Terjadi kesalahan: ${e.toString()}',
      );
      return false;
    }
  }

  Future<void> logout() async {
    await _storage.clearAll();
    state = AuthState(isLoggedIn: false);
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final apiClient = ref.watch(apiClientProvider);
  return AuthNotifier(storage, apiClient);
});
