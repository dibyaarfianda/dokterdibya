package com.dokterdibya.patient.ui.screens.journeybook

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ZoomIn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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

    // Zoom and pan state
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    // Swipe tracking for page navigation
    var accumulatedDragX by remember { mutableFloatStateOf(0f) }

    // Reset zoom when changing pages
    fun resetZoom() {
        scale = 1f
        offsetX = 0f
        offsetY = 0f
    }

    fun goToNextPage() {
        if (currentPage < totalPages - 1) {
            resetZoom()
            currentPage++
        }
    }

    fun goToPrevPage() {
        if (currentPage > 0) {
            resetZoom()
            currentPage--
        }
    }

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
                actions = {
                    // Zoom indicator
                    if (scale > 1f) {
                        Surface(
                            color = WebAccent.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(4.dp),
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Icon(
                                    Icons.Default.ZoomIn,
                                    contentDescription = null,
                                    tint = WebAccent,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    "${(scale * 100).toInt()}%",
                                    fontSize = 12.sp,
                                    color = WebAccent
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )

            // Subtitle with zoom hint
            Text(
                text = if (scale > 1f) "Cubit untuk zoom • Ketuk 2x untuk reset"
                       else "Cubit untuk zoom • Geser untuk pindah halaman",
                fontSize = 13.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Book viewer with zoom
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
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
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(currentPage, scale) {
                                detectTransformGestures(
                                    onGesture = { _, pan, zoom, _ ->
                                        // Handle zoom
                                        val newScale = (scale * zoom).coerceIn(1f, 4f)

                                        if (newScale > 1f || zoom != 1f) {
                                            // Zooming or already zoomed - handle zoom/pan
                                            scale = newScale

                                            if (scale > 1f) {
                                                // Calculate pan limits based on scale
                                                val maxOffsetX = (size.width * (scale - 1)) / 2
                                                val maxOffsetY = (size.height * (scale - 1)) / 2

                                                offsetX = (offsetX + pan.x).coerceIn(-maxOffsetX, maxOffsetX)
                                                offsetY = (offsetY + pan.y).coerceIn(-maxOffsetY, maxOffsetY)
                                            }
                                        } else {
                                            // Not zoomed and not zooming - track horizontal swipe for page change
                                            accumulatedDragX += pan.x

                                            // Swipe threshold (100 pixels)
                                            val swipeThreshold = 100f
                                            if (accumulatedDragX < -swipeThreshold) {
                                                // Swipe left -> next page
                                                accumulatedDragX = 0f
                                                goToNextPage()
                                            } else if (accumulatedDragX > swipeThreshold) {
                                                // Swipe right -> previous page
                                                accumulatedDragX = 0f
                                                goToPrevPage()
                                            }
                                        }

                                        // Reset to 1f if below threshold
                                        if (scale < 1f) {
                                            scale = 1f
                                            offsetX = 0f
                                            offsetY = 0f
                                        }
                                    }
                                )
                            }
                            .pointerInput(currentPage) {
                                detectTapGestures(
                                    onDoubleTap = { tapOffset ->
                                        if (scale > 1f) {
                                            // Reset zoom on double tap when zoomed
                                            resetZoom()
                                        } else {
                                            // Zoom in to 2.5x on double tap
                                            scale = 2.5f
                                            // Center zoom on tap position
                                            val centerX = size.width / 2
                                            val centerY = size.height / 2
                                            offsetX = (centerX - tapOffset.x) * (scale - 1) / scale
                                            offsetY = (centerY - tapOffset.y) * (scale - 1) / scale
                                        }
                                    },
                                    onTap = { tapOffset ->
                                        // Reset accumulated drag on tap
                                        accumulatedDragX = 0f

                                        // Only handle tap navigation when not zoomed
                                        if (scale <= 1f) {
                                            val width = size.width
                                            if (tapOffset.x < width / 3) {
                                                goToPrevPage()
                                            } else if (tapOffset.x > width * 2 / 3) {
                                                goToNextPage()
                                            }
                                        }
                                    }
                                )
                            }
                    ) {
                        // Page image with zoom transformation
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
                                modifier = Modifier
                                    .fillMaxSize()
                                    .graphicsLayer(
                                        scaleX = scale,
                                        scaleY = scale,
                                        translationX = offsetX,
                                        translationY = offsetY
                                    ),
                                contentScale = ContentScale.Fit
                            )
                        }

                        // Page number overlay (hidden when zoomed)
                        if (scale <= 1.2f) {
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
                        }

                        // Zoom hint overlay (shown briefly or when at 1x)
                        if (scale == 1f) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .padding(16.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color.Black.copy(alpha = 0.4f))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.ZoomIn,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "Cubit untuk zoom",
                                        fontSize = 10.sp,
                                        color = Color.White
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Navigation controls (only visible when not zoomed)
            AnimatedVisibility(
                visible = scale <= 1.2f,
                enter = fadeIn() + slideInVertically { it },
                exit = fadeOut() + slideOutVertically { it }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Previous button
                    Button(
                        onClick = { goToPrevPage() },
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
                        onClick = { goToNextPage() },
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
            }

            // Spacer when controls are hidden
            if (scale > 1.2f) {
                Spacer(modifier = Modifier.height(16.dp))
            } else {
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
