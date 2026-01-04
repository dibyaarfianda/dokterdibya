import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/appointment_model.dart';
import '../../data/repositories/appointment_repository.dart';

class AppointmentListState {
  final List<Appointment> appointments;
  final bool isLoading;
  final String? error;
  final String? selectedLocation;
  final DateTime? selectedDate;

  AppointmentListState({
    this.appointments = const [],
    this.isLoading = false,
    this.error,
    this.selectedLocation,
    this.selectedDate,
  });

  AppointmentListState copyWith({
    List<Appointment>? appointments,
    bool? isLoading,
    String? error,
    String? selectedLocation,
    DateTime? selectedDate,
  }) {
    return AppointmentListState(
      appointments: appointments ?? this.appointments,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      selectedLocation: selectedLocation ?? this.selectedLocation,
      selectedDate: selectedDate ?? this.selectedDate,
    );
  }

  List<Appointment> get todayAppointments {
    final now = DateTime.now();
    return appointments.where((a) =>
      a.appointmentDate.year == now.year &&
      a.appointmentDate.month == now.month &&
      a.appointmentDate.day == now.day
    ).toList();
  }

  List<Appointment> get upcomingAppointments {
    return appointments.where((a) => a.isUpcoming && !a.isToday).toList();
  }

  Map<DateTime, List<Appointment>> get appointmentsByDate {
    final map = <DateTime, List<Appointment>>{};
    for (final apt in appointments) {
      final dateKey = DateTime(apt.appointmentDate.year, apt.appointmentDate.month, apt.appointmentDate.day);
      map.putIfAbsent(dateKey, () => []).add(apt);
    }
    return map;
  }
}

class AppointmentListNotifier extends StateNotifier<AppointmentListState> {
  final AppointmentRepository _repository;

  AppointmentListNotifier(this._repository) : super(AppointmentListState());

  Future<void> loadAppointments({String? location, DateTime? date}) async {
    state = state.copyWith(
      isLoading: true,
      error: null,
      selectedLocation: location,
      selectedDate: date,
    );

    try {
      final appointments = await _repository.getAppointments(
        location: location,
        date: date,
      );
      state = state.copyWith(appointments: appointments, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadUpcoming({String? location}) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final appointments = await _repository.getUpcomingAppointments(
        location: location,
        days: 14,
      );
      state = state.copyWith(appointments: appointments, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setLocation(String? location) {
    state = state.copyWith(selectedLocation: location);
    loadAppointments(location: location, date: state.selectedDate);
  }

  void setDate(DateTime? date) {
    state = state.copyWith(selectedDate: date);
    loadAppointments(location: state.selectedLocation, date: date);
  }

  Future<bool> cancelAppointment(int id, {String? reason}) async {
    try {
      await _repository.cancelAppointment(id, reason: reason);
      await loadAppointments(
        location: state.selectedLocation,
        date: state.selectedDate,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> confirmAppointment(int id) async {
    try {
      await _repository.confirmAppointment(id);
      await loadAppointments(
        location: state.selectedLocation,
        date: state.selectedDate,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> markAsCompleted(int id) async {
    try {
      await _repository.markAsCompleted(id);
      await loadAppointments(
        location: state.selectedLocation,
        date: state.selectedDate,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final appointmentListProvider =
    StateNotifierProvider<AppointmentListNotifier, AppointmentListState>((ref) {
  final repository = ref.watch(appointmentRepositoryProvider);
  return AppointmentListNotifier(repository);
});

// Create Appointment State
class CreateAppointmentState {
  final bool isLoading;
  final String? error;
  final Appointment? createdAppointment;

  CreateAppointmentState({
    this.isLoading = false,
    this.error,
    this.createdAppointment,
  });

  CreateAppointmentState copyWith({
    bool? isLoading,
    String? error,
    Appointment? createdAppointment,
  }) {
    return CreateAppointmentState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      createdAppointment: createdAppointment,
    );
  }
}

class CreateAppointmentNotifier extends StateNotifier<CreateAppointmentState> {
  final AppointmentRepository _repository;

  CreateAppointmentNotifier(this._repository) : super(CreateAppointmentState());

  Future<bool> createAppointment({
    required String patientId,
    required DateTime appointmentDate,
    String? appointmentTime,
    required String location,
    String? category,
    String? notes,
  }) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final appointment = await _repository.createAppointment(
        patientId: patientId,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        location: location,
        category: category,
        notes: notes,
      );
      state = state.copyWith(
        isLoading: false,
        createdAppointment: appointment,
      );
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  void clear() {
    state = CreateAppointmentState();
  }
}

final createAppointmentProvider =
    StateNotifierProvider<CreateAppointmentNotifier, CreateAppointmentState>((ref) {
  final repository = ref.watch(appointmentRepositoryProvider);
  return CreateAppointmentNotifier(repository);
});
