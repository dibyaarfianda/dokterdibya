package com.dokterdibya.patient.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.dokterdibya.patient.ui.theme.*

/**
 * Static bubble component (no animation for better performance)
 */
@Composable
private fun StaticBubble(
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

/**
 * Themed background with static gradient and frozen bubbles
 * Use this as the root container for all screens to maintain consistent theme
 * Static design for smooth performance (no animations)
 */
@Composable
fun ThemedBackground(
    modifier: Modifier = Modifier,
    showBubbles: Boolean = true,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
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
                    colors = listOf(WebAccent.copy(alpha = 0.05f), Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(x = 500f, y = 500f),
                    radius = 800f
                )
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(Purple.copy(alpha = 0.03f), Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(x = 600f, y = 1000f),
                    radius = 600f
                )
            )
    ) {
        // Static bubbles (frozen for performance)
        if (showBubbles) {
            StaticBubble(size = 80f, x = 20f, y = 100f)
            StaticBubble(size = 60f, x = 280f, y = 200f)
            StaticBubble(size = 100f, x = 150f, y = 400f)
            StaticBubble(size = 40f, x = 320f, y = 600f)
            StaticBubble(size = 70f, x = 50f, y = 700f)
            StaticBubble(size = 55f, x = 250f, y = 850f)
        }

        content()
    }
}
