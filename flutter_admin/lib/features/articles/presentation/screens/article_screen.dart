import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/article_model.dart';
import '../providers/article_provider.dart';

class ArticleScreen extends ConsumerStatefulWidget {
  const ArticleScreen({super.key});

  @override
  ConsumerState<ArticleScreen> createState() => _ArticleScreenState();
}

class _ArticleScreenState extends ConsumerState<ArticleScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(articleProvider.notifier).loadArticles();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(articleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ruang Membaca'),
      ),
      body: state.isLoading && state.articles.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : state.articles.isEmpty
              ? _buildEmptyState()
              : _buildArticleList(state),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.article_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Belum ada artikel',
            style: TextStyle(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildArticleList(ArticleState state) {
    return RefreshIndicator(
      onRefresh: () => ref.read(articleProvider.notifier).loadArticles(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.articles.length,
        itemBuilder: (context, index) {
          final article = state.articles[index];
          return _ArticleCard(
            article: article,
            onEdit: () => _showEditDialog(article),
            onDelete: () => _confirmDelete(article.id),
            onPublish: () => _publishArticle(article.id),
          );
        },
      ),
    );
  }

  void _showCreateDialog() {
    final titleController = TextEditingController();
    final contentController = TextEditingController();
    final summaryController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Artikel Baru'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Judul',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: summaryController,
                decoration: const InputDecoration(
                  labelText: 'Ringkasan',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contentController,
                decoration: const InputDecoration(
                  labelText: 'Konten (Markdown)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 8,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty || contentController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Judul dan konten harus diisi')),
                );
                return;
              }

              final data = {
                'title': titleController.text,
                'summary': summaryController.text,
                'content': contentController.text,
              };

              final success = await ref
                  .read(articleProvider.notifier)
                  .createArticle(data);

              if (success && mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Artikel berhasil dibuat')),
                );
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(Article article) {
    final titleController = TextEditingController(text: article.title);
    final contentController = TextEditingController(text: article.content);
    final summaryController = TextEditingController(text: article.summary);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Artikel'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Judul',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: summaryController,
                decoration: const InputDecoration(
                  labelText: 'Ringkasan',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contentController,
                decoration: const InputDecoration(
                  labelText: 'Konten (Markdown)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 8,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              final data = {
                'title': titleController.text,
                'summary': summaryController.text,
                'content': contentController.text,
              };

              final success = await ref
                  .read(articleProvider.notifier)
                  .updateArticle(article.id, data);

              if (success && mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Artikel berhasil diperbarui')),
                );
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(int id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Artikel'),
        content: const Text('Apakah Anda yakin ingin menghapus artikel ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () async {
              final success = await ref
                  .read(articleProvider.notifier)
                  .deleteArticle(id);

              if (mounted) {
                Navigator.pop(context);
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Artikel berhasil dihapus')),
                  );
                }
              }
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }

  void _publishArticle(int id) async {
    final success = await ref.read(articleProvider.notifier).publishArticle(id);
    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Artikel berhasil dipublikasikan')),
      );
    }
  }
}

class _ArticleCard extends StatelessWidget {
  final Article article;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onPublish;

  const _ArticleCard({
    required this.article,
    required this.onEdit,
    required this.onDelete,
    required this.onPublish,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    article.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: article.isPublished
                        ? Colors.green.withValues(alpha: 0.1)
                        : Colors.orange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    article.isPublished ? 'Published' : 'Draft',
                    style: TextStyle(
                      fontSize: 11,
                      color: article.isPublished ? Colors.green : Colors.orange,
                    ),
                  ),
                ),
              ],
            ),
            if (article.summary != null && article.summary!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                article.summary!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.grey[700]),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.favorite, size: 16, color: Colors.red[300]),
                const SizedBox(width: 4),
                Text(
                  '${article.likes}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
                const SizedBox(width: 16),
                Icon(Icons.visibility, size: 16, color: Colors.grey[400]),
                const SizedBox(width: 4),
                Text(
                  '${article.views}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
                const Spacer(),
                Text(
                  DateFormat('d MMM yyyy', 'id_ID').format(article.createdAt),
                  style: TextStyle(color: Colors.grey[500], fontSize: 12),
                ),
              ],
            ),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!article.isPublished)
                  TextButton.icon(
                    onPressed: onPublish,
                    icon: const Icon(Icons.publish, size: 18),
                    label: const Text('Publish'),
                  ),
                TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit, size: 18),
                  label: const Text('Edit'),
                ),
                TextButton.icon(
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete, size: 18, color: Colors.red),
                  label: const Text('Hapus', style: TextStyle(color: Colors.red)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
