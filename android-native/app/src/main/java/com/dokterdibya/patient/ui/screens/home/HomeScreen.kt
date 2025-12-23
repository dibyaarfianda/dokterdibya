package com.dokterdibya.patient.ui.screens.home

import android.content.Intent
import android.net.Uri
import android.widget.TextView
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
import androidx.compose.ui.platform.LocalContext
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.zIndex
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import io.noties.markwon.Markwon
import io.noties.markwon.html.HtmlPlugin
import coil.compose.AsyncImage
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.data.api.BabySize
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
    onNavigateToNotifications: () -> Unit = {},
    onLogout: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var isMenuOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Refresh data when screen is resumed (e.g., after returning from profile)
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BgDark, BgDarkEnd),
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                )
            )
    ) {
        // Sticky Top Navigation Bar with semi-transparent background
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(70.dp)
                .zIndex(10f)
                .background(BgDark.copy(alpha = 0.9f))
        ) {
            // Nav bar content
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(70.dp)
                    .padding(start = 8.dp, end = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left: Logo and brand name with tagline
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AsyncImage(
                        model = "https://dokterdibya.com/staff/images/db-white.svg",
                        contentDescription = "Dokter Dibya Logo",
                        modifier = Modifier
                            .height(32.dp)
                            .widthIn(max = 100.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Column {
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(color = Color.White)) {
                                    append("dokter")
                                }
                                withStyle(SpanStyle(color = WebAccent)) {
                                    append("DIBYA")
                                }
                            },
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Portal Privat Kandungan Anda",
                            fontSize = 9.sp,
                            color = TextSecondaryDark,
                            letterSpacing = 0.3.sp
                        )
                    }
                }

                // Right: Notification icon + Profile photo + Name
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Notification icon with badge
                    Box {
                        IconButton(onClick = onNavigateToNotifications) {
                            Icon(
                                imageVector = Icons.Outlined.Notifications,
                                contentDescription = "Notifikasi",
                                tint = Color.White,
                                modifier = Modifier.size(26.dp)
                            )
                        }
                        // Badge
                        if (uiState.unreadNotificationCount > 0) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = (-4).dp, y = 4.dp)
                                    .size(18.dp)
                                    .clip(CircleShape)
                                    .background(Danger),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (uiState.unreadNotificationCount > 99) "99+" else uiState.unreadNotificationCount.toString(),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }

                    // Profile photo
                    val photoUrl = uiState.patient?.photoUrl ?: uiState.patient?.profilePicture
                    val fullPhotoUrl = photoUrl?.let { url ->
                        if (url.startsWith("/api/")) "https://dokterdibya.com$url" else url
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable(onClick = onNavigateToProfile)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(CardDark),
                            contentAlignment = Alignment.Center
                        ) {
                            if (fullPhotoUrl != null) {
                                AsyncImage(
                                    model = fullPhotoUrl,
                                    contentDescription = "Foto Profil",
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                // Use custom profile icon
                                Icon(
                                    painter = painterResource(id = R.drawable.profil),
                                    contentDescription = "Profil",
                                    tint = WebAccent,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = uiState.patientName?.split(" ")?.firstOrNull() ?: "Ibu",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color.White,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }

        // Main content (scrollable)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(top = 78.dp, start = 16.dp, end = 16.dp, bottom = 16.dp)
        ) {
            // Welcome Card (website-style glassmorphism)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = WebCardBg),
                border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
            ) {
                Column(
                    modifier = Modifier.padding(25.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = WebAccent,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Selamat Datang",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = WebAccent
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Halo, ${uiState.patientName ?: "Ibu"}!",
                        fontSize = 16.sp,
                        color = TextPrimaryDark
                    )
                    Text(
                        text = "Selamat datang di portal privat kesehatan kandungan Anda.",
                        fontSize = 14.sp,
                        color = TextSecondaryDark
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Welcome Message Card (Selamat Datang - expandable)
            WelcomeMessageCard()

            Spacer(modifier = Modifier.height(16.dp))

            // Profile Identity Card
            ProfileIdentityCard(onEditProfile = onNavigateToProfile)

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
                    dueDate = uiState.dueDate,
                    trimester = uiState.trimester,
                    babySize = uiState.babySize,
                    tip = uiState.pregnancyTip
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

            // Journey Book Card (shown for all users like website)
            JourneyBookCard(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://dokterdibya.com/perjalanan-ibu.html"))
                    context.startActivity(intent)
                }
            )
            Spacer(modifier = Modifier.height(16.dp))

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
                    iconRes = R.drawable.book,
                    title = "Booking",
                    subtitle = "Pesan jadwal",
                    iconColor = WebAccent,
                    onClick = onNavigateToBooking
                )
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    iconRes = R.drawable.usg,
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
                    iconRes = R.drawable.subur,
                    title = "Kesuburan",
                    subtitle = "Kalender",
                    iconColor = Fertility,
                    onClick = onNavigateToFertility
                )
                QuickMenuItem(
                    modifier = Modifier.weight(1f),
                    iconRes = R.drawable.erm,
                    title = "Dokumen",
                    subtitle = "Invoice, dll",
                    iconColor = WebSuccess,
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
                containerColor = WebCardBg,
                contentColor = WebAccent
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
    var showAll by remember { mutableStateOf(false) }

    // Get priority announcement and most recent non-priority
    val priorityAnnouncement = announcements.find { it.priority == "important" || it.priority == "urgent" }
    val recentAnnouncements = announcements.filter { it.id != priorityAnnouncement?.id }

    // Initial 2: priority (if exists) + most recent
    val initialAnnouncements = buildList {
        priorityAnnouncement?.let { add(it) }
        recentAnnouncements.firstOrNull()?.let { add(it) }
    }.take(2)

    val remainingAnnouncements = announcements.filter { it !in initialAnnouncements }
    val displayedAnnouncements = if (showAll) announcements else initialAnnouncements

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

        displayedAnnouncements.forEach { announcement ->
            AnnouncementCard(
                announcement = announcement,
                onLike = { onLike(announcement.id) }
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Show expand/collapse button if there are more announcements
        if (remainingAnnouncements.isNotEmpty()) {
            TextButton(
                onClick = { showAll = !showAll },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (showAll) "Lihat Lebih Sedikit" else "Lihat ${remainingAnnouncements.size} Pengumuman Lainnya",
                    fontSize = 13.sp,
                    color = Accent
                )
                Spacer(modifier = Modifier.width(4.dp))
                Icon(
                    imageVector = if (showAll) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = Accent,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
fun AnnouncementCard(
    announcement: Announcement,
    onLike: () -> Unit
) {
    var isExpanded by remember { mutableStateOf(false) }

    val priorityColor = when (announcement.priority) {
        "urgent" -> Danger
        "important" -> Warning
        else -> Accent
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { isExpanded = !isExpanded },
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

            // Render markdown content
            MarkdownText(
                content = announcement.message,
                maxLines = if (isExpanded) Int.MAX_VALUE else 3,
                modifier = Modifier.fillMaxWidth()
            )

            // Show expand/collapse hint if text is long
            if (announcement.message.length > 100) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (isExpanded) "Lihat lebih sedikit" else "Lihat selengkapnya",
                    fontSize = 12.sp,
                    color = Accent,
                    fontWeight = FontWeight.Medium
                )
            }

            // Image if available
            if (!announcement.image_url.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                AsyncImage(
                    model = announcement.image_url,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (isExpanded) 200.dp else 120.dp)
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

                // Like button - use IconButton for proper touch handling
                IconButton(
                    onClick = onLike,
                    modifier = Modifier.size(36.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
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
                    painter = painterResource(id = R.drawable.vit),
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
                painter = painterResource(id = R.drawable.vit),
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
    dueDate: String?,
    trimester: Int = 0,
    babySize: BabySize? = null,
    tip: String? = null
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
                // Header with trimester badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
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
                    if (trimester > 0) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Purple.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = "Trimester $trimester",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                color = Purple,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
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

                // Baby Size Section
                if (babySize != null) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = CardDark.copy(alpha = 0.5f)
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = babySize.emoji,
                                fontSize = 32.sp
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Ukuran bayi Anda saat ini",
                                    fontSize = 11.sp,
                                    color = TextSecondaryDark
                                )
                                Text(
                                    text = "Sebesar ${babySize.size}",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Fertility
                                )
                                Text(
                                    text = "Panjang: ${babySize.length}",
                                    fontSize = 11.sp,
                                    color = TextSecondaryDark
                                )
                            }
                        }
                    }
                }

                // Tip Section
                if (!tip.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lightbulb,
                            contentDescription = null,
                            tint = Warning,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = tip,
                            fontSize = 12.sp,
                            color = TextSecondaryDark,
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickMenuItem(
    modifier: Modifier = Modifier,
    iconRes: Int,
    title: String,
    subtitle: String,
    iconColor: Color,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = modifier.height(90.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(iconColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = iconRes),
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column {
                Text(
                    text = title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = TextSecondaryDark
                )
            }
        }
    }
}

@Composable
fun WelcomeMessageCard() {
    var isExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { isExpanded = !isExpanded },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Tentang Portal Ini",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = WebAccent
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Tutup" else "Buka",
                    tint = TextSecondaryDark
                )
            }

            if (isExpanded) {
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Halaman ini adalah ruang khusus bagi Anda — tempat saya membantu Anda, memantau kehamilan atau kesehatan kandungan Anda secara berkala dan privat. Semua catatan dan informasi di sini bersifat rahasia.",
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = buildAnnotatedString {
                        append("Adanya ")
                        withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.SemiBold)) {
                            append("dokter")
                        }
                        withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                            append("DIBYA")
                        }
                        append(" berawal dari keinginan ")
                        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                            append("sederhana")
                        }
                        append(" saya, yaitu agar setiap pasien bisa tetap terhubung dengan dokter pilihannya, tanpa batasan rumah sakit, tempat, atau waktu.")
                    },
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Terima kasih telah menjadi bagian dari \"modern therapy without boundary\" — pendampingan dan terapi berkelanjutan, di mana pun dan kapan pun Anda membutuhkannya.",
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Salam hangat,\ndokter Anda",
                    fontSize = 14.sp,
                    color = Accent,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun JourneyBookCard(onClick: () -> Unit) {
    val GoldColor = Color(0xFFD4AF37)
    val GoldBorder = Color(0x4DD4AF37)  // Gold with 30% opacity

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        border = androidx.compose.foundation.BorderStroke(1.dp, GoldBorder)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF1a1a2e),
                            Color(0xFF16213e),
                            Color(0xFF0f3460)
                        )
                    )
                )
        ) {
            // Gold corner accents (top-left)
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (top-right)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.align(Alignment.TopEnd).fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (bottom-left)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (bottom-right)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.align(Alignment.BottomEnd).fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.align(Alignment.BottomEnd).fillMaxHeight().width(2.dp).background(GoldColor))
            }

            // Content
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(25.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Book thumbnail with gold border
                Card(
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(2.dp, GoldBorder),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    AsyncImage(
                        model = "https://dokterdibya.com/images/dokter-dibya-book/thumb-book.jpeg",
                        contentDescription = "Book Cover",
                        modifier = Modifier
                            .width(100.dp)
                            .height(140.dp),
                        contentScale = ContentScale.Crop
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Perjalanan menjadi Ibu",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Normal,
                        color = Color(0xFFF5F5F5),
                        fontStyle = FontStyle.Italic,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(5.dp))
                    Text(
                        text = buildAnnotatedString {
                            append("by ")
                            withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.SemiBold)) {
                                append("dokter")
                            }
                            withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                                append("DIBYA")
                            }
                        },
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic,
                        color = Color(0xFFCCCCCC)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.TouchApp,
                            contentDescription = null,
                            tint = GoldColor,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(color = GoldColor, fontWeight = FontWeight.Bold)) {
                                    append("Klik untuk membuka")
                                }
                                append(" buku interaktif perjalanan kehamilan Anda")
                            },
                            fontSize = 13.sp,
                            color = Color(0xFFE0E0E0),
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileIdentityCard(onEditProfile: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onEditProfile),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(WebAccent.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.identitas),
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text(
                        text = "Identitas Pribadi",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimaryDark
                    )
                    Text(
                        text = "Lihat & Edit Data Anda",
                        fontSize = 12.sp,
                        color = TextSecondaryDark
                    )
                }
            }
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = "Edit",
                tint = WebAccent,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
fun MarkdownText(
    content: String,
    maxLines: Int = Int.MAX_VALUE,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val textColor = TextSecondaryDark.toArgb()
    val accentColor = Accent.toArgb()

    // Create Markwon instance with HTML support
    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(HtmlPlugin.create())
            .build()
    }

    // Normalize content: convert </br> to <br>, \n to actual newlines
    val normalizedContent = remember(content) {
        content
            .replace("</br>", "<br>")
            .replace("\\n", "\n")
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(textColor)
                setLinkTextColor(accentColor)
                textSize = 13f
                setLineSpacing(4f, 1f)
                this.maxLines = maxLines
                ellipsize = android.text.TextUtils.TruncateAt.END
                // Don't consume touch events - let parent handle clicks
                isClickable = false
                isFocusable = false
            }
        },
        update = { textView ->
            textView.maxLines = maxLines
            markwon.setMarkdown(textView, normalizedContent)
        }
    )
}
