package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MedicationsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val medications: List<Medication> = emptyList(),
    val currentMedications: List<Medication> = emptyList(),
    val pastMedications: List<Medication> = emptyList()
)

@HiltViewModel
class MedicationsViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MedicationsUiState())
    val uiState: StateFlow<MedicationsUiState> = _uiState.asStateFlow()

    init {
        loadMedications()
    }

    fun loadMedications() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getMedications()
                .onSuccess { medications ->
                    val current = medications.filter { it.is_current == 1 }
                    val past = medications.filter { it.is_current == 0 }

                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        medications = medications,
                        currentMedications = current,
                        pastMedications = past
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message
                    )
                }
        }
    }

    fun retry() {
        loadMedications()
    }
}
