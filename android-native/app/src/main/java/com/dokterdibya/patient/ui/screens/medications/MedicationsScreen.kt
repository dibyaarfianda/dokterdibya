package com.dokterdibya.patient.ui.screens.medications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.ui.res.painterResource
import com.dokterdibya.patient.R
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.api.Medication
import androidx.compose.ui.graphics.Color
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.MedicationsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicationsScreen(
    onBack: () -> Unit,
    viewModel: MedicationsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    ThemedBackground {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Jadwal Vitamin & Obat",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = Success
                    )
                }
                uiState.error != null -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            tint = Danger,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            uiState.error ?: "Terjadi kesalahan",
                            color = TextSecondaryDark
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.retry() }) {
                            Text("Coba Lagi")
                        }
                    }
                }
                uiState.medications.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.vit),
                            contentDescription = null,
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Belum ada riwayat terapi",
                            color = TextSecondaryDark,
                            fontSize = 16.sp
                        )
                        Text(
                            "Riwayat vitamin dan obat Anda akan muncul di sini",
                            color = TextSecondaryDark.copy(alpha = 0.7f),
                            fontSize = 13.sp
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(vertical = 16.dp)
                    ) {
                        // Current medications section
                        if (uiState.currentMedications.isNotEmpty()) {
                            item {
                                SectionHeader(
                                    title = "Terapi Aktif",
                                    subtitle = "Dalam 30 hari terakhir",
                                    color = Success
                                )
                            }
                            items(uiState.currentMedications) { medication ->
                                MedicationCard(medication = medication, isCurrent = true)
                            }
                        }

                        // Past medications section
                        if (uiState.pastMedications.isNotEmpty()) {
                            item {
                                Spacer(modifier = Modifier.height(8.dp))
                                SectionHeader(
                                    title = "Riwayat Sebelumnya",
                                    subtitle = "Lebih dari 30 hari",
                                    color = TextSecondaryDark
                                )
                            }
                            items(uiState.pastMedications) { medication ->
                                MedicationCard(medication = medication, isCurrent = false)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String,
    color: androidx.compose.ui.graphics.Color
) {
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Text(
            text = title,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = color
        )
        Text(
            text = subtitle,
            fontSize = 12.sp,
            color = TextSecondaryDark
        )
    }
}

@Composable
fun MedicationCard(
    medication: Medication,
    isCurrent: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (isCurrent) Success.copy(alpha = 0.2f)
                        else TextSecondaryDark.copy(alpha = 0.15f)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.vit),
                    contentDescription = null,
                    tint = if (isCurrent) Success else TextSecondaryDark,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                // MR ID badge
                if (!medication.mr_id.isNullOrEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = Accent.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = medication.mr_id,
                            fontSize = 10.sp,
                            color = Accent,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                }

                // Terapi content
                Text(
                    text = medication.terapi ?: "Terapi tidak tersedia",
                    fontSize = 14.sp,
                    color = TextPrimaryDark,
                    lineHeight = 20.sp
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Visit date
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.CalendarToday,
                        contentDescription = null,
                        tint = TextSecondaryDark,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = medication.visit_date ?: "-",
                        fontSize = 12.sp,
                        color = TextSecondaryDark
                    )
                }
            }

            // Status badge
            if (isCurrent) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Success.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = "Aktif",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = Success,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
    }
}
