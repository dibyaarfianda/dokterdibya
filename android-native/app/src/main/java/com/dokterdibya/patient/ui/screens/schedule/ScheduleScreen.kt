package com.dokterdibya.patient.ui.screens.schedule

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.PracticeLocation
import com.dokterdibya.patient.viewmodel.ScheduleViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(
    onBack: () -> Unit,
    onNavigateToBooking: () -> Unit,
    viewModel: ScheduleViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (uiState.selectedLocation != null)
                            uiState.selectedLocation!!.name
                        else
                            "Jadwal & Lokasi Praktik",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (uiState.selectedLocation != null) {
                            viewModel.clearSelection()
                        } else {
                            onBack()
                        }
                    }) {
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
        ) {
            if (uiState.selectedLocation == null) {
                // Show location list
                LocationListContent(
                    locations = viewModel.practiceLocations,
                    onLocationClick = { location ->
                        if (location.hasOnlineBooking) {
                            onNavigateToBooking()
                        } else {
                            viewModel.selectLocation(location)
                        }
                    }
                )
            } else {
                // Show schedule detail
                ScheduleDetailContent(
                    location = uiState.selectedLocation!!,
                    schedules = uiState.schedules,
                    isLoading = uiState.isLoading,
                    error = uiState.error,
                    viewModel = viewModel,
                    onWhatsAppClick = {
                        val url = "https://wa.me/628113650101?text=Halo%20kak%2C%20saya%20mau%20daftar%20Poli%20dr.%20Dibya"
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        context.startActivity(intent)
                    }
                )
            }
        }
    }
}

@Composable
fun LocationListContent(
    locations: List<PracticeLocation>,
    onLocationClick: (PracticeLocation) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                "Silakan pilih lokasi praktik untuk melihat jadwal atau membuat janji konsultasi",
                color = TextSecondaryDark,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        items(locations) { location ->
            LocationCard(
                location = location,
                onClick = { onLocationClick(location) }
            )
        }
    }
}

@Composable
fun LocationCard(
    location: PracticeLocation,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Logo
            if (location.logoUrl != null) {
                AsyncImage(
                    model = location.logoUrl,
                    contentDescription = location.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .size(70.dp)
                        .clip(CircleShape)
                )
            } else {
                Surface(
                    modifier = Modifier.size(70.dp),
                    shape = CircleShape,
                    color = if (location.hasOnlineBooking) Success else Accent
                ) {
                    Icon(
                        Icons.Default.LocalHospital,
                        contentDescription = null,
                        tint = TextPrimaryDark,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Name
            Text(
                text = location.name,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimaryDark,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Description
            Text(
                text = location.description,
                fontSize = 13.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Badge
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = if (location.hasOnlineBooking)
                    Success.copy(alpha = 0.2f)
                else
                    Warning.copy(alpha = 0.2f)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        if (location.hasOnlineBooking) Icons.Default.CalendarMonth else Icons.Default.Schedule,
                        contentDescription = null,
                        tint = if (location.hasOnlineBooking) Success else Warning,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (location.hasOnlineBooking) "Booking Online Tersedia" else "Lihat Jadwal Saja",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (location.hasOnlineBooking) Success else Warning
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Button
            Button(
                onClick = onClick,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (location.hasOnlineBooking) Success else Accent
                )
            ) {
                Icon(
                    if (location.hasOnlineBooking) Icons.Default.Add else Icons.Default.Event,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    if (location.hasOnlineBooking) "Buat Janji Konsultasi" else "Lihat Jadwal Praktik",
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
fun ScheduleDetailContent(
    location: PracticeLocation,
    schedules: List<com.dokterdibya.patient.data.api.PracticeSchedule>,
    isLoading: Boolean,
    error: String?,
    viewModel: ScheduleViewModel,
    onWhatsAppClick: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Info card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Accent.copy(alpha = 0.15f))
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        "Untuk lokasi ini, Anda tidak dapat melakukan booking online. Silakan datang langsung sesuai jadwal praktik.",
                        color = TextPrimaryDark,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // Schedule header
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 8.dp)
            ) {
                Icon(
                    Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint = Accent,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Jadwal Praktik",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimaryDark
                )
            }
        }

        // Content
        if (isLoading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Accent)
                }
            }
        } else if (error != null) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
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
                            "Gagal memuat jadwal",
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        } else if (schedules.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.EventBusy,
                            contentDescription = null,
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Belum ada jadwal praktik yang ditetapkan",
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        } else {
            items(schedules) { schedule ->
                ScheduleRow(
                    dayName = viewModel.getDayName(schedule.day_of_week),
                    startTime = viewModel.formatTime(schedule.start_time),
                    endTime = viewModel.formatTime(schedule.end_time),
                    notes = schedule.notes
                )
            }
        }

        // WhatsApp button for RSIA Melinda
        if (location.id == "rsia_melinda") {
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Divider(color = TextSecondaryDark.copy(alpha = 0.3f))
                Spacer(modifier = Modifier.height(16.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Butuh informasi lebih lanjut atau ingin membuat janji?",
                        color = TextSecondaryDark,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onWhatsAppClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Success),
                        shape = RoundedCornerShape(25.dp)
                    ) {
                        Icon(
                            Icons.Default.Chat,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Hubungi via WhatsApp", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
fun ScheduleRow(
    dayName: String,
    startTime: String,
    endTime: String,
    notes: String?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Day name
            Text(
                text = dayName,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = Accent,
                modifier = Modifier.width(80.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            // Time
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        tint = Success,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "$startTime - $endTime",
                        fontSize = 15.sp,
                        color = TextPrimaryDark
                    )
                }
                if (notes != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = notes,
                        fontSize = 12.sp,
                        color = TextSecondaryDark
                    )
                }
            }
        }
    }
}
