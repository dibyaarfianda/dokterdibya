package com.dokterdibya.patient.ui.screens.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.R
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.AuthViewModel

@Composable
fun LoginScreen(
    onGoogleSignIn: () -> Unit,
    onLoginSuccess: () -> Unit,
    onNeedCompleteProfile: () -> Unit = {},
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val isLoggedIn by viewModel.isLoggedIn.collectAsState(initial = false)

    // Navigate based on login state and profile completion
    // Registration code is now handled in CompleteProfileScreen (like website)
    LaunchedEffect(uiState.isLoggedIn, uiState.needsProfileCompletion) {
        if (uiState.isLoggedIn) {
            when {
                // New user needs to complete profile (registration code asked in form)
                uiState.needsProfileCompletion -> onNeedCompleteProfile()
                // Returning user with complete profile
                else -> onLoginSuccess()
            }
        }
    }

    // Also check if already logged in (returning user)
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn && !uiState.isLoggedIn) {
            // Already logged in from previous session - check profile completion first
            viewModel.checkProfileCompletion()
        }
    }

    ThemedBackground {
        // Main content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .shadow(
                        elevation = 20.dp,
                        shape = RoundedCornerShape(28.dp),
                        ambientColor = Accent.copy(alpha = 0.3f)
                    )
                    .clip(RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(id = R.mipmap.ic_launcher),
                    contentDescription = "Dokter Dibya Logo",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // App name
            Text(
                text = buildAnnotatedString {
                    append("dokter")
                    withStyle(style = SpanStyle(color = Primary)) {
                        append("DIBYA")
                    }
                },
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )

            Text(
                text = stringResource(R.string.app_tagline),
                fontSize = 14.sp,
                color = TextSecondaryDark
            )

            Spacer(modifier = Modifier.height(60.dp))

            // Error message
            if (uiState.error != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Danger.copy(alpha = 0.15f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = uiState.error!!,
                        color = Color(0xFFFCA5A5),
                        fontSize = 14.sp,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }

            // Google Sign In Button
            Button(
                onClick = onGoogleSignIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color(0xFF333333)
                ),
                elevation = ButtonDefaults.buttonElevation(
                    defaultElevation = 8.dp
                ),
                enabled = !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Primary
                    )
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        // Google icon (placeholder - use actual SVG)
                        Text(
                            text = "G",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF4285F4)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.login_google),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
