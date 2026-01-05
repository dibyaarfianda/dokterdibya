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
    // Deprecated: use loadRecordByMrId instead
    state = state.copyWith(isLoading: false, error: 'Use MR ID to load records');
  }

  Future<void> loadRecordByMrId(String mrId) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final record = await _repository.getRecordByMrId(mrId);
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
    String? existingMrId,
  }) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      MedicalRecord? record;

      // If we have an existing MR ID, load it
      if (existingMrId != null && existingMrId.isNotEmpty) {
        record = await _repository.getRecordByMrId(existingMrId);
      }

      // If no record found, create a new one
      record ??= await _repository.createRecord(
        patientId: patientId,
        category: category,
        visitLocation: location,
      );

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
    if (state.record?.mrId == null) return false;

    state = state.copyWith(isSaving: true, error: null, successMessage: null);

    try {
      final updatedRecord = await _repository.updateRecordSection(
        recordId: state.record!.id ?? 0,
        section: section,
        sectionData: data,
        mrId: state.record!.mrId,
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
    if (state.record?.mrId == null) return false;

    state = state.copyWith(isSaving: true, error: null);

    try {
      final updatedRecord = await _repository.finalizeRecord(
        state.record!.id ?? 0,
        mrId: state.record!.mrId,
      );
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

// Billing State
class BillingState {
  final Billing? billing;
  final bool isLoading;
  final bool isProcessing;
  final String? error;
  final String? successMessage;

  BillingState({
    this.billing,
    this.isLoading = false,
    this.isProcessing = false,
    this.error,
    this.successMessage,
  });

  BillingState copyWith({
    Billing? billing,
    bool? isLoading,
    bool? isProcessing,
    String? error,
    String? successMessage,
  }) {
    return BillingState(
      billing: billing ?? this.billing,
      isLoading: isLoading ?? this.isLoading,
      isProcessing: isProcessing ?? this.isProcessing,
      error: error,
      successMessage: successMessage,
    );
  }
}

class BillingNotifier extends StateNotifier<BillingState> {
  final SundayClinicRepository _repository;

  BillingNotifier(this._repository) : super(BillingState());

  Future<void> loadBilling(String mrId) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final billing = await _repository.getBilling(mrId);
      state = state.copyWith(
        billing: billing ?? Billing(mrId: mrId),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> addItem({
    required String mrId,
    required String type,
    required String name,
    String? code,
    int quantity = 1,
    required double price,
  }) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final billing = await _repository.addBillingItem(
        mrId: mrId,
        type: type,
        name: name,
        code: code,
        quantity: quantity,
        price: price,
      );
      state = state.copyWith(
        billing: billing,
        isProcessing: false,
        successMessage: 'Item berhasil ditambahkan',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteItem(String mrId, int itemId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      await _repository.deleteBillingItem(mrId, itemId);
      await loadBilling(mrId);
      state = state.copyWith(
        isProcessing: false,
        successMessage: 'Item berhasil dihapus',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  Future<bool> confirm(String mrId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final billing = await _repository.confirmBilling(mrId);
      state = state.copyWith(
        billing: billing,
        isProcessing: false,
        successMessage: 'Billing berhasil dikonfirmasi',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  Future<bool> markPaid(String mrId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final billing = await _repository.markBillingPaid(mrId);
      state = state.copyWith(
        billing: billing,
        isProcessing: false,
        successMessage: 'Status pembayaran diupdate',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  Future<String?> printInvoice(String mrId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final url = await _repository.printInvoice(mrId);
      state = state.copyWith(isProcessing: false);
      return url;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return null;
    }
  }

  Future<String?> printEtiket(String mrId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final url = await _repository.printEtiket(mrId);
      state = state.copyWith(isProcessing: false);
      return url;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return null;
    }
  }

  void clear() {
    state = BillingState();
  }

  void clearMessages() {
    state = state.copyWith(error: null, successMessage: null);
  }
}

final billingProvider = StateNotifierProvider<BillingNotifier, BillingState>((ref) {
  final repository = ref.watch(sundayClinicRepositoryProvider);
  return BillingNotifier(repository);
});

// Send to Patient State
class SendToPatientState {
  final bool isProcessing;
  final String? error;
  final String? successMessage;
  final DocumentsSent? documentsSent;

  SendToPatientState({
    this.isProcessing = false,
    this.error,
    this.successMessage,
    this.documentsSent,
  });

  SendToPatientState copyWith({
    bool? isProcessing,
    String? error,
    String? successMessage,
    DocumentsSent? documentsSent,
  }) {
    return SendToPatientState(
      isProcessing: isProcessing ?? this.isProcessing,
      error: error,
      successMessage: successMessage,
      documentsSent: documentsSent ?? this.documentsSent,
    );
  }
}

class SendToPatientNotifier extends StateNotifier<SendToPatientState> {
  final SundayClinicRepository _repository;

  SendToPatientNotifier(this._repository) : super(SendToPatientState());

  Future<void> loadDocumentsSentStatus(String mrId) async {
    try {
      final status = await _repository.getDocumentsSentStatus(mrId);
      state = state.copyWith(documentsSent: status);
    } catch (_) {
      // Silently fail
    }
  }

  Future<String?> generatePdf(String mrId) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      final url = await _repository.generateResumeMedisPdf(mrId);
      state = state.copyWith(
        isProcessing: false,
        successMessage: 'PDF berhasil di-generate',
      );
      return url;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return null;
    }
  }

  Future<bool> sendToPortal({
    required String mrId,
    bool sendResumeMedis = true,
    bool sendLabResults = false,
    bool sendUsgPhotos = false,
    String? notes,
  }) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      await _repository.sendToPatientPortal(
        mrId: mrId,
        sendResumeMedis: sendResumeMedis,
        sendLabResults: sendLabResults,
        sendUsgPhotos: sendUsgPhotos,
        notes: notes,
      );
      await loadDocumentsSentStatus(mrId);
      state = state.copyWith(
        isProcessing: false,
        successMessage: 'Dokumen berhasil dikirim ke Portal',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  Future<bool> sendToWhatsApp({
    required String mrId,
    required String phone,
    bool sendResumeMedis = true,
    bool sendLabResults = false,
    bool sendUsgPhotos = false,
    String? message,
  }) async {
    state = state.copyWith(isProcessing: true, error: null);

    try {
      await _repository.sendToWhatsApp(
        mrId: mrId,
        phone: phone,
        sendResumeMedis: sendResumeMedis,
        sendLabResults: sendLabResults,
        sendUsgPhotos: sendUsgPhotos,
        message: message,
      );
      await loadDocumentsSentStatus(mrId);
      state = state.copyWith(
        isProcessing: false,
        successMessage: 'Dokumen berhasil dikirim via WhatsApp',
      );
      return true;
    } catch (e) {
      state = state.copyWith(isProcessing: false, error: e.toString());
      return false;
    }
  }

  void clear() {
    state = SendToPatientState();
  }

  void clearMessages() {
    state = state.copyWith(error: null, successMessage: null);
  }
}

final sendToPatientProvider =
    StateNotifierProvider<SendToPatientNotifier, SendToPatientState>((ref) {
  final repository = ref.watch(sundayClinicRepositoryProvider);
  return SendToPatientNotifier(repository);
});
