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

data class UsgInfo(
    val id: Int,
    val imageUrl: String,
    val date: String,
    val gestationalAge: String?,
    val notes: String?
)

data class UsgUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val results: List<UsgInfo> = emptyList(),
    val selectedUsg: UsgInfo? = null
)

@HiltViewModel
class UsgViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UsgUiState())
    val uiState: StateFlow<UsgUiState> = _uiState.asStateFlow()

    init {
        loadUsgResults()
    }

    private val baseUrl = "https://dokterdibya.com"

    fun loadUsgResults() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getUsgDocuments()
                .onSuccess { documents ->
                    val usgInfos = documents.map { doc ->
                        // Prepend base URL if it's a relative path
                        val fullUrl = doc.documentUrl?.let { url ->
                            if (url.startsWith("/")) "$baseUrl$url" else url
                        } ?: ""

                        UsgInfo(
                            id = doc.id,
                            imageUrl = fullUrl,
                            date = formatDate(doc.publishedAt ?: doc.createdAt),
                            gestationalAge = doc.description,
                            notes = doc.title
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        results = usgInfos
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
            val outputFormat = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("id", "ID"))
            val date = inputFormat.parse(dateStr.take(19))
            date?.let { outputFormat.format(it) } ?: dateStr.take(10)
        } catch (e: Exception) {
            dateStr.take(10)
        }
    }

    fun selectUsg(usg: UsgInfo) {
        _uiState.value = _uiState.value.copy(selectedUsg = usg)
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(selectedUsg = null)
    }
}
