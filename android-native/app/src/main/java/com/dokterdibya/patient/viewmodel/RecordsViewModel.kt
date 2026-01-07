package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.Billing
import com.dokterdibya.patient.data.model.PatientDocument
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MedicalRecordSummary(
    val id: Int,
    val mrId: String?,
    val visitDate: String,
    val location: String?,
    val totalAmount: Double,
    val status: String?,
    val hasInvoice: Boolean = false,
    val hasResume: Boolean = false
)

data class RecordsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val records: List<MedicalRecordSummary> = emptyList(),
    val documents: List<PatientDocument> = emptyList()
)

@HiltViewModel
class RecordsViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecordsUiState())
    val uiState: StateFlow<RecordsUiState> = _uiState.asStateFlow()

    init {
        loadRecords()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)

            val billingsResult = repository.getMyBillings()
            val documentsResult = repository.getDocuments()

            billingsResult
                .onSuccess { billings ->
                    val documents = documentsResult.getOrNull() ?: emptyList()
                    val records = billings.map { billing ->
                        val hasInvoice = documents.any {
                            it.mrId == billing.billing_number ||
                                    (it.documentType == "invoice" && it.visitDate == billing.billing_date)
                        }
                        val hasResume = documents.any {
                            it.mrId == billing.billing_number ||
                                    (it.documentType == "resume_medis" && it.visitDate == billing.billing_date)
                        }
                        MedicalRecordSummary(
                            id = billing.id,
                            mrId = billing.billing_number,
                            visitDate = formatDate(billing.billing_date),
                            location = getLocationLabel(billing.billing_number),
                            totalAmount = billing.total_amount,
                            status = billing.payment_status,
                            hasInvoice = hasInvoice,
                            hasResume = hasResume
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        isRefreshing = false,
                        records = records,
                        documents = documents
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isRefreshing = false)
                }
        }
    }

    fun loadRecords() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            // Load billings as medical records
            val billingsResult = repository.getMyBillings()
            val documentsResult = repository.getDocuments()

            billingsResult
                .onSuccess { billings ->
                    val documents = documentsResult.getOrNull() ?: emptyList()

                    val records = billings.map { billing ->
                        val hasInvoice = documents.any {
                            it.mrId == billing.billing_number ||
                                    (it.documentType == "invoice" && it.visitDate == billing.billing_date)
                        }
                        val hasResume = documents.any {
                            it.mrId == billing.billing_number ||
                                    (it.documentType == "resume_medis" && it.visitDate == billing.billing_date)
                        }

                        MedicalRecordSummary(
                            id = billing.id,
                            mrId = billing.billing_number,
                            visitDate = formatDate(billing.billing_date),
                            location = getLocationLabel(billing.billing_number),
                            totalAmount = billing.total_amount,
                            status = billing.payment_status,
                            hasInvoice = hasInvoice,
                            hasResume = hasResume
                        )
                    }

                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        records = records,
                        documents = documents
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

    private fun formatDate(dateStr: String?): String {
        if (dateStr.isNullOrEmpty()) return "-"
        return try {
            val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
            val outputFormat = java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale("id", "ID"))
            val date = inputFormat.parse(dateStr)
            date?.let { outputFormat.format(it) } ?: dateStr
        } catch (e: Exception) {
            dateStr
        }
    }

    private fun getLocationLabel(billingNumber: String?): String {
        return when {
            billingNumber?.contains("MLN", ignoreCase = true) == true -> "RSIA Melinda"
            billingNumber?.contains("GMB", ignoreCase = true) == true -> "RSUD Gambiran"
            billingNumber?.contains("BHY", ignoreCase = true) == true -> "RS Bhayangkara"
            else -> "Klinik Privat"
        }
    }
}
