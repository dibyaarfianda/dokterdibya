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
import android.os.Build
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import io.noties.markwon.Markwon
import io.noties.markwon.html.HtmlPlugin
import coil.compose.AsyncImage
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.data.api.Article
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
    onNavigateToArticleDetail: (Int) -> Unit = {},
    onNavigateToJourneyBook: () -> Unit = {},
    onNavigateToWebView: (String, String) -> Unit = { _, _ -> },
    onNavigateToCompleteProfile: () -> Unit = {},
    onLogout: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var isMenuOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Track scroll state for nav bar appearance
    val scrollState = rememberScrollState()

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

    // Animated gradient background (like web PWA)
    val infiniteTransition = rememberInfiniteTransition(label = "bgGradient")

    // Primary animation for gradient movement
    val animatedOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 8000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "gradientOffset"
    )

    // Secondary animation for color shift
    val colorShift by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 12000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "colorShift"
    )

    // Interpolate gradient positions for smooth animation
    val startX = animatedOffset * 800f
    val startY = animatedOffset * 600f
    val endX = 1200f + (1f - animatedOffset) * 800f
    val endY = 2000f + (1f - animatedOffset) * 600f

    // Animate accent color glow
    val accentAlpha = 0.03f + (colorShift * 0.04f)
    val animatedAccent = WebAccent.copy(alpha = accentAlpha)
    val animatedPurple = Purple.copy(alpha = accentAlpha * 0.5f)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BgDark, BgDarkEnd, BgDark),
                    start = androidx.compose.ui.geometry.Offset(startX, startY),
                    end = androidx.compose.ui.geometry.Offset(endX, endY)
                )
            )
            // Add subtle color overlay that animates
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        animatedAccent,
                        Color.Transparent
                    ),
                    center = androidx.compose.ui.geometry.Offset(
                        x = 200f + (animatedOffset * 600f),
                        y = 300f + (colorShift * 400f)
                    ),
                    radius = 800f
                )
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        animatedPurple,
                        Color.Transparent
                    ),
                    center = androidx.compose.ui.geometry.Offset(
                        x = 800f - (animatedOffset * 400f),
                        y = 1200f - (colorShift * 300f)
                    ),
                    radius = 600f
                )
            )
    ) {
        // Sticky Top Navigation Bar with frosted glass effect
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(70.dp)
                .zIndex(10f)
                .background(
                    // Dark frosted glass background matching app theme
                    Brush.verticalGradient(
                        colors = listOf(
                            BgDark.copy(alpha = 0.95f),
                            BgDark.copy(alpha = 0.85f)
                        )
                    )
                )
        ) {
            // Bottom border (subtle glow line)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color.Transparent,
                                WebAccent.copy(alpha = 0.3f),
                                WebAccent.copy(alpha = 0.5f),
                                WebAccent.copy(alpha = 0.3f),
                                Color.Transparent
                            )
                        )
                    )
            )
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
                .verticalScroll(scrollState)
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
            ProfileIdentityCard(onEditIntake = onNavigateToCompleteProfile)

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
                onClick = onNavigateToJourneyBook
            )
            Spacer(modifier = Modifier.height(16.dp))

            // Klinik Privat Minggu Card (Upcoming Appointments)
            KlinikPrivatMingguCard(
                onBookAppointment = onNavigateToBooking
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Jadwal dan Lokasi Card
            JadwalDanLokasiCard(
                onViewAllLocations = onNavigateToSchedule
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Kalender Kesuburan Card
            KalenderKesuburanCard(
                onClick = onNavigateToFertility
            )

            // Medications Section (if any)
            if (uiState.hasMedications) {
                Spacer(modifier = Modifier.height(16.dp))
                MedicationsSection(
                    medications = uiState.medications,
                    onViewAll = onNavigateToMedications
                )
            }

            // Ruang Membaca Section (Articles)
            if (uiState.articles.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                RuangMembacaSection(
                    articles = uiState.articles,
                    totalArticleCount = uiState.totalArticleCount,
                    onArticleClick = { article ->
                        // Open article in app using ArticleDetailScreen
                        onNavigateToArticleDetail(article.id)
                    },
                    onViewAll = onNavigateToArticles
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
    var isExpanded by remember { mutableStateOf(true) }
    var showAllAnnouncements by remember { mutableStateOf(false) }

    // Get priority announcement and most recent non-priority
    val priorityAnnouncement = announcements.find { it.priority == "important" || it.priority == "urgent" }
    val recentAnnouncements = announcements.filter { it.id != priorityAnnouncement?.id }

    // Initial 2: priority (if exists) + most recent
    val initialAnnouncements = buildList {
        priorityAnnouncement?.let { add(it) }
        recentAnnouncements.firstOrNull()?.let { add(it) }
    }.take(2)

    val displayedAnnouncements = if (showAllAnnouncements) announcements else initialAnnouncements
    val remainingCount = announcements.size - initialAnnouncements.size

    // Announcements container card (website style)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column {
            // Header row (clickable to expand/collapse)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.PushPin,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Pengumuman",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = WebAccent
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Tutup" else "Buka",
                    tint = WebAccent,
                    modifier = Modifier.size(24.dp)
                )
            }

            // Content (expandable)
            if (isExpanded) {
                Column(
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)
                ) {
                    displayedAnnouncements.forEachIndexed { index, announcement ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                        AnnouncementCard(
                            announcement = announcement,
                            onLike = { onLike(announcement.id) }
                        )
                    }

                    // "Lihat X Pengumuman Lainnya" button at BOTTOM (website style)
                    if (remainingCount > 0 && !showAllAnnouncements) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showAllAnnouncements = true },
                            color = WebAccent.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Lihat $remainingCount Pengumuman Lainnya",
                                    fontSize = 14.sp,
                                    color = WebAccent,
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Default.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = WebAccent,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }

                    // "Sembunyikan" button when showing all
                    if (showAllAnnouncements && announcements.size > 2) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showAllAnnouncements = false },
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Sembunyikan",
                                fontSize = 13.sp,
                                color = TextSecondaryDark,
                                fontWeight = FontWeight.Medium
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.KeyboardArrowUp,
                                contentDescription = null,
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AnnouncementCard(
    announcement: Announcement,
    onLike: () -> Unit
) {
    val isImportant = announcement.priority == "urgent" || announcement.priority == "important"
    val priorityColor = if (isImportant) Warning else WebAccent
    val priorityIcon = if (isImportant) Icons.Default.Warning else Icons.Default.Info

    // Inner card for each announcement
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark.copy(alpha = 0.6f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder.copy(alpha = 0.3f))
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Title row with icon and badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                // Priority icon
                Icon(
                    imageVector = priorityIcon,
                    contentDescription = null,
                    tint = priorityColor,
                    modifier = Modifier
                        .size(20.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))

                // Title
                Text(
                    text = announcement.title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    modifier = Modifier.weight(1f)
                )

                Spacer(modifier = Modifier.width(10.dp))

                // Badge
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = priorityColor
                ) {
                    Text(
                        text = if (isImportant) "PENTING" else "INFORMASI",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isImportant) Color.Black else Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Message content (full text, no truncation like website)
            MarkdownText(
                content = announcement.message,
                maxLines = Int.MAX_VALUE,
                modifier = Modifier.fillMaxWidth()
            )

            // Image if available
            if (!announcement.image_url.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(14.dp))
                AsyncImage(
                    model = announcement.image_url,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Author section (website style)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Author with icon
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = announcement.created_by_name ?: "Tim dokterDIBYA",
                        fontSize = 12.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Like count and date
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Like button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable(onClick = onLike)
                    ) {
                        Icon(
                            imageVector = if (announcement.liked_by_me) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = "Like",
                            tint = if (announcement.liked_by_me) Danger else TextSecondaryDark,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = announcement.like_count.toString(),
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }

                    // Date
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.CalendarToday,
                            contentDescription = null,
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = formatAnnouncementDate(announcement.created_at),
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        }
    }
}

// Helper function to format date
private fun formatAnnouncementDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return ""
    return try {
        val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale("id", "ID"))
        val outputFormat = java.text.SimpleDateFormat("dd MMMM yyyy", java.util.Locale("id", "ID"))
        val date = inputFormat.parse(dateString)
        date?.let { outputFormat.format(it) } ?: dateString.take(10)
    } catch (e: Exception) {
        dateString.take(10)
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
fun ProfileIdentityCard(onEditIntake: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            // Header row with icon and title
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.identitas),
                    contentDescription = null,
                    tint = WebAccent,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "IDENTITAS PRIBADI",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    letterSpacing = 0.5.sp
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Green button (like website)
            Button(
                onClick = onEditIntake,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Success
                ),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(vertical = 14.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Lihat & Edit Identitas Pribadi",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.White
                )
            }
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

// Ruang Membaca (Articles) Section - website style
@Composable
fun RuangMembacaSection(
    articles: List<Article>,
    totalArticleCount: Int = 0,
    onArticleClick: (Article) -> Unit,
    onViewAll: () -> Unit
) {
    var isExpanded by remember { mutableStateOf(true) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column {
            // Header row (clickable to expand/collapse)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.MenuBook,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Ruang Membaca",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = WebAccent
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Tutup" else "Buka",
                    tint = WebAccent,
                    modifier = Modifier.size(24.dp)
                )
            }

            // Content (expandable)
            if (isExpanded) {
                Column(
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)
                ) {
                    // Description
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = null,
                            tint = Warning,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = buildAnnotatedString {
                                append("Artikel pilihan dari ")
                                withStyle(SpanStyle(color = WebAccent, fontWeight = FontWeight.SemiBold)) {
                                    append("dokter")
                                }
                                withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                                    append("DIBYA")
                                }
                                append(" berdasarkan jurnal terkini")
                            },
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }

                    // Article cards
                    articles.forEachIndexed { index, article ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                        ArticleCard(
                            article = article,
                            onClick = { onArticleClick(article) }
                        )
                    }

                    // View all button (filled cyan button with count - website style)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = onViewAll,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = WebAccent),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (totalArticleCount > 0) "Lihat Semua Artikel ($totalArticleCount)" else "Lihat Semua Artikel",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ArticleCard(
    article: Article,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark.copy(alpha = 0.6f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Article image thumbnail
            Card(
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(width = 80.dp, height = 100.dp)
            ) {
                if (!article.imageUrl.isNullOrEmpty()) {
                    AsyncImage(
                        model = article.imageUrl,
                        contentDescription = article.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(WebAccent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Article,
                            contentDescription = null,
                            tint = WebAccent,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Article info
            Column(modifier = Modifier.weight(1f)) {
                // Category badge and date
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 6.dp)
                ) {
                    if (!article.category.isNullOrEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = WebAccent
                        ) {
                            Text(
                                text = article.category.uppercase(),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(
                        text = formatArticleDate(article.publishedAt ?: article.createdAt),
                        fontSize = 11.sp,
                        color = TextSecondaryDark
                    )
                }

                // Title
                Text(
                    text = article.title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Excerpt
                if (!article.excerpt.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = article.excerpt,
                        fontSize = 12.sp,
                        color = TextSecondaryDark,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    }
}

// Helper function to format article date
private fun formatArticleDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return ""
    return try {
        val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale("id", "ID"))
        val outputFormat = java.text.SimpleDateFormat("MMM yyyy", java.util.Locale("id", "ID"))
        val date = inputFormat.parse(dateString.take(10))
        date?.let { outputFormat.format(it) } ?: dateString.take(10)
    } catch (e: Exception) {
        dateString.take(10)
    }
}

// Klinik Privat Minggu Card (Upcoming Appointments) - website style
@Composable
fun KlinikPrivatMingguCard(
    onBookAppointment: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint = WebAccent,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Klinik Privat Minggu",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = WebAccent
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Empty state (website style)
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Calendar icon with empty state
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(WebAccent.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.EventBusy,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(32.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Belum ada janji temu yang akan datang",
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Book appointment button (website style)
                Button(
                    onClick = onBookAppointment,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = WebAccent),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Buat Janji Temu",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

// Jadwal dan Lokasi Card - website style
@Composable
fun JadwalDanLokasiCard(
    onViewAllLocations: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = WebAccent,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Jadwal dan Lokasi",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = WebAccent
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Location info card
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = CardDark.copy(alpha = 0.6f)),
                border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder.copy(alpha = 0.3f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Location icon
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(WebAccent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.MedicalServices,
                            contentDescription = null,
                            tint = WebAccent,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Klinik Privat",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimaryDark
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Jl. Balowerti 2 No. 59, Kediri",
                            fontSize = 12.sp,
                            color = TextSecondaryDark,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Schedule,
                                contentDescription = null,
                                tint = WebAccent,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Minggu, 07:00 - 12:00",
                                fontSize = 11.sp,
                                color = WebAccent,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // View all locations button
            OutlinedButton(
                onClick = onViewAllLocations,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = WebAccent),
                border = androidx.compose.foundation.BorderStroke(1.dp, WebAccent),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Lihat Semua Lokasi Praktek", fontSize = 14.sp)
                Spacer(modifier = Modifier.width(6.dp))
                Icon(
                    imageVector = Icons.Default.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

// Kalender Kesuburan Card - website style with pink/purple gradient
@Composable
fun KalenderKesuburanCard(
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Fertility.copy(alpha = 0.3f),
                            Purple.copy(alpha = 0.3f)
                        )
                    )
                )
                .padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    // Fertility icon
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Fertility.copy(alpha = 0.3f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.subur),
                            contentDescription = null,
                            tint = Fertility,
                            modifier = Modifier.size(28.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column {
                        Text(
                            text = "Kalender Kesuburan",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Fertility
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Pantau masa subur Anda",
                            fontSize = 13.sp,
                            color = TextSecondaryDark
                        )
                    }
                }

                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = "Buka",
                    tint = Fertility,
                    modifier = Modifier.size(28.dp)
                )
            }
        }
    }
}
