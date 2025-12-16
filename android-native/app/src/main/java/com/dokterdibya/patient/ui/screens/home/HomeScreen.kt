package com.dokterdibya.patient.ui.screens.home

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.R
import com.dokterdibya.patient.ui.components.SlideMenu
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    onNavigateToFertility: () -> Unit,
    onNavigateToBooking: () -> Unit,
    onNavigateToUsg: () -> Unit,
    onNavigateToDocuments: () -> Unit,
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
                    // Logo placeholder
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color.White),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "dD",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Primary
                        )
                    }
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

            // Pregnancy Card (if pregnant)
            if (uiState.isPregnant) {
                PregnancyCard(
                    weeks = uiState.pregnancyWeeks,
                    days = uiState.pregnancyDays,
                    progress = uiState.pregnancyProgress,
                    dueDate = uiState.dueDate
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

            Spacer(modifier = Modifier.height(100.dp))
        }

        // Slide Menu
        SlideMenu(
            isOpen = isMenuOpen,
            onClose = { isMenuOpen = false },
            onNavigateToBooking = onNavigateToBooking,
            onNavigateToUsg = onNavigateToUsg,
            onNavigateToFertility = onNavigateToFertility,
            onLogout = {
                viewModel.logout()
                onLogout()
            }
        )

        // Swipe edge for opening menu
        Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .width(25.dp)
                .fillMaxHeight()
                .clickable { isMenuOpen = true }
        )
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
