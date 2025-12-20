package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.Article
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ArticleDetailUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val article: Article? = null
)

@HiltViewModel
class ArticleDetailViewModel @Inject constructor(
    private val repository: PatientRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArticleDetailUiState())
    val uiState: StateFlow<ArticleDetailUiState> = _uiState.asStateFlow()

    private val articleId: Int = savedStateHandle.get<Int>("articleId") ?: 0

    init {
        if (articleId > 0) {
            loadArticle()
        } else {
            _uiState.value = ArticleDetailUiState(
                isLoading = false,
                error = "Artikel tidak ditemukan"
            )
        }
    }

    fun loadArticle() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            repository.getArticleDetail(articleId)
                .onSuccess { article ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        article = article
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Gagal memuat artikel"
                    )
                }
        }
    }
}
