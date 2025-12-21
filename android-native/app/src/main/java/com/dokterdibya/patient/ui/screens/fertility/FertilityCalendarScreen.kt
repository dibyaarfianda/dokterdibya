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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.model.CalendarEvent
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.FertilityViewModel
import java.text.SimpleDateFormat
import java.util.*

// Colors matching web version
private val PeriodColor = Color(0xFFEF4444)        // Red
private val FertileColor = Color(0xFF4CAF50)       // Green
private val PeakFertileColor = Color(0xFF388E3C)   // Darker green
private val OvulationColor = Color(0xFFFFC107)     // Yellow/Amber
private val PredictedPeriodColor = Color(0xFFEF4444).copy(alpha = 0.3f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FertilityCalendarScreen(
    onBack: () -> Unit,
    viewModel: FertilityViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Kalender Kesuburan",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BgDark,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )
        },
        containerColor = BgDark
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

                // Calendar
                CalendarSection(
                    year = uiState.currentYear,
                    month = uiState.currentMonth,
                    monthName = viewModel.getMonthName(uiState.currentMonth),
                    events = uiState.calendarEvents,
                    onPrevMonth = { viewModel.previousMonth() },
                    onNextMonth = { viewModel.nextMonth() },
                    onToday = { viewModel.goToToday() }
                )

                // Legend
                LegendSection()

                // Cycle History
                if (uiState.cycles.isNotEmpty()) {
                    CycleHistorySection(uiState.cycles)
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun StatsSection(stats: com.dokterdibya.patient.viewmodel.StatsInfo?) {
    Column(modifier = Modifier.padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Row 1: Siklus Rata-rata & Ovulasi Berikutnya
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
            // Row 2: Masa Subur & Prediksi Menstruasi
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
            Icon(
                icon,
                contentDescription = null,
                tint = iconColor,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                label,
                fontSize = 11.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                value,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimaryDark,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun DisclaimerCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Warning.copy(alpha = 0.1f)
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = Warning,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Penting untuk Diketahui",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = Warning
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "Kalender kesuburan ini hanya estimasi. Untuk hasil lebih akurat, kombinasikan dengan observasi lendir serviks, pencatatan suhu basal (BBT), atau OPK (alat tes ovulasi).",
                fontSize = 12.sp,
                color = TextSecondaryDark,
                lineHeight = 18.sp
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
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onToday: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Calendar Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = onPrevMonth,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Default.ChevronLeft,
                            contentDescription = "Previous",
                            tint = TextPrimaryDark
                        )
                    }
                    Text(
                        "$monthName $year",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                        color = TextPrimaryDark,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    IconButton(
                        onClick = onNextMonth,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Next",
                            tint = TextPrimaryDark
                        )
                    }
                }
                TextButton(onClick = onToday) {
                    Text(
                        "Hari Ini",
                        fontSize = 13.sp,
                        color = Accent
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

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
            CalendarGrid(year, month, events)
        }
    }
}

@Composable
fun CalendarGrid(year: Int, month: Int, events: List<CalendarEvent>) {
    val calendar = Calendar.getInstance()
    calendar.set(year, month - 1, 1)
    val firstDayOfWeek = calendar.get(Calendar.DAY_OF_WEEK) - 1 // Sunday = 0
    val daysInMonth = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)

    val today = Calendar.getInstance()
    val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(today.time)

    // Build map of events by date
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
                        // Empty cell
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                        )
                    } else {
                        val dateStr = String.format(
                            Locale.getDefault(),
                            "%04d-%02d-%02d",
                            year, month, dayCounter
                        )
                        val dayEvents = eventsByDate[dateStr] ?: emptyList()
                        val isToday = dateStr == todayStr

                        CalendarDayCell(
                            modifier = Modifier.weight(1f),
                            day = dayCounter,
                            isToday = isToday,
                            events = dayEvents
                        )
                        dayCounter++
                    }
                }
            }
        }
    }
}

@Composable
fun CalendarDayCell(
    modifier: Modifier = Modifier,
    day: Int,
    isToday: Boolean,
    events: List<CalendarEvent>
) {
    // Determine day type based on events (priority order)
    val eventTypes = events.map { it.type }
    val backgroundColor = when {
        eventTypes.contains("period") -> PeriodColor.copy(alpha = 0.3f)
        eventTypes.contains("ovulation") -> OvulationColor.copy(alpha = 0.3f)
        eventTypes.contains("peak_fertile") -> PeakFertileColor.copy(alpha = 0.3f)
        eventTypes.contains("fertile") -> FertileColor.copy(alpha = 0.2f)
        eventTypes.contains("predicted_period") -> PredictedPeriodColor
        else -> Color.Transparent
    }

    val textColor = when {
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
                if (isToday) Modifier.border(
                    2.dp,
                    TextPrimaryDark,
                    RoundedCornerShape(8.dp)
                ) else Modifier
            ),
        contentAlignment = Alignment.Center
    ) {
        // Day number
        Text(
            text = day.toString(),
            fontSize = 13.sp,
            color = textColor,
            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal
        )

        // Period day badge (H1, H2, etc.) - top right
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
                Text(
                    "H$periodDay",
                    fontSize = 8.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
            }
        }

        // Intercourse indicator - bottom center
        if (hasIntercourse) {
            Icon(
                Icons.Default.Favorite,
                contentDescription = null,
                tint = Color(0xFFE91E63),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 2.dp)
                    .size(10.dp)
            )
        }
    }
}

@Composable
fun LegendSection() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Keterangan",
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                color = TextPrimaryDark
            )
            Spacer(modifier = Modifier.height(12.dp))

            // Legend items in 2 columns
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    LegendItem(
                        color = PeriodColor.copy(alpha = 0.4f),
                        label = "Menstruasi"
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(
                        color = FertileColor.copy(alpha = 0.3f),
                        label = "Masa Subur"
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(
                        color = PeakFertileColor.copy(alpha = 0.5f),
                        label = "Sangat Subur"
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    LegendItem(
                        color = OvulationColor.copy(alpha = 0.4f),
                        label = "Ovulasi"
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LegendItem(
                        color = PredictedPeriodColor,
                        label = "Prediksi Haid"
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Favorite,
                            contentDescription = null,
                            tint = Color(0xFFE91E63),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Hubungan Intim",
                            fontSize = 12.sp,
                            color = TextPrimaryDark
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun LegendItem(
    color: Color,
    label: String
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(color)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            label,
            fontSize = 12.sp,
            color = TextPrimaryDark
        )
    }
}

@Composable
fun CycleHistorySection(cycles: List<com.dokterdibya.patient.viewmodel.CycleInfo>) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            "Riwayat Siklus",
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimaryDark
        )

        Spacer(modifier = Modifier.height(12.dp))

        cycles.take(5).forEach { cycle ->
            CycleCard(
                startDate = cycle.startDate,
                cycleLength = cycle.cycleLength,
                periodLength = cycle.periodLength
            )
            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}

@Composable
fun CycleCard(
    startDate: String,
    cycleLength: Int,
    periodLength: Int
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    startDate,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimaryDark
                )
                Text(
                    "Siklus $cycleLength hari",
                    fontSize = 12.sp,
                    color = TextSecondaryDark
                )
            }
            Text(
                "Haid $periodLength hari",
                fontSize = 12.sp,
                color = Danger
            )
        }
    }
}
