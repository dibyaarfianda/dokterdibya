package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.Patient
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = false,
    val patientName: String? = null,
    val patient: Patient? = null,
    val isPregnant: Boolean = false,
    val pregnancyWeeks: Int = 0,
    val pregnancyDays: Int = 0,
    val pregnancyProgress: Float = 0f,
    val dueDate: String? = null,
    val usgCount: Int = 0,
    val error: String? = null
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val patientRepository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadPatientData()
    }

    fun loadPatientData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    val pregnancyInfo = calculatePregnancyInfo(patient)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        patient = patient,
                        patientName = patient.name,
                        isPregnant = patient.isPregnant,
                        pregnancyWeeks = pregnancyInfo.weeks,
                        pregnancyDays = pregnancyInfo.days,
                        pregnancyProgress = pregnancyInfo.progress,
                        dueDate = patient.expectedDueDate
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )

            // Load USG count
            patientRepository.getUsgResults().fold(
                onSuccess = { usgList ->
                    _uiState.value = _uiState.value.copy(
                        usgCount = usgList.size
                    )
                },
                onFailure = { /* Ignore */ }
            )
        }
    }

    private fun calculatePregnancyInfo(patient: Patient): PregnancyInfo {
        if (!patient.isPregnant || patient.pregnancyStartDate == null) {
            return PregnancyInfo(0, 0, 0f)
        }

        return try {
            val startDate = LocalDate.parse(patient.pregnancyStartDate.take(10))
            val today = LocalDate.now()
            val daysPregnant = ChronoUnit.DAYS.between(startDate, today).toInt()

            val weeks = daysPregnant / 7
            val days = daysPregnant % 7
            val progress = (daysPregnant.toFloat() / 280f).coerceIn(0f, 1f) // 40 weeks = 280 days

            PregnancyInfo(weeks, days, progress)
        } catch (e: Exception) {
            PregnancyInfo(0, 0, 0f)
        }
    }

    fun logout() {
        viewModelScope.launch {
            patientRepository.logout()
        }
    }

    private data class PregnancyInfo(
        val weeks: Int,
        val days: Int,
        val progress: Float
    )
}
