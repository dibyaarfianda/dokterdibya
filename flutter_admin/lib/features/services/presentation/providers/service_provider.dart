import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/service_model.dart';
import '../../data/repositories/service_repository.dart';

class ServiceState {
  final List<MedicalService> services;
  final bool isLoading;
  final String? error;

  ServiceState({
    this.services = const [],
    this.isLoading = false,
    this.error,
  });

  ServiceState copyWith({
    List<MedicalService>? services,
    bool? isLoading,
    String? error,
  }) {
    return ServiceState(
      services: services ?? this.services,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ServiceNotifier extends StateNotifier<ServiceState> {
  final ServiceRepository _repository;

  ServiceNotifier(this._repository) : super(ServiceState());

  Future<void> loadServices() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final services = await _repository.getServices();
      state = state.copyWith(services: services, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> createService(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createService(data);
      await loadServices();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> updateService(int id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.updateService(id, data);
      await loadServices();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteService(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteService(id);
      await loadServices();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final serviceProvider =
    StateNotifierProvider<ServiceNotifier, ServiceState>((ref) {
  final repository = ref.watch(serviceRepositoryProvider);
  return ServiceNotifier(repository);
});
