package com.dokterdibya.patient.ui.screens.registrationcode

import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.R
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.RegistrationCodeViewModel

@Composable
fun RegistrationCodeScreen(
    onCodeValidated: () -> Unit,
    viewModel: RegistrationCodeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Navigate when code is validated
    LaunchedEffect(uiState.isValid) {
        if (uiState.isValid) {
            onCodeValidated()
        }
    }

    // Animated background bubbles
    val infiniteTransition = rememberInfiniteTransition(label = "bubble")
    val bubbleOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 30f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = EaseInOutQuad),
            repeatMode = RepeatMode.Reverse
        ),
        label = "bubbleOffset"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(IntakeBgStart, IntakeBgEnd)
                )
            )
    ) {
        // Animated bubbles
        Box(
            modifier = Modifier
                .size(150.dp)
                .offset(x = (-30).dp, y = (50 + bubbleOffset).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            IntakePrimary.copy(alpha = 0.15f),
                            Color.Transparent
                        )
                    ),
                    shape = RoundedCornerShape(50)
                )
        )

        Box(
            modifier = Modifier
                .size(100.dp)
                .align(Alignment.BottomEnd)
                .offset(x = 20.dp, y = (-100 - bubbleOffset).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Purple.copy(alpha = 0.12f),
                            Color.Transparent
                        )
                    ),
                    shape = RoundedCornerShape(50)
                )
        )

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
                    .size(100.dp)
                    .shadow(
                        elevation = 20.dp,
                        shape = RoundedCornerShape(24.dp),
                        ambientColor = IntakePrimary.copy(alpha = 0.3f)
                    )
                    .clip(RoundedCornerShape(24.dp)),
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

            // Title
            Text(
                text = "Kode Registrasi",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = IntakeTextPrimary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Masukkan kode 6 karakter dari klinik",
                fontSize = 14.sp,
                color = IntakeTextSecondary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(40.dp))

            // Code input with 6 character boxes
            CodeInputField(
                code = uiState.code,
                onCodeChange = { viewModel.updateCode(it) },
                isError = uiState.error != null,
                modifier = Modifier.fillMaxWidth()
            )

            // Error message
            if (uiState.error != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = uiState.error!!,
                    color = Danger,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Verify button
            Button(
                onClick = { viewModel.validateCode() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = IntakePrimary,
                    contentColor = Color.White,
                    disabledContainerColor = IntakePrimary.copy(alpha = 0.5f)
                ),
                enabled = uiState.code.length == 6 && !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Verifikasi Kode",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Help text
            Text(
                text = "Belum punya kode?",
                fontSize = 14.sp,
                color = IntakeTextSecondary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Hubungi klinik untuk mendapatkan kode registrasi",
                fontSize = 13.sp,
                color = IntakePlaceholder,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun CodeInputField(
    code: String,
    onCodeChange: (String) -> Unit,
    isError: Boolean,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        // Hidden text field for input handling
        BasicTextField(
            value = code,
            onValueChange = onCodeChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
            textStyle = TextStyle(
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Transparent,
                letterSpacing = 16.sp,
                textAlign = TextAlign.Center
            ),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                capitalization = KeyboardCapitalization.Characters
            ),
            singleLine = true,
            cursorBrush = SolidColor(Color.Transparent)
        )

        // Visual display of characters
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
        ) {
            repeat(6) { index ->
                val char = code.getOrNull(index)?.toString() ?: ""
                val isFilled = char.isNotEmpty()
                val borderColor = when {
                    isError -> Danger
                    isFilled -> IntakePrimary
                    else -> IntakeBorder
                }

                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            color = IntakeInputBg,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .border(
                            width = 1.5.dp,
                            color = borderColor,
                            shape = RoundedCornerShape(12.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = char,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = IntakeTextPrimary
                    )
                }
            }
        }
    }
}
