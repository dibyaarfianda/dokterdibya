package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LabResultInfo(
    val id: Int,
    val title: String,
    val imageUrl: String?,
    val documentUrl: String?,
    val date: String,
    val isNew: Boolean = false
)

data class LabResultsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val results: List<LabResultInfo> = emptyList(),
    val selectedLab: LabResultInfo? = null
)

@HiltViewModel
class LabResultsViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LabResultsUiState())
    val uiState: StateFlow<LabResultsUiState> = _uiState.asStateFlow()

    private val baseUrl = "https://dokterdibya.com"

    init {
        loadLabResults()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            repository.getLabDocuments()
                .onSuccess { documents ->
                    val labInfos = documents.map { doc ->
                        val fullImageUrl = doc.documentUrl?.let { url ->
                            if (url.startsWith("/")) "$baseUrl$url" else url
                        }
                        val fullDocUrl = doc.documentUrl?.let { url ->
                            if (url.startsWith("/")) "$baseUrl$url" else url
                        }
                        LabResultInfo(
                            id = doc.id,
                            title = doc.title ?: "Hasil Lab",
                            imageUrl = fullImageUrl,
                            documentUrl = fullDocUrl,
                            date = formatDate(doc.publishedAt ?: doc.createdAt),
                            isNew = doc.isRead == 0
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        isRefreshing = false,
                        results = labInfos
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isRefreshing = false)
                }
        }
    }

    fun loadLabResults() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getLabDocuments()
                .onSuccess { documents ->
                    val labInfos = documents.map { doc ->
                        // Prepend base URL if it's a relative path
                        val fullImageUrl = doc.documentUrl?.let { url ->
                            if (url.startsWith("/")) "$baseUrl$url" else url
                        }
                        val fullDocUrl = doc.documentUrl?.let { url ->
                            if (url.startsWith("/")) "$baseUrl$url" else url
                        }

                        LabResultInfo(
                            id = doc.id,
                            title = doc.title ?: "Hasil Lab",
                            imageUrl = fullImageUrl,
                            documentUrl = fullDocUrl,
                            date = formatDate(doc.publishedAt ?: doc.createdAt),
                            isNew = doc.isRead == 0
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        results = labInfos
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
            // Parse ISO date format
            val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
            val outputFormat = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
            val date = inputFormat.parse(dateStr.take(19))
            date?.let { outputFormat.format(it) } ?: dateStr.take(10)
        } catch (e: Exception) {
            dateStr.take(10)
        }
    }

    fun selectLab(lab: LabResultInfo) {
        _uiState.value = _uiState.value.copy(selectedLab = lab)
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(selectedLab = null)
    }
}
