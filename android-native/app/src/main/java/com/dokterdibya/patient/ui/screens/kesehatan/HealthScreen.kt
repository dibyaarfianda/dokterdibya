package com.dokterdibya.patient.ui.screens.kesehatan

import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.model.IntakePayload
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.HealthViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthScreen(
    onBack: () -> Unit,
    onEditIntake: () -> Unit,
    viewModel: HealthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollState = rememberScrollState()

    ThemedBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            "Kesehatan Saya",
                            fontWeight = FontWeight.SemiBold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                        }
                    },
                    actions = {
                        if (uiState.hasIntake) {
                            IconButton(onClick = onEditIntake) {
                                Icon(Icons.Default.Edit, "Edit", tint = Accent)
                            }
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
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(16.dp)
                    .verticalScroll(scrollState)
            ) {
                if (uiState.isLoading) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Accent)
                    }
                } else if (!uiState.hasIntake) {
                    // No intake data yet
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp)
                        ) {
                            Icon(
                                Icons.Default.HealthAndSafety,
                                contentDescription = null,
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(64.dp)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                "Belum ada data kesehatan",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Medium,
                                color = TextPrimaryDark
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Lengkapi formulir identitas untuk melihat ringkasan kesehatan Anda",
                                fontSize = 14.sp,
                                color = TextSecondaryDark,
                                modifier = Modifier.padding(horizontal = 16.dp)
                            )
                            Spacer(modifier = Modifier.height(24.dp))
                            Button(
                                onClick = onEditIntake,
                                colors = ButtonDefaults.buttonColors(containerColor = Accent)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Isi Formulir")
                            }
                        }
                    }
                } else {
                    // Show health data
                    uiState.intake?.let { intake ->
                        HealthContent(intake = intake)
                    }
                }
            }
        }
    }
}

@Composable
fun HealthContent(intake: IntakePayload) {
    // Blood Type & Rhesus
    if (!intake.bloodType.isNullOrEmpty() || !intake.rhesus.isNullOrEmpty()) {
        HealthSection(
            title = "Golongan Darah",
            icon = Icons.Default.Bloodtype,
            color = Danger
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                BloodTypeCard(
                    label = "Golongan",
                    value = intake.bloodType ?: "-"
                )
                BloodTypeCard(
                    label = "Rhesus",
                    value = intake.rhesus ?: "-"
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
    }

    // Allergies
    val hasAllergies = !intake.allergyDrugs.isNullOrEmpty() ||
            !intake.allergyFood.isNullOrEmpty() ||
            !intake.allergyEnv.isNullOrEmpty()

    HealthSection(
        title = "Alergi",
        icon = Icons.Default.Warning,
        color = Warning
    ) {
        if (hasAllergies) {
            if (!intake.allergyDrugs.isNullOrEmpty()) {
                AllergyItem(type = "Obat", value = intake.allergyDrugs)
            }
            if (!intake.allergyFood.isNullOrEmpty()) {
                AllergyItem(type = "Makanan", value = intake.allergyFood)
            }
            if (!intake.allergyEnv.isNullOrEmpty()) {
                AllergyItem(type = "Lingkungan", value = intake.allergyEnv)
            }
        } else {
            Text(
                "Tidak ada alergi yang tercatat",
                color = Success,
                fontSize = 14.sp
            )
        }
    }
    Spacer(modifier = Modifier.height(16.dp))

    // Current Medications
    val hasMeds = !intake.medName1.isNullOrEmpty() ||
            !intake.medName2.isNullOrEmpty() ||
            !intake.medName3.isNullOrEmpty()

    HealthSection(
        title = "Obat yang Sedang Dikonsumsi",
        icon = Icons.Default.Medication,
        color = Purple
    ) {
        if (hasMeds) {
            if (!intake.medName1.isNullOrEmpty()) {
                MedicationItem(
                    name = intake.medName1,
                    dose = intake.medDose1,
                    freq = intake.medFreq1
                )
            }
            if (!intake.medName2.isNullOrEmpty()) {
                MedicationItem(
                    name = intake.medName2,
                    dose = intake.medDose2,
                    freq = intake.medFreq2
                )
            }
            if (!intake.medName3.isNullOrEmpty()) {
                MedicationItem(
                    name = intake.medName3,
                    dose = intake.medDose3,
                    freq = intake.medFreq3
                )
            }
        } else {
            Text(
                "Tidak ada obat rutin yang dikonsumsi",
                color = TextSecondaryDark,
                fontSize = 14.sp
            )
        }
    }
    Spacer(modifier = Modifier.height(16.dp))

    // Medical History
    HealthSection(
        title = "Riwayat Penyakit",
        icon = Icons.Default.History,
        color = Info
    ) {
        if (!intake.pastConditions.isNullOrEmpty()) {
            intake.pastConditions.forEach { condition ->
                ConditionChip(condition)
            }
            if (!intake.pastConditionsDetail.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Detail: ${intake.pastConditionsDetail}",
                    color = TextSecondaryDark,
                    fontSize = 13.sp
                )
            }
        } else {
            Text(
                "Tidak ada riwayat penyakit yang tercatat",
                color = TextSecondaryDark,
                fontSize = 14.sp
            )
        }
    }
    Spacer(modifier = Modifier.height(16.dp))

    // Family History
    HealthSection(
        title = "Riwayat Penyakit Keluarga",
        icon = Icons.Default.FamilyRestroom,
        color = Fertility
    ) {
        if (!intake.familyHistory.isNullOrEmpty()) {
            intake.familyHistory.forEach { condition ->
                ConditionChip(condition)
            }
            if (!intake.familyHistoryDetail.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Detail: ${intake.familyHistoryDetail}",
                    color = TextSecondaryDark,
                    fontSize = 13.sp
                )
            }
        } else {
            Text(
                "Tidak ada riwayat penyakit keluarga yang tercatat",
                color = TextSecondaryDark,
                fontSize = 14.sp
            )
        }
    }
    Spacer(modifier = Modifier.height(16.dp))

    // Obstetric History
    val hasObstetric = !intake.totalPregnancies.isNullOrEmpty() ||
            !intake.normalDeliveryCount.isNullOrEmpty() ||
            !intake.cesareanDeliveryCount.isNullOrEmpty()

    if (hasObstetric) {
        HealthSection(
            title = "Riwayat Obstetri",
            icon = Icons.Default.PregnantWoman,
            color = Accent
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                ObstetricStat(
                    label = "Kehamilan",
                    value = intake.totalPregnancies ?: "0"
                )
                ObstetricStat(
                    label = "Normal",
                    value = intake.normalDeliveryCount ?: "0"
                )
                ObstetricStat(
                    label = "SC",
                    value = intake.cesareanDeliveryCount ?: "0"
                )
                ObstetricStat(
                    label = "Keguguran",
                    value = intake.miscarriageCount ?: "0"
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
    }

    // Physical Info
    if (!intake.height.isNullOrEmpty()) {
        HealthSection(
            title = "Data Fisik",
            icon = Icons.Default.Height,
            color = Success
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Height,
                    contentDescription = null,
                    tint = Success,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Tinggi Badan: ${intake.height} cm",
                    fontSize = 14.sp,
                    color = TextPrimaryDark
                )
            }
        }
    }

    Spacer(modifier = Modifier.height(32.dp))
}

@Composable
fun HealthSection(
    title: String,
    icon: ImageVector,
    color: Color,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(bottom = 12.dp)
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )
            }
            content()
        }
    }
}

@Composable
fun BloodTypeCard(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            label,
            fontSize = 12.sp,
            color = TextSecondaryDark
        )
        Box(
            modifier = Modifier
                .padding(top = 4.dp)
                .size(56.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Danger.copy(alpha = 0.3f), Danger.copy(alpha = 0.1f))
                    ),
                    RoundedCornerShape(12.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                value,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Danger
            )
        }
    }
}

@Composable
fun AllergyItem(type: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(Warning, RoundedCornerShape(4.dp))
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            "$type: ",
            fontWeight = FontWeight.Medium,
            fontSize = 14.sp,
            color = TextPrimaryDark
        )
        Text(
            value,
            fontSize = 14.sp,
            color = TextSecondaryDark
        )
    }
}

@Composable
fun MedicationItem(name: String, dose: String?, freq: String?) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Purple.copy(alpha = 0.1f))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                name,
                fontWeight = FontWeight.Medium,
                fontSize = 14.sp,
                color = TextPrimaryDark
            )
            if (!dose.isNullOrEmpty() || !freq.isNullOrEmpty()) {
                Text(
                    "${dose ?: ""} ${if (!dose.isNullOrEmpty() && !freq.isNullOrEmpty()) "•" else ""} ${freq ?: ""}".trim(),
                    fontSize = 12.sp,
                    color = TextSecondaryDark
                )
            }
        }
    }
}

@Composable
fun ConditionChip(condition: String) {
    Box(
        modifier = Modifier
            .padding(end = 8.dp, bottom = 8.dp)
            .background(Info.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(
            condition,
            fontSize = 13.sp,
            color = Info
        )
    }
}

@Composable
fun ObstetricStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Accent
        )
        Text(
            label,
            fontSize = 11.sp,
            color = TextSecondaryDark
        )
    }
}
