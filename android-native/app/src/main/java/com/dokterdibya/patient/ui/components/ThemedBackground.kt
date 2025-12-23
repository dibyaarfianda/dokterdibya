package com.dokterdibya.patient.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.dokterdibya.patient.ui.theme.*

/**
 * Floating bubble animation component
 */
@Composable
private fun FloatingBubble(
    size: Float,
    startX: Float,
    startY: Float,
    delay: Int,
    duration: Int
) {
    val infiniteTransition = rememberInfiniteTransition(label = "bubble")

    val offsetY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -100f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = duration, easing = LinearEasing, delayMillis = delay),
            repeatMode = RepeatMode.Reverse
        ),
        label = "bubbleY"
    )

    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 180f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = duration, easing = LinearEasing, delayMillis = delay),
            repeatMode = RepeatMode.Reverse
        ),
        label = "bubbleRotation"
    )

    Box(
        modifier = Modifier
            .offset(x = startX.dp, y = (startY + offsetY).dp)
            .size(size.dp)
            .graphicsLayer { rotationZ = rotation }
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.08f))
    )
}

/**
 * Themed background with animated gradient and floating bubbles
 * Use this as the root container for all screens to maintain consistent theme
 */
@Composable
fun ThemedBackground(
    modifier: Modifier = Modifier,
    showBubbles: Boolean = true,
    content: @Composable BoxScope.() -> Unit
) {
    // Animated gradient background
    val infiniteTransition = rememberInfiniteTransition(label = "bgGradient")

    val animatedOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 8000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "gradientOffset"
    )

    val colorShift by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 12000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "colorShift"
    )

    val startX = animatedOffset * 800f
    val startY = animatedOffset * 600f
    val endX = 1200f + (1f - animatedOffset) * 800f
    val endY = 2000f + (1f - animatedOffset) * 600f

    val accentAlpha = 0.03f + (colorShift * 0.04f)
    val animatedAccent = WebAccent.copy(alpha = accentAlpha)
    val animatedPurple = Purple.copy(alpha = accentAlpha * 0.5f)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BgDark, BgDarkEnd, BgDark),
                    start = androidx.compose.ui.geometry.Offset(startX, startY),
                    end = androidx.compose.ui.geometry.Offset(endX, endY)
                )
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(animatedAccent, Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(
                        x = 200f + (animatedOffset * 600f),
                        y = 300f + (colorShift * 400f)
                    ),
                    radius = 800f
                )
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(animatedPurple, Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(
                        x = 800f - (animatedOffset * 400f),
                        y = 1200f - (colorShift * 300f)
                    ),
                    radius = 600f
                )
            )
    ) {
        // Floating bubbles
        if (showBubbles) {
            FloatingBubble(size = 80f, startX = 20f, startY = 100f, delay = 0, duration = 8000)
            FloatingBubble(size = 60f, startX = 280f, startY = 200f, delay = 1000, duration = 10000)
            FloatingBubble(size = 100f, startX = 150f, startY = 400f, delay = 2000, duration = 7000)
            FloatingBubble(size = 40f, startX = 320f, startY = 600f, delay = 500, duration = 9000)
            FloatingBubble(size = 70f, startX = 50f, startY = 700f, delay = 1500, duration = 11000)
            FloatingBubble(size = 55f, startX = 250f, startY = 850f, delay = 3000, duration = 8500)
        }

        content()
    }
}
