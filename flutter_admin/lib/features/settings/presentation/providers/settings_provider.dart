import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/settings_model.dart';
import '../../data/repositories/settings_repository.dart';

// Profile State
class ProfileState {
  final UserProfile? profile;
  final bool isLoading;
  final bool isSaving;
  final String? error;

  ProfileState({
    this.profile,
    this.isLoading = false,
    this.isSaving = false,
    this.error,
  });

  ProfileState copyWith({
    UserProfile? profile,
    bool? isLoading,
    bool? isSaving,
    String? error,
  }) {
    return ProfileState(
      profile: profile ?? this.profile,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
    );
  }
}

class ProfileNotifier extends StateNotifier<ProfileState> {
  final SettingsRepository _repository;

  ProfileNotifier(this._repository) : super(ProfileState());

  Future<void> loadProfile() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final profile = await _repository.getProfile();
      state = state.copyWith(profile: profile, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> updateProfile(Map<String, dynamic> updates) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final profile = await _repository.updateProfile(updates);
      state = state.copyWith(profile: profile, isSaving: false);
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      await _repository.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      state = state.copyWith(isSaving: false);
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }
}

final profileProvider = StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  final repository = ref.watch(settingsRepositoryProvider);
  return ProfileNotifier(repository);
});

// App Preferences State
class PreferencesNotifier extends StateNotifier<AppPreferences> {
  final SettingsRepository _repository;

  PreferencesNotifier(this._repository) : super(AppPreferences()) {
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    final prefs = await _repository.getPreferences();
    state = prefs;
  }

  Future<void> setDarkMode(bool value) async {
    state = state.copyWith(darkMode: value);
    await _repository.savePreferences(state);
  }

  Future<void> setNotificationsEnabled(bool value) async {
    state = state.copyWith(notificationsEnabled: value);
    await _repository.savePreferences(state);
  }

  Future<void> setSoundEnabled(bool value) async {
    state = state.copyWith(soundEnabled: value);
    await _repository.savePreferences(state);
  }

  Future<void> setLanguage(String value) async {
    state = state.copyWith(language: value);
    await _repository.savePreferences(state);
  }
}

final preferencesProvider =
    StateNotifierProvider<PreferencesNotifier, AppPreferences>((ref) {
  final repository = ref.watch(settingsRepositoryProvider);
  return PreferencesNotifier(repository);
});

// Activity Logs State
class ActivityLogState {
  final List<ActivityLog> items;
  final bool isLoading;
  final String? error;
  final bool hasMore;
  final int currentPage;

  ActivityLogState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.hasMore = true,
    this.currentPage = 1,
  });

  ActivityLogState copyWith({
    List<ActivityLog>? items,
    bool? isLoading,
    String? error,
    bool? hasMore,
    int? currentPage,
  }) {
    return ActivityLogState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      hasMore: hasMore ?? this.hasMore,
      currentPage: currentPage ?? this.currentPage,
    );
  }
}

class ActivityLogNotifier extends StateNotifier<ActivityLogState> {
  final SettingsRepository _repository;

  ActivityLogNotifier(this._repository) : super(ActivityLogState());

  Future<void> loadLogs({bool refresh = false}) async {
    if (state.isLoading) return;

    final page = refresh ? 1 : state.currentPage;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final items = await _repository.getActivityLogs(page: page);

      if (refresh) {
        state = state.copyWith(
          items: items,
          isLoading: false,
          currentPage: 1,
          hasMore: items.length >= 50,
        );
      } else {
        state = state.copyWith(
          items: [...state.items, ...items],
          isLoading: false,
          currentPage: page + 1,
          hasMore: items.length >= 50,
        );
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() => loadLogs(refresh: true);
}

final activityLogProvider =
    StateNotifierProvider<ActivityLogNotifier, ActivityLogState>((ref) {
  final repository = ref.watch(settingsRepositoryProvider);
  return ActivityLogNotifier(repository);
});

// System Settings Provider (Admin only)
final systemSettingsProvider = FutureProvider<SystemSettings>((ref) async {
  final repository = ref.watch(settingsRepositoryProvider);
  return repository.getSystemSettings();
});

// Role Visibility Provider (Admin only)
final roleVisibilityProvider = FutureProvider<List<RoleVisibility>>((ref) async {
  final repository = ref.watch(settingsRepositoryProvider);
  return repository.getRoleVisibility();
});
