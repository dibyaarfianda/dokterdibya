package com.dokterdibya.patient.ui.screens.home

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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import coil.compose.AsyncImage
import com.dokterdibya.patient.R
import com.dokterdibya.patient.ui.components.SlideMenu
import com.dokterdibya.patient.ui.screens.home.components.cards.*
import com.dokterdibya.patient.ui.screens.home.components.sections.*
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.HomeViewModel
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.haze
import dev.chrisbanes.haze.hazeChild

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
    onNavigateToPatientIntake: () -> Unit = {},
    onNavigateToLabResults: () -> Unit = {},
    onNavigateToHealth: () -> Unit = {},
    onNavigateToRecords: () -> Unit = {},
    onLogout: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var isMenuOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Track scroll state for nav bar appearance
    val scrollState = rememberScrollState()
    val hazeState = remember { HazeState() }

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

    // Static floating bubble (no animation for performance with Haze)
    @Composable
    fun StaticBubble(
        size: Float,
        x: Float,
        y: Float
    ) {
        Box(
            modifier = Modifier
                .offset(x = x.dp, y = y.dp)
                .size(size.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.08f))
        )
    }

    // Static gradient background (no animation for smooth Haze blur)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BgDark, BgDarkEnd, BgDark),
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(1200f, 2000f)
                )
            )
            // Static subtle color overlays
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        WebAccent.copy(alpha = 0.05f),
                        Color.Transparent
                    ),
                    center = androidx.compose.ui.geometry.Offset(x = 500f, y = 500f),
                    radius = 800f
                )
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Purple.copy(alpha = 0.03f),
                        Color.Transparent
                    ),
                    center = androidx.compose.ui.geometry.Offset(x = 600f, y = 1000f),
                    radius = 600f
                )
            )
    ) {
        // Static bubbles (frozen for performance with Haze blur)
        StaticBubble(size = 80f, x = 20f, y = 100f)
        StaticBubble(size = 60f, x = 280f, y = 200f)
        StaticBubble(size = 100f, x = 150f, y = 400f)
        StaticBubble(size = 40f, x = 320f, y = 600f)
        StaticBubble(size = 70f, x = 50f, y = 700f)
        StaticBubble(size = 55f, x = 250f, y = 850f)

        // Sticky Top Navigation Bar with real blur effect
        TopNavigationBar(
            hazeState = hazeState,
            patient = uiState.patient,
            patientName = uiState.patientName,
            unreadNotificationCount = uiState.unreadNotificationCount,
            onNavigateToNotifications = onNavigateToNotifications,
            onNavigateToProfile = onNavigateToProfile
        )

        // Main content (scrollable) - haze enables blur effect on nav bar
        Column(
            modifier = Modifier
                .fillMaxSize()
                .haze(state = hazeState)
                .verticalScroll(scrollState)
                .padding(top = 64.dp, start = 16.dp, end = 16.dp, bottom = 16.dp)
        ) {
            // Welcome Card (website-style glassmorphism)
            WelcomeCard(patientName = uiState.patientName)

            Spacer(modifier = Modifier.height(16.dp))

            // Welcome Message Card (Selamat Datang - expandable)
            WelcomeMessageCard()

            Spacer(modifier = Modifier.height(16.dp))

            // Profile Identity Card
            ProfileIdentityCard(onEditIntake = onNavigateToPatientIntake)

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
            onNavigateToLabResults = onNavigateToLabResults,
            onNavigateToHealth = onNavigateToHealth,
            onNavigateToRecords = onNavigateToRecords,
            onLogout = {
                viewModel.logout()
                onLogout()
            }
        )
    }
}

@Composable
private fun TopNavigationBar(
    hazeState: HazeState,
    patient: com.dokterdibya.patient.data.model.Patient?,
    patientName: String?,
    unreadNotificationCount: Int,
    onNavigateToNotifications: () -> Unit,
    onNavigateToProfile: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .zIndex(10f)
            .hazeChild(state = hazeState)
            .background(Color.White.copy(alpha = 0.15f))
    ) {
        // Nav bar content
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
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
                Column(verticalArrangement = Arrangement.spacedBy((-2).dp)) {
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
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = 16.sp
                    )
                    Text(
                        text = "Portal Privat Kandungan Anda",
                        fontSize = 9.sp,
                        color = TextSecondaryDark,
                        letterSpacing = 0.3.sp,
                        lineHeight = 9.sp
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
                    if (unreadNotificationCount > 0) {
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
                                text = if (unreadNotificationCount > 99) "99+" else unreadNotificationCount.toString(),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }

                // Profile photo
                val photoUrl = patient?.photoUrl ?: patient?.profilePicture
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
                        text = patientName?.split(" ")?.firstOrNull() ?: "Ibu",
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
}

@Composable
private fun WelcomeCard(patientName: String?) {
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
                    contentDescription = "Selamat Datang",
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
                text = "Halo, ${patientName ?: "Ibu"}!",
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
}
