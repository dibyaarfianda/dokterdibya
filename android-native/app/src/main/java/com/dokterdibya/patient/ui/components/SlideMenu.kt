package com.dokterdibya.patient.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.dokterdibya.patient.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun SlideMenu(
    isOpen: Boolean,
    onClose: () -> Unit,
    onNavigateToBooking: () -> Unit,
    onNavigateToUsg: () -> Unit,
    onNavigateToFertility: () -> Unit,
    onNavigateToDocuments: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToArticles: () -> Unit,
    onNavigateToSchedule: () -> Unit,
    onNavigateToVisitHistory: () -> Unit,
    onLogout: () -> Unit
) {
    val menuItems = listOf(
        MenuItem(Icons.Default.CalendarMonth, "Booking", Accent) { onNavigateToBooking(); onClose() },
        MenuItem(Icons.Default.Schedule, "Jadwal", Info) { onNavigateToSchedule(); onClose() },
        MenuItem(Icons.Default.ChildCare, "USG", Purple) { onNavigateToUsg(); onClose() },
        MenuItem(Icons.Default.Favorite, "Kesuburan", Fertility) { onNavigateToFertility(); onClose() },
        MenuItem(Icons.Default.History, "Riwayat", Warning) { onNavigateToVisitHistory(); onClose() },
        MenuItem(Icons.Default.Description, "Dokumen", Success) { onNavigateToDocuments(); onClose() },
        MenuItem(Icons.Default.Article, "Artikel", Accent) { onNavigateToArticles(); onClose() },
        MenuItem(Icons.Default.Person, "Profil", Purple) { onNavigateToProfile(); onClose() },
        MenuItem(Icons.Default.Logout, "Keluar", Danger, isLogout = true) { onLogout() }
    )

    // Overlay and menu container
    if (isOpen) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(OverlayDark)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose
                )
                .pointerInput(Unit) {
                    detectHorizontalDragGestures { _, dragAmount ->
                        if (dragAmount > 50) {
                            onClose()
                        }
                    }
                }
        )
    }

    // Menu items container
    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // Menu items column (right side)
        AnimatedVisibility(
            visible = isOpen,
            enter = slideInHorizontally(
                initialOffsetX = { it },
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow
                )
            ),
            exit = slideOutHorizontally(
                targetOffsetX = { it },
                animationSpec = tween(200)
            ),
            modifier = Modifier.align(Alignment.CenterEnd)
        ) {
            Column(
                modifier = Modifier
                    .padding(end = 15.dp)
                    .width(80.dp)
                    .heightIn(max = 360.dp)  // Show ~5 items
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                menuItems.forEachIndexed { index, item ->
                    AnimatedMenuItem(
                        item = item,
                        index = index,
                        isVisible = isOpen
                    )
                }
            }
        }
    }
}

@Composable
fun AnimatedMenuItem(
    item: MenuItem,
    index: Int,
    isVisible: Boolean
) {
    var visible by remember { mutableStateOf(false) }

    LaunchedEffect(isVisible) {
        if (isVisible) {
            delay(30L + (index * 40L)) // Staggered animation
            visible = true
        } else {
            delay(((8 - index) * 30L).coerceAtLeast(0L)) // Reverse stagger
            visible = false
        }
    }

    AnimatedVisibility(
        visible = visible && isVisible,
        enter = slideInHorizontally(
            initialOffsetX = { 30 },
            animationSpec = spring(
                dampingRatio = 0.6f,
                stiffness = Spring.StiffnessMediumLow
            )
        ) + fadeIn(animationSpec = tween(200)),
        exit = slideOutHorizontally(
            targetOffsetX = { 25 },
            animationSpec = tween(150)
        ) + fadeOut(animationSpec = tween(100))
    ) {
        MenuItemButton(item = item)
    }
}

@Composable
fun MenuItemButton(item: MenuItem) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    // Faster, snappier scale animation
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.92f else 1f,
        animationSpec = tween(durationMillis = 50),
        label = "scale"
    )

    Box(
        modifier = Modifier
            .size(58.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (item.isLogout) {
                    Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF3C1E23).copy(alpha = 0.9f),
                            Color(0xFF281419).copy(alpha = 0.95f)
                        )
                    )
                } else {
                    Brush.linearGradient(
                        colors = listOf(
                            GlassDark,
                            Color(0xFF191C2D).copy(alpha = 0.95f)
                        )
                    )
                }
            )
            .clickable(
                interactionSource = interactionSource,
                indication = rememberRipple(bounded = true, color = item.color.copy(alpha = 0.3f)),
                onClick = item.onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = item.color,
            modifier = Modifier.size(26.dp)
        )
    }
}

data class MenuItem(
    val icon: ImageVector,
    val label: String,
    val color: Color,
    val isLogout: Boolean = false,
    val onClick: () -> Unit
)
