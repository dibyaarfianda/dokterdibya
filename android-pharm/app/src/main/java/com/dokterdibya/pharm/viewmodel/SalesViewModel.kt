package com.dokterdibya.pharm.viewmodel

import android.content.Context
import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.pharm.data.model.Obat
import com.dokterdibya.pharm.data.model.ObatSale
import com.dokterdibya.pharm.data.model.SaleItemRequest
import com.dokterdibya.pharm.data.repository.SalesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class SalesUiState(
    val isLoading: Boolean = false,
    val sales: List<ObatSale> = emptyList(),
    val obatList: List<Obat> = emptyList(),
    val selectedSale: ObatSale? = null,
    val error: String? = null,
    val successMessage: String? = null
)

data class FormItem(
    val obat: Obat? = null,
    val quantity: Int = 1
)

@HiltViewModel
class SalesViewModel @Inject constructor(
    private val salesRepository: SalesRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SalesUiState())
    val uiState: StateFlow<SalesUiState> = _uiState.asStateFlow()

    // Form state
    private val _patientName = MutableStateFlow("")
    val patientName: StateFlow<String> = _patientName.asStateFlow()

    private val _patientAge = MutableStateFlow("")
    val patientAge: StateFlow<String> = _patientAge.asStateFlow()

    private val _hospitalSource = MutableStateFlow("rsia_melinda")
    val hospitalSource: StateFlow<String> = _hospitalSource.asStateFlow()

    private val _formItems = MutableStateFlow<List<FormItem>>(listOf(FormItem()))
    val formItems: StateFlow<List<FormItem>> = _formItems.asStateFlow()

    init {
        loadSales()
        // loadObatList() is called from NewSaleScreen to avoid race condition with token
    }

    fun loadSales() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.getSales().fold(
                onSuccess = { sales ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        sales = sales
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    fun loadObatList() {
        viewModelScope.launch {
            salesRepository.getObatList().fold(
                onSuccess = { obatList ->
                    _uiState.value = _uiState.value.copy(obatList = obatList)
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        error = "Gagal memuat daftar obat: ${error.message}"
                    )
                }
            )
        }
    }

    fun loadSaleDetail(id: Int) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.getSaleDetail(id).fold(
                onSuccess = { sale ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        selectedSale = sale
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    // Form updates
    fun updatePatientName(value: String) { _patientName.value = value }
    fun updatePatientAge(value: String) { _patientAge.value = value }
    fun updateHospitalSource(value: String) { _hospitalSource.value = value }

    fun addItem() {
        _formItems.value = _formItems.value + FormItem()
    }

    fun removeItem(index: Int) {
        if (_formItems.value.size > 1) {
            _formItems.value = _formItems.value.toMutableList().also { it.removeAt(index) }
        }
    }

    fun updateItemObat(index: Int, obat: Obat) {
        _formItems.value = _formItems.value.toMutableList().also {
            it[index] = it[index].copy(obat = obat)
        }
    }

    fun updateItemQuantity(index: Int, quantity: Int) {
        _formItems.value = _formItems.value.toMutableList().also {
            it[index] = it[index].copy(quantity = quantity.coerceAtLeast(1))
        }
    }

    fun resetForm() {
        _patientName.value = ""
        _patientAge.value = ""
        _hospitalSource.value = "rsia_melinda"
        _formItems.value = listOf(FormItem())
    }

    fun calculateTotal(): Double {
        return _formItems.value.sumOf { item ->
            (item.obat?.price ?: 0.0) * item.quantity
        }
    }

    fun createSale(onSuccess: (Int) -> Unit) {
        val items = _formItems.value
            .filter { it.obat != null }
            .map { SaleItemRequest(it.obat!!.id, it.quantity) }

        if (_patientName.value.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Nama pasien harus diisi")
            return
        }

        if (items.isEmpty()) {
            _uiState.value = _uiState.value.copy(error = "Pilih minimal 1 obat")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.createSale(
                patientName = _patientName.value,
                patientAge = _patientAge.value.ifBlank { null },
                hospitalSource = _hospitalSource.value,
                items = items
            ).fold(
                onSuccess = { sale ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Penjualan berhasil dibuat"
                    )
                    resetForm()
                    loadSales()
                    onSuccess(sale.id)
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    fun confirmSale(id: Int, paymentMethod: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.confirmSale(id, paymentMethod).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Penjualan berhasil dikonfirmasi"
                    )
                    loadSales()
                    loadSaleDetail(id)
                    onSuccess()
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    fun shareInvoiceViaWhatsApp(context: Context, saleId: Int) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.getInvoiceBase64(saleId).fold(
                onSuccess = { response ->
                    try {
                        // Decode base64 to bytes
                        val pdfBytes = Base64.decode(response.base64, Base64.DEFAULT)

                        // Save to cache directory
                        val cacheDir = File(context.cacheDir, "invoices")
                        cacheDir.mkdirs()
                        val pdfFile = File(cacheDir, response.filename ?: "invoice.pdf")
                        pdfFile.writeBytes(pdfBytes)

                        // Get URI via FileProvider
                        val uri = FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.provider",
                            pdfFile
                        )

                        // Create WhatsApp intent
                        val sale = _uiState.value.selectedSale
                        val message = buildString {
                            appendLine("Invoice Penjualan Obat")
                            appendLine("Pasien: ${sale?.patientName ?: "-"}")
                            appendLine("No: ${sale?.saleNumber ?: "-"}")
                            appendLine("Total: Rp ${String.format("%,.0f", sale?.total ?: 0.0)}")
                            appendLine()
                            appendLine("Silakan lihat lampiran PDF.")
                        }

                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "application/pdf"
                            putExtra(Intent.EXTRA_STREAM, uri)
                            putExtra(Intent.EXTRA_TEXT, message)
                            setPackage("com.whatsapp")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }

                        _uiState.value = _uiState.value.copy(isLoading = false)

                        // Try WhatsApp, fallback to chooser
                        try {
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            // WhatsApp not installed, use chooser
                            val chooser = Intent.createChooser(
                                Intent(Intent.ACTION_SEND).apply {
                                    type = "application/pdf"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    putExtra(Intent.EXTRA_TEXT, message)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                },
                                "Kirim Invoice"
                            )
                            context.startActivity(chooser)
                        }
                    } catch (e: Exception) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = "Gagal membuka WhatsApp: ${e.message}"
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    fun deleteSale(id: Int, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            salesRepository.deleteSale(id).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Penjualan berhasil dihapus"
                    )
                    loadSales()
                    onSuccess()
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message
                    )
                }
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun clearSuccess() {
        _uiState.value = _uiState.value.copy(successMessage = null)
    }
}
