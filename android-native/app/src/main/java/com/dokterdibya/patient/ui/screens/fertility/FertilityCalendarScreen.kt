package com.dokterdibya.patient.ui.screens.fertility

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.FertilityViewModel

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
                        Icon(Icons.Default.ArrowBack, "Back")
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
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Fertility)
                }
            } else {
                // Legend
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CardDark)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Keterangan",
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimaryDark
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        LegendItem(
                            color = Danger,
                            label = "Menstruasi"
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        LegendItem(
                            color = Fertility,
                            label = "Masa Subur"
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        LegendItem(
                            color = Purple,
                            label = "Ovulasi (Paling Subur)"
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Current Cycle Info
                if (uiState.prediction != null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Fertility.copy(alpha = 0.1f))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Favorite,
                                    contentDescription = null,
                                    tint = Fertility
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    "Prediksi Bulan Ini",
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextPrimaryDark
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            InfoRow(
                                icon = Icons.Default.Event,
                                label = "Menstruasi Berikutnya",
                                value = uiState.prediction?.nextPeriodStart ?: "-"
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            InfoRow(
                                icon = Icons.Default.Stars,
                                label = "Masa Subur",
                                value = "${uiState.prediction?.fertileStart ?: "-"} - ${uiState.prediction?.fertileEnd ?: "-"}"
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            InfoRow(
                                icon = Icons.Default.Favorite,
                                label = "Ovulasi",
                                value = uiState.prediction?.ovulationDate ?: "-"
                            )
                        }
                    }
                } else {
                    // No data card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = CardDark)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                Icons.Default.CalendarMonth,
                                contentDescription = null,
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "Belum ada data siklus",
                                color = TextSecondaryDark,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Hubungi dokter untuk memulai tracking kesuburan",
                                color = TextSecondaryDark,
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Cycle History
                if (uiState.cycles.isNotEmpty()) {
                    Text(
                        "Riwayat Siklus",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimaryDark
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    uiState.cycles.forEach { cycle ->
                        CycleCard(
                            startDate = cycle.startDate,
                            cycleLength = cycle.cycleLength,
                            periodLength = cycle.periodLength
                        )
                        Spacer(modifier = Modifier.height(10.dp))
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
                .clip(CircleShape)
                .background(color)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            label,
            fontSize = 13.sp,
            color = TextPrimaryDark
        )
    }
}

@Composable
fun InfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                icon,
                contentDescription = null,
                tint = TextSecondaryDark,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                label,
                fontSize = 13.sp,
                color = TextSecondaryDark
            )
        }
        Text(
            value,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = TextPrimaryDark
        )
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
