import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/medical_record_model.dart';
import '../../data/repositories/sunday_clinic_repository.dart';

// Queue State
class QueueState {
  final List<QueueItem> items;
  final bool isLoading;
  final String? error;
  final String selectedLocation;
  final String? searchQuery;

  QueueState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.selectedLocation = 'klinik_private',
    this.searchQuery,
  });

  QueueState copyWith({
    List<QueueItem>? items,
    bool? isLoading,
    String? error,
    String? selectedLocation,
    String? searchQuery,
  }) {
    return QueueState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      selectedLocation: selectedLocation ?? this.selectedLocation,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }

  List<QueueItem> get pendingItems => items.where((i) => i.isPending).toList();
  List<QueueItem> get inProgressItems => items.where((i) => i.isInProgress).toList();
  List<QueueItem> get completedItems => items.where((i) => i.isCompleted).toList();
}

class QueueNotifier extends StateNotifier<QueueState> {
  final SundayClinicRepository _repository;

  QueueNotifier(this._repository) : super(QueueState());

  Future<void> loadQueue() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final items = await _repository.getTodayQueue(location: state.selectedLocation);
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setLocation(String location) {
    state = state.copyWith(selectedLocation: location, items: []);
    loadQueue();
  }

  void setSearch(String? query) {
    state = state.copyWith(searchQuery: query);
  }

  Future<void> refresh() async {
    await loadQueue();
  }

  Future<bool> addToQueue({
    required String patientId,
    String? appointmentTime,
    String? notes,
  }) async {
    try {
      await _repository.addToQueue(
        patientId: patientId,
        location: state.selectedLocation,
        appointmentTime: appointmentTime,
        notes: notes,
      );
      await loadQueue();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> removeFromQueue(int queueId) async {
    try {
      await _repository.removeFromQueue(queueId);
      await loadQueue();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final queueProvider = StateNotifierProvider<QueueNotifier, QueueState>((ref) {
  final repository = ref.watch(sundayClinicRepositoryProvider);
  return QueueNotifier(repository);
});

// Medical Record State
class MedicalRecordState {
  final MedicalRecord? record;
  final bool isLoading;
  final bool isSaving;
  final String? error;
  final String? successMessage;
  final List<MedicalRecord> patientHistory;
  final String activeSection;

  MedicalRecordState({
    this.record,
    this.isLoading = false,
    this.isSaving = false,
    this.error,
    this.successMessage,
    this.patientHistory = const [],
    this.activeSection = 'anamnesa',
  });

  MedicalRecordState copyWith({
    MedicalRecord? record,
    bool? isLoading,
    bool? isSaving,
    String? error,
    String? successMessage,
    List<MedicalRecord>? patientHistory,
    String? activeSection,
  }) {
    return MedicalRecordState(
      record: record ?? this.record,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
      successMessage: successMessage,
      patientHistory: patientHistory ?? this.patientHistory,
      activeSection: activeSection ?? this.activeSection,
    );
  }
}

class MedicalRecordNotifier extends StateNotifier<MedicalRecordState> {
  final SundayClinicRepository _repository;

  MedicalRecordNotifier(this._repository) : super(MedicalRecordState());

  Future<void> loadRecord(int recordId) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final record = await _repository.getRecord(recordId);
      state = state.copyWith(record: record, isLoading: false);

      if (record != null) {
        loadPatientHistory(record.patientId);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadOrCreateRecord({
    required String patientId,
    required String category,
    required String location,
  }) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      // Try to get existing record first
      var record = await _repository.getRecordByPatient(patientId, location: location);

      // If no record exists, create one
      if (record == null) {
        record = await _repository.createRecord(
          patientId: patientId,
          category: category,
          visitLocation: location,
        );
      }

      state = state.copyWith(record: record, isLoading: false);
      loadPatientHistory(patientId);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadPatientHistory(String patientId) async {
    try {
      final history = await _repository.getPatientVisits(patientId);
      state = state.copyWith(patientHistory: history);
    } catch (_) {
      // Silently fail for history
    }
  }

  void setActiveSection(String section) {
    state = state.copyWith(activeSection: section);
  }

  Future<bool> saveSection({
    required String section,
    required Map<String, dynamic> data,
  }) async {
    if (state.record?.id == null) return false;

    state = state.copyWith(isSaving: true, error: null, successMessage: null);

    try {
      final updatedRecord = await _repository.updateRecordSection(
        recordId: state.record!.id!,
        section: section,
        sectionData: data,
      );

      state = state.copyWith(
        record: updatedRecord,
        isSaving: false,
        successMessage: 'Data berhasil disimpan',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  Future<bool> finalize() async {
    if (state.record?.id == null) return false;

    state = state.copyWith(isSaving: true, error: null);

    try {
      final updatedRecord = await _repository.finalizeRecord(state.record!.id!);
      state = state.copyWith(
        record: updatedRecord,
        isSaving: false,
        successMessage: 'Rekam medis berhasil diselesaikan',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSaving: false, error: e.toString());
      return false;
    }
  }

  void clear() {
    state = MedicalRecordState();
  }

  void clearMessages() {
    state = state.copyWith(error: null, successMessage: null);
  }
}

final medicalRecordProvider =
    StateNotifierProvider<MedicalRecordNotifier, MedicalRecordState>((ref) {
  final repository = ref.watch(sundayClinicRepositoryProvider);
  return MedicalRecordNotifier(repository);
});

// Section-specific form data providers
final anamnesaFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final physicalExamFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final obstetricsExamFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final supportingFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final usgObstetriFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final usgGynecologyFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final diagnosisFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
final planFormProvider = StateProvider<Map<String, dynamic>>((ref) => {});
