package com.dokterdibya.patient.ui.screens.fertility

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.model.CalendarEvent
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.*
import java.text.SimpleDateFormat
import java.util.*

// Colors matching web version
private val PeriodColor = Color(0xFFEF4444)
private val FertileColor = Color(0xFF4CAF50)
private val PeakFertileColor = Color(0xFF388E3C)
private val OvulationColor = Color(0xFFFFC107)
private val PredictedPeriodColor = Color(0xFFEF4444).copy(alpha = 0.3f)
private val SelectionColor = Color(0xFF3B82F6)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FertilityCalendarScreen(
    onBack: () -> Unit,
    viewModel: FertilityViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val view = androidx.compose.ui.platform.LocalView.current

    // Show snackbar for messages
    LaunchedEffect(uiState.successMessage) {
        uiState.successMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSuccessMessage()
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    // Delete confirmation dialog
    if (uiState.showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.hideDeleteDialog() },
            title = { Text("Hapus Data Siklus") },
            text = { Text("Apakah Anda yakin ingin menghapus data siklus ini?") },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.confirmDelete() },
                    enabled = !uiState.isSaving
                ) {
                    Text("Hapus", color = Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.hideDeleteDialog() }) {
                    Text("Batal")
                }
            },
            containerColor = CardDark,
            titleContentColor = TextPrimaryDark,
            textContentColor = TextSecondaryDark
        )
    }

    ThemedBackground {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Kalender Kesuburan", fontWeight = FontWeight.SemiBold)
                },
                navigationIcon = {
                    IconButton(onClick = {
                        view.playSoundEffect(android.view.SoundEffectConstants.CLICK)
                        onBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color.Transparent
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
        ) {
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(400.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Fertility)
                }
            } else {
                // Stats Cards
                StatsSection(uiState.stats)

                // Disclaimer
                DisclaimerCard()

                // Calendar with Mode Toggle
                CalendarSection(
                    year = uiState.currentYear,
                    month = uiState.currentMonth,
                    monthName = viewModel.getMonthName(uiState.currentMonth),
                    events = uiState.calendarEvents,
                    calendarMode = uiState.calendarMode,
                    selectionMode = uiState.selectionMode,
                    selectedStartDate = uiState.selectedStartDate,
                    selectedEndDate = uiState.selectedEndDate,
                    onPrevMonth = { viewModel.previousMonth() },
                    onNextMonth = { viewModel.nextMonth() },
                    onToday = { viewModel.goToToday() },
                    onModeChange = { viewModel.setCalendarMode(it) },
                    onDateClick = { viewModel.onDateClick(it) },
                    onClearSelection = { viewModel.clearSelection() }
                )

                // Legend
                LegendSection()

                // Add Period Form (only show when in period mode and has selection)
                if (uiState.calendarMode == CalendarMode.PERIOD && uiState.selectedStartDate != null) {
                    AddPeriodForm(
                        startDate = uiState.selectedStartDate,
                        endDate = uiState.selectedEndDate,
                        flowIntensity = uiState.flowIntensity,
                        painIntensity = uiState.painIntensity,
                        selectedSymptoms = uiState.selectedSymptoms,
                        notes = uiState.notes,
                        isSaving = uiState.isSaving,
                        flowOptions = viewModel.flowOptions,
                        painOptions = viewModel.painOptions,
                        symptoms = viewModel.symptoms,
                        onFlowChange = { viewModel.setFlowIntensity(it) },
                        onPainChange = { viewModel.setPainIntensity(it) },
                        onSymptomToggle = { viewModel.toggleSymptom(it) },
                        onNotesChange = { viewModel.setNotes(it) },
                        onSave = { viewModel.saveCycle() }
                    )
                }

                // Cycle History
                if (uiState.cycles.isNotEmpty()) {
                    CycleHistorySection(
                        cycles = uiState.cycles,
                        onDelete = { viewModel.showDeleteDialog(it) }
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
}

@Composable
fun StatsSection(stats: StatsInfo?) {
    Column(modifier = Modifier.padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.WaterDrop,
                iconColor = PeriodColor,
                label = "Siklus Rata-rata",
                value = "${stats?.avgCycleLength ?: "--"} hari"
            )
            StatCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.Egg,
                iconColor = OvulationColor,
                label = "Ovulasi Berikutnya",
                value = stats?.nextOvulation ?: "--"
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.Favorite,
                iconColor = FertileColor,
                label = "Masa Subur",
                value = stats?.fertileWindow ?: "--"
            )
            StatCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.CalendarToday,
                iconColor = PeriodColor,
                label = "Prediksi Haid",
                value = stats?.nextPeriod ?: "--"
            )
        }
    }
}

@Composable
fun StatCard(
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconColor: Color,
    label: String,
    value: String
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, null, tint = iconColor, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Text(label, fontSize = 11.sp, color = TextSecondaryDark, textAlign = TextAlign.Center)
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimaryDark, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun DisclaimerCard() {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Warning.copy(alpha = 0.1f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, null, tint = Warning, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Penting untuk Diketahui", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Warning)
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "Kalender kesuburan ini hanya estimasi. Untuk hasil lebih akurat, kombinasikan dengan observasi lendir serviks, pencatatan suhu basal (BBT), atau OPK.",
                fontSize = 12.sp, color = TextSecondaryDark, lineHeight = 18.sp
            )
        }
    }
}

@Composable
fun CalendarSection(
    year: Int,
    month: Int,
    monthName: String,
    events: List<CalendarEvent>,
    calendarMode: CalendarMode,
    selectionMode: SelectionMode,
    selectedStartDate: String?,
    selectedEndDate: String?,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onToday: () -> Unit,
    onModeChange: (CalendarMode) -> Unit,
    onDateClick: (String) -> Unit,
    onClearSelection: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onPrevMonth, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.ChevronLeft, "Previous", tint = TextPrimaryDark)
                    }
                    Text(
                        "$monthName $year",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                        color = TextPrimaryDark,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    IconButton(onClick = onNextMonth, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.ChevronRight, "Next", tint = TextPrimaryDark)
                    }
                }
                TextButton(onClick = onToday) {
                    Text("Hari Ini", fontSize = 13.sp, color = Accent)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Mode Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ModeButton(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.WaterDrop,
                    label = "Catat Haid",
                    isActive = calendarMode == CalendarMode.PERIOD,
                    activeColor = PeriodColor,
                    onClick = { onModeChange(CalendarMode.PERIOD) }
                )
                ModeButton(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Favorite,
                    label = "Catat Hubungan",
                    isActive = calendarMode == CalendarMode.INTERCOURSE,
                    activeColor = Color(0xFFE91E63),
                    onClick = { onModeChange(CalendarMode.INTERCOURSE) }
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Selection Hint
            if (calendarMode == CalendarMode.PERIOD) {
                SelectionHint(
                    selectionMode = selectionMode,
                    selectedStartDate = selectedStartDate,
                    selectedEndDate = selectedEndDate,
                    onClear = onClearSelection
                )
                Spacer(modifier = Modifier.height(12.dp))
            } else {
                // Intercourse mode hint
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFE91E63).copy(alpha = 0.1f))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.TouchApp, null, tint = Color(0xFFE91E63), modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Klik tanggal untuk mencatat hubungan intim", fontSize = 12.sp, color = TextPrimaryDark)
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Day Headers
            val dayHeaders = listOf("Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab")
            Row(modifier = Modifier.fillMaxWidth()) {
                dayHeaders.forEach { day ->
                    Text(
                        day,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextSecondaryDark
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Calendar Grid
            CalendarGrid(
                year = year,
                month = month,
                events = events,
                selectedStartDate = selectedStartDate,
                selectedEndDate = selectedEndDate,
                onDateClick = onDateClick
            )
        }
    }
}

@Composable
fun ModeButton(
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean,
    activeColor: Color,
    onClick: () -> Unit
) {
    val bgColor = if (isActive) activeColor.copy(alpha = 0.2f) else Color.Transparent
    val borderColor = if (isActive) activeColor else TextSecondaryDark.copy(alpha = 0.3f)
    val contentColor = if (isActive) activeColor else TextSecondaryDark

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = contentColor, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, fontSize = 12.sp, color = contentColor, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SelectionHint(
    selectionMode: SelectionMode,
    selectedStartDate: String?,
    selectedEndDate: String?,
    onClear: () -> Unit
) {
    val hintText = when {
        selectionMode == SelectionMode.START -> "Klik tanggal untuk pilih hari pertama haid"
        selectionMode == SelectionMode.END -> "Klik tanggal terakhir haid (opsional)"
        selectedStartDate != null && selectedEndDate != null -> "Tanggal dipilih: $selectedStartDate s/d $selectedEndDate"
        selectedStartDate != null -> "Tanggal mulai: $selectedStartDate"
        else -> ""
    }

    if (hintText.isNotEmpty()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Accent.copy(alpha = 0.1f))
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.TouchApp, null, tint = Accent, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(hintText, fontSize = 12.sp, color = TextPrimaryDark)
            }
            if (selectedStartDate != null) {
                IconButton(onClick = onClear, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.Close, "Clear", tint = TextSecondaryDark, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
fun CalendarGrid(
    year: Int,
    month: Int,
    events: List<CalendarEvent>,
    selectedStartDate: String?,
    selectedEndDate: String?,
    onDateClick: (String) -> Unit
) {
    val calendar = Calendar.getInstance()
    calendar.set(year, month - 1, 1)
    val firstDayOfWeek = calendar.get(Calendar.DAY_OF_WEEK) - 1
    val daysInMonth = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)

    val today = Calendar.getInstance()
    val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(today.time)

    val eventsByDate = events.groupBy { it.date }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        var dayCounter = 1
        val totalCells = firstDayOfWeek + daysInMonth
        val rows = (totalCells + 6) / 7

        for (row in 0 until rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                for (col in 0 until 7) {
                    val cellIndex = row * 7 + col
                    if (cellIndex < firstDayOfWeek || dayCounter > daysInMonth) {
                        Box(modifier = Modifier.weight(1f).aspectRatio(1f))
                    } else {
                        val dateStr = String.format(Locale.getDefault(), "%04d-%02d-%02d", year, month, dayCounter)
                        val dayEvents = eventsByDate[dateStr] ?: emptyList()
                        val isToday = dateStr == todayStr
                        val isSelected = isDateSelected(dateStr, selectedStartDate, selectedEndDate)
                        val isInRange = isDateInRange(dateStr, selectedStartDate, selectedEndDate)

                        CalendarDayCell(
                            modifier = Modifier.weight(1f),
                            day = dayCounter,
                            isToday = isToday,
                            isSelected = isSelected,
                            isInRange = isInRange,
                            events = dayEvents,
                            onClick = { onDateClick(dateStr) }
                        )
                        dayCounter++
                    }
                }
            }
        }
    }
}

fun isDateSelected(date: String, start: String?, end: String?): Boolean {
    return date == start || date == end
}

fun isDateInRange(date: String, start: String?, end: String?): Boolean {
    if (start == null || end == null) return false
    return date > start && date < end
}

@Composable
fun CalendarDayCell(
    modifier: Modifier = Modifier,
    day: Int,
    isToday: Boolean,
    isSelected: Boolean,
    isInRange: Boolean,
    events: List<CalendarEvent>,
    onClick: () -> Unit
) {
    val eventTypes = events.map { it.type }

    val backgroundColor = when {
        isSelected -> SelectionColor.copy(alpha = 0.5f)
        isInRange -> SelectionColor.copy(alpha = 0.2f)
        eventTypes.contains("period") -> PeriodColor.copy(alpha = 0.3f)
        eventTypes.contains("ovulation") -> OvulationColor.copy(alpha = 0.3f)
        eventTypes.contains("peak_fertile") -> PeakFertileColor.copy(alpha = 0.3f)
        eventTypes.contains("fertile") -> FertileColor.copy(alpha = 0.2f)
        eventTypes.contains("predicted_period") -> PredictedPeriodColor
        else -> Color.Transparent
    }

    val textColor = when {
        isSelected -> Color.White
        eventTypes.contains("period") -> Color(0xFFFF8A80)
        eventTypes.contains("ovulation") -> Color(0xFFFFD54F)
        eventTypes.contains("peak_fertile") -> Color(0xFF81C784)
        eventTypes.contains("fertile") -> Color(0xFFA5D6A7)
        eventTypes.contains("predicted_period") -> Color(0xFFFF8A80)
        else -> TextPrimaryDark
    }

    val periodEvent = events.find { it.type == "period" }
    val hasIntercourse = eventTypes.contains("intercourse")

    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .then(
                if (isToday) Modifier.border(2.dp, TextPrimaryDark, RoundedCornerShape(8.dp))
                else Modifier
            )
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = day.toString(),
            fontSize = 13.sp,
            color = textColor,
            fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal
        )

        periodEvent?.periodDay?.let { periodDay ->
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(2.dp)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(PeriodColor.copy(alpha = 0.8f)),
                contentAlignment = Alignment.Center
            ) {
                Text("H$periodDay", fontSize = 8.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
            }
        }

        if (hasIntercourse) {
            Icon(
                Icons.Default.Favorite,
                null,
                tint = Color(0xFFE91E63),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 2.dp).size(10.dp)
            )
        }
    }
}

@Composable
fun LegendSection() {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Keterangan", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = TextPrimaryDark)
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    LegendItem(PeriodColor.copy(alpha = 0.4f), "Menstruasi")
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(FertileColor.copy(alpha = 0.3f), "Masa Subur")
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(PeakFertileColor.copy(alpha = 0.5f), "Sangat Subur")
                }
                Column(modifier = Modifier.weight(1f)) {
                    LegendItem(OvulationColor.copy(alpha = 0.4f), "Ovulasi")
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(PredictedPeriodColor, "Prediksi Haid")
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Favorite, null, tint = Color(0xFFE91E63), modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Hubungan Intim", fontSize = 12.sp, color = TextPrimaryDark)
                    }
                }
            }
        }
    }
}

@Composable
fun LegendItem(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(color))
        Spacer(modifier = Modifier.width(8.dp))
        Text(label, fontSize = 12.sp, color = TextPrimaryDark)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AddPeriodForm(
    startDate: String?,
    endDate: String?,
    flowIntensity: String,
    painIntensity: String,
    selectedSymptoms: Set<String>,
    notes: String,
    isSaving: Boolean,
    flowOptions: List<Pair<String, String>>,
    painOptions: List<Pair<String, String>>,
    symptoms: List<Pair<String, String>>,
    onFlowChange: (String) -> Unit,
    onPainChange: (String) -> Unit,
    onSymptomToggle: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onSave: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Add, null, tint = Accent, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Catat Menstruasi", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimaryDark)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Selected dates display
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Tanggal Mulai", fontSize = 12.sp, color = TextSecondaryDark)
                    Text(startDate ?: "-", fontSize = 14.sp, color = TextPrimaryDark, fontWeight = FontWeight.Medium)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Tanggal Selesai", fontSize = 12.sp, color = TextSecondaryDark)
                    Text(endDate ?: "(opsional)", fontSize = 14.sp, color = if (endDate != null) TextPrimaryDark else TextSecondaryDark)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Flow & Pain
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Jumlah Darah", fontSize = 12.sp, color = TextSecondaryDark)
                    Spacer(modifier = Modifier.height(4.dp))
                    OptionSelector(
                        options = flowOptions,
                        selectedValue = flowIntensity,
                        onSelect = onFlowChange
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Intensitas Nyeri", fontSize = 12.sp, color = TextSecondaryDark)
                    Spacer(modifier = Modifier.height(4.dp))
                    OptionSelector(
                        options = painOptions,
                        selectedValue = painIntensity,
                        onSelect = onPainChange
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Symptoms
            Text("Gejala", fontSize = 12.sp, color = TextSecondaryDark)
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                symptoms.forEach { (key, label) ->
                    SymptomChip(
                        label = label,
                        isSelected = selectedSymptoms.contains(key),
                        onClick = { onSymptomToggle(key) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Notes
            Text("Catatan", fontSize = 12.sp, color = TextSecondaryDark)
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedTextField(
                value = notes,
                onValueChange = onNotesChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Catatan tambahan...", fontSize = 14.sp) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = TextSecondaryDark.copy(alpha = 0.3f),
                    focusedTextColor = TextPrimaryDark,
                    unfocusedTextColor = TextPrimaryDark
                ),
                maxLines = 2
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Save button
            Button(
                onClick = onSave,
                modifier = Modifier.fillMaxWidth(),
                enabled = startDate != null && !isSaving,
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) {
                if (isSaving) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                } else {
                    Icon(Icons.Default.Save, null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Simpan Data")
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OptionSelector(
    options: List<Pair<String, String>>,
    selectedValue: String,
    onSelect: (String) -> Unit
) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        options.forEach { (value, label) ->
            val isSelected = value == selectedValue
            Text(
                text = label,
                fontSize = 12.sp,
                color = if (isSelected) Color.White else TextSecondaryDark,
                fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isSelected) Accent else Color.Transparent)
                    .border(
                        1.dp,
                        if (isSelected) Accent else TextSecondaryDark.copy(alpha = 0.3f),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable { onSelect(value) }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}

@Composable
fun SymptomChip(label: String, isSelected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        fontSize = 12.sp,
        color = if (isSelected) Color.White else TextSecondaryDark,
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (isSelected) Accent else Color.Transparent)
            .border(
                1.dp,
                if (isSelected) Accent else TextSecondaryDark.copy(alpha = 0.3f),
                RoundedCornerShape(16.dp)
            )
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp)
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    horizontalArrangement: Arrangement.Horizontal = Arrangement.Start,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable () -> Unit
) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier,
        horizontalArrangement = horizontalArrangement,
        verticalArrangement = verticalArrangement
    ) {
        content()
    }
}

@Composable
fun CycleHistorySection(cycles: List<CycleInfo>, onDelete: (Int) -> Unit) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Riwayat Siklus", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = TextPrimaryDark)
        Spacer(modifier = Modifier.height(12.dp))

        cycles.take(10).forEach { cycle ->
            CycleCard(
                startDate = cycle.startDate,
                cycleLength = cycle.cycleLength,
                periodLength = cycle.periodLength,
                onDelete = { onDelete(cycle.id) }
            )
            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}

@Composable
fun CycleCard(startDate: String, cycleLength: Int, periodLength: Int, onDelete: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(startDate, fontWeight = FontWeight.Medium, color = TextPrimaryDark)
                Text("Siklus $cycleLength hari", fontSize = 12.sp, color = TextSecondaryDark)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Haid $periodLength hari", fontSize = 12.sp, color = Danger)
                Spacer(modifier = Modifier.width(12.dp))
                IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Delete, "Delete", tint = Danger, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
