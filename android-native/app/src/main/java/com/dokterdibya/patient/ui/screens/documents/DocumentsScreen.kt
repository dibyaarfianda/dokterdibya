package com.dokterdibya.patient.ui.screens.documents

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.DocumentsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentsScreen(
    onBack: () -> Unit,
    onNavigateToViewer: (Int) -> Unit = {},
    viewModel: DocumentsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Dokumen",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BgDark,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )
        },
        containerColor = BgDark
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            // Filter tabs - only Resume Medis and Hasil Lab
            var selectedTab by remember { mutableStateOf(0) }
            val tabs = listOf("Semua", "Resume Medis", "Hasil Lab")

            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.Transparent,
                contentColor = Accent
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = {
                            selectedTab = index
                            viewModel.filterByType(
                                when (index) {
                                    1 -> "resume"
                                    2 -> "lab"
                                    else -> null
                                }
                            )
                        },
                        text = {
                            Text(
                                title,
                                color = if (selectedTab == index) Accent else TextSecondaryDark
                            )
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Success)
                }
            } else if (uiState.documents.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            painter = painterResource(id = R.drawable.erm),
                            contentDescription = null,
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Belum ada dokumen",
                            color = TextSecondaryDark,
                            fontSize = 16.sp
                        )
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(uiState.documents) { doc ->
                        DocumentCard(
                            title = doc.title,
                            type = doc.type,
                            date = doc.date,
                            onClick = {
                                // Resume medis opens in viewer, others open URL
                                if (doc.type.lowercase() == "resume_medis") {
                                    onNavigateToViewer(doc.id)
                                } else if (doc.url.isNotEmpty()) {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(doc.url))
                                    context.startActivity(intent)
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun DocumentCard(
    title: String,
    type: String,
    date: String,
    onClick: () -> Unit
) {
    val (iconRes, color) = when (type.lowercase()) {
        "invoice" -> R.drawable.erm to Accent
        "etiket" -> R.drawable.vit to Purple
        "resume", "resume_medis" -> R.drawable.erm to Success
        "lab_result", "patient_lab", "lab" -> R.drawable.lab to Warning
        else -> R.drawable.erm to TextSecondaryDark
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painter = painterResource(id = iconRes),
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimaryDark,
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row {
                    Text(
                        type.replaceFirstChar { it.uppercase() },
                        fontSize = 12.sp,
                        color = color
                    )
                    Text(
                        " • $date",
                        fontSize = 12.sp,
                        color = TextSecondaryDark
                    )
                }
            }
            Icon(
                if (type.lowercase() == "resume_medis") Icons.Default.Visibility else Icons.Default.Download,
                contentDescription = if (type.lowercase() == "resume_medis") "View" else "Download",
                tint = TextSecondaryDark,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
