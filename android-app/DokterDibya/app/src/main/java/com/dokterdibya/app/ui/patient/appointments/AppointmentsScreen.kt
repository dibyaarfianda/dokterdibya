package com.dokterdibya.app.ui.patient.appointments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Appointment
import com.dokterdibya.app.ui.common.components.*
import com.dokterdibya.app.ui.patient.dashboard.BottomNavigationBar
import com.dokterdibya.app.ui.patient.dashboard.StatusChip
import com.dokterdibya.app.ui.common.navigation.Screen
import com.dokterdibya.app.utils.DateUtils
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(
    navController: NavController,
    viewModel: AppointmentViewModel = hiltViewModel()
) {
    val appointments by viewModel.appointments.collectAsState()
    val isRefreshing = appointments is Result.Loading

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Janji Temu") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        bottomBar = {
            BottomNavigationBar(navController = navController, currentRoute = Screen.Appointments.route)
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { /* TODO: Navigate to booking screen */ }
            ) {
                Icon(Icons.Default.Add, contentDescription = "Book Appointment")
            }
        }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(isRefreshing),
            onRefresh = { viewModel.loadAppointments() },
            modifier = Modifier.padding(paddingValues)
        ) {
            when (val state = appointments) {
                is Result.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = androidx.compose.ui.Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                is Result.Error -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                    ) {
                        ErrorCard(
                            message = state.message ?: "Gagal memuat janji temu",
                            onRetry = { viewModel.loadAppointments() }
                        )
                    }
                }
                is Result.Success -> {
                    if (state.data.isEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp)
                        ) {
                            EmptyStateCard(
                                message = "Belum ada janji temu.\nKlik tombol + untuk membuat janji temu baru.",
                                icon = { Icon(Icons.Default.Add, contentDescription = null) }
                            )
                        }
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(state.data) { appointment ->
                                AppointmentDetailCard(appointment, viewModel)
                            }
                        }
                    }
                }
                null -> {}
            }
        }
    }
}

@Composable
fun AppointmentDetailCard(appointment: Appointment, viewModel: AppointmentViewModel) {
    var showCancelDialog by remember { mutableStateOf(false) }

    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            title = { Text("Batalkan Janji Temu?") },
            text = { Text("Apakah Anda yakin ingin membatalkan janji temu ini?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.cancelAppointment(appointment.id)
                        showCancelDialog = false
                    }
                ) {
                    Text("Ya, Batalkan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelDialog = false }) {
                    Text("Tidak")
                }
            }
        )
    }

    AppCard {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = DateUtils.formatDate(appointment.appointmentDate),
                        style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = DateUtils.getSessionName(appointment.session),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                StatusChip(appointment.status)
            }

            Spacer(modifier = Modifier.height(12.dp))
            Divider()
            Spacer(modifier = Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth()) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        text = "Waktu",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = DateUtils.formatTime(appointment.appointmentTime),
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }

            if (!appointment.notes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Catatan:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = appointment.notes,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (appointment.status == "scheduled" || appointment.status == "confirmed") {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { showCancelDialog = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Batalkan Janji")
                }
            }
        }
    }
}
