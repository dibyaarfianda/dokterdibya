package com.dokterdibya.patient.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokterdibya.patient.ui.theme.*

/**
 * Reusable error state component with retry functionality.
 * Provides consistent error display across all screens.
 *
 * @param error The error message to display
 * @param onRetry Callback when retry button is pressed
 * @param modifier Optional modifier
 * @param title Optional custom title (defaults based on error type)
 */
@Composable
fun ErrorState(
    error: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null
) {
    val (icon, defaultTitle, iconColor) = getErrorDetails(error)

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            // Error Icon
            Icon(
                imageVector = icon,
                contentDescription = "Error",
                tint = iconColor,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Title
            Text(
                text = title ?: defaultTitle,
                fontSize = 18.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = TextPrimaryDark,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Error Message
            Text(
                text = error,
                fontSize = 14.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 280.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Retry Button
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Coba lagi",
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Coba Lagi",
                    fontSize = 14.sp
                )
            }
        }
    }
}

/**
 * Compact error state for inline display (e.g., in cards or smaller areas)
 */
@Composable
fun ErrorStateCompact(
    error: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Danger.copy(alpha = 0.1f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "Error",
                tint = Danger,
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Text(
                text = error,
                fontSize = 13.sp,
                color = TextPrimaryDark,
                modifier = Modifier.weight(1f)
            )

            Spacer(modifier = Modifier.width(12.dp))

            TextButton(onClick = onRetry) {
                Text(
                    text = "Coba Lagi",
                    color = Accent,
                    fontSize = 13.sp
                )
            }
        }
    }
}

/**
 * Error state specifically for empty data scenarios
 */
@Composable
fun EmptyState(
    message: String,
    icon: ImageVector = Icons.Default.CloudOff,
    modifier: Modifier = Modifier,
    actionText: String? = null,
    onAction: (() -> Unit)? = null
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = TextSecondaryDark,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = message,
                fontSize = 16.sp,
                color = TextSecondaryDark,
                textAlign = TextAlign.Center
            )

            if (actionText != null && onAction != null) {
                Spacer(modifier = Modifier.height(16.dp))

                OutlinedButton(
                    onClick = onAction,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Accent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(text = actionText)
                }
            }
        }
    }
}

/**
 * Get appropriate icon and title based on error type
 */
private fun getErrorDetails(error: String): Triple<ImageVector, String, Color> {
    return when {
        error.contains("internet", ignoreCase = true) ||
        error.contains("connection", ignoreCase = true) ||
        error.contains("network", ignoreCase = true) ||
        error.contains("resolve host", ignoreCase = true) ->
            Triple(Icons.Default.WifiOff, "Tidak Ada Koneksi", Warning)

        error.contains("timeout", ignoreCase = true) ->
            Triple(Icons.Default.CloudOff, "Koneksi Timeout", Warning)

        error.contains("server", ignoreCase = true) ||
        error.contains("500", ignoreCase = true) ->
            Triple(Icons.Default.CloudOff, "Server Bermasalah", Danger)

        else ->
            Triple(Icons.Default.Warning, "Terjadi Kesalahan", Danger)
    }
}
