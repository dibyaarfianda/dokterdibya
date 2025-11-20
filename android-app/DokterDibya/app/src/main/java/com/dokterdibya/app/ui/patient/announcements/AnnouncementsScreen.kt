package com.dokterdibya.app.ui.patient.announcements

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.dokterdibya.app.data.repository.AnnouncementRepository
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Announcement
import com.dokterdibya.app.ui.common.components.*
import com.dokterdibya.app.ui.patient.dashboard.BottomNavigationBar
import com.dokterdibya.app.ui.patient.dashboard.PriorityChip
import com.dokterdibya.app.ui.common.navigation.Screen
import com.dokterdibya.app.utils.DateUtils
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AnnouncementViewModel @Inject constructor(
    private val announcementRepository: AnnouncementRepository
) : ViewModel() {

    private val _announcements = MutableStateFlow<Result<List<Announcement>>?>(null)
    val announcements: StateFlow<Result<List<Announcement>>?> = _announcements.asStateFlow()

    init {
        loadAnnouncements()
    }

    fun loadAnnouncements() {
        viewModelScope.launch {
            announcementRepository.getActiveAnnouncements().collect { result ->
                _announcements.value = result
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnouncementsScreen(
    navController: NavController,
    viewModel: AnnouncementViewModel = hiltViewModel()
) {
    val announcements by viewModel.announcements.collectAsState()
    val isRefreshing = announcements is Result.Loading

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pengumuman") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        bottomBar = {
            BottomNavigationBar(navController = navController, currentRoute = Screen.Announcements.route)
        }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(isRefreshing),
            onRefresh = { viewModel.loadAnnouncements() },
            modifier = Modifier.padding(paddingValues)
        ) {
            when (val state = announcements) {
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
                            message = state.message ?: "Gagal memuat pengumuman",
                            onRetry = { viewModel.loadAnnouncements() }
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
                            EmptyStateCard(message = "Belum ada pengumuman")
                        }
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(state.data) { announcement ->
                                AnnouncementFullCard(announcement)
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
fun AnnouncementFullCard(announcement: Announcement) {
    AppCard {
        Column {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = announcement.title,
                        style = MaterialTheme.typography.titleLarge
                    )
                }
                PriorityChip(announcement.priority)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Metadata
            Text(
                text = "Oleh ${announcement.createdByName}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = DateUtils.getRelativeTimeSpan(announcement.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))
            Divider()
            Spacer(modifier = Modifier.height(12.dp))

            // Content
            Text(
                text = announcement.message,
                style = MaterialTheme.typography.bodyLarge
            )

            // Image (if available)
            if (!announcement.imageUrl.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    shape = MaterialTheme.shapes.medium
                ) {
                    AsyncImage(
                        model = announcement.imageUrl,
                        contentDescription = announcement.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        placeholder = null,
                        error = null
                    )
                }
            }
        }
    }
}
