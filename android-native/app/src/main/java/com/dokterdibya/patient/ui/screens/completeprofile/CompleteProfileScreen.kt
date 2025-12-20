package com.dokterdibya.patient.ui.screens.completeprofile

import android.app.DatePickerDialog
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
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

    val datePickerDialog = remember {
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                calendar.set(year, month, dayOfMonth)
                viewModel.updateBirthDate(dateFormatter.format(calendar.time))
            },
            calendar.get(Calendar.YEAR) - 25,
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
                        Color(0xFF667eea),
                        Color(0xFF764ba2)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            // Progress bar
            Column(modifier = Modifier.padding(bottom = 20.dp)) {
                Text(
                    text = "Langkah ${uiState.currentStep} dari ${uiState.totalSteps}",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
                Spacer(modifier = Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { uiState.currentStep.toFloat() / uiState.totalSteps },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(10.dp)),
                    color = Color.White,
                    trackColor = Color.White.copy(alpha = 0.3f)
                )
            }

            // Content card
            Card(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(25.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(25.dp)
                ) {
                    // Error message
                    AnimatedVisibility(visible = uiState.error != null) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = Color(0xFFFEE2E2)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = uiState.error ?: "",
                                color = Color(0xFFDC2626),
                                fontSize = 14.sp,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }

                    // Step content
                    AnimatedContent(
                        targetState = uiState.currentStep,
                        transitionSpec = {
                            if (targetState > initialState) {
                                slideInHorizontally { it } + fadeIn() togetherWith
                                        slideOutHorizontally { -it } + fadeOut()
                            } else {
                                slideInHorizontally { -it } + fadeIn() togetherWith
                                        slideOutHorizontally { it } + fadeOut()
                            }
                        },
                        label = "step"
                    ) { step ->
                        when (step) {
                            1 -> Step1BasicInfo(
                                uiState = uiState,
                                viewModel = viewModel,
                                onShowDatePicker = { datePickerDialog.show() },
                                displayFormatter = displayFormatter,
                                dateFormatter = dateFormatter
                            )
                            2 -> Step2Contact(uiState = uiState, viewModel = viewModel)
                            3 -> Step3Address(uiState = uiState, viewModel = viewModel)
                            4 -> Step4MaritalStatus(uiState = uiState, viewModel = viewModel)
                            5 -> Step5SpouseInfo(uiState = uiState, viewModel = viewModel)
                            6 -> Step6AdditionalInfo(uiState = uiState, viewModel = viewModel)
                            7 -> Step7Registration(uiState = uiState, viewModel = viewModel)
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    // Navigation buttons
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (uiState.currentStep > 1) {
                            OutlinedButton(
                                onClick = { viewModel.prevStep() },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(15.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color(0xFF6366f1)
                                )
                            ) {
                                Text("← Kembali", fontWeight = FontWeight.SemiBold)
                            }
                        }

                        Button(
                            onClick = {
                                if (uiState.currentStep == uiState.totalSteps) {
                                    viewModel.submit()
                                } else {
                                    viewModel.nextStep()
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(15.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF6366f1)
                            ),
                            enabled = !uiState.isLoading
                        ) {
                            if (uiState.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Text(
                                    text = if (uiState.currentStep == uiState.totalSteps) "Selesai ✓" else "Lanjut →",
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Step1BasicInfo(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel,
    onShowDatePicker: () -> Unit,
    displayFormatter: SimpleDateFormat,
    dateFormatter: SimpleDateFormat
) {
    Column {
        Text("😊", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Siapa nama lengkap Anda?",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Nama sesuai KTP ya!",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.fullname,
            onValueChange = viewModel::updateFullname,
            label = { Text("Nama Lengkap") },
            placeholder = { Text("Contoh: Siti Nurhaliza") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = if (uiState.birthDate.isNotBlank()) {
                try {
                    dateFormatter.parse(uiState.birthDate)?.let {
                        displayFormatter.format(it)
                    } ?: uiState.birthDate
                } catch (e: Exception) { uiState.birthDate }
            } else "",
            onValueChange = { },
            label = { Text("Tanggal Lahir") },
            placeholder = { Text("Pilih tanggal lahir") },
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onShowDatePicker() },
            enabled = false,
            readOnly = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                disabledBorderColor = Color(0xFFe5e7eb),
                disabledTextColor = Color(0xFF1f2937),
                disabledLabelColor = Color(0xFF6b7280),
                disabledContainerColor = Color.White
            )
        )

        if (uiState.age != null) {
            Text(
                text = "Usia: ${uiState.age} tahun",
                fontSize = 14.sp,
                color = Color(0xFF6b7280),
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.nik,
            onValueChange = viewModel::updateNik,
            label = { Text("NIK (Opsional)") },
            placeholder = { Text("16 digit NIK") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )
    }
}

@Composable
private fun Step2Contact(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    Column {
        Text("📱", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Bagaimana kami bisa menghubungi Anda?",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Nomor HP untuk konfirmasi janji temu",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.phone,
            onValueChange = viewModel::updatePhone,
            label = { Text("Nomor WhatsApp/HP") },
            placeholder = { Text("081234567890") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(15.dp),
            supportingText = {
                Text("Nomor dimulai 0 akan otomatis diubah ke 628")
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.emergencyContact,
            onValueChange = viewModel::updateEmergencyContact,
            label = { Text("Kontak Darurat (Opsional)") },
            placeholder = { Text("081234567890") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )
    }
}

@Composable
private fun Step3Address(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    Column {
        Text("🏡", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Di mana alamat Anda?",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Alamat lengkap untuk keperluan administrasi",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.address,
            onValueChange = viewModel::updateAddress,
            label = { Text("Alamat Lengkap") },
            placeholder = { Text("Jl. Contoh No. 123, RT/RW, Kelurahan, Kecamatan, Kota") },
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp),
            maxLines = 5,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )
    }
}

@Composable
private fun Step4MaritalStatus(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    val options = listOf("single" to "Single", "menikah" to "Menikah", "cerai" to "Cerai")

    Column {
        Text("💍", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Status pernikahan Anda?",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Pilih salah satu",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        options.forEach { (value, label) ->
            val isSelected = uiState.maritalStatus == value
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .selectable(
                        selected = isSelected,
                        onClick = { viewModel.updateMaritalStatus(value) },
                        role = Role.RadioButton
                    ),
                shape = RoundedCornerShape(15.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) Color(0xFF6366f1) else Color.White
                ),
                border = if (!isSelected) CardDefaults.outlinedCardBorder() else null
            ) {
                Text(
                    text = label,
                    modifier = Modifier.padding(18.dp),
                    color = if (isSelected) Color.White else Color(0xFF1f2937),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun Step5SpouseInfo(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    Column {
        Text("👨‍👩‍👧", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Informasi Pasangan",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Data suami (opsional)",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.husbandName,
            onValueChange = viewModel::updateHusbandName,
            label = { Text("Nama Suami") },
            placeholder = { Text("Nama lengkap suami") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.husbandAge,
            onValueChange = viewModel::updateHusbandAge,
            label = { Text("Umur Suami") },
            placeholder = { Text("Contoh: 35") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.husbandJob,
            onValueChange = viewModel::updateHusbandJob,
            label = { Text("Pekerjaan Suami") },
            placeholder = { Text("Contoh: Pegawai Swasta") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Step6AdditionalInfo(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    val educationOptions = listOf(
        "" to "Pilih pendidikan",
        "sd" to "SD/MI",
        "smp" to "SMP/MTs",
        "sma" to "SMA/SMK/MA",
        "diploma" to "Diploma",
        "sarjana" to "Sarjana",
        "lainnya" to "Lainnya"
    )
    var expanded by remember { mutableStateOf(false) }

    Column {
        Text("💼", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Informasi Tambahan",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Beberapa data terakhir",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.occupation,
            onValueChange = viewModel::updateOccupation,
            label = { Text("Pekerjaan Anda") },
            placeholder = { Text("Contoh: Ibu Rumah Tangga") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = educationOptions.find { it.first == uiState.education }?.second ?: "Pilih pendidikan",
                onValueChange = {},
                readOnly = true,
                label = { Text("Pendidikan Terakhir") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(),
                shape = RoundedCornerShape(15.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color(0xFF1f2937),
                    unfocusedTextColor = Color(0xFF1f2937),
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = Color(0xFFe5e7eb),
                    focusedLabelColor = Accent,
                    unfocusedLabelColor = Color(0xFF6b7280)
                )
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.background(Color.White)
            ) {
                educationOptions.filter { it.first.isNotEmpty() }.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label, color = Color(0xFF1f2937)) },
                        onClick = {
                            viewModel.updateEducation(value)
                            expanded = false
                        },
                        modifier = Modifier.background(Color.White)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.insurance,
            onValueChange = viewModel::updateInsurance,
            label = { Text("Asuransi (Opsional)") },
            placeholder = { Text("BPJS, Private, dll") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )
    }
}

@Composable
private fun Step7Registration(
    uiState: com.dokterdibya.patient.viewmodel.CompleteProfileUiState,
    viewModel: CompleteProfileViewModel
) {
    Column {
        Text("🔑", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = "Kode Registrasi",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1f2937)
        )
        Text(
            text = "Masukkan kode dari klinik atau dokter Anda",
            fontSize = 14.sp,
            color = Color(0xFF6b7280),
            modifier = Modifier.padding(bottom = 20.dp)
        )

        OutlinedTextField(
            value = uiState.registrationCode,
            onValueChange = viewModel::updateRegistrationCode,
            label = { Text("Kode Registrasi") },
            placeholder = { Text("Contoh: ABC123") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color(0xFF1f2937),
                unfocusedTextColor = Color(0xFF1f2937),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFFe5e7eb),
                focusedLabelColor = Accent,
                unfocusedLabelColor = Color(0xFF6b7280),
                cursorColor = Accent
            )
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { viewModel.updateConsentChecked(!uiState.consentChecked) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = uiState.consentChecked,
                onCheckedChange = viewModel::updateConsentChecked,
                colors = CheckboxDefaults.colors(
                    checkedColor = Color(0xFF6366f1)
                )
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Saya setuju data ini digunakan untuk pelayanan kesehatan",
                fontSize = 14.sp,
                color = Color(0xFF1f2937)
            )
        }
    }
}
