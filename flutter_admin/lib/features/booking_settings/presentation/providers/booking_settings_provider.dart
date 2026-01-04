import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/booking_settings_model.dart';
import '../../data/repositories/booking_settings_repository.dart';

class BookingSettingsState {
  final List<BookingSession> sessions;
  final List<Booking> bookings;
  final bool isLoading;
  final String? error;

  BookingSettingsState({
    this.sessions = const [],
    this.bookings = const [],
    this.isLoading = false,
    this.error,
  });

  BookingSettingsState copyWith({
    List<BookingSession>? sessions,
    List<Booking>? bookings,
    bool? isLoading,
    String? error,
  }) {
    return BookingSettingsState(
      sessions: sessions ?? this.sessions,
      bookings: bookings ?? this.bookings,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class BookingSettingsNotifier extends StateNotifier<BookingSettingsState> {
  final BookingSettingsRepository _repository;

  BookingSettingsNotifier(this._repository) : super(BookingSettingsState());

  Future<void> loadAll() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final sessions = await _repository.getSettings();
      final bookings = await _repository.getBookings();

      state = state.copyWith(
        sessions: sessions,
        bookings: bookings,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadSessions() async {
    try {
      final sessions = await _repository.getSettings();
      state = state.copyWith(sessions: sessions);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> loadBookings({String? date, int? session, String? status}) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final bookings = await _repository.getBookings(
        date: date,
        session: session,
        status: status,
      );

      state = state.copyWith(bookings: bookings, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> updateSession(int id, Map<String, dynamic> updates) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final success = await _repository.updateSession(id, updates);
      if (success) {
        await loadSessions();
      }
      state = state.copyWith(isLoading: false);
      return success;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> createSession(Map<String, dynamic> sessionData) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final success = await _repository.createSession(sessionData);
      if (success) {
        await loadSessions();
      }
      state = state.copyWith(isLoading: false);
      return success;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteSession(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final success = await _repository.deleteSession(id);
      if (success) {
        await loadSessions();
      }
      state = state.copyWith(isLoading: false);
      return success;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> cancelBooking(int id, String reason, bool notifyPatient) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final success = await _repository.cancelBooking(id, reason, notifyPatient);
      if (success) {
        await loadBookings();
      }
      state = state.copyWith(isLoading: false);
      return success;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final bookingSettingsProvider =
    StateNotifierProvider<BookingSettingsNotifier, BookingSettingsState>((ref) {
  final repository = ref.watch(bookingSettingsRepositoryProvider);
  return BookingSettingsNotifier(repository);
});
