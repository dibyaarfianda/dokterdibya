package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.SessionSlots
import com.dokterdibya.patient.data.model.SundayDate
import com.dokterdibya.patient.data.model.TimeSlot
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

data class SelectedSlot(
    val date: String,
    val dateFormatted: String,
    val session: Int,
    val sessionLabel: String,
    val slotNumber: Int,
    val time: String
)

data class BookingUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val sundays: List<SundayDate> = emptyList(),
    val selectedSunday: SundayDate? = null,
    val sessions: List<SessionSlots> = emptyList(),
    val isLoadingSlots: Boolean = false,
    val appointments: List<AppointmentInfo> = emptyList(),
    // Dialog state
    val showBookingDialog: Boolean = false,
    val selectedSlot: SelectedSlot? = null,
    val isBooking: Boolean = false,
    val bookingSuccess: String? = null,
    val bookingError: String? = null
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
                        selectedSunday = sundays.firstOrNull()
                    )
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

    fun onSlotClick(session: SessionSlots, slot: TimeSlot) {
        val sunday = _uiState.value.selectedSunday ?: return
        if (!slot.available) return

        _uiState.value = _uiState.value.copy(
            showBookingDialog = true,
            selectedSlot = SelectedSlot(
                date = sunday.date,
                dateFormatted = sunday.formatted,
                session = session.session,
                sessionLabel = session.label,
                slotNumber = slot.number,
                time = slot.time
            ),
            bookingError = null
        )
    }

    fun dismissBookingDialog() {
        _uiState.value = _uiState.value.copy(
            showBookingDialog = false,
            selectedSlot = null,
            bookingError = null
        )
    }

    fun confirmBooking(chiefComplaint: String, category: String) {
        val slot = _uiState.value.selectedSlot ?: return

        if (chiefComplaint.isBlank()) {
            _uiState.value = _uiState.value.copy(
                bookingError = "Mohon isi keluhan utama"
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isBooking = true, bookingError = null)

            repository.bookAppointment(
                date = slot.date,
                session = slot.session,
                slotNumber = slot.slotNumber,
                chiefComplaint = chiefComplaint,
                category = category
            )
                .onSuccess { message ->
                    _uiState.value = _uiState.value.copy(
                        isBooking = false,
                        showBookingDialog = false,
                        selectedSlot = null,
                        bookingSuccess = message
                    )
                    // Refresh data
                    loadAppointments()
                    _uiState.value.selectedSunday?.let { selectSunday(it) }
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isBooking = false,
                        bookingError = e.message ?: "Booking gagal"
                    )
                }
        }
    }

    fun dismissSuccessMessage() {
        _uiState.value = _uiState.value.copy(bookingSuccess = null)
    }

    private fun loadAppointments() {
        viewModelScope.launch {
            repository.getAppointments()
                .onSuccess { appointments ->
                    val appointmentInfos = appointments.map { apt ->
                        AppointmentInfo(
                            id = apt.id,
                            date = apt.appointmentDate ?: "",
                            dateFormatted = apt.getDisplayDate() ?: apt.appointmentDate ?: "",
                            time = apt.getDisplayTime() ?: apt.time ?: apt.timeSlot ?: "-",
                            sessionLabel = apt.sessionLabel ?: "Sesi ${apt.session ?: 1}",
                            status = apt.status ?: "pending",
                            isPast = apt.isPast ?: false
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
