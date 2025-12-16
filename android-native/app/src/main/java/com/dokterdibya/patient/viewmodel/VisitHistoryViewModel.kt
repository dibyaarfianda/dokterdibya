package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.Billing
import com.dokterdibya.patient.data.api.BillingDetail
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class VisitHistoryUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val visits: List<Billing> = emptyList(),
    val selectedVisit: BillingDetail? = null,
    val isLoadingDetail: Boolean = false
)

@HiltViewModel
class VisitHistoryViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(VisitHistoryUiState())
    val uiState: StateFlow<VisitHistoryUiState> = _uiState.asStateFlow()

    init {
        loadVisitHistory()
    }

    fun loadVisitHistory() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getVisitHistory()
                .onSuccess { visits ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        visits = visits
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message
                    )
                }
        }
    }

    fun loadVisitDetails(billingId: Int) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingDetail = true)

            repository.getVisitDetails(billingId)
                .onSuccess { detail ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingDetail = false,
                        selectedVisit = detail
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        isLoadingDetail = false
                    )
                }
        }
    }

    fun clearSelectedVisit() {
        _uiState.value = _uiState.value.copy(selectedVisit = null)
    }

    fun formatDate(dateString: String?): String {
        if (dateString.isNullOrEmpty()) return "-"
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val outputFormat = SimpleDateFormat("dd MMMM yyyy", Locale("id", "ID"))
            val date = inputFormat.parse(dateString.take(10))
            date?.let { outputFormat.format(it) } ?: dateString
        } catch (e: Exception) {
            dateString.take(10)
        }
    }

    fun formatRupiah(amount: Double?): String {
        if (amount == null) return "Rp 0"
        val format = NumberFormat.getCurrencyInstance(Locale("id", "ID"))
        return format.format(amount).replace(",00", "")
    }

    fun getPaymentStatusText(status: String?): String {
        return when (status?.lowercase()) {
            "paid" -> "Lunas"
            "unpaid" -> "Belum Bayar"
            "partial" -> "Belum Lunas"
            else -> status ?: "Unknown"
        }
    }

    fun getItemTypeText(type: String?): String {
        return when (type?.lowercase()) {
            "consultation" -> "Konsultasi"
            "service" -> "Layanan"
            "medication" -> "Obat"
            "procedure" -> "Tindakan"
            "lab" -> "Laboratorium"
            else -> type ?: "Lainnya"
        }
    }
}
