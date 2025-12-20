package com.dokterdibya.app.ui.patient.appointments

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.ui.common.components.*
import com.dokterdibya.app.utils.Constants
import com.dokterdibya.app.utils.DateUtils
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    navController: NavController,
    viewModel: AppointmentViewModel = hiltViewModel()
) {
    var selectedDate by remember { mutableStateOf<String?>(null) }
    var selectedSession by remember { mutableStateOf<Int?>(null) }
    var selectedSlot by remember { mutableStateOf<Int?>(null) }
    var notes by remember { mutableStateOf("") }
    var showConfirmDialog by remember { mutableStateOf(false) }

    val bookingResult by viewModel.bookingResult.collectAsState()
    val availableSlots by viewModel.availableSlots.collectAsState()

    // Load available slots when date is selected
    LaunchedEffect(selectedDate) {
        selectedDate?.let { date ->
            viewModel.loadAvailableSlots(date)
        }
    }

    // Handle booking success
    LaunchedEffect(bookingResult) {
        if (bookingResult is Result.Success) {
            navController.popBackStack()
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(bookingResult) {
        if (bookingResult is Result.Error) {
            val error = (bookingResult as Result.Error)
            snackbarHostState.showSnackbar(
                message = error.message ?: "Gagal membuat janji temu",
                duration = SnackbarDuration.Short
            )
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Konfirmasi Janji Temu") },
            text = {
                Column {
                    Text("Tanggal: ${DateUtils.formatDate(selectedDate)}")
                    Text("Sesi: ${selectedSession?.let { DateUtils.getSessionName(it) }}")
                    Text("Waktu: Slot #$selectedSlot")
                    if (notes.isNotBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Catatan: $notes")
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        selectedDate?.let { date ->
                            selectedSession?.let { session ->
                                selectedSlot?.let { slot ->
                                    viewModel.bookAppointment(date, session, slot, notes.ifBlank { null })
                                    showConfirmDialog = false
                                }
                            }
                        }
                    }
                ) {
                    Text("Konfirmasi")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Batal")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Buat Janji Temu") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Step 1: Select Date
            item {
                Text(
                    text = "1. Pilih Tanggal",
                    style = MaterialTheme.typography.titleLarge
                )
            }

            item {
                DateSelector(
                    selectedDate = selectedDate,
                    onDateSelected = { date ->
                        selectedDate = date
                        selectedSession = null
                        selectedSlot = null
                    }
                )
            }

            // Step 2: Select Session
            if (selectedDate != null) {
                item {
                    Text(
                        text = "2. Pilih Sesi",
                        style = MaterialTheme.typography.titleLarge
                    )
                }

                item {
                    SessionSelector(
                        selectedSession = selectedSession,
                        onSessionSelected = { session ->
                            selectedSession = session
                            selectedSlot = null
                        }
                    )
                }
            }

            // Step 3: Select Time Slot
            if (selectedSession != null) {
                item {
                    Text(
                        text = "3. Pilih Waktu",
                        style = MaterialTheme.typography.titleLarge
                    )
                }

                item {
                    when (val slots = availableSlots) {
                        is Result.Loading -> {
                            Box(
                                modifier = Modifier.fillMaxWidth().height(200.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        is Result.Success -> {
                            val sessionSlots = slots.data.find { it.session == selectedSession }
                            if (sessionSlots != null) {
                                TimeSlotGrid(
                                    slots = sessionSlots.slots,
                                    selectedSlot = selectedSlot,
                                    onSlotSelected = { slot -> selectedSlot = slot }
                                )
                            } else {
                                Text("Tidak ada slot tersedia untuk sesi ini")
                            }
                        }
                        is Result.Error -> {
                            ErrorCard(
                                message = "Gagal memuat slot",
                                onRetry = { selectedDate?.let { viewModel.loadAvailableSlots(it) } }
                            )
                        }
                        null -> {}
                    }
                }
            }

            // Step 4: Add Notes (optional)
            if (selectedSlot != null) {
                item {
                    Text(
                        text = "4. Catatan (Opsional)",
                        style = MaterialTheme.typography.titleLarge
                    )
                }

                item {
                    AppTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = "Catatan",
                        placeholder = "Tambahkan catatan jika diperlukan",
                        singleLine = false,
                        maxLines = 4
                    )
                }

                // Book button
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    AppButton(
                        text = "Buat Janji Temu",
                        onClick = { showConfirmDialog = true },
                        loading = bookingResult is Result.Loading
                    )
                }
            }
        }
    }
}

@Composable
fun DateSelector(
    selectedDate: String?,
    onDateSelected: (String) -> Unit
) {
    // Get next 7 Sundays
    val sundays = remember {
        val calendar = Calendar.getInstance()
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val sundays = mutableListOf<String>()

        // Move to next Sunday
        while (calendar.get(Calendar.DAY_OF_WEEK) != Calendar.SUNDAY) {
            calendar.add(Calendar.DAY_OF_MONTH, 1)
        }

        // Get next 7 Sundays
        repeat(7) {
            sundays.add(dateFormat.format(calendar.time))
            calendar.add(Calendar.WEEK_OF_YEAR, 1)
        }
        sundays
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        sundays.forEach { date ->
            AppCard(
                onClick = { onDateSelected(date) }
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = DateUtils.formatDate(date, "EEEE, dd MMMM yyyy"),
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "Minggu",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    if (date == selectedDate) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = "Selected",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionSelector(
    selectedSession: Int?,
    onSessionSelected: (Int) -> Unit
) {
    val sessions = listOf(
        Constants.SESSION_MORNING to "Pagi",
        Constants.SESSION_AFTERNOON to "Siang",
        Constants.SESSION_EVENING to "Sore"
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        sessions.forEach { (sessionId, sessionName) ->
            FilterChip(
                selected = selectedSession == sessionId,
                onClick = { onSessionSelected(sessionId) },
                label = { Text(sessionName) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
fun TimeSlotGrid(
    slots: List<com.dokterdibya.app.domain.models.TimeSlot>,
    selectedSlot: Int?,
    onSlotSelected: (Int) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.height(300.dp),
        contentPadding = PaddingValues(4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(slots) { slot ->
            SlotCard(
                slot = slot,
                isSelected = selectedSlot == slot.slotNumber,
                onSelected = { if (slot.available) onSlotSelected(slot.slotNumber) }
            )
        }
    }
}

@Composable
fun SlotCard(
    slot: com.dokterdibya.app.domain.models.TimeSlot,
    isSelected: Boolean,
    onSelected: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(60.dp)
            .clickable(enabled = slot.available) { onSelected() },
        colors = CardDefaults.cardColors(
            containerColor = when {
                isSelected -> MaterialTheme.colorScheme.primaryContainer
                !slot.available -> MaterialTheme.colorScheme.surfaceVariant
                else -> MaterialTheme.colorScheme.surface
            }
        ),
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else null
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = slot.time,
                    style = MaterialTheme.typography.titleMedium,
                    color = when {
                        !slot.available -> MaterialTheme.colorScheme.onSurfaceVariant
                        isSelected -> MaterialTheme.colorScheme.onPrimaryContainer
                        else -> MaterialTheme.colorScheme.onSurface
                    }
                )
                Text(
                    text = if (slot.available) "Tersedia" else "Penuh",
                    style = MaterialTheme.typography.bodySmall,
                    color = when {
                        !slot.available -> MaterialTheme.colorScheme.onSurfaceVariant
                        isSelected -> MaterialTheme.colorScheme.onPrimaryContainer
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }
        }
    }
}
