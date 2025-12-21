package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.DocumentContent
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DocumentViewerUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val document: DocumentContent? = null
)

@HiltViewModel
class DocumentViewerViewModel @Inject constructor(
    private val repository: PatientRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(DocumentViewerUiState())
    val uiState: StateFlow<DocumentViewerUiState> = _uiState.asStateFlow()

    private val documentId: Int = savedStateHandle.get<Int>("documentId") ?: 0

    init {
        if (documentId > 0) {
            loadDocument()
        } else {
            _uiState.value = DocumentViewerUiState(
                isLoading = false,
                error = "Dokumen tidak ditemukan"
            )
        }
    }

    fun loadDocument() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getDocumentContent(documentId)
                .onSuccess { document ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        document = document
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Gagal memuat dokumen"
                    )
                }
        }
    }
}
