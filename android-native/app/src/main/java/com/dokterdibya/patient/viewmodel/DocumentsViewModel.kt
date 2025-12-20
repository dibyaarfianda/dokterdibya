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

    private fun loadDocuments() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getDocuments()
                .onSuccess { documents ->
                    val docInfos = documents.map { doc ->
                        DocumentInfo(
                            id = doc.id,
                            title = doc.filename ?: "Dokumen",
                            type = doc.documentType,
                            date = doc.visitDate ?: doc.createdAt ?: "",
                            url = doc.documentUrl
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
        } else {
            _uiState.value.allDocuments.filter { it.type.equals(type, ignoreCase = true) }
        }
        _uiState.value = _uiState.value.copy(documents = filtered)
    }
}
