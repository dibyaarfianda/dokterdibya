package com.dokterdibya.app.ui.patient.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.app.data.repository.AppointmentRepository
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Appointment
import com.dokterdibya.app.domain.models.AvailableSlots
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AppointmentViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository
) : ViewModel() {

    private val _appointments = MutableStateFlow<Result<List<Appointment>>?>(null)
    val appointments: StateFlow<Result<List<Appointment>>?> = _appointments.asStateFlow()

    private val _availableSlots = MutableStateFlow<Result<List<AvailableSlots>>?>(null)
    val availableSlots: StateFlow<Result<List<AvailableSlots>>?> = _availableSlots.asStateFlow()

    private val _bookingResult = MutableStateFlow<Result<Appointment>?>(null)
    val bookingResult: StateFlow<Result<Appointment>?> = _bookingResult.asStateFlow()

    private val _cancelResult = MutableStateFlow<Result<Appointment>?>(null)
    val cancelResult: StateFlow<Result<Appointment>?> = _cancelResult.asStateFlow()

    init {
        loadAppointments()
    }

    fun loadAppointments() {
        viewModelScope.launch {
            appointmentRepository.getMyAppointments().collect { result ->
                _appointments.value = result
            }
        }
    }

    fun loadAvailableSlots(date: String) {
        viewModelScope.launch {
            appointmentRepository.getAvailableSlots(date).collect { result ->
                _availableSlots.value = result
            }
        }
    }

    fun bookAppointment(date: String, session: Int, slotNumber: Int, notes: String? = null) {
        viewModelScope.launch {
            appointmentRepository.bookAppointment(date, session, slotNumber, notes).collect { result ->
                _bookingResult.value = result
                if (result is Result.Success) {
                    loadAppointments() // Refresh list
                }
            }
        }
    }

    fun cancelAppointment(id: Int) {
        viewModelScope.launch {
            appointmentRepository.cancelAppointment(id).collect { result ->
                _cancelResult.value = result
                if (result is Result.Success) {
                    loadAppointments() // Refresh list
                }
            }
        }
    }

    fun clearBookingResult() {
        _bookingResult.value = null
    }

    fun clearCancelResult() {
        _cancelResult.value = null
    }
}
