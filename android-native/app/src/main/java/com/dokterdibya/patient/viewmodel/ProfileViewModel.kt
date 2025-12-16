package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject

data class ProfileUiState(
    val isLoading: Boolean = true,
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val birthDate: String = "",
    val isPregnant: Boolean = false,
    val pregnancyWeeks: Int = 0,
    val pregnancyDays: Int = 0,
    val dueDate: String = ""
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            repository.getProfile()
                .onSuccess { patient ->
                    var weeks = 0
                    var days = 0

                    if (patient.isPregnant && patient.pregnancyStartDate != null) {
                        try {
                            val startDate = LocalDate.parse(patient.pregnancyStartDate.take(10))
                            val today = LocalDate.now()
                            val daysPregnant = ChronoUnit.DAYS.between(startDate, today).toInt()
                            weeks = daysPregnant / 7
                            days = daysPregnant % 7
                        } catch (e: Exception) {
                            // Ignore parsing errors
                        }
                    }

                    _uiState.value = ProfileUiState(
                        isLoading = false,
                        name = patient.name,
                        email = patient.email ?: "",
                        phone = patient.phone ?: "",
                        birthDate = patient.birthDate ?: "",
                        isPregnant = patient.isPregnant,
                        pregnancyWeeks = weeks,
                        pregnancyDays = days,
                        dueDate = patient.expectedDueDate ?: ""
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
        }
    }
}
