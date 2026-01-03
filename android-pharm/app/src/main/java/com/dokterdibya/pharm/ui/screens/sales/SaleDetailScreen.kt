package com.dokterdibya.pharm.ui.screens.sales

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.pharm.ui.theme.*
import com.dokterdibya.pharm.viewmodel.SalesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaleDetailScreen(
    saleId: Int,
    onBack: () -> Unit,
    viewModel: SalesViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val sale = uiState.selectedSale

    var showConfirmDialog by remember { mutableStateOf(false) }
    var selectedPaymentMethod by remember { mutableStateOf("cash") }
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Load sale detail on start
    LaunchedEffect(saleId) {
        viewModel.loadSaleDetail(saleId)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(BgDark, BgDarkEnd)
                )
            )
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Top Bar
            TopAppBar(
                title = { Text("Detail Penjualan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (sale?.status == "draft") {
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Danger)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )

            if (uiState.isLoading && sale == null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Primary)
                }
            } else if (sale != null) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Sale Number & Status
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = CardDark)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = sale.saleNumber,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 18.sp,
                                        color = WebAccent
                                    )
                                    StatusBadge(status = sale.status)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = formatDate(sale.createdAt),
                                    fontSize = 13.sp,
                                    color = TextSecondaryDark
                                )
                            }
                        }
                    }

                    // Patient Info
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = CardDark)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Informasi Pasien",
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextSecondaryDark,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(bottom = 12.dp)
                                )

                                InfoRow("Nama", sale.patientName)
                                sale.patientAge?.let { InfoRow("Umur", it) }
                                InfoRow("Rumah Sakit", sale.hospitalName ?: sale.hospitalSource)
                                sale.paymentMethod?.let {
                                    InfoRow("Metode Bayar", when(it) {
                                        "cash" -> "Tunai"
                                        "bpjs" -> "BPJS"
                                        "insurance" -> "Asuransi"
                                        else -> it
                                    })
                                }
                            }
                        }
                    }

                    // Items
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = CardDark)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Item Obat/Alkes",
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextSecondaryDark,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(bottom = 12.dp)
                                )

                                sale.items?.forEachIndexed { index, item ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = item.obatName ?: "Obat #${item.obatId}",
                                                fontWeight = FontWeight.Medium,
                                                color = TextPrimaryDark
                                            )
                                            Text(
                                                text = "${item.quantity} x Rp ${String.format("%,.0f", item.price ?: 0.0)}",
                                                fontSize = 13.sp,
                                                color = TextSecondaryDark
                                            )
                                        }
                                        Text(
                                            text = "Rp ${String.format("%,.0f", item.total ?: 0.0)}",
                                            fontWeight = FontWeight.Medium,
                                            color = WebAccent
                                        )
                                    }
                                    if (index < (sale.items?.size ?: 0) - 1) {
                                        HorizontalDivider(
                                            color = GlassBorderDark,
                                            modifier = Modifier.padding(vertical = 8.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Total
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Primary.copy(alpha = 0.1f))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "TOTAL",
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimaryDark
                                )
                                Text(
                                    text = "Rp ${String.format("%,.0f", sale.total)}",
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = WebAccent
                                )
                            }
                        }
                    }

                    // Actions
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            when (sale.status) {
                                "draft" -> {
                                    // Confirm button
                                    Button(
                                        onClick = { showConfirmDialog = true },
                                        enabled = !uiState.isLoading,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(56.dp),
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Success)
                                    ) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Konfirmasi Penjualan", fontWeight = FontWeight.SemiBold)
                                    }
                                }
                                "confirmed", "payment_pending", "paid" -> {
                                    // WhatsApp Share button
                                    Button(
                                        onClick = { viewModel.shareInvoiceViaWhatsApp(context, saleId) },
                                        enabled = !uiState.isLoading,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(56.dp),
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Success)
                                    ) {
                                        if (uiState.isLoading) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(24.dp),
                                                color = Color.White,
                                                strokeWidth = 2.dp
                                            )
                                        } else {
                                            Icon(Icons.Default.Share, contentDescription = null)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Kirim via WhatsApp", fontWeight = FontWeight.SemiBold)
                                        }
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(32.dp))
                    }
                }
            }
        }

        // Loading overlay
        if (uiState.isLoading && sale != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Primary)
            }
        }
    }

    // Confirm Dialog
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Konfirmasi Penjualan") },
            text = {
                Column {
                    Text(
                        "Pilih metode pembayaran:",
                        modifier = Modifier.padding(bottom = 16.dp)
                    )

                    val paymentMethods = listOf(
                        "cash" to "Tunai",
                        "bpjs" to "BPJS",
                        "insurance" to "Asuransi"
                    )

                    paymentMethods.forEach { (value, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selectedPaymentMethod == value,
                                onClick = { selectedPaymentMethod = value },
                                colors = RadioButtonDefaults.colors(
                                    selectedColor = Primary
                                )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(label, color = TextPrimaryDark)
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        viewModel.confirmSale(saleId, selectedPaymentMethod) {}
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Success)
                ) {
                    Text("Konfirmasi")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Batal")
                }
            },
            containerColor = CardDark,
            titleContentColor = TextPrimaryDark,
            textContentColor = TextSecondaryDark
        )
    }

    // Delete Dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Hapus Penjualan") },
            text = { Text("Apakah Anda yakin ingin menghapus penjualan ini?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deleteSale(saleId) { onBack() }
                    }
                ) {
                    Text("Hapus", color = Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Batal")
                }
            },
            containerColor = CardDark,
            titleContentColor = TextPrimaryDark,
            textContentColor = TextSecondaryDark
        )
    }

    // Error Snackbar
    uiState.error?.let { error ->
        LaunchedEffect(error) {
            // Show error
            viewModel.clearError()
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            color = TextSecondaryDark,
            fontSize = 14.sp
        )
        Text(
            text = value,
            fontWeight = FontWeight.Medium,
            color = TextPrimaryDark,
            fontSize = 14.sp
        )
    }
}
