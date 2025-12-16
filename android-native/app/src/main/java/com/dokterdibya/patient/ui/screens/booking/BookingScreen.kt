package com.dokterdibya.patient.ui.screens.booking

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.model.SessionSlots
import com.dokterdibya.patient.data.model.SundayDate
import com.dokterdibya.patient.data.model.TimeSlot
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.AppointmentInfo
import com.dokterdibya.patient.viewmodel.BookingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    onBack: () -> Unit,
    viewModel: BookingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Booking Klinik Minggu",
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
        ) {
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Accent)
                }
            } else if (uiState.error != null && uiState.sundays.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = Danger,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            uiState.error ?: "Terjadi kesalahan",
                            color = TextSecondaryDark
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.retry() },
                            colors = ButtonDefaults.buttonColors(containerColor = Accent)
                        ) {
                            Text("Coba Lagi")
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Info card
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Accent.copy(alpha = 0.1f))
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Info,
                                    contentDescription = null,
                                    tint = Accent
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    "Klinik Minggu dibuka setiap hari Minggu",
                                    fontSize = 13.sp,
                                    color = TextPrimaryDark
                                )
                            }
                        }
                    }

                    // Date selector
                    item {
                        Text(
                            "Pilih Tanggal",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimaryDark
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        if (uiState.sundays.isEmpty()) {
                            Text(
                                "Tidak ada jadwal tersedia",
                                color = TextSecondaryDark,
                                fontSize = 14.sp
                            )
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                uiState.sundays.forEach { sunday ->
                                    DateChip(
                                        sunday = sunday,
                                        isSelected = uiState.selectedSunday?.date == sunday.date,
                                        onClick = { viewModel.selectSunday(sunday) }
                                    )
                                }
                            }
                        }
                    }

                    // Sessions and slots
                    if (uiState.selectedSunday != null) {
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Sesi & Slot - ${uiState.selectedSunday?.formatted ?: ""}",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimaryDark
                            )
                        }

                        if (uiState.isLoadingSlots) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(100.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(
                                        color = Accent,
                                        modifier = Modifier.size(32.dp)
                                    )
                                }
                            }
                        } else if (uiState.sessions.isEmpty()) {
                            item {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = CardDark)
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(24.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Icon(
                                            Icons.Default.EventBusy,
                                            contentDescription = null,
                                            tint = TextSecondaryDark,
                                            modifier = Modifier.size(40.dp)
                                        )
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text(
                                            "Tidak ada slot tersedia",
                                            color = TextSecondaryDark
                                        )
                                    }
                                }
                            }
                        } else {
                            items(uiState.sessions) { session ->
                                SessionCard(session = session)
                            }
                        }
                    }

                    // User's appointments
                    if (uiState.appointments.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Janji Temu Anda",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimaryDark
                            )
                        }

                        items(uiState.appointments) { appointment ->
                            AppointmentCard(appointment = appointment)
                        }
                    }

                    // Bottom spacing
                    item {
                        Spacer(modifier = Modifier.height(32.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun DateChip(
    sunday: SundayDate,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    // Extract day and month from formatted date
    val parts = sunday.formatted.split(",").getOrNull(1)?.trim()?.split(" ") ?: listOf()
    val day = parts.getOrNull(0) ?: ""
    val month = parts.getOrNull(1)?.take(3) ?: ""

    Card(
        modifier = Modifier
            .width(70.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Accent else CardDark
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = day,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) BgDark else TextPrimaryDark
            )
            Text(
                text = month,
                fontSize = 12.sp,
                color = if (isSelected) BgDark.copy(alpha = 0.8f) else TextSecondaryDark
            )
        }
    }
}

@Composable
fun SessionCard(session: SessionSlots) {
    val availableCount = session.slots.count { it.available }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = session.label,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimaryDark
                )
                Text(
                    text = "$availableCount slot tersedia",
                    fontSize = 12.sp,
                    color = if (availableCount > 0) Success else Danger
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Slots grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                session.slots.chunked(5).forEach { rowSlots ->
                    Column(
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        rowSlots.forEach { slot ->
                            SlotChip(slot = slot)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SlotChip(slot: TimeSlot) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(
                if (slot.available) Success.copy(alpha = 0.2f)
                else Danger.copy(alpha = 0.1f)
            )
            .clickable(enabled = slot.available) {
                // TODO: Show booking dialog
            }
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(
            text = slot.time,
            fontSize = 12.sp,
            color = if (slot.available) Success else TextSecondaryDark.copy(alpha = 0.5f)
        )
    }
}

@Composable
fun AppointmentCard(appointment: AppointmentInfo) {
    val statusColor = when (appointment.status.lowercase()) {
        "confirmed" -> Success
        "pending" -> Warning
        "cancelled" -> Danger
        "completed" -> Purple
        else -> TextSecondaryDark
    }

    val statusLabel = when (appointment.status.lowercase()) {
        "confirmed" -> "Dikonfirmasi"
        "pending" -> "Menunggu"
        "cancelled" -> "Dibatalkan"
        "completed" -> "Selesai"
        else -> appointment.status
    }

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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Event,
                    contentDescription = null,
                    tint = Accent,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        appointment.dateFormatted,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimaryDark
                    )
                    Text(
                        appointment.sessionLabel,
                        fontSize = 13.sp,
                        color = TextSecondaryDark
                    )
                }
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(statusColor.copy(alpha = 0.2f))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    statusLabel,
                    fontSize = 12.sp,
                    color = statusColor,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
