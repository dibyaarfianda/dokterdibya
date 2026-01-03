package com.dokterdibya.pharm.ui.screens.sales

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.pharm.data.model.ObatSale
import com.dokterdibya.pharm.ui.theme.*
import com.dokterdibya.pharm.viewmodel.AuthViewModel
import com.dokterdibya.pharm.viewmodel.SalesViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesListScreen(
    onNewSale: () -> Unit,
    onSaleClick: (Int) -> Unit,
    onLogout: () -> Unit,
    salesViewModel: SalesViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by salesViewModel.uiState.collectAsState()
    var showLogoutDialog by remember { mutableStateOf(false) }

    // Pull to refresh
    val pullRefreshState = rememberPullToRefreshState()
    if (pullRefreshState.isRefreshing) {
        LaunchedEffect(true) {
            salesViewModel.loadSales()
            pullRefreshState.endRefresh()
        }
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
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top Bar
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Penjualan Obat",
                            fontWeight = FontWeight.Bold,
                            color = TextPrimaryDark
                        )
                        Text(
                            text = "dokterDIBYA Pharm",
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { salesViewModel.loadSales() }) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = TextSecondaryDark
                        )
                    }
                    IconButton(onClick = { showLogoutDialog = true }) {
                        Icon(
                            Icons.Default.Logout,
                            contentDescription = "Logout",
                            tint = TextSecondaryDark
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )

            // Sales List
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .nestedScroll(pullRefreshState.nestedScrollConnection)
            ) {
                if (uiState.isLoading && uiState.sales.isEmpty()) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = Primary
                    )
                } else if (uiState.sales.isEmpty()) {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.ShoppingCart,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = TextSecondaryDark
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Belum ada penjualan",
                            color = TextSecondaryDark
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(uiState.sales) { sale ->
                            SaleCard(
                                sale = sale,
                                onClick = { onSaleClick(sale.id) }
                            )
                        }
                        // Bottom padding for FAB
                        item { Spacer(modifier = Modifier.height(80.dp)) }
                    }
                }

                PullToRefreshContainer(
                    state = pullRefreshState,
                    modifier = Modifier.align(Alignment.TopCenter),
                    containerColor = CardDark,
                    contentColor = Primary
                )
            }
        }

        // FAB
        FloatingActionButton(
            onClick = onNewSale,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            containerColor = Primary,
            contentColor = Color.White
        ) {
            Icon(Icons.Default.Add, contentDescription = "Penjualan Baru")
        }
    }

    // Logout Dialog
    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Logout") },
            text = { Text("Apakah Anda yakin ingin keluar?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        authViewModel.logout()
                        onLogout()
                    }
                ) {
                    Text("Logout", color = Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Batal")
                }
            },
            containerColor = CardDark,
            titleContentColor = TextPrimaryDark,
            textContentColor = TextSecondaryDark
        )
    }
}

@Composable
fun SaleCard(
    sale: ObatSale,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardDark
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Status indicator
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(
                        when (sale.status) {
                            "paid" -> Success.copy(alpha = 0.2f)
                            "confirmed", "payment_pending" -> Warning.copy(alpha = 0.2f)
                            else -> Primary.copy(alpha = 0.2f)
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    when (sale.status) {
                        "paid" -> Icons.Default.CheckCircle
                        "confirmed", "payment_pending" -> Icons.Default.Schedule
                        else -> Icons.Default.Edit
                    },
                    contentDescription = null,
                    tint = when (sale.status) {
                        "paid" -> Success
                        "confirmed", "payment_pending" -> Warning
                        else -> Primary
                    },
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = sale.patientName,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = sale.hospitalName ?: sale.hospitalSource,
                    fontSize = 13.sp,
                    color = TextSecondaryDark
                )
                Text(
                    text = formatDate(sale.createdAt),
                    fontSize = 12.sp,
                    color = TextSecondaryDark.copy(alpha = 0.7f)
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "Rp ${String.format("%,.0f", sale.total)}",
                    fontWeight = FontWeight.Bold,
                    color = WebAccent
                )
                StatusBadge(status = sale.status)
            }
        }
    }
}

@Composable
fun StatusBadge(status: String) {
    val (text, bgColor, textColor) = when (status) {
        "paid" -> Triple("Dibayar", Success.copy(alpha = 0.2f), Success)
        "confirmed" -> Triple("Dikonfirmasi", Warning.copy(alpha = 0.2f), Warning)
        "payment_pending" -> Triple("Menunggu", Warning.copy(alpha = 0.2f), Warning)
        else -> Triple("Draft", Primary.copy(alpha = 0.2f), Primary)
    }

    Surface(
        shape = RoundedCornerShape(4.dp),
        color = bgColor
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = textColor,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

fun formatDate(dateString: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        inputFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = inputFormat.parse(dateString)
        val outputFormat = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale("id", "ID"))
        outputFormat.timeZone = TimeZone.getTimeZone("Asia/Jakarta")
        outputFormat.format(date ?: Date())
    } catch (e: Exception) {
        dateString
    }
}
