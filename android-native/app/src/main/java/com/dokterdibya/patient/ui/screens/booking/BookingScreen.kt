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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.ui.res.painterResource
import com.dokterdibya.patient.R
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.model.SessionSlots
import com.dokterdibya.patient.data.model.SundayDate
import com.dokterdibya.patient.data.model.TimeSlot
import androidx.compose.ui.graphics.Color
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.AppointmentInfo
import com.dokterdibya.patient.viewmodel.BookingViewModel
import com.dokterdibya.patient.viewmodel.SelectedSlot

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    onBack: () -> Unit,
    viewModel: BookingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Show success snackbar
    LaunchedEffect(uiState.bookingSuccess) {
        uiState.bookingSuccess?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.dismissSuccessMessage()
        }
    }

    ThemedBackground {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Klinik Minggu",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 18.sp
                        )
                        Text(
                            "Buat Janji",
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
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
                                    "Pilih tanggal dan slot waktu untuk booking",
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
                                "Pilih Sesi & Waktu",
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
                                            painter = painterResource(id = R.drawable.temurs),
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
                                SessionCard(
                                    session = session,
                                    onSlotClick = { slot -> viewModel.onSlotClick(session, slot) }
                                )
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
                            AppointmentCard(
                                appointment = appointment,
                                onCancel = { viewModel.showCancelDialog(appointment) }
                            )
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(32.dp))
                    }
                }
            }
        }
    }

    // Booking Dialog
    if (uiState.showBookingDialog && uiState.selectedSlot != null) {
        BookingDialog(
            slot = uiState.selectedSlot!!,
            isLoading = uiState.isBooking,
            error = uiState.bookingError,
            onDismiss = { viewModel.dismissBookingDialog() },
            onConfirm = { complaint, category -> viewModel.confirmBooking(complaint, category) }
        )
    }

    // Cancel Confirmation Dialog
    if (uiState.showCancelDialog && uiState.appointmentToCancel != null) {
        CancelDialog(
            appointment = uiState.appointmentToCancel!!,
            isLoading = uiState.isCancelling,
            error = uiState.cancelError,
            reason = uiState.cancelReason,
            onReasonChange = { viewModel.updateCancelReason(it) },
            onDismiss = { viewModel.dismissCancelDialog() },
            onConfirm = { viewModel.confirmCancel() }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingDialog(
    slot: SelectedSlot,
    isLoading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit
) {
    var chiefComplaint by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("obstetri") }
    var expanded by remember { mutableStateOf(false) }

    val categories = listOf(
        "obstetri" to "Kehamilan (Obstetri)",
        "gyn_repro" to "Program Hamil (Reproduksi)",
        "gyn_special" to "Ginekologi Umum"
    )

    Dialog(onDismissRequest = { if (!isLoading) onDismiss() }) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardDark)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Text(
                    "Konfirmasi Booking",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimaryDark
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Slot info
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = BgDark)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                slot.dateFormatted,
                                fontSize = 14.sp,
                                color = TextPrimaryDark
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painter = painterResource(id = R.drawable.temurs),
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "${slot.time} - ${slot.sessionLabel}",
                                fontSize = 14.sp,
                                color = TextPrimaryDark
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Category dropdown
                Text(
                    "Kategori Konsultasi",
                    fontSize = 14.sp,
                    color = TextSecondaryDark
                )
                Spacer(modifier = Modifier.height(4.dp))

                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    OutlinedTextField(
                        value = categories.find { it.first == selectedCategory }?.second ?: "",
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimaryDark,
                            unfocusedTextColor = TextPrimaryDark,
                            focusedBorderColor = Accent,
                            unfocusedBorderColor = TextSecondaryDark.copy(alpha = 0.5f)
                        )
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        categories.forEach { (value, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = {
                                    selectedCategory = value
                                    expanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Chief complaint
                Text(
                    "Keluhan Utama *",
                    fontSize = 14.sp,
                    color = TextSecondaryDark
                )
                Spacer(modifier = Modifier.height(4.dp))

                OutlinedTextField(
                    value = chiefComplaint,
                    onValueChange = { chiefComplaint = it },
                    placeholder = { Text("Tuliskan keluhan Anda...", color = TextSecondaryDark.copy(alpha = 0.5f)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextPrimaryDark,
                        unfocusedTextColor = TextPrimaryDark,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = TextSecondaryDark.copy(alpha = 0.5f)
                    )
                )

                // Error message
                if (error != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        error,
                        color = Danger,
                        fontSize = 13.sp
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading
                    ) {
                        Text("Batal")
                    }
                    Button(
                        onClick = { onConfirm(chiefComplaint, selectedCategory) },
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                color = BgDark,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Booking")
                        }
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
fun SessionCard(
    session: SessionSlots,
    onSlotClick: (TimeSlot) -> Unit
) {
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
                    text = "$availableCount tersedia",
                    fontSize = 12.sp,
                    color = if (availableCount > 0) Success else Danger
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Slots as flow layout
            val chunkedSlots = session.slots.chunked(5)
            chunkedSlots.forEach { rowSlots ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    rowSlots.forEach { slot ->
                        SlotChip(
                            slot = slot,
                            onClick = { onSlotClick(slot) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
            }
        }
    }
}

@Composable
fun SlotChip(
    slot: TimeSlot,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(
                if (slot.available) Success.copy(alpha = 0.2f)
                else Danger.copy(alpha = 0.1f)
            )
            .clickable(enabled = slot.available, onClick = onClick)
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
fun CancelDialog(
    appointment: AppointmentInfo,
    isLoading: Boolean,
    error: String?,
    reason: String,
    onReasonChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    Dialog(onDismissRequest = { if (!isLoading) onDismiss() }) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardDark)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = Danger,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        "Batalkan Janji Temu?",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimaryDark
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    "Apakah Anda yakin ingin membatalkan janji temu berikut?",
                    fontSize = 14.sp,
                    color = TextSecondaryDark
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Appointment info
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = BgDark)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                appointment.dateFormatted,
                                fontSize = 14.sp,
                                color = TextPrimaryDark
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painter = painterResource(id = R.drawable.temurs),
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "${appointment.time} - ${appointment.sessionLabel}",
                                fontSize = 14.sp,
                                color = TextPrimaryDark
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Reason TextField
                OutlinedTextField(
                    value = reason,
                    onValueChange = onReasonChange,
                    label = { Text("Alasan pembatalan") },
                    placeholder = { Text("Minimal 10 karakter") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextPrimaryDark,
                        unfocusedTextColor = TextPrimaryDark,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = TextSecondaryDark.copy(alpha = 0.5f),
                        focusedLabelColor = Accent,
                        unfocusedLabelColor = TextSecondaryDark,
                        cursorColor = Accent
                    ),
                    enabled = !isLoading
                )

                // Error message
                if (error != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        error,
                        color = Danger,
                        fontSize = 13.sp
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading
                    ) {
                        Text("Tidak")
                    }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading && reason.trim().length >= 10,
                        colors = ButtonDefaults.buttonColors(containerColor = Danger)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                color = TextPrimaryDark,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Ya, Batalkan")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AppointmentCard(
    appointment: AppointmentInfo,
    onCancel: (() -> Unit)? = null
) {
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

    val canCancel = appointment.status.lowercase() in listOf("confirmed", "pending") && !appointment.isPast

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
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.temurs),
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
                            "${appointment.time} - ${appointment.sessionLabel}",
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

            // Cancel button
            if (canCancel && onCancel != null) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onCancel,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Danger
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Danger.copy(alpha = 0.5f))
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Batalkan Janji Temu")
                }
            }
        }
    }
    }
}
