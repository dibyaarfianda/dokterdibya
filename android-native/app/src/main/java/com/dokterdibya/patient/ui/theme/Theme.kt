package com.dokterdibya.patient.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Primary,
    onPrimary = Color.White,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = Color.White,
    secondary = Accent,
    onSecondary = Color.White,
    secondaryContainer = Purple,
    onSecondaryContainer = Color.White,
    tertiary = Fertility,
    onTertiary = Color.White,
    background = BgDark,
    onBackground = TextPrimaryDark,
    surface = SurfaceDark,
    onSurface = TextPrimaryDark,
    surfaceVariant = CardDark,
    onSurfaceVariant = TextSecondaryDark,
    error = Danger,
    onError = Color.White,
    outline = GlassBorderDark
)

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = Color.White,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = Color.White,
    secondary = Accent,
    onSecondary = Color.White,
    secondaryContainer = Purple,
    onSecondaryContainer = Color.White,
    tertiary = Fertility,
    onTertiary = Color.White,
    background = BgLight,
    onBackground = TextPrimaryLight,
    surface = SurfaceLight,
    onSurface = TextPrimaryLight,
    surfaceVariant = CardLight,
    onSurfaceVariant = TextSecondaryLight,
    error = Danger,
    onError = Color.White,
    outline = GlassBorderLight
)

@Composable
fun DokterDibyaTheme(
    darkTheme: Boolean = true, // Default to dark theme like the web
    dynamicColor: Boolean = false, // Disable Material You for consistent branding
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = if (darkTheme) {
                Color(0xFF0A0A12).toArgb()
            } else {
                Color(0xFFE8F4FC).toArgb()
            }
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Extension colors for custom UI elements
object DokterDibyaColors {
    val success = Success
    val danger = Danger
    val warning = Warning
    val fertility = Fertility
    val purple = Purple
    val gold = Gold

    @Composable
    fun glassBg(darkTheme: Boolean = isSystemInDarkTheme()) =
        if (darkTheme) GlassDark else GlassLight

    @Composable
    fun cardBg(darkTheme: Boolean = isSystemInDarkTheme()) =
        if (darkTheme) CardDark else CardLight

    @Composable
    fun overlay(darkTheme: Boolean = isSystemInDarkTheme()) =
        if (darkTheme) OverlayDark else OverlayLight
}
