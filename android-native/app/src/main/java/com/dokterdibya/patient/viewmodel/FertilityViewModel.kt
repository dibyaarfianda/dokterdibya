package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class CycleInfo(
    val id: Int,
    val startDate: String,
    val cycleLength: Int,
    val periodLength: Int
)

data class PredictionInfo(
    val nextPeriodStart: String,
    val fertileStart: String,
    val fertileEnd: String,
    val ovulationDate: String
)

data class FertilityUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val cycles: List<CycleInfo> = emptyList(),
    val prediction: PredictionInfo? = null
)

@HiltViewModel
class FertilityViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FertilityUiState())
    val uiState: StateFlow<FertilityUiState> = _uiState.asStateFlow()

    init {
        loadFertilityData()
    }

    private fun loadFertilityData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            // Load cycles
            repository.getFertilityCycles()
                .onSuccess { cycles ->
                    val cycleInfos = cycles.map { cycle ->
                        CycleInfo(
                            id = cycle.id,
                            startDate = cycle.cycleStartDate,
                            cycleLength = cycle.cycleLength,
                            periodLength = cycle.periodLength
                        )
                    }
                    _uiState.value = _uiState.value.copy(cycles = cycleInfos)
                }

            // Load prediction
            val calendar = Calendar.getInstance()
            val month = calendar.get(Calendar.MONTH) + 1
            val year = calendar.get(Calendar.YEAR)

            repository.getFertilityPrediction(month, year)
                .onSuccess { prediction ->
                    val predictionInfo = PredictionInfo(
                        nextPeriodStart = prediction.nextPeriodDate ?: "",
                        fertileStart = prediction.fertileDates.firstOrNull() ?: "",
                        fertileEnd = prediction.fertileDates.lastOrNull() ?: "",
                        ovulationDate = prediction.ovulationDate ?: ""
                    )
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        prediction = predictionInfo
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
        }
    }
}
