package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.SessionSlots
import com.dokterdibya.patient.data.model.SundayDate
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AppointmentInfo(
    val id: Int,
    val date: String,
    val dateFormatted: String,
    val time: String,
    val sessionLabel: String,
    val status: String,
    val isPast: Boolean
)

data class BookingUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val sundays: List<SundayDate> = emptyList(),
    val selectedSunday: SundayDate? = null,
    val sessions: List<SessionSlots> = emptyList(),
    val isLoadingSlots: Boolean = false,
    val appointments: List<AppointmentInfo> = emptyList()
)

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(BookingUiState())
    val uiState: StateFlow<BookingUiState> = _uiState.asStateFlow()

    init {
        loadSundays()
        loadAppointments()
    }

    fun loadSundays() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getAvailableSundays()
                .onSuccess { sundays ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        sundays = sundays,
                        // Auto-select first Sunday if available
                        selectedSunday = sundays.firstOrNull()
                    )
                    // Load slots for first Sunday
                    sundays.firstOrNull()?.let { selectSunday(it) }
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Gagal memuat jadwal"
                    )
                }
        }
    }

    fun selectSunday(sunday: SundayDate) {
        _uiState.value = _uiState.value.copy(
            selectedSunday = sunday,
            isLoadingSlots = true,
            sessions = emptyList()
        )

        viewModelScope.launch {
            repository.getSlotsForDate(sunday.date)
                .onSuccess { response ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingSlots = false,
                        sessions = response.sessions
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingSlots = false,
                        error = e.message
                    )
                }
        }
    }

    private fun loadAppointments() {
        viewModelScope.launch {
            repository.getAppointments()
                .onSuccess { appointments ->
                    val appointmentInfos = appointments.map { apt ->
                        AppointmentInfo(
                            id = apt.id,
                            date = apt.appointmentDate,
                            dateFormatted = apt.appointmentDate,
                            time = apt.timeSlot,
                            sessionLabel = apt.timeSlot,
                            status = apt.status,
                            isPast = false
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        appointments = appointmentInfos
                    )
                }
        }
    }

    fun retry() {
        loadSundays()
        loadAppointments()
    }
}
