package com.dokterdibya.app.ui.patient.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Announcement
import com.dokterdibya.app.domain.models.Appointment
import com.dokterdibya.app.ui.common.components.*
import com.dokterdibya.app.ui.common.navigation.Screen
import com.dokterdibya.app.ui.theme.*
import com.dokterdibya.app.utils.Constants
import com.dokterdibya.app.utils.DateUtils
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    navController: NavController,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val userProfile by viewModel.userProfile.collectAsState()
    val appointments by viewModel.appointments.collectAsState()
    val announcements by viewModel.announcements.collectAsState()

    val isRefreshing = userProfile is Result.Loading ||
                       appointments is Result.Loading ||
                       announcements is Result.Loading

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dashboard") },
                actions = {
                    IconButton(onClick = { navController.navigate(Screen.Profile.route) }) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "Profile")
                    }
                }
            )
        },
        bottomBar = {
            BottomNavigationBar(navController = navController, currentRoute = Screen.Dashboard.route)
        }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(isRefreshing),
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.padding(paddingValues)
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Welcome card
                item {
                    WelcomeCard(userProfile)
                }

                // Upcoming appointments section
                item {
                    Text(
                        text = "Janji Temu Mendatang",
                        style = MaterialTheme.typography.titleLarge
                    )
                }

                item {
                    when (val state = appointments) {
                        is Result.Loading -> LoadingCard()
                        is Result.Error -> ErrorCard(
                            message = state.message ?: "Gagal memuat janji temu",
                            onRetry = { viewModel.loadDashboardData() }
                        )
                        is Result.Success -> {
                            val upcomingAppointments = state.data.filter {
                                it.status == Constants.STATUS_SCHEDULED || it.status == Constants.STATUS_CONFIRMED
                            }.take(3)

                            if (upcomingAppointments.isEmpty()) {
                                EmptyStateCard(
                                    message = "Belum ada janji temu",
                                    icon = { Icon(Icons.Default.CalendarToday, contentDescription = null) }
                                )
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    upcomingAppointments.forEach { appointment ->
                                        AppointmentCard(appointment)
                                    }
                                    TextButton(
                                        onClick = { navController.navigate(Screen.Appointments.route) },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text("Lihat Semua")
                                    }
                                }
                            }
                        }
                        null -> {}
                    }
                }

                // Announcements section
                item {
                    Text(
                        text = "Pengumuman Terbaru",
                        style = MaterialTheme.typography.titleLarge
                    )
                }

                item {
                    when (val state = announcements) {
                        is Result.Loading -> LoadingCard()
                        is Result.Error -> ErrorCard(
                            message = state.message ?: "Gagal memuat pengumuman",
                            onRetry = { viewModel.loadDashboardData() }
                        )
                        is Result.Success -> {
                            val recentAnnouncements = state.data.take(3)

                            if (recentAnnouncements.isEmpty()) {
                                EmptyStateCard(
                                    message = "Belum ada pengumuman",
                                    icon = { Icon(Icons.Default.Announcement, contentDescription = null) }
                                )
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    recentAnnouncements.forEach { announcement ->
                                        AnnouncementCard(announcement)
                                    }
                                    TextButton(
                                        onClick = { navController.navigate(Screen.Announcements.route) },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text("Lihat Semua")
                                    }
                                }
                            }
                        }
                        null -> {}
                    }
                }
            }
        }
    }
}

@Composable
fun WelcomeCard(userProfile: Result<com.dokterdibya.app.domain.models.User>?) {
    AppCard {
        when (userProfile) {
            is Result.Success -> {
                Text(
                    text = "Selamat Datang,",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = userProfile.data.fullName,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            else -> {
                Text(
                    text = "Selamat Datang",
                    style = MaterialTheme.typography.headlineMedium
                )
            }
        }
    }
}

@Composable
fun AppointmentCard(appointment: Appointment) {
    AppCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = DateUtils.formatDate(appointment.appointmentDate),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Sesi ${DateUtils.getSessionName(appointment.session)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = DateUtils.formatTime(appointment.appointmentTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            StatusChip(appointment.status)
        }
    }
}

@Composable
fun AnnouncementCard(announcement: Announcement) {
    AppCard {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Text(
                    text = announcement.title,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                PriorityChip(announcement.priority)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = announcement.message,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = DateUtils.getRelativeTimeSpan(announcement.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun StatusChip(status: String) {
    val color = when (status) {
        Constants.STATUS_SCHEDULED -> Info
        Constants.STATUS_CONFIRMED -> Success
        Constants.STATUS_COMPLETED -> Gray500
        Constants.STATUS_CANCELLED -> Error
        else -> Gray500
    }

    val text = when (status) {
        Constants.STATUS_SCHEDULED -> "Dijadwalkan"
        Constants.STATUS_CONFIRMED -> "Dikonfirmasi"
        Constants.STATUS_COMPLETED -> "Selesai"
        Constants.STATUS_CANCELLED -> "Dibatalkan"
        else -> status
    }

    Surface(
        color = color,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun PriorityChip(priority: String) {
    val color = when (priority) {
        Constants.PRIORITY_URGENT -> Urgent
        Constants.PRIORITY_IMPORTANT -> Important
        else -> Normal
    }

    val text = when (priority) {
        Constants.PRIORITY_URGENT -> "MENDESAK"
        Constants.PRIORITY_IMPORTANT -> "PENTING"
        else -> "INFO"
    }

    Surface(
        color = color,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun BottomNavigationBar(navController: NavController, currentRoute: String) {
    NavigationBar {
        NavigationBarItem(
            icon = { Icon(Icons.Default.Home, contentDescription = "Dashboard") },
            label = { Text("Beranda") },
            selected = currentRoute == Screen.Dashboard.route,
            onClick = { navController.navigate(Screen.Dashboard.route) {
                popUpTo(Screen.Dashboard.route) { inclusive = true }
            }}
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.CalendarToday, contentDescription = "Appointments") },
            label = { Text("Janji Temu") },
            selected = currentRoute == Screen.Appointments.route,
            onClick = { navController.navigate(Screen.Appointments.route) }
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.Announcement, contentDescription = "Announcements") },
            label = { Text("Pengumuman") },
            selected = currentRoute == Screen.Announcements.route,
            onClick = { navController.navigate(Screen.Announcements.route) }
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
            label = { Text("Profil") },
            selected = currentRoute == Screen.Profile.route,
            onClick = { navController.navigate(Screen.Profile.route) }
        )
    }
}
