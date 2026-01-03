package com.dokterdibya.pharm.ui.screens.sales

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.pharm.data.model.Obat
import com.dokterdibya.pharm.ui.theme.*
import com.dokterdibya.pharm.viewmodel.FormItem
import com.dokterdibya.pharm.viewmodel.SalesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewSaleScreen(
    onBack: () -> Unit,
    onSaleCreated: (Int) -> Unit,
    viewModel: SalesViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val patientName by viewModel.patientName.collectAsState()
    val patientAge by viewModel.patientAge.collectAsState()
    val hospitalSource by viewModel.hospitalSource.collectAsState()
    val formItems by viewModel.formItems.collectAsState()

    val hospitals = listOf(
        "rsia_melinda" to "RSIA Melinda",
        "rsud_gambiran" to "RSUD Gambiran",
        "rs_bhayangkara" to "RS Bhayangkara"
    )

    // Error snackbar
    LaunchedEffect(uiState.error) {
        if (uiState.error != null) {
            // Error will be shown inline
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
        Column(modifier = Modifier.fillMaxSize()) {
            // Top Bar
            TopAppBar(
                title = { Text("Penjualan Baru", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Patient Info Card
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
                                color = TextPrimaryDark,
                                modifier = Modifier.padding(bottom = 16.dp)
                            )

                            // Patient Name
                            OutlinedTextField(
                                value = patientName,
                                onValueChange = { viewModel.updatePatientName(it) },
                                label = { Text("Nama Pasien *") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = textFieldColors()
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Patient Age
                            OutlinedTextField(
                                value = patientAge,
                                onValueChange = { viewModel.updatePatientAge(it) },
                                label = { Text("Umur") },
                                placeholder = { Text("contoh: 25 tahun") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = textFieldColors()
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Hospital
                            var hospitalExpanded by remember { mutableStateOf(false) }
                            ExposedDropdownMenuBox(
                                expanded = hospitalExpanded,
                                onExpandedChange = { hospitalExpanded = it }
                            ) {
                                OutlinedTextField(
                                    value = hospitals.find { it.first == hospitalSource }?.second ?: "",
                                    onValueChange = {},
                                    readOnly = true,
                                    label = { Text("Rumah Sakit *") },
                                    trailingIcon = {
                                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = hospitalExpanded)
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .menuAnchor(),
                                    colors = textFieldColors()
                                )

                                ExposedDropdownMenu(
                                    expanded = hospitalExpanded,
                                    onDismissRequest = { hospitalExpanded = false },
                                    modifier = Modifier.background(SurfaceDark)
                                ) {
                                    hospitals.forEach { (value, label) ->
                                        DropdownMenuItem(
                                            text = { Text(label, color = TextPrimaryDark) },
                                            onClick = {
                                                viewModel.updateHospitalSource(value)
                                                hospitalExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Items Card
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
                                color = TextPrimaryDark,
                                modifier = Modifier.padding(bottom = 16.dp)
                            )

                            formItems.forEachIndexed { index, item ->
                                ItemRow(
                                    index = index,
                                    item = item,
                                    obatList = uiState.obatList,
                                    onObatChange = { viewModel.updateItemObat(index, it) },
                                    onQuantityChange = { viewModel.updateItemQuantity(index, it) },
                                    onRemove = { viewModel.removeItem(index) },
                                    canRemove = formItems.size > 1
                                )
                                if (index < formItems.size - 1) {
                                    HorizontalDivider(
                                        color = GlassBorderDark,
                                        modifier = Modifier.padding(vertical = 12.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Add Item Button
                            OutlinedButton(
                                onClick = { viewModel.addItem() },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Primary
                                )
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Tambah Item")
                            }
                        }
                    }
                }

                // Total Card
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
                                text = "Rp ${String.format("%,.0f", viewModel.calculateTotal())}",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = WebAccent
                            )
                        }
                    }
                }

                // Error Message
                if (uiState.error != null) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Danger.copy(alpha = 0.1f))
                        ) {
                            Text(
                                text = uiState.error ?: "",
                                color = Danger,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                }

                // Submit Button
                item {
                    Button(
                        onClick = { viewModel.createSale { saleId -> onSaleCreated(saleId) } },
                        enabled = !uiState.isLoading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Save, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Simpan Penjualan", fontWeight = FontWeight.SemiBold)
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemRow(
    index: Int,
    item: FormItem,
    obatList: List<Obat>,
    onObatChange: (Obat) -> Unit,
    onQuantityChange: (Int) -> Unit,
    onRemove: () -> Unit,
    canRemove: Boolean
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Obat Selector
            var obatExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = obatExpanded,
                onExpandedChange = { obatExpanded = it },
                modifier = Modifier.weight(1f)
            ) {
                OutlinedTextField(
                    value = item.obat?.name ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Pilih Obat") },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = obatExpanded)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    colors = textFieldColors()
                )

                ExposedDropdownMenu(
                    expanded = obatExpanded,
                    onDismissRequest = { obatExpanded = false },
                    modifier = Modifier.background(SurfaceDark)
                ) {
                    obatList.forEach { obat ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(obat.name, color = TextPrimaryDark)
                                    Text(
                                        "Rp ${String.format("%,.0f", obat.price)} - Stok: ${obat.stock}",
                                        fontSize = 12.sp,
                                        color = TextSecondaryDark
                                    )
                                }
                            },
                            onClick = {
                                onObatChange(obat)
                                obatExpanded = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Quantity
            OutlinedTextField(
                value = item.quantity.toString(),
                onValueChange = { value ->
                    value.toIntOrNull()?.let { onQuantityChange(it) }
                },
                label = { Text("Qty") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(80.dp),
                singleLine = true,
                colors = textFieldColors()
            )

            // Remove Button
            if (canRemove) {
                IconButton(onClick = onRemove) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Hapus",
                        tint = Danger
                    )
                }
            }
        }

        // Price info
        if (item.obat != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "@ Rp ${String.format("%,.0f", item.obat.price)}",
                    fontSize = 13.sp,
                    color = TextSecondaryDark
                )
                Text(
                    text = "Subtotal: Rp ${String.format("%,.0f", item.obat.price * item.quantity)}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = WebAccent
                )
            }
        }
    }
}

@Composable
fun textFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Primary,
    unfocusedBorderColor = GlassBorderDark,
    focusedTextColor = TextPrimaryDark,
    unfocusedTextColor = TextPrimaryDark,
    focusedLabelColor = Primary,
    unfocusedLabelColor = TextSecondaryDark,
    cursorColor = Primary
)
