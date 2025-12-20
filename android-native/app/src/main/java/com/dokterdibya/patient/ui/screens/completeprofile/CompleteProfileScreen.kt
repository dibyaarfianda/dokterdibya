package com.dokterdibya.patient.ui.screens.completeprofile

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.CompleteProfileViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompleteProfileScreen(
    onComplete: () -> Unit,
    onBack: (() -> Unit)? = null,
    viewModel: CompleteProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Navigate on success
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onComplete()
        }
    }

    // Date picker
    val calendar = Calendar.getInstance()
    val dateFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    val displayFormatter = SimpleDateFormat("dd MMMM yyyy", Locale("id", "ID"))

    // Parse existing date if available
    LaunchedEffect(uiState.birthDate) {
        if (uiState.birthDate.isNotBlank()) {
            try {
                dateFormatter.parse(uiState.birthDate)?.let {
                    calendar.time = it
                }
            } catch (e: Exception) { /* ignore */ }
        }
    }

    val datePickerDialog = remember {
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                calendar.set(year, month, dayOfMonth)
                viewModel.updateBirthDate(dateFormatter.format(calendar.time))
            },
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH),
            calendar.get(Calendar.DAY_OF_MONTH)
        ).apply {
            datePicker.maxDate = System.currentTimeMillis()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color(0xFF0A0A12),
                        Color(0xFF1A1A2E)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Back button if provided
            if (onBack != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Start
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Kembali",
                            tint = Color.White
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(40.dp))

            // Header
            Text(
                text = buildAnnotatedString {
                    append("Lengkapi ")
                    withStyle(style = SpanStyle(color = Primary)) {
                        append("Profil")
                    }
                },
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Lengkapi data diri Anda untuk melanjutkan",
                fontSize = 14.sp,
                color = TextSecondaryDark
            )

            Spacer(modifier = Modifier.height(40.dp))

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

            // Full name field
            OutlinedTextField(
                value = uiState.fullname,
                onValueChange = viewModel::updateFullname,
                label = { Text("Nama Lengkap") },
                placeholder = { Text("Masukkan nama lengkap") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = Primary
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !uiState.isLoading,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = Color.Gray.copy(alpha = 0.5f),
                    focusedLabelColor = Primary,
                    unfocusedLabelColor = TextSecondaryDark,
                    cursorColor = Primary,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedPlaceholderColor = TextSecondaryDark,
                    unfocusedPlaceholderColor = TextSecondaryDark
                ),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Phone field
            OutlinedTextField(
                value = uiState.phone,
                onValueChange = viewModel::updatePhone,
                label = { Text("Nomor Telepon") },
                placeholder = { Text("6281234567890") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Phone,
                        contentDescription = null,
                        tint = Primary
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !uiState.isLoading,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = Color.Gray.copy(alpha = 0.5f),
                    focusedLabelColor = Primary,
                    unfocusedLabelColor = TextSecondaryDark,
                    cursorColor = Primary,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedPlaceholderColor = TextSecondaryDark,
                    unfocusedPlaceholderColor = TextSecondaryDark
                ),
                shape = RoundedCornerShape(12.dp),
                supportingText = {
                    Text(
                        text = "Format: 628xxxxxxxxxx",
                        color = TextSecondaryDark,
                        fontSize = 12.sp
                    )
                }
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Birth date field (clickable)
            OutlinedTextField(
                value = if (uiState.birthDate.isNotBlank()) {
                    try {
                        dateFormatter.parse(uiState.birthDate)?.let {
                            displayFormatter.format(it)
                        } ?: uiState.birthDate
                    } catch (e: Exception) {
                        uiState.birthDate
                    }
                } else "",
                onValueChange = { },
                label = { Text("Tanggal Lahir") },
                placeholder = { Text("Pilih tanggal lahir") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = Primary
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !uiState.isLoading) {
                        datePickerDialog.show()
                    },
                singleLine = true,
                enabled = false,
                readOnly = true,
                colors = OutlinedTextFieldDefaults.colors(
                    disabledBorderColor = Color.Gray.copy(alpha = 0.5f),
                    disabledLabelColor = TextSecondaryDark,
                    disabledTextColor = Color.White,
                    disabledPlaceholderColor = TextSecondaryDark,
                    disabledLeadingIconColor = Primary
                ),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Registration code field
            OutlinedTextField(
                value = uiState.registrationCode,
                onValueChange = viewModel::updateRegistrationCode,
                label = { Text("Kode Registrasi") },
                placeholder = { Text("Masukkan kode dari dokter") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Key,
                        contentDescription = null,
                        tint = Primary
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !uiState.isLoading,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = Color.Gray.copy(alpha = 0.5f),
                    focusedLabelColor = Primary,
                    unfocusedLabelColor = TextSecondaryDark,
                    cursorColor = Primary,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedPlaceholderColor = TextSecondaryDark,
                    unfocusedPlaceholderColor = TextSecondaryDark
                ),
                shape = RoundedCornerShape(12.dp),
                supportingText = {
                    Text(
                        text = "Dapatkan kode dari klinik atau dokter Anda",
                        color = TextSecondaryDark,
                        fontSize = 12.sp
                    )
                }
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Submit button
            Button(
                onClick = viewModel::submit,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Primary,
                    disabledContainerColor = Primary.copy(alpha = 0.5f)
                ),
                enabled = !uiState.isLoading &&
                        uiState.fullname.isNotBlank() &&
                        uiState.phone.isNotBlank() &&
                        uiState.birthDate.isNotBlank() &&
                        uiState.registrationCode.isNotBlank()
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Simpan & Lanjutkan",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
