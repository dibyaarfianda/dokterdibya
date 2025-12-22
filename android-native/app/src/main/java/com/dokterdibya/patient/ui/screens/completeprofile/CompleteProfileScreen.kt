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
import com.dokterdibya.patient.ui.components.CheckboxGroup
import com.dokterdibya.patient.ui.components.MedicationRow
import com.dokterdibya.patient.ui.components.PaymentMethodGroup
import com.dokterdibya.patient.ui.components.SingleCheckbox
import androidx.compose.foundation.BorderStroke
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.CompleteProfileUiState
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

    // State for success dialog
    var showSuccessDialog by remember { mutableStateOf(false) }

    // Show success dialog when submission succeeds
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            showSuccessDialog = true
        }
    }

    // Success Dialog - Dark Glassmorphism
    if (showSuccessDialog) {
        AlertDialog(
            onDismissRequest = { /* Don't dismiss on outside click */ },
            icon = {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Success,
                    modifier = Modifier.size(48.dp)
                )
            },
            title = {
                Text(
                    "Formulir Berhasil Dikirim!",
                    fontWeight = FontWeight.Bold,
                    color = IntakeTextPrimary
                )
            },
            text = {
                Text(
                    "Data Anda telah tersimpan",
                    fontSize = 14.sp,
                    color = IntakeTextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showSuccessDialog = false
                        onComplete()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = IntakePrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Lanjut ke Dashboard", fontWeight = FontWeight.Medium)
                }
            },
            containerColor = IntakeBgEnd,
            shape = RoundedCornerShape(16.dp)
        )
    }

    // Date picker
    val calendar = Calendar.getInstance()
    val dateFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    val displayFormatter = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())

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
                    colors = listOf(IntakeBgStart, IntakeBgEnd)
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            // Title based on existing intake
            if (uiState.isExistingIntake) {
                Text(
                    text = "Perbarui Formulir Rekam Medis",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

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

            // Content card - Glassmorphism style
            Card(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(25.dp),
                colors = CardDefaults.cardColors(containerColor = IntakeCardBg),
                border = BorderStroke(1.dp, IntakeBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(25.dp)
                ) {
                    // Error message - Dark theme compatible
                    AnimatedVisibility(visible = uiState.error != null) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = Danger.copy(alpha = 0.15f)
                            ),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Danger.copy(alpha = 0.3f))
                        ) {
                            Text(
                                text = uiState.error ?: "",
                                color = Danger,
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
                            1 -> Step1BasicInfo(uiState, viewModel, { datePickerDialog.show() }, displayFormatter, dateFormatter)
                            2 -> Step2Contact(uiState, viewModel)
                            3 -> Step3Address(uiState, viewModel)
                            4 -> Step4MaritalStatus(uiState, viewModel)
                            5 -> Step5SpouseInfo(uiState, viewModel)
                            6 -> Step6ChildrenObstetric(uiState, viewModel)
                            7 -> Step7SocialPayment(uiState, viewModel)
                            8 -> Step8BloodAllergy(uiState, viewModel)
                            9 -> Step9MedicalHistory(uiState, viewModel)
                            10 -> Step10Confirmation(uiState, viewModel)
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
                                    contentColor = IntakeTextPrimary
                                ),
                                border = BorderStroke(1.dp, IntakeBorder)
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
                                containerColor = IntakePrimary
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
                                    text = when {
                                        uiState.currentStep == uiState.totalSteps && uiState.isExistingIntake -> "Perbarui ✓"
                                        uiState.currentStep == uiState.totalSteps -> "Kirim ✓"
                                        else -> "Lanjut →"
                                    },
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

// ==================== Step 1: Basic Info ====================
@Composable
private fun Step1BasicInfo(
    uiState: CompleteProfileUiState,
    viewModel: CompleteProfileViewModel,
    onShowDatePicker: () -> Unit,
    displayFormatter: SimpleDateFormat,
    dateFormatter: SimpleDateFormat
) {
    Column {
        Text("😊", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Data Diri", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Informasi dasar untuk rekam medis", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        // Registration Code (shown while loading or if required)
        if (uiState.registrationCodeCheckLoading || uiState.registrationCodeRequired) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 20.dp),
                colors = CardDefaults.cardColors(containerColor = IntakeInputBg),
                shape = RoundedCornerShape(15.dp),
                border = BorderStroke(1.dp, if (uiState.registrationCodeValidated) Success else IntakeBorder)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "Kode Registrasi *",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = IntakeTextSecondary
                        )
                        if (uiState.registrationCodeCheckLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                color = IntakePrimary,
                                strokeWidth = 2.dp
                            )
                        }
                    }
                    Text(
                        "Masukkan kode 6 karakter dari klinik",
                        fontSize = 12.sp,
                        color = IntakePlaceholder,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = uiState.registrationCode,
                            onValueChange = viewModel::updateRegistrationCode,
                            placeholder = { Text("XXXXXX") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            enabled = !uiState.registrationCodeValidated,
                            shape = RoundedCornerShape(12.dp),
                            textStyle = androidx.compose.ui.text.TextStyle(
                                letterSpacing = 4.sp,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            ),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = IntakeTextPrimary,
                                unfocusedTextColor = IntakeTextPrimary,
                                disabledTextColor = IntakeTextPrimary,
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                disabledContainerColor = Color.Transparent,
                                focusedBorderColor = IntakePrimary,
                                unfocusedBorderColor = IntakeBorder,
                                disabledBorderColor = Success,
                                cursorColor = IntakePrimary,
                                focusedPlaceholderColor = IntakePlaceholder,
                                unfocusedPlaceholderColor = IntakePlaceholder
                            )
                        )

                        if (uiState.registrationCodeValidated) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "Valid",
                                tint = Success,
                                modifier = Modifier.size(32.dp)
                            )
                        } else {
                            Button(
                                onClick = { viewModel.validateRegistrationCode() },
                                enabled = uiState.registrationCode.length == 6 && !uiState.registrationCodeValidating,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = IntakePrimary)
                            ) {
                                if (uiState.registrationCodeValidating) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Validasi", fontSize = 13.sp)
                                }
                            }
                        }
                    }

                    if (uiState.registrationCodeValidated) {
                        Text(
                            "✓ Kode valid",
                            fontSize = 12.sp,
                            color = Success,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
        }

        // Name
        OutlinedTextField(
            value = uiState.fullname,
            onValueChange = viewModel::updateFullname,
            label = { Text("Nama Lengkap *") },
            placeholder = { Text("Sesuai KTP") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Birth date
        OutlinedTextField(
            value = if (uiState.birthDate.isNotBlank()) {
                try { dateFormatter.parse(uiState.birthDate)?.let { displayFormatter.format(it) } ?: uiState.birthDate }
                catch (e: Exception) { uiState.birthDate }
            } else "",
            onValueChange = { },
            label = { Text("Tanggal Lahir *") },
            placeholder = { Text("Pilih tanggal") },
            modifier = Modifier.fillMaxWidth().clickable { onShowDatePicker() },
            enabled = false, readOnly = true,
            shape = RoundedCornerShape(15.dp),
            colors = OutlinedTextFieldDefaults.colors(
                disabledBorderColor = IntakeBorder,
                disabledTextColor = IntakeTextPrimary,
                disabledLabelColor = IntakeTextSecondary,
                disabledContainerColor = IntakeInputBg
            )
        )

        if (uiState.age != null) {
            Text("Usia: ${uiState.age} tahun", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(top = 8.dp))
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Height
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = uiState.height,
                onValueChange = viewModel::updateHeight,
                label = { Text("Tinggi Badan (cm)") },
                placeholder = { Text("160") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !uiState.heightUnknown,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(15.dp),
                colors = defaultTextFieldColors()
            )
        }

        SingleCheckbox(
            label = "Tidak tahu / belum mengukur",
            checked = uiState.heightUnknown,
            onCheckedChange = viewModel::updateHeightUnknown
        )

        Spacer(modifier = Modifier.height(16.dp))

        // NIK
        OutlinedTextField(
            value = uiState.nik,
            onValueChange = viewModel::updateNik,
            label = { Text("NIK (Opsional)") },
            placeholder = { Text("16 digit NIK") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )
    }
}

// ==================== Step 2: Contact ====================
@Composable
private fun Step2Contact(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("📱", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Kontak", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Nomor HP untuk konfirmasi janji temu", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        OutlinedTextField(
            value = uiState.phone,
            onValueChange = viewModel::updatePhone,
            label = { Text("Nomor WhatsApp/HP *") },
            placeholder = { Text("081234567890") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(15.dp),
            supportingText = { Text("Format: 08xxx atau 628xxx") },
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.emergencyContact,
            onValueChange = viewModel::updateEmergencyContact,
            label = { Text("Kontak Darurat") },
            placeholder = { Text("Nomor keluarga/suami") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )
    }
}

// ==================== Step 3: Address ====================
@Composable
private fun Step3Address(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("🏡", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Alamat", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Alamat lengkap untuk administrasi", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        OutlinedTextField(
            value = uiState.address,
            onValueChange = viewModel::updateAddress,
            label = { Text("Alamat Lengkap") },
            placeholder = { Text("Jl. Contoh No. 123, Kelurahan, Kecamatan, Kota") },
            modifier = Modifier.fillMaxWidth().height(150.dp),
            maxLines = 5,
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )
    }
}

// ==================== Step 4: Marital Status ====================
@Composable
private fun Step4MaritalStatus(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    val options = listOf("single" to "Single / Belum Menikah", "menikah" to "Menikah", "cerai" to "Cerai")

    Column {
        Text("💍", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Status Pernikahan", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Pilih salah satu", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        options.forEach { (value, label) ->
            val isSelected = uiState.maritalStatus == value
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .selectable(selected = isSelected, onClick = { viewModel.updateMaritalStatus(value) }, role = Role.RadioButton),
                shape = RoundedCornerShape(15.dp),
                colors = CardDefaults.cardColors(containerColor = if (isSelected) IntakePrimary else IntakeInputBg),
                border = BorderStroke(1.dp, if (isSelected) IntakePrimary else IntakeBorder)
            ) {
                Text(label, modifier = Modifier.padding(18.dp), color = if (isSelected) Color.White else IntakeTextPrimary, fontWeight = FontWeight.Medium)
            }
        }
    }
}

// ==================== Step 5: Spouse Info ====================
@Composable
private fun Step5SpouseInfo(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("👨‍👩‍👧", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Informasi Suami", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Data suami (opsional)", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        OutlinedTextField(
            value = uiState.husbandName,
            onValueChange = viewModel::updateHusbandName,
            label = { Text("Nama Suami") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = uiState.husbandAge,
                onValueChange = viewModel::updateHusbandAge,
                label = { Text("Umur") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(15.dp),
                colors = defaultTextFieldColors()
            )
            OutlinedTextField(
                value = uiState.husbandJob,
                onValueChange = viewModel::updateHusbandJob,
                label = { Text("Pekerjaan") },
                modifier = Modifier.weight(1.5f),
                singleLine = true,
                shape = RoundedCornerShape(15.dp),
                colors = defaultTextFieldColors()
            )
        }
    }
}

// ==================== Step 6: Children & Obstetric ====================
@Composable
private fun Step6ChildrenObstetric(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("👶", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Riwayat Anak & Kehamilan", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Informasi untuk rekam medis obstetri", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        // Has children
        Text("Apakah sudah punya anak?", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = IntakeTextSecondary)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            listOf("ya" to "Ya", "tidak" to "Tidak").forEach { (value, label) ->
                val isSelected = uiState.hasChildren == value
                FilterChip(
                    selected = isSelected,
                    onClick = { viewModel.updateHasChildren(value) },
                    label = { Text(label, color = if (isSelected) Color.White else IntakeTextPrimary) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = IntakePrimary,
                        containerColor = IntakeInputBg
                    )
                )
            }
        }

        // If has children
        if (uiState.hasChildren == "ya") {
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = uiState.livingChildrenCount,
                    onValueChange = viewModel::updateLivingChildrenCount,
                    label = { Text("Jumlah anak hidup") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(15.dp),
                    colors = defaultTextFieldColors()
                )
                OutlinedTextField(
                    value = uiState.youngestChildAge,
                    onValueChange = viewModel::updateYoungestChildAge,
                    label = { Text("Usia terkecil (thn)") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(15.dp),
                    colors = defaultTextFieldColors()
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            Text("Riwayat Kehamilan", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = IntakeTextSecondary)
            Spacer(modifier = Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = uiState.totalPregnancies,
                    onValueChange = viewModel::updateTotalPregnancies,
                    label = { Text("Total hamil") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp),
                    colors = defaultTextFieldColors()
                )
                OutlinedTextField(
                    value = uiState.normalDeliveryCount,
                    onValueChange = viewModel::updateNormalDeliveryCount,
                    label = { Text("Normal") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp),
                    colors = defaultTextFieldColors()
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = uiState.cesareanDeliveryCount,
                    onValueChange = viewModel::updateCesareanDeliveryCount,
                    label = { Text("Sesar (SC)") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp),
                    colors = defaultTextFieldColors()
                )
                OutlinedTextField(
                    value = uiState.miscarriageCount,
                    onValueChange = viewModel::updateMiscarriageCount,
                    label = { Text("Keguguran") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp),
                    colors = defaultTextFieldColors()
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("Pernah hamil di luar kandungan (ektopik)?", fontSize = 14.sp, color = IntakeTextSecondary)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                listOf("ya" to "Ya", "tidak" to "Tidak").forEach { (value, label) ->
                    val isSelected = uiState.hadEctopic == value
                    FilterChip(
                        selected = isSelected,
                        onClick = { viewModel.updateHadEctopic(value) },
                        label = { Text(label, color = if (isSelected) Color.White else IntakeTextPrimary) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = IntakePrimary,
                            containerColor = IntakeInputBg
                        )
                    )
                }
            }
        }
    }
}

// ==================== Step 7: Social & Payment ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Step7SocialPayment(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    var educationExpanded by remember { mutableStateOf(false) }

    Column {
        Text("💼", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Pekerjaan & Pembiayaan", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Informasi sosial ekonomi", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        OutlinedTextField(
            value = uiState.occupation,
            onValueChange = viewModel::updateOccupation,
            label = { Text("Pekerjaan Anda") },
            placeholder = { Text("Contoh: Ibu Rumah Tangga") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Education dropdown
        ExposedDropdownMenuBox(expanded = educationExpanded, onExpandedChange = { educationExpanded = !educationExpanded }) {
            OutlinedTextField(
                value = viewModel.educationOptions.find { it.first == uiState.education }?.second ?: "Pilih pendidikan",
                onValueChange = {},
                readOnly = true,
                label = { Text("Pendidikan Terakhir") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = educationExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                shape = RoundedCornerShape(15.dp),
                colors = defaultTextFieldColors()
            )
            ExposedDropdownMenu(expanded = educationExpanded, onDismissRequest = { educationExpanded = false }) {
                viewModel.educationOptions.filter { it.first.isNotEmpty() }.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = { viewModel.updateEducation(value); educationExpanded = false }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        PaymentMethodGroup(
            selectedMethods = uiState.paymentMethods,
            onToggle = viewModel::togglePaymentMethod,
            insuranceName = uiState.insuranceName,
            onInsuranceNameChange = viewModel::updateInsuranceName
        )
    }
}

// ==================== Step 8: Blood & Allergy ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Step8BloodAllergy(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    var bloodExpanded by remember { mutableStateOf(false) }
    var rhesusExpanded by remember { mutableStateOf(false) }

    Column {
        Text("🩸", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Golongan Darah & Alergi", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Informasi penting untuk keselamatan", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // Blood type
            ExposedDropdownMenuBox(expanded = bloodExpanded, onExpandedChange = { bloodExpanded = !bloodExpanded }, modifier = Modifier.weight(1f)) {
                val bloodValue = viewModel.bloodTypeOptions.find { it.first == uiState.bloodType }?.second
                val hasBloodValue = uiState.bloodType.isNotEmpty()
                OutlinedTextField(
                    value = bloodValue ?: "Pilih...",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Gol. Darah", fontSize = 12.sp) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = bloodExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    shape = RoundedCornerShape(15.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = if (hasBloodValue) IntakeTextPrimary else IntakePlaceholder,
                        unfocusedTextColor = if (hasBloodValue) IntakeTextPrimary else IntakePlaceholder,
                        focusedContainerColor = IntakeInputBg,
                        unfocusedContainerColor = IntakeInputBg,
                        focusedBorderColor = IntakePrimary,
                        unfocusedBorderColor = IntakeBorder,
                        focusedLabelColor = IntakePrimary,
                        unfocusedLabelColor = IntakeTextSecondary,
                        cursorColor = IntakePrimary,
                        focusedTrailingIconColor = IntakeTextPrimary,
                        unfocusedTrailingIconColor = IntakeTextSecondary
                    )
                )
                ExposedDropdownMenu(
                    expanded = bloodExpanded,
                    onDismissRequest = { bloodExpanded = false },
                    modifier = Modifier.background(IntakeBgEnd)
                ) {
                    viewModel.bloodTypeOptions.filter { it.first.isNotEmpty() }.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label, color = IntakeTextPrimary) }, onClick = { viewModel.updateBloodType(value); bloodExpanded = false })
                    }
                }
            }

            // Rhesus
            ExposedDropdownMenuBox(expanded = rhesusExpanded, onExpandedChange = { rhesusExpanded = !rhesusExpanded }, modifier = Modifier.weight(1f)) {
                val rhesusValue = viewModel.rhesusOptions.find { it.first == uiState.rhesus }?.second
                val hasRhesusValue = uiState.rhesus.isNotEmpty()
                OutlinedTextField(
                    value = rhesusValue ?: "Pilih...",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Rhesus", fontSize = 12.sp) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = rhesusExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    shape = RoundedCornerShape(15.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = if (hasRhesusValue) IntakeTextPrimary else IntakePlaceholder,
                        unfocusedTextColor = if (hasRhesusValue) IntakeTextPrimary else IntakePlaceholder,
                        focusedContainerColor = IntakeInputBg,
                        unfocusedContainerColor = IntakeInputBg,
                        focusedBorderColor = IntakePrimary,
                        unfocusedBorderColor = IntakeBorder,
                        focusedLabelColor = IntakePrimary,
                        unfocusedLabelColor = IntakeTextSecondary,
                        cursorColor = IntakePrimary,
                        focusedTrailingIconColor = IntakeTextPrimary,
                        unfocusedTrailingIconColor = IntakeTextSecondary
                    )
                )
                ExposedDropdownMenu(
                    expanded = rhesusExpanded,
                    onDismissRequest = { rhesusExpanded = false },
                    modifier = Modifier.background(IntakeBgEnd)
                ) {
                    viewModel.rhesusOptions.filter { it.first.isNotEmpty() }.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label, color = IntakeTextPrimary) }, onClick = { viewModel.updateRhesus(value); rhesusExpanded = false })
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        Text("Alergi", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = IntakeTextSecondary)
        Text("Isi dengan tanda (-) jika tidak ada", fontSize = 12.sp, color = IntakePlaceholder, modifier = Modifier.padding(bottom = 12.dp))

        OutlinedTextField(
            value = uiState.allergyDrugs,
            onValueChange = viewModel::updateAllergyDrugs,
            label = { Text("Alergi Obat") },
            placeholder = { Text("Contoh: Penisilin, Aspirin") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.allergyFood,
            onValueChange = viewModel::updateAllergyFood,
            label = { Text("Alergi Makanan") },
            placeholder = { Text("Contoh: Seafood, Kacang") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.allergyEnv,
            onValueChange = viewModel::updateAllergyEnv,
            label = { Text("Alergi Lingkungan") },
            placeholder = { Text("Contoh: Debu, Dingin") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )
    }
}

// ==================== Step 9: Medical History ====================
@Composable
private fun Step9MedicalHistory(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("📋", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Riwayat Kesehatan", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Riwayat penyakit dan obat", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        // Current medications
        Text("Obat yang Sedang Dikonsumsi", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = IntakeTextSecondary)
        Text("Isi jika ada obat rutin", fontSize = 12.sp, color = IntakePlaceholder, modifier = Modifier.padding(bottom = 12.dp))

        MedicationRow(0, uiState.medName1, uiState.medDose1, uiState.medFreq1, viewModel::updateMedName1, viewModel::updateMedDose1, viewModel::updateMedFreq1)
        Spacer(modifier = Modifier.height(8.dp))
        MedicationRow(1, uiState.medName2, uiState.medDose2, uiState.medFreq2, viewModel::updateMedName2, viewModel::updateMedDose2, viewModel::updateMedFreq2)
        Spacer(modifier = Modifier.height(8.dp))
        MedicationRow(2, uiState.medName3, uiState.medDose3, uiState.medFreq3, viewModel::updateMedName3, viewModel::updateMedDose3, viewModel::updateMedFreq3)

        Spacer(modifier = Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        // Past conditions
        CheckboxGroup(
            title = "Riwayat Penyakit (pilih yang pernah dialami)",
            options = viewModel.pastConditionOptions,
            selectedOptions = uiState.pastConditions,
            onToggle = viewModel::togglePastCondition
        )

        if (uiState.pastConditions.contains("lainnya")) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = uiState.pastConditionsDetail,
                onValueChange = viewModel::updatePastConditionsDetail,
                label = { Text("Detail penyakit lainnya") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = defaultTextFieldColors()
            )
        }

        Spacer(modifier = Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        // Family history
        CheckboxGroup(
            title = "Riwayat Penyakit Keluarga",
            options = viewModel.familyHistoryOptions,
            selectedOptions = uiState.familyHistory,
            onToggle = viewModel::toggleFamilyHistory
        )

        if (uiState.familyHistory.contains("lainnya")) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = uiState.familyHistoryDetail,
                onValueChange = viewModel::updateFamilyHistoryDetail,
                label = { Text("Detail riwayat keluarga lainnya") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = defaultTextFieldColors()
            )
        }
    }
}

// ==================== Step 10: Confirmation ====================
@Composable
private fun Step10Confirmation(uiState: CompleteProfileUiState, viewModel: CompleteProfileViewModel) {
    Column {
        Text("✍️", fontSize = 48.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(modifier = Modifier.height(15.dp))
        Text("Konfirmasi & Tanda Tangan", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = IntakeTextPrimary)
        Text("Langkah terakhir untuk mengirim formulir", fontSize = 14.sp, color = IntakeTextSecondary, modifier = Modifier.padding(bottom = 20.dp))

        OutlinedTextField(
            value = uiState.patientSignature,
            onValueChange = viewModel::updatePatientSignature,
            label = { Text("Tanda Tangan (Ketik Nama Lengkap) *") },
            placeholder = { Text("Ketik nama lengkap Anda sebagai tanda tangan") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
            colors = defaultTextFieldColors()
        )

        Spacer(modifier = Modifier.height(20.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = IntakeInputBg),
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, IntakeBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                SingleCheckbox(
                    label = "Saya menyetujui data ini digunakan untuk pelayanan kesehatan di klinik dokterDIBYA",
                    checked = uiState.consentChecked,
                    onCheckedChange = viewModel::updateConsentChecked
                )

                Spacer(modifier = Modifier.height(8.dp))

                SingleCheckbox(
                    label = "Saya menyatakan bahwa semua informasi yang saya berikan adalah benar dan dapat dipertanggungjawabkan",
                    checked = uiState.finalAckChecked,
                    onCheckedChange = viewModel::updateFinalAckChecked
                )
            }
        }

        if (uiState.isExistingIntake) {
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = IntakePrimary.copy(alpha = 0.2f)),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, IntakePrimary.copy(alpha = 0.3f))
            ) {
                Text(
                    text = "Anda sedang memperbarui formulir yang sudah ada. Kode: ${uiState.existingQuickId ?: "-"}",
                    fontSize = 13.sp,
                    color = IntakeTextPrimary,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}

// ==================== Helper ====================
@Composable
private fun defaultTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = IntakeTextPrimary,
    unfocusedTextColor = IntakeTextPrimary,
    focusedContainerColor = IntakeInputBg,
    unfocusedContainerColor = IntakeInputBg,
    focusedBorderColor = IntakePrimary,
    unfocusedBorderColor = IntakeBorder,
    focusedLabelColor = IntakePrimary,
    unfocusedLabelColor = IntakeTextSecondary,
    cursorColor = IntakePrimary,
    focusedPlaceholderColor = IntakePlaceholder,
    unfocusedPlaceholderColor = IntakePlaceholder,
    focusedSupportingTextColor = IntakeTextSecondary,
    unfocusedSupportingTextColor = IntakeTextSecondary
)
