package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import javax.inject.Inject

data class DocumentInfo(
    val id: Int,
    val title: String,
    val type: String,
    val date: String,
    val url: String
)

data class DocumentsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val documents: List<DocumentInfo> = emptyList(),
    val allDocuments: List<DocumentInfo> = emptyList()
)

@HiltViewModel
class DocumentsViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DocumentsUiState())
    val uiState: StateFlow<DocumentsUiState> = _uiState.asStateFlow()

    init {
        loadDocuments()
    }

    // Document types that should appear in this screen (not USG - that's in USG Gallery)
    private val allowedDocTypes = listOf("resume_medis", "lab_result", "patient_lab")

    private fun loadDocuments() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getDocuments()
                .onSuccess { documents ->
                    // Filter out USG types - those belong in USG Gallery
                    val filteredDocs = documents.filter { doc ->
                        doc.documentType.lowercase() in allowedDocTypes
                    }
                    val docInfos = filteredDocs.map { doc ->
                        DocumentInfo(
                            id = doc.id,
                            title = doc.filename ?: "Dokumen",
                            type = doc.documentType,
                            date = formatDate(doc.visitDate ?: doc.createdAt),
                            url = doc.documentUrl ?: ""
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        documents = docInfos,
                        allDocuments = docInfos
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

    fun filterByType(type: String?) {
        val filtered = if (type == null) {
            _uiState.value.allDocuments
        } else if (type == "lab") {
            // Lab filter matches lab_result and patient_lab types
            _uiState.value.allDocuments.filter {
                it.type.lowercase() in listOf("lab_result", "patient_lab")
            }
        } else if (type == "resume") {
            // Resume filter matches resume_medis type
            _uiState.value.allDocuments.filter {
                it.type.lowercase() == "resume_medis"
            }
        } else {
            _uiState.value.allDocuments.filter { it.type.equals(type, ignoreCase = true) }
        }
        _uiState.value = _uiState.value.copy(documents = filtered)
    }

    private fun formatDate(dateStr: String?): String {
        if (dateStr.isNullOrEmpty()) return "-"
        return try {
            // Parse ISO date format
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            val outputFormat = SimpleDateFormat("d MMM yyyy", Locale("id", "ID"))
            val date = inputFormat.parse(dateStr.take(19))
            date?.let { outputFormat.format(it) } ?: dateStr.take(10)
        } catch (e: Exception) {
            // Try simple date format
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                val outputFormat = SimpleDateFormat("d MMM yyyy", Locale("id", "ID"))
                val date = inputFormat.parse(dateStr.take(10))
                date?.let { outputFormat.format(it) } ?: dateStr.take(10)
            } catch (e2: Exception) {
                dateStr.take(10)
            }
        }
    }
}
