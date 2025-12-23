package com.dokterdibya.patient.ui.screens.journeybook

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JourneyBookScreen(
    onBack: () -> Unit
) {
    // Book page images
    val bookImages = listOf(
        "1.png", "2.png", "6.png", "7.png", "8.png", "9.png",
        "10.png", "11.png", "12.png", "13.png", "14.png", "15.png",
        "16.png", "17.png", "37.png", "38.png"
    )

    var currentPage by remember { mutableIntStateOf(0) }
    val totalPages = bookImages.size

    // Base URL for book images
    val baseUrl = "https://dokterdibya.com/images/dokter-dibya-book/"

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BgDark, BgDarkEnd, BgDark)
                )
            )
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top bar
            TopAppBar(
                title = {
                    Text(
                        "Perjalanan menjadi Ibu",
                        color = TextPrimaryDark,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Kembali",
                            tint = TextPrimaryDark
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )

            // Subtitle
            Text(
                text = "Jelajahi momen indah dalam perjalanan kehamilan Anda",
                fontSize = 14.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Book viewer
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .pointerInput(Unit) {
                        detectHorizontalDragGestures { _, dragAmount ->
                            when {
                                dragAmount < -50 && currentPage < totalPages - 1 -> {
                                    currentPage++
                                }
                                dragAmount > 50 && currentPage > 0 -> {
                                    currentPage--
                                }
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                // Book page with shadow
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(0.7f),
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        // Page image
                        AnimatedContent(
                            targetState = currentPage,
                            transitionSpec = {
                                if (targetState > initialState) {
                                    slideInHorizontally { width -> width } + fadeIn() togetherWith
                                            slideOutHorizontally { width -> -width } + fadeOut()
                                } else {
                                    slideInHorizontally { width -> -width } + fadeIn() togetherWith
                                            slideOutHorizontally { width -> width } + fadeOut()
                                }
                            },
                            label = "pageAnimation"
                        ) { page ->
                            AsyncImage(
                                model = baseUrl + bookImages[page],
                                contentDescription = "Halaman ${page + 1}",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Fit
                            )
                        }

                        // Page number
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(16.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color.Black.copy(alpha = 0.5f))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "${currentPage + 1}",
                                fontSize = 12.sp,
                                color = Color.White,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        // Tap areas for navigation
                        Row(modifier = Modifier.fillMaxSize()) {
                            // Left tap area (previous)
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable(enabled = currentPage > 0) {
                                        if (currentPage > 0) currentPage--
                                    }
                            )
                            // Right tap area (next)
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable(enabled = currentPage < totalPages - 1) {
                                        if (currentPage < totalPages - 1) currentPage++
                                    }
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Navigation controls
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Previous button
                Button(
                    onClick = { if (currentPage > 0) currentPage-- },
                    enabled = currentPage > 0,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = WebCardBg,
                        disabledContainerColor = WebCardBg.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Icon(
                        Icons.Default.ChevronLeft,
                        contentDescription = null,
                        tint = if (currentPage > 0) Color.White else Color.White.copy(alpha = 0.3f)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Sebelumnya",
                        color = if (currentPage > 0) Color.White else Color.White.copy(alpha = 0.3f),
                        fontSize = 14.sp
                    )
                }

                // Page indicator
                Surface(
                    color = WebCardBg,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "${currentPage + 1} / $totalPages",
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Next button
                Button(
                    onClick = { if (currentPage < totalPages - 1) currentPage++ },
                    enabled = currentPage < totalPages - 1,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = WebAccent,
                        disabledContainerColor = WebAccent.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Text(
                        "Selanjutnya",
                        color = if (currentPage < totalPages - 1) Color.White else Color.White.copy(alpha = 0.3f),
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = if (currentPage < totalPages - 1) Color.White else Color.White.copy(alpha = 0.3f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
