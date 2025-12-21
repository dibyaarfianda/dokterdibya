package com.dokterdibya.patient.ui.screens.history

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.data.api.Billing
import com.dokterdibya.patient.data.api.BillingDetail
import com.dokterdibya.patient.data.api.BillingItem
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.VisitHistoryViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VisitHistoryScreen(
    onBack: () -> Unit,
    viewModel: VisitHistoryViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (uiState.selectedVisit != null)
                            "Detail Kunjungan"
                        else
                            "Riwayat Kunjungan",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (uiState.selectedVisit != null) {
                            viewModel.clearSelectedVisit()
                        } else {
                            onBack()
                        }
                    }) {
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
        ) {
            if (uiState.selectedVisit != null) {
                VisitDetailContent(
                    detail = uiState.selectedVisit!!,
                    viewModel = viewModel
                )
            } else {
                VisitListContent(
                    isLoading = uiState.isLoading,
                    error = uiState.error,
                    visits = uiState.visits,
                    viewModel = viewModel,
                    onVisitClick = { billing ->
                        viewModel.loadVisitDetails(billing.id)
                    },
                    onRetry = { viewModel.loadVisitHistory() }
                )
            }
        }
    }
}

@Composable
fun VisitListContent(
    isLoading: Boolean,
    error: String?,
    visits: List<Billing>,
    viewModel: VisitHistoryViewModel,
    onVisitClick: (Billing) -> Unit,
    onRetry: () -> Unit
) {
    if (isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = Accent)
        }
    } else if (error != null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = Danger,
                    modifier = Modifier.size(48.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    error,
                    color = TextSecondaryDark,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(containerColor = Accent)
                ) {
                    Text("Coba Lagi")
                }
            }
        }
    } else if (visits.isEmpty()) {
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
                    "Belum Ada Riwayat Kunjungan",
                    color = TextPrimaryDark,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Anda belum memiliki riwayat kunjungan di klinik kami",
                    color = TextSecondaryDark,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center
                )
            }
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(visits) { visit ->
                VisitCard(
                    billing = visit,
                    viewModel = viewModel,
                    onClick = { onVisitClick(visit) }
                )
            }
        }
    }
}

@Composable
fun VisitCard(
    billing: Billing,
    viewModel: VisitHistoryViewModel,
    onClick: () -> Unit
) {
    val statusColor = when (billing.payment_status?.lowercase()) {
        "paid" -> Success
        "unpaid" -> Danger
        "partial" -> Warning
        else -> TextSecondaryDark
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Header with gradient-like appearance
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Accent,
                shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painter = painterResource(id = R.drawable.book),
                                contentDescription = null,
                                tint = TextPrimaryDark,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                viewModel.formatDate(billing.billing_date),
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimaryDark
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Invoice: ${billing.billing_number ?: "-"}",
                            fontSize = 12.sp,
                            color = TextPrimaryDark.copy(alpha = 0.9f)
                        )
                    }

                    // Status badge
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = statusColor
                    ) {
                        Text(
                            viewModel.getPaymentStatusText(billing.payment_status),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimaryDark
                        )
                    }
                }
            }

            // Content
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Total",
                    color = TextSecondaryDark,
                    fontSize = 14.sp
                )
                Text(
                    viewModel.formatRupiah(billing.total_amount),
                    color = TextPrimaryDark,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Tap indicator
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Ketuk untuk melihat detail",
                    color = TextSecondaryDark,
                    fontSize = 12.sp
                )
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = TextSecondaryDark,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

@Composable
fun VisitDetailContent(
    detail: BillingDetail,
    viewModel: VisitHistoryViewModel
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Visit info card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = CardDark)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painter = painterResource(id = R.drawable.erm),
                            contentDescription = null,
                            tint = Accent,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Informasi Kunjungan",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimaryDark
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    DetailRow("Nomor Invoice", detail.billing_number ?: "-")
                    DetailRow("Tanggal", viewModel.formatDate(detail.billing_date))
                    DetailRow("Status", viewModel.getPaymentStatusText(detail.payment_status))
                }
            }
        }

        // Items section
        if (detail.items.isNotEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CardDark)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.List,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Rincian Tindakan & Obat",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimaryDark
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        detail.items.forEach { item ->
                            BillingItemRow(item, viewModel)
                            if (item != detail.items.last()) {
                                Divider(
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    color = TextSecondaryDark.copy(alpha = 0.2f)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Payment summary
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = CardDark)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Payment,
                            contentDescription = null,
                            tint = Accent,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Ringkasan Pembayaran",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimaryDark
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    PaymentRow("Subtotal", viewModel.formatRupiah(detail.subtotal))

                    if ((detail.discount_amount ?: 0.0) > 0) {
                        PaymentRow(
                            "Diskon (${detail.discount_percent?.toInt() ?: 0}%)",
                            "- ${viewModel.formatRupiah(detail.discount_amount)}"
                        )
                    }

                    if ((detail.tax_amount ?: 0.0) > 0) {
                        PaymentRow(
                            "Pajak (${detail.tax_percent?.toInt() ?: 0}%)",
                            viewModel.formatRupiah(detail.tax_amount)
                        )
                    }

                    Divider(
                        modifier = Modifier.padding(vertical = 12.dp),
                        color = TextSecondaryDark.copy(alpha = 0.3f)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "Total",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimaryDark
                        )
                        Text(
                            viewModel.formatRupiah(detail.total_amount),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = Accent
                        )
                    }

                    if ((detail.paid_amount ?: 0.0) > 0) {
                        Spacer(modifier = Modifier.height(8.dp))
                        PaymentRow("Dibayar", viewModel.formatRupiah(detail.paid_amount))

                        val remaining = detail.total_amount - (detail.paid_amount ?: 0.0)
                        if (remaining > 0) {
                            PaymentRow("Sisa", viewModel.formatRupiah(remaining), Danger)
                        }
                    }
                }
            }
        }

        // Notes
        if (!detail.notes.isNullOrEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CardDark)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Notes,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Catatan",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimaryDark
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            detail.notes!!,
                            color = TextSecondaryDark,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label,
            color = TextSecondaryDark,
            fontSize = 14.sp
        )
        Text(
            value,
            color = TextPrimaryDark,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun BillingItemRow(item: BillingItem, viewModel: VisitHistoryViewModel) {
    val typeColor = when (item.item_type?.lowercase()) {
        "consultation" -> Accent
        "medication" -> Success
        "procedure" -> Warning
        "lab" -> Info
        else -> TextSecondaryDark
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                // Type badge
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = typeColor.copy(alpha = 0.2f)
                ) {
                    Text(
                        viewModel.getItemTypeText(item.item_type),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = typeColor
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    item.item_name ?: "-",
                    fontWeight = FontWeight.Medium,
                    color = TextPrimaryDark,
                    fontSize = 14.sp
                )

                if (!item.description.isNullOrEmpty()) {
                    Text(
                        item.description!!,
                        color = TextSecondaryDark,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${item.quantity.toInt()} x ${viewModel.formatRupiah(item.unit_price)}",
                    color = TextSecondaryDark,
                    fontSize = 12.sp
                )
                Text(
                    viewModel.formatRupiah(item.total_amount),
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    fontSize = 14.sp
                )
            }
        }
    }
}

@Composable
fun PaymentRow(
    label: String,
    value: String,
    valueColor: androidx.compose.ui.graphics.Color = TextPrimaryDark
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label,
            color = TextSecondaryDark,
            fontSize = 14.sp
        )
        Text(
            value,
            color = valueColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
    }
}
