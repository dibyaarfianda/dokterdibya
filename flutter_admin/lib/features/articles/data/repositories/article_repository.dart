import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../models/article_model.dart';

class ArticleRepository {
  final ApiClient _apiClient;

  ArticleRepository(this._apiClient);

  Future<List<Article>> getArticles() async {
    final response = await _apiClient.get(ApiEndpoints.articlesAdmin);
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return (data['data'] as List)
          .map((a) => Article.fromJson(a))
          .toList();
    }
    return [];
  }

  Future<Article> getArticleById(int id) async {
    final response = await _apiClient.get('${ApiEndpoints.articles}/$id');
    final data = response.data;

    if (data['success'] == true && data['data'] != null) {
      return Article.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Artikel tidak ditemukan');
  }

  Future<Article> createArticle(Map<String, dynamic> articleData) async {
    final response = await _apiClient.post(
      ApiEndpoints.articles,
      data: articleData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Article.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal membuat artikel');
  }

  Future<Article> updateArticle(int id, Map<String, dynamic> articleData) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.articles}/$id',
      data: articleData,
    );

    final data = response.data;
    if (data['success'] == true && data['data'] != null) {
      return Article.fromJson(data['data']);
    }
    throw Exception(data['message'] ?? 'Gagal memperbarui artikel');
  }

  Future<void> deleteArticle(int id) async {
    final response = await _apiClient.delete('${ApiEndpoints.articles}/$id');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal menghapus artikel');
    }
  }

  Future<void> publishArticle(int id) async {
    final response = await _apiClient.patch('${ApiEndpoints.articles}/$id/publish');

    final data = response.data;
    if (data['success'] != true) {
      throw Exception(data['message'] ?? 'Gagal mempublikasikan artikel');
    }
  }
}

final articleRepositoryProvider = Provider<ArticleRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ArticleRepository(apiClient);
});
