package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.CalendarEvent
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
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

data class StatsInfo(
    val avgCycleLength: Int,
    val nextOvulation: String,
    val fertileWindow: String,
    val nextPeriod: String
)

data class FertilityUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val cycles: List<CycleInfo> = emptyList(),
    val prediction: PredictionInfo? = null,
    val stats: StatsInfo? = null,
    val currentYear: Int = Calendar.getInstance().get(Calendar.YEAR),
    val currentMonth: Int = Calendar.getInstance().get(Calendar.MONTH) + 1,
    val calendarEvents: List<CalendarEvent> = emptyList()
)

@HiltViewModel
class FertilityViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FertilityUiState())
    val uiState: StateFlow<FertilityUiState> = _uiState.asStateFlow()

    private val monthNames = listOf(
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    )

    init {
        loadFertilityData()
    }

    fun getMonthName(month: Int): String {
        return monthNames.getOrElse(month - 1) { "Unknown" }
    }

    fun previousMonth() {
        var newMonth = _uiState.value.currentMonth - 1
        var newYear = _uiState.value.currentYear
        if (newMonth < 1) {
            newMonth = 12
            newYear--
        }
        _uiState.value = _uiState.value.copy(
            currentMonth = newMonth,
            currentYear = newYear
        )
        loadCalendarData()
    }

    fun nextMonth() {
        var newMonth = _uiState.value.currentMonth + 1
        var newYear = _uiState.value.currentYear
        if (newMonth > 12) {
            newMonth = 1
            newYear++
        }
        _uiState.value = _uiState.value.copy(
            currentMonth = newMonth,
            currentYear = newYear
        )
        loadCalendarData()
    }

    fun goToToday() {
        val calendar = Calendar.getInstance()
        _uiState.value = _uiState.value.copy(
            currentMonth = calendar.get(Calendar.MONTH) + 1,
            currentYear = calendar.get(Calendar.YEAR)
        )
        loadCalendarData()
    }

    private fun loadFertilityData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            // Load cycles
            repository.getFertilityCyclesData()
                .onSuccess { response ->
                    val cycleInfos = response.cycles?.map { cycle ->
                        CycleInfo(
                            id = cycle.id,
                            startDate = formatDateIndo(cycle.cycleStartDate),
                            cycleLength = cycle.cycleLength,
                            periodLength = cycle.periodLength
                        )
                    } ?: emptyList()

                    // Build stats from currentFertility
                    val stats = response.currentFertility?.let { cf ->
                        StatsInfo(
                            avgCycleLength = response.averageCycleLength ?: 28,
                            nextOvulation = formatDateShort(cf.ovulationDate),
                            fertileWindow = "${formatDateShort(cf.fertileStart)} - ${formatDateShort(cf.fertileEnd)}",
                            nextPeriod = formatDateShort(cf.nextPeriod)
                        )
                    }

                    val prediction = response.currentFertility?.let { cf ->
                        PredictionInfo(
                            nextPeriodStart = formatDateIndo(cf.nextPeriod),
                            fertileStart = formatDateIndo(cf.fertileStart),
                            fertileEnd = formatDateIndo(cf.fertileEnd),
                            ovulationDate = formatDateIndo(cf.ovulationDate)
                        )
                    }

                    _uiState.value = _uiState.value.copy(
                        cycles = cycleInfos,
                        stats = stats,
                        prediction = prediction,
                        isLoading = false
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = it.message
                    )
                }

            // Load calendar data for current month
            loadCalendarData()
        }
    }

    private fun loadCalendarData() {
        viewModelScope.launch {
            val year = _uiState.value.currentYear
            val month = _uiState.value.currentMonth

            repository.getCalendarData(year, month)
                .onSuccess { response ->
                    _uiState.value = _uiState.value.copy(
                        calendarEvents = response.events ?: emptyList()
                    )
                }
                .onFailure {
                    // Keep existing events on failure
                }
        }
    }

    private fun formatDateIndo(dateStr: String?): String {
        if (dateStr.isNullOrEmpty()) return "-"
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val outputFormat = SimpleDateFormat("d MMM yyyy", Locale("id", "ID"))
            val date = inputFormat.parse(dateStr)
            date?.let { outputFormat.format(it) } ?: dateStr
        } catch (e: Exception) {
            dateStr
        }
    }

    private fun formatDateShort(dateStr: String?): String {
        if (dateStr.isNullOrEmpty()) return "--"
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val outputFormat = SimpleDateFormat("d MMM", Locale("id", "ID"))
            val date = inputFormat.parse(dateStr)
            date?.let { outputFormat.format(it) } ?: "--"
        } catch (e: Exception) {
            "--"
        }
    }
}
