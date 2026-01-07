package com.dokterdibya.patient.viewmodel

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

data class ArticlesUiState(
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val articles: List<Article> = emptyList(),
    val hasMorePages: Boolean = true,
    val currentPage: Int = 0
)

@HiltViewModel
class ArticlesViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArticlesUiState())
    val uiState: StateFlow<ArticlesUiState> = _uiState.asStateFlow()

    companion object {
        private const val PAGE_SIZE = 15
    }

    init {
        loadArticles()
    }

    fun loadArticles() {
        viewModelScope.launch {
            _uiState.value = ArticlesUiState(isLoading = true)

            repository.getArticles(limit = PAGE_SIZE, offset = 0)
                .onSuccess { articles ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        articles = articles,
                        currentPage = 1,
                        hasMorePages = articles.size >= PAGE_SIZE
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

    fun loadMoreArticles() {
        val currentState = _uiState.value

        // Don't load more if already loading, no more pages, or has error
        if (currentState.isLoadingMore || currentState.isLoading || !currentState.hasMorePages) {
            return
        }

        viewModelScope.launch {
            _uiState.value = currentState.copy(isLoadingMore = true)

            val offset = currentState.currentPage * PAGE_SIZE

            repository.getArticles(limit = PAGE_SIZE, offset = offset)
                .onSuccess { newArticles ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingMore = false,
                        articles = currentState.articles + newArticles,
                        currentPage = currentState.currentPage + 1,
                        hasMorePages = newArticles.size >= PAGE_SIZE
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingMore = false,
                        error = e.message
                    )
                }
        }
    }

    fun refresh() {
        loadArticles()
    }
}
