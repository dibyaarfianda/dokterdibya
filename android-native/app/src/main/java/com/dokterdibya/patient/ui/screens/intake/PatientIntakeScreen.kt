package com.dokterdibya.patient.ui.screens.intake

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.PatientIntakeViewModel
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientIntakeScreen(
    onBack: () -> Unit,
    onComplete: () -> Unit,
    viewModel: PatientIntakeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Show snackbar for errors
    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            // Error will be shown in UI
        }
    }

    ThemedBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            if (uiState.isEditMode) "Edit Identitas Pribadi" else "Identitas Pribadi",
                            fontWeight = FontWeight.SemiBold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Kembali")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = TextPrimaryDark,
                        navigationIconContentColor = TextPrimaryDark
                    )
                )
            },
            containerColor = Color.Transparent
        ) { paddingValues ->
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Accent)
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                ) {
                    // Step indicator
                    StepIndicator(currentStep = uiState.currentStep)

                    // Error message
                    uiState.error?.let { error ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Danger.copy(alpha = 0.1f))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Warning,
                                    contentDescription = "Error",
                                    tint = Danger,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(error, color = Danger, fontSize = 13.sp)
                                Spacer(modifier = Modifier.weight(1f))
                                IconButton(onClick = { viewModel.clearError() }) {
                                    Icon(Icons.Default.Close, "Tutup", tint = Danger)
                                }
                            }
                        }
                    }

                    // Form content
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    ) {
                        when (uiState.currentStep) {
                            1 -> Step1PersonalInfo(uiState, viewModel, context)
                            2 -> Step2MedicalHistory(uiState, viewModel)
                            3 -> Step3Consent(uiState, viewModel)
                        }
                    }

                    // Navigation buttons
                    NavigationButtons(
                        currentStep = uiState.currentStep,
                        isSubmitting = uiState.isSubmitting,
                        onPrevious = { viewModel.previousStep() },
                        onNext = { viewModel.nextStep() },
                        onSubmit = { viewModel.submitForm(onComplete) }
                    )
                }
            }
        }
    }
}

@Composable
private fun StepIndicator(currentStep: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        listOf(
            "Informasi Pribadi",
            "Riwayat Medis",
            "Persetujuan"
        ).forEachIndexed { index, label ->
            val stepNumber = index + 1
            val isActive = stepNumber <= currentStep
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(
                            if (isActive) Accent else TextSecondaryDark.copy(alpha = 0.3f),
                            RoundedCornerShape(16.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (stepNumber < currentStep) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = "Selesai",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    } else {
                        Text(
                            "$stepNumber",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    label,
                    fontSize = 10.sp,
                    color = if (isActive) TextPrimaryDark else TextSecondaryDark,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun Step1PersonalInfo(
    uiState: com.dokterdibya.patient.viewmodel.PatientIntakeUiState,
    viewModel: PatientIntakeViewModel,
    context: android.content.Context
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        SectionTitle("Data Diri")

        FormTextField(
            value = uiState.fullName,
            onValueChange = { viewModel.updateFullName(it) },
            label = "Nama Lengkap *",
            placeholder = "Masukkan nama lengkap"
        )

        // Date picker for DOB
        var showDatePicker by remember { mutableStateOf(false) }
        FormTextField(
            value = uiState.dob,
            onValueChange = {},
            label = "Tanggal Lahir *",
            placeholder = "YYYY-MM-DD",
            readOnly = true,
            trailingIcon = {
                IconButton(onClick = { showDatePicker = true }) {
                    Icon(Icons.Default.CalendarToday, "Pilih tanggal", tint = Accent)
                }
            },
            modifier = Modifier.clickable { showDatePicker = true }
        )

        if (showDatePicker) {
            val calendar = Calendar.getInstance()
            DatePickerDialog(
                context,
                { _, year, month, day ->
                    viewModel.updateDob(String.format("%04d-%02d-%02d", year, month + 1, day))
                    showDatePicker = false
                },
                calendar.get(Calendar.YEAR) - 25,
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            ).show()
        }

        FormTextField(
            value = uiState.phone,
            onValueChange = { viewModel.updatePhone(it) },
            label = "Nomor Telepon/WhatsApp *",
            placeholder = "08xxxxxxxxxx"
        )

        FormTextField(
            value = uiState.address,
            onValueChange = { viewModel.updateAddress(it) },
            label = "Alamat",
            placeholder = "Alamat lengkap",
            maxLines = 3
        )

        FormTextField(
            value = uiState.emergencyContact,
            onValueChange = { viewModel.updateEmergencyContact(it) },
            label = "Kontak Darurat",
            placeholder = "Nama dan nomor telepon"
        )

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Status")

        FormDropdown(
            value = uiState.maritalStatus,
            onValueChange = { viewModel.updateMaritalStatus(it) },
            label = "Status Pernikahan",
            options = listOf("single", "married", "divorced", "widowed"),
            optionLabels = listOf("Belum Menikah", "Menikah", "Cerai", "Janda/Duda")
        )

        if (uiState.maritalStatus == "married") {
            FormTextField(
                value = uiState.husbandName,
                onValueChange = { viewModel.updateHusbandName(it) },
                label = "Nama Suami",
                placeholder = "Nama lengkap suami"
            )
        }

        FormTextField(
            value = uiState.occupation,
            onValueChange = { viewModel.updateOccupation(it) },
            label = "Pekerjaan",
            placeholder = "Pekerjaan Anda"
        )

        FormDropdown(
            value = uiState.education,
            onValueChange = { viewModel.updateEducation(it) },
            label = "Pendidikan Terakhir",
            options = listOf("sd", "smp", "sma", "d3", "s1", "s2", "s3"),
            optionLabels = listOf("SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3")
        )

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Metode Pembayaran")

        PaymentMethodCheckboxes(
            selected = uiState.paymentMethods,
            onToggle = { viewModel.togglePaymentMethod(it) }
        )

        if (uiState.paymentMethods.contains("insurance")) {
            FormTextField(
                value = uiState.insuranceName,
                onValueChange = { viewModel.updateInsuranceName(it) },
                label = "Nama Asuransi",
                placeholder = "Nama perusahaan asuransi"
            )
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun Step2MedicalHistory(
    uiState: com.dokterdibya.patient.viewmodel.PatientIntakeUiState,
    viewModel: PatientIntakeViewModel
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        SectionTitle("Golongan Darah")

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("A", "B", "AB", "O").forEach { type ->
                FilterChip(
                    selected = uiState.bloodType == type,
                    onClick = { viewModel.updateBloodType(type) },
                    label = { Text(type) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Accent,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("+" to "Positif", "-" to "Negatif").forEach { (value, label) ->
                FilterChip(
                    selected = uiState.rhesus == value,
                    onClick = { viewModel.updateRhesus(value) },
                    label = { Text("Rhesus $label") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Accent,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Alergi")

        FormTextField(
            value = uiState.allergyDrugs,
            onValueChange = { viewModel.updateAllergyDrugs(it) },
            label = "Alergi Obat",
            placeholder = "Nama obat (atau '-' jika tidak ada)"
        )

        FormTextField(
            value = uiState.allergyFood,
            onValueChange = { viewModel.updateAllergyFood(it) },
            label = "Alergi Makanan",
            placeholder = "Nama makanan (atau '-' jika tidak ada)"
        )

        FormTextField(
            value = uiState.allergyEnv,
            onValueChange = { viewModel.updateAllergyEnv(it) },
            label = "Alergi Lingkungan",
            placeholder = "Debu, cuaca, dll (atau '-' jika tidak ada)"
        )

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Riwayat Penyakit")

        val pastConditionOptions = listOf(
            "diabetes" to "Diabetes",
            "hipertensi" to "Hipertensi",
            "jantung" to "Penyakit Jantung",
            "asma" to "Asma",
            "tbc" to "TBC",
            "hepatitis" to "Hepatitis",
            "hiv" to "HIV/AIDS",
            "kanker" to "Kanker",
            "tiroid" to "Gangguan Tiroid",
            "lainnya" to "Lainnya"
        )

        pastConditionOptions.forEach { (value, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { viewModel.togglePastCondition(value) }
                    .padding(vertical = 4.dp)
            ) {
                Checkbox(
                    checked = uiState.pastConditions.contains(value),
                    onCheckedChange = { viewModel.togglePastCondition(value) },
                    colors = CheckboxDefaults.colors(checkedColor = Accent)
                )
                Text(label, color = TextPrimaryDark, fontSize = 14.sp)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Riwayat Penyakit Keluarga")

        val familyHistoryOptions = listOf(
            "diabetes" to "Diabetes",
            "hipertensi" to "Hipertensi",
            "jantung" to "Penyakit Jantung",
            "kanker" to "Kanker",
            "stroke" to "Stroke"
        )

        familyHistoryOptions.forEach { (value, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { viewModel.toggleFamilyHistory(value) }
                    .padding(vertical = 4.dp)
            ) {
                Checkbox(
                    checked = uiState.familyHistory.contains(value),
                    onCheckedChange = { viewModel.toggleFamilyHistory(value) },
                    colors = CheckboxDefaults.colors(checkedColor = Accent)
                )
                Text(label, color = TextPrimaryDark, fontSize = 14.sp)
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun Step3Consent(
    uiState: com.dokterdibya.patient.viewmodel.PatientIntakeUiState,
    viewModel: PatientIntakeViewModel
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        SectionTitle("Tanda Tangan Digital")

        FormTextField(
            value = uiState.patientSignature,
            onValueChange = { viewModel.updateSignature(it) },
            label = "Ketik Nama Lengkap Anda *",
            placeholder = "Nama lengkap sebagai tanda tangan"
        )

        Text(
            "Dengan mengetik nama Anda di atas, Anda menyatakan bahwa data yang diberikan adalah benar.",
            fontSize = 12.sp,
            color = TextSecondaryDark,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))
        SectionTitle("Pernyataan Persetujuan")

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = WebCardBg),
            border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.updateConsent(!uiState.consent) }
                ) {
                    Checkbox(
                        checked = uiState.consent,
                        onCheckedChange = { viewModel.updateConsent(it) },
                        colors = CheckboxDefaults.colors(checkedColor = Accent)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Saya menyetujui bahwa data pribadi saya digunakan untuk keperluan medis di klinik dokterDIBYA dan mitra rumah sakit.",
                        fontSize = 13.sp,
                        color = TextPrimaryDark
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.updateFinalAck(!uiState.finalAck) }
                ) {
                    Checkbox(
                        checked = uiState.finalAck,
                        onCheckedChange = { viewModel.updateFinalAck(it) },
                        colors = CheckboxDefaults.colors(checkedColor = Accent)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Saya menyatakan bahwa semua informasi yang saya berikan adalah benar dan dapat dipertanggungjawabkan.",
                        fontSize = 13.sp,
                        color = TextPrimaryDark
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun NavigationButtons(
    currentStep: Int,
    isSubmitting: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onSubmit: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(BgDark)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (currentStep > 1) {
            OutlinedButton(
                onClick = onPrevious,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent),
                border = androidx.compose.foundation.BorderStroke(1.dp, Accent)
            ) {
                Icon(Icons.Default.ChevronLeft, "Kembali")
                Text("Kembali")
            }
        }

        if (currentStep < 3) {
            Button(
                onClick = onNext,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) {
                Text("Lanjut")
                Icon(Icons.Default.ChevronRight, "Lanjut")
            }
        } else {
            Button(
                onClick = onSubmit,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Success),
                enabled = !isSubmitting
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(Icons.Default.Check, "Simpan")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Simpan")
                }
            }
        }
    }
}

// Helper composables
@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
        color = Accent,
        modifier = Modifier.padding(bottom = 12.dp)
    )
}

@Composable
private fun FormTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    maxLines: Int = 1,
    trailingIcon: @Composable (() -> Unit)? = null
) {
    Column(modifier = modifier.padding(bottom = 12.dp)) {
        Text(
            label,
            fontSize = 13.sp,
            color = TextSecondaryDark,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = TextSecondaryDark.copy(alpha = 0.5f)) },
            modifier = Modifier.fillMaxWidth(),
            readOnly = readOnly,
            maxLines = maxLines,
            trailingIcon = trailingIcon,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = WebCardBorder,
                focusedTextColor = TextPrimaryDark,
                unfocusedTextColor = TextPrimaryDark,
                cursorColor = Accent
            ),
            shape = RoundedCornerShape(8.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FormDropdown(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    options: List<String>,
    optionLabels: List<String>
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.indexOf(value).takeIf { it >= 0 }?.let { optionLabels[it] } ?: ""

    Column(modifier = Modifier.padding(bottom = 12.dp)) {
        Text(
            label,
            fontSize = 13.sp,
            color = TextSecondaryDark,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = selectedLabel,
                onValueChange = {},
                readOnly = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = WebCardBorder,
                    focusedTextColor = TextPrimaryDark,
                    unfocusedTextColor = TextPrimaryDark
                ),
                shape = RoundedCornerShape(8.dp)
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEachIndexed { index, option ->
                    DropdownMenuItem(
                        text = { Text(optionLabels[index]) },
                        onClick = {
                            onValueChange(option)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun PaymentMethodCheckboxes(
    selected: List<String>,
    onToggle: (String) -> Unit
) {
    val options = listOf(
        "self" to "Pribadi",
        "bpjs" to "BPJS",
        "insurance" to "Asuransi"
    )

    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        options.forEach { (value, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onToggle(value) }
            ) {
                Checkbox(
                    checked = selected.contains(value),
                    onCheckedChange = { onToggle(value) },
                    colors = CheckboxDefaults.colors(checkedColor = Accent)
                )
                Text(label, color = TextPrimaryDark, fontSize = 14.sp)
            }
        }
    }
}
