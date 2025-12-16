package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.PracticeSchedule
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PracticeLocation(
    val id: String,
    val name: String,
    val description: String,
    val hasOnlineBooking: Boolean,
    val logoUrl: String?
)

data class ScheduleUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedLocation: PracticeLocation? = null,
    val schedules: List<PracticeSchedule> = emptyList()
)

@HiltViewModel
class ScheduleViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScheduleUiState())
    val uiState: StateFlow<ScheduleUiState> = _uiState.asStateFlow()

    val practiceLocations = listOf(
        PracticeLocation(
            id = "klinik_privat",
            name = "Klinik Privat Minggu",
            description = "Praktik privat setiap hari Minggu dengan sistem booking online",
            hasOnlineBooking = true,
            logoUrl = "https://dokterdibya.com/images/dibya-logo.png"
        ),
        PracticeLocation(
            id = "rsud_gambiran",
            name = "Poli RSUD Gambiran Kediri",
            description = "Praktek di Poli Kandungan RSUD Gambiran",
            hasOnlineBooking = false,
            logoUrl = "https://dokterdibya.com/images/gambiran-logo.png"
        ),
        PracticeLocation(
            id = "rsia_melinda",
            name = "Poli RSIA Melinda Kediri",
            description = "Praktik di Poli Kandungan RSIA Melinda",
            hasOnlineBooking = false,
            logoUrl = "https://dokterdibya.com/images/melinda-logo.png"
        ),
        PracticeLocation(
            id = "rs_bhayangkara",
            name = "Poli RS Bhayangkara Kediri",
            description = "Praktik di Poli Kandungan RS Bhayangkara",
            hasOnlineBooking = false,
            logoUrl = "https://dokterdibya.com/images/bhayangkara-logo.png"
        )
    )

    fun selectLocation(location: PracticeLocation) {
        _uiState.value = _uiState.value.copy(
            selectedLocation = location,
            schedules = emptyList(),
            error = null
        )

        if (!location.hasOnlineBooking) {
            loadSchedules(location.id)
        }
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(
            selectedLocation = null,
            schedules = emptyList(),
            error = null
        )
    }

    private fun loadSchedules(locationId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getPracticeSchedules(locationId)
                .onSuccess { schedules ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        schedules = schedules
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

    fun getDayName(dayOfWeek: Int): String {
        return when (dayOfWeek) {
            0 -> "Minggu"
            1 -> "Senin"
            2 -> "Selasa"
            3 -> "Rabu"
            4 -> "Kamis"
            5 -> "Jumat"
            6 -> "Sabtu"
            else -> ""
        }
    }

    fun formatTime(time: String): String {
        // Format HH:MM:SS to HH:MM
        return time.take(5)
    }
}
