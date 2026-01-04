import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/announcement_model.dart';
import '../../data/repositories/announcement_repository.dart';

class AnnouncementState {
  final List<Announcement> announcements;
  final List<StaffAnnouncement> staffAnnouncements;
  final bool isLoading;
  final String? error;

  AnnouncementState({
    this.announcements = const [],
    this.staffAnnouncements = const [],
    this.isLoading = false,
    this.error,
  });

  AnnouncementState copyWith({
    List<Announcement>? announcements,
    List<StaffAnnouncement>? staffAnnouncements,
    bool? isLoading,
    String? error,
  }) {
    return AnnouncementState(
      announcements: announcements ?? this.announcements,
      staffAnnouncements: staffAnnouncements ?? this.staffAnnouncements,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AnnouncementNotifier extends StateNotifier<AnnouncementState> {
  final AnnouncementRepository _repository;

  AnnouncementNotifier(this._repository) : super(AnnouncementState());

  Future<void> loadAnnouncements() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final announcements = await _repository.getAnnouncements();
      state = state.copyWith(
        announcements: announcements,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadStaffAnnouncements() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final staffAnnouncements = await _repository.getStaffAnnouncements();
      state = state.copyWith(
        staffAnnouncements: staffAnnouncements,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<bool> createAnnouncement(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createAnnouncement(data);
      await loadAnnouncements();
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<bool> updateAnnouncement(int id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.updateAnnouncement(id, data);
      await loadAnnouncements();
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<bool> deleteAnnouncement(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteAnnouncement(id);
      await loadAnnouncements();
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<bool> createStaffAnnouncement(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createStaffAnnouncement(data);
      await loadStaffAnnouncements();
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<void> markStaffAnnouncementRead(int id) async {
    try {
      await _repository.markStaffAnnouncementRead(id);
      await loadStaffAnnouncements();
    } catch (_) {}
  }
}

final announcementProvider =
    StateNotifierProvider<AnnouncementNotifier, AnnouncementState>((ref) {
  final repository = ref.watch(announcementRepositoryProvider);
  return AnnouncementNotifier(repository);
});
