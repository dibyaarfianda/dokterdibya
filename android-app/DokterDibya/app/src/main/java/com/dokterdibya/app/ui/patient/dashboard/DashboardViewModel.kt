package com.dokterdibya.app.ui.patient.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.app.data.repository.AnnouncementRepository
import com.dokterdibya.app.data.repository.AppointmentRepository
import com.dokterdibya.app.data.repository.AuthRepository
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Announcement
import com.dokterdibya.app.domain.models.Appointment
import com.dokterdibya.app.domain.models.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val appointmentRepository: AppointmentRepository,
    private val announcementRepository: AnnouncementRepository
) : ViewModel() {

    private val _userProfile = MutableStateFlow<Result<User>?>(null)
    val userProfile: StateFlow<Result<User>?> = _userProfile.asStateFlow()

    private val _appointments = MutableStateFlow<Result<List<Appointment>>?>(null)
    val appointments: StateFlow<Result<List<Appointment>>?> = _appointments.asStateFlow()

    private val _announcements = MutableStateFlow<Result<List<Announcement>>?>(null)
    val announcements: StateFlow<Result<List<Announcement>>?> = _announcements.asStateFlow()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        loadProfile()
        loadAppointments()
        loadAnnouncements()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            authRepository.getProfile().collect { result ->
                _userProfile.value = result
            }
        }
    }

    private fun loadAppointments() {
        viewModelScope.launch {
            appointmentRepository.getMyAppointments().collect { result ->
                _appointments.value = result
            }
        }
    }

    private fun loadAnnouncements() {
        viewModelScope.launch {
            announcementRepository.getActiveAnnouncements().collect { result ->
                _announcements.value = result
            }
        }
    }

    fun refresh() {
        loadDashboardData()
    }
}
