import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/patient_model.dart';
import '../../data/repositories/patient_repository.dart';

class PatientListState {
  final List<Patient> patients;
  final bool isLoading;
  final String? error;
  final int currentPage;
  final int totalPages;
  final int total;
  final String searchQuery;
  final String? categoryFilter;
  final bool hasMore;

  PatientListState({
    this.patients = const [],
    this.isLoading = false,
    this.error,
    this.currentPage = 1,
    this.totalPages = 1,
    this.total = 0,
    this.searchQuery = '',
    this.categoryFilter,
    this.hasMore = true,
  });

  PatientListState copyWith({
    List<Patient>? patients,
    bool? isLoading,
    String? error,
    int? currentPage,
    int? totalPages,
    int? total,
    String? searchQuery,
    String? categoryFilter,
    bool? hasMore,
  }) {
    return PatientListState(
      patients: patients ?? this.patients,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      currentPage: currentPage ?? this.currentPage,
      totalPages: totalPages ?? this.totalPages,
      total: total ?? this.total,
      searchQuery: searchQuery ?? this.searchQuery,
      categoryFilter: categoryFilter ?? this.categoryFilter,
      hasMore: hasMore ?? this.hasMore,
    );
  }
}

class PatientListNotifier extends StateNotifier<PatientListState> {
  final PatientRepository _repository;

  PatientListNotifier(this._repository) : super(PatientListState());

  Future<void> loadPatients({bool refresh = false}) async {
    if (state.isLoading) return;

    final page = refresh ? 1 : state.currentPage;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _repository.getPatients(
        page: page,
        limit: 20,
        search: state.searchQuery.isNotEmpty ? state.searchQuery : null,
        category: state.categoryFilter,
      );

      final newPatients = refresh
          ? response.patients
          : [...state.patients, ...response.patients];

      state = state.copyWith(
        patients: newPatients,
        isLoading: false,
        currentPage: response.page,
        totalPages: response.totalPages,
        total: response.total,
        hasMore: response.page < response.totalPages,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> refresh() async {
    await loadPatients(refresh: true);
  }

  Future<void> loadMore() async {
    if (!state.hasMore || state.isLoading) return;
    state = state.copyWith(currentPage: state.currentPage + 1);
    await loadPatients();
  }

  void setSearchQuery(String query) {
    state = state.copyWith(
      searchQuery: query,
      currentPage: 1,
      patients: [],
    );
    loadPatients(refresh: true);
  }

  void setCategoryFilter(String? category) {
    state = state.copyWith(
      categoryFilter: category,
      currentPage: 1,
      patients: [],
    );
    loadPatients(refresh: true);
  }

  void clearFilters() {
    state = PatientListState();
    loadPatients(refresh: true);
  }
}

final patientListProvider =
    StateNotifierProvider<PatientListNotifier, PatientListState>((ref) {
  final repository = ref.watch(patientRepositoryProvider);
  return PatientListNotifier(repository);
});

// Single patient provider for detail view
class PatientDetailState {
  final Patient? patient;
  final bool isLoading;
  final String? error;
  final Map<String, dynamic>? history;

  PatientDetailState({
    this.patient,
    this.isLoading = false,
    this.error,
    this.history,
  });

  PatientDetailState copyWith({
    Patient? patient,
    bool? isLoading,
    String? error,
    Map<String, dynamic>? history,
  }) {
    return PatientDetailState(
      patient: patient ?? this.patient,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      history: history ?? this.history,
    );
  }
}

class PatientDetailNotifier extends StateNotifier<PatientDetailState> {
  final PatientRepository _repository;

  PatientDetailNotifier(this._repository) : super(PatientDetailState());

  Future<void> loadPatient(String id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final patient = await _repository.getPatientById(id);
      state = state.copyWith(
        patient: patient,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadHistory(String id) async {
    try {
      final history = await _repository.getPatientHistory(id);
      state = state.copyWith(history: history);
    } catch (e) {
      // Silently fail for history
    }
  }

  void clear() {
    state = PatientDetailState();
  }
}

final patientDetailProvider =
    StateNotifierProvider<PatientDetailNotifier, PatientDetailState>((ref) {
  final repository = ref.watch(patientRepositoryProvider);
  return PatientDetailNotifier(repository);
});

// Patient form provider for create/edit
class PatientFormState {
  final bool isLoading;
  final bool isSuccess;
  final String? error;
  final Patient? savedPatient;

  PatientFormState({
    this.isLoading = false,
    this.isSuccess = false,
    this.error,
    this.savedPatient,
  });

  PatientFormState copyWith({
    bool? isLoading,
    bool? isSuccess,
    String? error,
    Patient? savedPatient,
  }) {
    return PatientFormState(
      isLoading: isLoading ?? this.isLoading,
      isSuccess: isSuccess ?? this.isSuccess,
      error: error,
      savedPatient: savedPatient ?? this.savedPatient,
    );
  }
}

class PatientFormNotifier extends StateNotifier<PatientFormState> {
  final PatientRepository _repository;

  PatientFormNotifier(this._repository) : super(PatientFormState());

  Future<bool> createPatient(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null, isSuccess: false);

    try {
      final patient = await _repository.createPatient(data);
      state = state.copyWith(
        isLoading: false,
        isSuccess: true,
        savedPatient: patient,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<bool> updatePatient(String id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null, isSuccess: false);

    try {
      final patient = await _repository.updatePatient(id, data);
      state = state.copyWith(
        isLoading: false,
        isSuccess: true,
        savedPatient: patient,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  Future<bool> deletePatient(String id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deletePatient(id);
      state = state.copyWith(isLoading: false, isSuccess: true);
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      return false;
    }
  }

  void reset() {
    state = PatientFormState();
  }
}

final patientFormProvider =
    StateNotifierProvider<PatientFormNotifier, PatientFormState>((ref) {
  final repository = ref.watch(patientRepositoryProvider);
  return PatientFormNotifier(repository);
});

// Advanced search provider
class AdvancedSearchState {
  final String? name;
  final String? mrId;
  final String? phone;
  final String? email;
  final String? husbandName;
  final int? minAge;
  final int? maxAge;
  final String? category;
  final String? examDate;
  final List<Patient> results;
  final bool isLoading;
  final String? error;
  final bool hasSearched;

  AdvancedSearchState({
    this.name,
    this.mrId,
    this.phone,
    this.email,
    this.husbandName,
    this.minAge,
    this.maxAge,
    this.category,
    this.examDate,
    this.results = const [],
    this.isLoading = false,
    this.error,
    this.hasSearched = false,
  });

  AdvancedSearchState copyWith({
    String? name,
    String? mrId,
    String? phone,
    String? email,
    String? husbandName,
    int? minAge,
    int? maxAge,
    String? category,
    String? examDate,
    List<Patient>? results,
    bool? isLoading,
    String? error,
    bool? hasSearched,
  }) {
    return AdvancedSearchState(
      name: name ?? this.name,
      mrId: mrId ?? this.mrId,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      husbandName: husbandName ?? this.husbandName,
      minAge: minAge ?? this.minAge,
      maxAge: maxAge ?? this.maxAge,
      category: category ?? this.category,
      examDate: examDate ?? this.examDate,
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      hasSearched: hasSearched ?? this.hasSearched,
    );
  }
}

class AdvancedSearchNotifier extends StateNotifier<AdvancedSearchState> {
  final PatientRepository _repository;

  AdvancedSearchNotifier(this._repository) : super(AdvancedSearchState());

  Future<void> search() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final results = await _repository.searchPatients(
        name: state.name,
        mrId: state.mrId,
        phone: state.phone,
        email: state.email,
        husbandName: state.husbandName,
        minAge: state.minAge,
        maxAge: state.maxAge,
        category: state.category,
        examDate: state.examDate,
      );

      state = state.copyWith(
        results: results,
        isLoading: false,
        hasSearched: true,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  void updateField(String field, dynamic value) {
    switch (field) {
      case 'name':
        state = state.copyWith(name: value);
        break;
      case 'mrId':
        state = state.copyWith(mrId: value);
        break;
      case 'phone':
        state = state.copyWith(phone: value);
        break;
      case 'email':
        state = state.copyWith(email: value);
        break;
      case 'husbandName':
        state = state.copyWith(husbandName: value);
        break;
      case 'minAge':
        state = state.copyWith(minAge: value);
        break;
      case 'maxAge':
        state = state.copyWith(maxAge: value);
        break;
      case 'category':
        state = state.copyWith(category: value);
        break;
      case 'examDate':
        state = state.copyWith(examDate: value);
        break;
    }
  }

  void reset() {
    state = AdvancedSearchState();
  }
}

final advancedSearchProvider =
    StateNotifierProvider<AdvancedSearchNotifier, AdvancedSearchState>((ref) {
  final repository = ref.watch(patientRepositoryProvider);
  return AdvancedSearchNotifier(repository);
});
