import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/article_model.dart';
import '../../data/repositories/article_repository.dart';

class ArticleState {
  final List<Article> articles;
  final bool isLoading;
  final String? error;

  ArticleState({
    this.articles = const [],
    this.isLoading = false,
    this.error,
  });

  ArticleState copyWith({
    List<Article>? articles,
    bool? isLoading,
    String? error,
  }) {
    return ArticleState(
      articles: articles ?? this.articles,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ArticleNotifier extends StateNotifier<ArticleState> {
  final ArticleRepository _repository;

  ArticleNotifier(this._repository) : super(ArticleState());

  Future<void> loadArticles() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final articles = await _repository.getArticles();
      state = state.copyWith(articles: articles, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> createArticle(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.createArticle(data);
      await loadArticles();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> updateArticle(int id, Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.updateArticle(id, data);
      await loadArticles();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> deleteArticle(int id) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      await _repository.deleteArticle(id);
      await loadArticles();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> publishArticle(int id) async {
    try {
      await _repository.publishArticle(id);
      await loadArticles();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final articleProvider =
    StateNotifierProvider<ArticleNotifier, ArticleState>((ref) {
  final repository = ref.watch(articleRepositoryProvider);
  return ArticleNotifier(repository);
});
