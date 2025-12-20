package com.dokterdibya.patient.ui.screens.home

import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.ui.components.SlideMenu
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.BirthInfo
import com.dokterdibya.patient.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    onNavigateToFertility: () -> Unit,
    onNavigateToBooking: () -> Unit,
    onNavigateToUsg: () -> Unit,
    onNavigateToDocuments: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToArticles: () -> Unit,
    onNavigateToSchedule: () -> Unit,
    onNavigateToVisitHistory: () -> Unit,
    onNavigateToMedications: () -> Unit = {},
    onLogout: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var isMenuOpen by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
    ) {
        // Main content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Logo
                    Image(
                        painter = painterResource(id = R.mipmap.ic_launcher),
                        contentDescription = "Dokter Dibya Logo",
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp)),
                        contentScale = ContentScale.Crop
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = buildAnnotatedString {
                            withStyle(SpanStyle(color = Accent)) {
                                append("dokter")
                            }
                            withStyle(SpanStyle(color = Purple)) {
                                append("DIBYA")
                            }
                        },
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Welcome Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color.Transparent
                )
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    Accent.copy(alpha = 0.2f),
                                    Purple.copy(alpha = 0.2f)
                                )
                            )
                        )
                        .padding(20.dp)
                ) {
                    Column {
                        Text(
                            text = "Selamat Datang,",
                            fontSize = 16.sp,
                            color = TextPrimaryDark
                        )
                        Text(
                            text = uiState.patientName ?: "Ibu",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Accent
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Birth Congratulations Card (if has given birth)
            if (uiState.hasGivenBirth && uiState.birthInfo != null) {
                BirthCongratulationsCard(birthInfo = uiState.birthInfo!!)
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Pregnancy Card (if pregnant and not given birth)
            if (uiState.isPregnant && !uiState.hasGivenBirth) {
                PregnancyCard(
                    weeks = uiState.pregnancyWeeks,
                    days = uiState.pregnancyDays,
                    progress = uiState.pregnancyProgress,
                    dueDate = uiState.dueDate
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Announcements Section
            if (uiState.announcements.isNotEmpty()) {
                AnnouncementsSection(
                    announcements = uiState.announcements,
                    onLike = { viewModel.toggleLike(it) }
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Quick Menu
            Text(
                text = "Menu Cepat",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimaryDark
            )
            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.CalendarMonth,
                    title = "Booking",
                    subtitle = "Pesan jadwal",
                    iconColor = Accent,
                    onClick = onNavigateToBooking
                )
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.ChildCare,
                    title = "Hasil USG",
                    subtitle = "${uiState.usgCount} foto",
                    iconColor = Purple,
                    onClick = onNavigateToUsg
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Favorite,
                    title = "Kesuburan",
                    subtitle = "Kalender",
                    iconColor = Fertility,
                    onClick = onNavigateToFertility
                )
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Description,
                    title = "Dokumen",
                    subtitle = "Invoice, dll",
                    iconColor = Success,
                    onClick = onNavigateToDocuments
                )
            }

            // Medications Section (if any)
            if (uiState.hasMedications) {
                Spacer(modifier = Modifier.height(16.dp))
                MedicationsSection(
                    medications = uiState.medications,
                    onViewAll = onNavigateToMedications
                )
            }

            Spacer(modifier = Modifier.height(100.dp))
        }

        // Menu button (visible indicator)
        if (!isMenuOpen) {
            FloatingActionButton(
                onClick = { isMenuOpen = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
                containerColor = CardDark,
                contentColor = Accent
            ) {
                Icon(
                    imageVector = Icons.Default.Menu,
                    contentDescription = "Menu"
                )
            }
        }

        // Slide Menu
        SlideMenu(
            isOpen = isMenuOpen,
            onClose = { isMenuOpen = false },
            onNavigateToBooking = onNavigateToBooking,
            onNavigateToUsg = onNavigateToUsg,
            onNavigateToFertility = onNavigateToFertility,
            onNavigateToDocuments = onNavigateToDocuments,
            onNavigateToProfile = onNavigateToProfile,
            onNavigateToArticles = onNavigateToArticles,
            onNavigateToSchedule = onNavigateToSchedule,
            onNavigateToVisitHistory = onNavigateToVisitHistory,
            onLogout = {
                viewModel.logout()
                onLogout()
            }
        )
    }
}

@Composable
fun BirthCongratulationsCard(birthInfo: BirthInfo) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Purple.copy(alpha = 0.15f),
                            Fertility.copy(alpha = 0.15f)
                        )
                    )
                )
                .padding(20.dp)
        ) {
            Column {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = null,
                        tint = Purple,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Selamat atas Kelahiran Buah Hati!",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Purple
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Baby Photo
                    if (birthInfo.babyPhotoUrl != null) {
                        AsyncImage(
                            model = birthInfo.babyPhotoUrl,
                            contentDescription = "Foto Bayi",
                            modifier = Modifier
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp)),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Purple.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.ChildCare,
                                contentDescription = null,
                                tint = Purple,
                                modifier = Modifier.size(48.dp)
                            )
                        }
                    }

                    // Baby Details
                    Column(modifier = Modifier.weight(1f)) {
                        if (birthInfo.babyName.isNotEmpty()) {
                            Text(
                                text = birthInfo.babyName,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = Purple
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        BirthDetailRow(label = "Tanggal", value = birthInfo.birthDate)
                        if (birthInfo.birthTime.isNotEmpty()) {
                            BirthDetailRow(label = "Jam", value = birthInfo.birthTime)
                        }
                        if (birthInfo.babyWeight.isNotEmpty()) {
                            BirthDetailRow(label = "Berat", value = birthInfo.babyWeight)
                        }
                        if (birthInfo.babyLength.isNotEmpty()) {
                            BirthDetailRow(label = "Panjang", value = birthInfo.babyLength)
                        }
                    }
                }

                // Doctor Message
                if (!birthInfo.doctorMessage.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = CardDark.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "Pesan dari Dokter",
                                fontSize = 11.sp,
                                color = Purple,
                                fontWeight = FontWeight.Medium
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = birthInfo.doctorMessage,
                                fontSize = 13.sp,
                                color = TextPrimaryDark,
                                fontStyle = FontStyle.Italic
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BirthDetailRow(label: String, value: String) {
    Row(modifier = Modifier.padding(vertical = 2.dp)) {
        Text(
            text = "$label: ",
            fontSize = 12.sp,
            color = TextSecondaryDark
        )
        Text(
            text = value,
            fontSize = 12.sp,
            color = TextPrimaryDark,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun AnnouncementsSection(
    announcements: List<Announcement>,
    onLike: (Int) -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Campaign,
                    contentDescription = null,
                    tint = Warning,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Pengumuman",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        announcements.take(3).forEach { announcement ->
            AnnouncementCard(
                announcement = announcement,
                onLike = { onLike(announcement.id) }
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
fun AnnouncementCard(
    announcement: Announcement,
    onLike: () -> Unit
) {
    val priorityColor = when (announcement.priority) {
        "urgent" -> Danger
        "important" -> Warning
        else -> Accent
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    // Priority badge
                    if (announcement.priority == "urgent" || announcement.priority == "important") {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = priorityColor.copy(alpha = 0.2f),
                            modifier = Modifier.padding(bottom = 6.dp)
                        ) {
                            Text(
                                text = if (announcement.priority == "urgent") "PENTING" else "INFO",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = priorityColor,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    Text(
                        text = announcement.title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimaryDark
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = announcement.message,
                fontSize = 13.sp,
                color = TextSecondaryDark,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )

            // Image if available
            if (!announcement.image_url.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                AsyncImage(
                    model = announcement.image_url,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Author and date
                Text(
                    text = announcement.created_by_name ?: "",
                    fontSize = 11.sp,
                    color = TextSecondaryDark.copy(alpha = 0.7f)
                )

                // Like button
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onLike() }
                ) {
                    Icon(
                        imageVector = if (announcement.liked_by_me) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = "Like",
                        tint = if (announcement.liked_by_me) Danger else TextSecondaryDark,
                        modifier = Modifier.size(18.dp)
                    )
                    if (announcement.like_count > 0) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = announcement.like_count.toString(),
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MedicationsSection(
    medications: List<Medication>,
    onViewAll: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Medication,
                    contentDescription = null,
                    tint = Success,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Jadwal Vitamin",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = CardDark)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                medications.take(3).forEachIndexed { index, medication ->
                    if (index > 0) {
                        HorizontalDivider(
                            color = BgDark,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                    MedicationItem(medication = medication)
                }

                if (medications.size > 3) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = onViewAll,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Lihat Semua (${medications.size})",
                            color = Accent
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MedicationItem(medication: Medication) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    if (medication.is_current == 1) Success.copy(alpha = 0.2f)
                    else TextSecondaryDark.copy(alpha = 0.2f)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Medication,
                contentDescription = null,
                tint = if (medication.is_current == 1) Success else TextSecondaryDark,
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = medication.terapi ?: "Terapi",
                fontSize = 13.sp,
                color = TextPrimaryDark,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = medication.visit_date ?: "",
                fontSize = 11.sp,
                color = TextSecondaryDark
            )
        }

        if (medication.is_current == 1) {
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = Success.copy(alpha = 0.2f)
            ) {
                Text(
                    text = "Aktif",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = Success,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}

@Composable
fun PregnancyCard(
    weeks: Int,
    days: Int,
    progress: Float,
    dueDate: String?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Transparent
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Purple.copy(alpha = 0.1f),
                            Fertility.copy(alpha = 0.1f)
                        )
                    )
                )
                .padding(18.dp)
        ) {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.ChildCare,
                        contentDescription = null,
                        tint = Purple,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Usia Kehamilan",
                        fontSize = 13.sp,
                        color = Purple
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(
                            brush = Brush.linearGradient(
                                colors = listOf(Purple, Fertility)
                            )
                        )) {
                            append("$weeks Minggu $days Hari")
                        }
                    },
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Progress bar
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(Color.White.copy(alpha = 0.1f))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(progress)
                            .clip(RoundedCornerShape(5.dp))
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(Purple, Fertility)
                                )
                            )
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = "HPL: ${dueDate ?: "-"}",
                    fontSize = 12.sp,
                    color = TextSecondaryDark
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickMenuItem(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    title: String,
    subtitle: String,
    iconColor: Color,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardDark
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(iconColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimaryDark
                )
                Text(
                    text = subtitle,
                    fontSize = 10.sp,
                    color = TextSecondaryDark
                )
            }
        }
    }
}
