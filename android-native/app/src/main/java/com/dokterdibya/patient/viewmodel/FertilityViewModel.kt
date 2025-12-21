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

// Calendar mode
enum class CalendarMode {
    PERIOD,      // Select dates to add period
    INTERCOURSE  // Click to toggle intercourse
}

// Selection mode for period dates
enum class SelectionMode {
    START,  // Selecting start date
    END,    // Selecting end date
    DONE    // Selection complete
}

data class CycleInfo(
    val id: Int,
    val startDate: String,
    val rawStartDate: String,  // yyyy-MM-dd format for display
    val cycleLength: Int,
    val periodLength: Int,
    val flowIntensity: String?,
    val painIntensity: String?,
    val symptoms: List<String>?
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
    val isSaving: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val cycles: List<CycleInfo> = emptyList(),
    val prediction: PredictionInfo? = null,
    val stats: StatsInfo? = null,
    val currentYear: Int = Calendar.getInstance().get(Calendar.YEAR),
    val currentMonth: Int = Calendar.getInstance().get(Calendar.MONTH) + 1,
    val calendarEvents: List<CalendarEvent> = emptyList(),
    // Calendar mode
    val calendarMode: CalendarMode = CalendarMode.PERIOD,
    // Period selection
    val selectionMode: SelectionMode = SelectionMode.START,
    val selectedStartDate: String? = null,
    val selectedEndDate: String? = null,
    // Form fields
    val flowIntensity: String = "medium",
    val painIntensity: String = "none",
    val selectedSymptoms: Set<String> = emptySet(),
    val notes: String = "",
    // Delete dialog
    val showDeleteDialog: Boolean = false,
    val cycleToDelete: Int? = null
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

    val symptoms = listOf(
        "cramps" to "Kram",
        "headache" to "Sakit Kepala",
        "bloating" to "Kembung",
        "mood_swings" to "Mood Swing",
        "fatigue" to "Lelah",
        "breast_tenderness" to "Payudara Nyeri",
        "acne" to "Jerawat",
        "backache" to "Sakit Punggung"
    )

    val flowOptions = listOf(
        "light" to "Sedikit",
        "medium" to "Sedang",
        "heavy" to "Banyak"
    )

    val painOptions = listOf(
        "none" to "Tidak Nyeri",
        "light" to "Ringan",
        "medium" to "Sedang",
        "heavy" to "Berat"
    )

    init {
        loadFertilityData()
    }

    fun getMonthName(month: Int): String {
        return monthNames.getOrElse(month - 1) { "Unknown" }
    }

    // ==================== Calendar Navigation ====================

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

    // ==================== Calendar Mode ====================

    fun setCalendarMode(mode: CalendarMode) {
        _uiState.value = _uiState.value.copy(
            calendarMode = mode,
            // Reset selection when switching modes
            selectionMode = SelectionMode.START,
            selectedStartDate = null,
            selectedEndDate = null
        )
    }

    // ==================== Date Selection (Period Mode) ====================

    fun onDateClick(dateStr: String) {
        val state = _uiState.value

        if (state.calendarMode == CalendarMode.INTERCOURSE) {
            toggleIntercourse(dateStr)
            return
        }

        // Period mode - select dates
        when (state.selectionMode) {
            SelectionMode.START -> {
                _uiState.value = state.copy(
                    selectedStartDate = dateStr,
                    selectedEndDate = null,
                    selectionMode = SelectionMode.END
                )
            }
            SelectionMode.END -> {
                val startDate = state.selectedStartDate ?: return
                val endDate = if (dateStr < startDate) {
                    // Swap if end is before start
                    _uiState.value = state.copy(
                        selectedStartDate = dateStr,
                        selectedEndDate = startDate,
                        selectionMode = SelectionMode.DONE
                    )
                    return
                } else {
                    dateStr
                }
                _uiState.value = state.copy(
                    selectedEndDate = endDate,
                    selectionMode = SelectionMode.DONE
                )
            }
            SelectionMode.DONE -> {
                // Start new selection
                _uiState.value = state.copy(
                    selectedStartDate = dateStr,
                    selectedEndDate = null,
                    selectionMode = SelectionMode.END
                )
            }
        }
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(
            selectionMode = SelectionMode.START,
            selectedStartDate = null,
            selectedEndDate = null
        )
    }

    // ==================== Form Fields ====================

    fun setFlowIntensity(flow: String) {
        _uiState.value = _uiState.value.copy(flowIntensity = flow)
    }

    fun setPainIntensity(pain: String) {
        _uiState.value = _uiState.value.copy(painIntensity = pain)
    }

    fun toggleSymptom(symptom: String) {
        val current = _uiState.value.selectedSymptoms.toMutableSet()
        if (current.contains(symptom)) {
            current.remove(symptom)
        } else {
            current.add(symptom)
        }
        _uiState.value = _uiState.value.copy(selectedSymptoms = current)
    }

    fun setNotes(notes: String) {
        _uiState.value = _uiState.value.copy(notes = notes)
    }

    // ==================== Save Cycle ====================

    fun saveCycle() {
        val state = _uiState.value
        val startDate = state.selectedStartDate ?: return

        viewModelScope.launch {
            _uiState.value = state.copy(isSaving = true, error = null)

            repository.createFertilityCycle(
                periodStartDate = startDate,
                periodEndDate = state.selectedEndDate,
                flowIntensity = state.flowIntensity,
                painIntensity = state.painIntensity,
                symptoms = if (state.selectedSymptoms.isNotEmpty())
                    state.selectedSymptoms.toList() else null,
                notes = if (state.notes.isNotBlank()) state.notes else null
            ).onSuccess {
                _uiState.value = _uiState.value.copy(
                    isSaving = false,
                    successMessage = "Data siklus berhasil disimpan",
                    // Reset form
                    selectionMode = SelectionMode.START,
                    selectedStartDate = null,
                    selectedEndDate = null,
                    flowIntensity = "medium",
                    painIntensity = "none",
                    selectedSymptoms = emptySet(),
                    notes = ""
                )
                // Reload data
                loadFertilityData()
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    isSaving = false,
                    error = e.message ?: "Gagal menyimpan data"
                )
            }
        }
    }

    // ==================== Delete Cycle ====================

    fun showDeleteDialog(cycleId: Int) {
        _uiState.value = _uiState.value.copy(
            showDeleteDialog = true,
            cycleToDelete = cycleId
        )
    }

    fun hideDeleteDialog() {
        _uiState.value = _uiState.value.copy(
            showDeleteDialog = false,
            cycleToDelete = null
        )
    }

    fun confirmDelete() {
        val cycleId = _uiState.value.cycleToDelete ?: return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSaving = true)

            repository.deleteFertilityCycle(cycleId)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        showDeleteDialog = false,
                        cycleToDelete = null,
                        successMessage = "Data siklus berhasil dihapus"
                    )
                    loadFertilityData()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        showDeleteDialog = false,
                        cycleToDelete = null,
                        error = e.message ?: "Gagal menghapus data"
                    )
                }
        }
    }

    // ==================== Toggle Intercourse ====================

    private fun toggleIntercourse(dateStr: String) {
        viewModelScope.launch {
            repository.toggleIntercourse(dateStr)
                .onSuccess { action ->
                    val message = if (action == "added") {
                        "Hubungan intim dicatat"
                    } else {
                        "Catatan hubungan intim dihapus"
                    }
                    _uiState.value = _uiState.value.copy(successMessage = message)
                    loadCalendarData()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        error = e.message ?: "Gagal menyimpan data"
                    )
                }
        }
    }

    // ==================== Clear Messages ====================

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun clearSuccessMessage() {
        _uiState.value = _uiState.value.copy(successMessage = null)
    }

    // ==================== Load Data ====================

    private fun loadFertilityData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getFertilityCyclesData()
                .onSuccess { response ->
                    val cycleInfos = response.cycles?.map { cycle ->
                        CycleInfo(
                            id = cycle.id,
                            startDate = formatDateIndo(cycle.cycleStartDate),
                            rawStartDate = cycle.cycleStartDate,
                            cycleLength = cycle.cycleLength,
                            periodLength = cycle.periodLength,
                            flowIntensity = null, // API doesn't return these yet
                            painIntensity = null,
                            symptoms = null
                        )
                    } ?: emptyList()

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
