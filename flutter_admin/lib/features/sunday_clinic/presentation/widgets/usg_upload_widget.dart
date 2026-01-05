import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:convert';
import 'dart:typed_data';
import '../../data/repositories/sunday_clinic_repository.dart';

// Simple file picker wrapper - uses HTML input on web
class UsgUploadWidget extends ConsumerStatefulWidget {
  final String? mrId;
  final List<Map<String, dynamic>> existingImages;
  final bool isReadOnly;
  final Function(List<Map<String, dynamic>>) onImagesChanged;

  const UsgUploadWidget({
    super.key,
    this.mrId,
    this.existingImages = const [],
    this.isReadOnly = false,
    required this.onImagesChanged,
  });

  @override
  ConsumerState<UsgUploadWidget> createState() => _UsgUploadWidgetState();
}

class _UsgUploadWidgetState extends ConsumerState<UsgUploadWidget> {
  List<Map<String, dynamic>> _images = [];
  bool _isUploading = false;
  String? _uploadError;

  @override
  void initState() {
    super.initState();
    _images = List.from(widget.existingImages);
  }

  @override
  void didUpdateWidget(UsgUploadWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.existingImages != oldWidget.existingImages) {
      setState(() {
        _images = List.from(widget.existingImages);
      });
    }
  }

  Future<void> _pickAndUploadImage() async {
    if (widget.mrId == null) {
      _showError('Simpan rekam medis terlebih dahulu sebelum upload gambar');
      return;
    }

    // For web, we'll use a simple approach - show file input dialog
    if (kIsWeb) {
      await _webFileUpload();
    } else {
      // For mobile, we'd use image_picker or file_picker
      _showError('Upload gambar hanya tersedia di versi web saat ini');
    }
  }

  Future<void> _webFileUpload() async {
    // On web, we create a temporary input element
    // This is a simplified approach - in production you'd use a proper file picker package

    // For now, show a dialog explaining the limitation
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _WebFilePickerDialog(
        onFilePicked: (name, bytes) async {
          Navigator.pop(context, {'name': name, 'bytes': bytes});
        },
      ),
    );

    if (result != null && result['bytes'] != null) {
      await _uploadImage(
        result['name'] as String,
        result['bytes'] as Uint8List,
      );
    }
  }

  Future<void> _uploadImage(String filename, Uint8List bytes) async {
    setState(() {
      _isUploading = true;
      _uploadError = null;
    });

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final result = await repo.uploadUsgImage(
        mrId: widget.mrId!,
        imageBytes: bytes.toList(),
        filename: filename,
      );

      final newImage = {
        'id': result['id'] ?? DateTime.now().millisecondsSinceEpoch.toString(),
        'name': filename,
        'url': result['url'] ?? result['downloadUrl'],
        'thumbnail': result['thumbnail'],
        'uploadedAt': DateTime.now().toIso8601String(),
      };

      setState(() {
        _images.add(newImage);
        _isUploading = false;
      });

      widget.onImagesChanged(_images);
      _showSuccess('Gambar berhasil diupload');
    } catch (e) {
      setState(() {
        _isUploading = false;
        _uploadError = e.toString();
      });
      _showError('Gagal upload: ${e.toString()}');
    }
  }

  Future<void> _deleteImage(int index) async {
    final image = _images[index];
    final imageId = image['id']?.toString();

    if (imageId == null || widget.mrId == null) {
      // Just remove from local list
      setState(() {
        _images.removeAt(index);
      });
      widget.onImagesChanged(_images);
      return;
    }

    // Confirm deletion
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Gambar'),
        content: const Text('Apakah Anda yakin ingin menghapus gambar ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      await repo.deleteUsgImage(widget.mrId!, imageId);

      setState(() {
        _images.removeAt(index);
      });
      widget.onImagesChanged(_images);
      _showSuccess('Gambar berhasil dihapus');
    } catch (e) {
      _showError('Gagal menghapus: ${e.toString()}');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Row(
          children: [
            Icon(Icons.image, color: theme.colorScheme.primary, size: 20),
            const SizedBox(width: 8),
            Text(
              'Foto USG',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const Spacer(),
            if (!widget.isReadOnly)
              FilledButton.icon(
                onPressed: _isUploading ? null : _pickAndUploadImage,
                icon: _isUploading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_photo_alternate, size: 18),
                label: Text(_isUploading ? 'Uploading...' : 'Tambah'),
              ),
          ],
        ),
        const SizedBox(height: 12),

        // Error message
        if (_uploadError != null)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.red.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.red.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.error, color: Colors.red, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _uploadError!,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() => _uploadError = null),
                ),
              ],
            ),
          ),

        // Images grid
        if (_images.isEmpty)
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outline.withOpacity(0.3)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Column(
                children: [
                  Icon(
                    Icons.photo_library_outlined,
                    size: 48,
                    color: theme.colorScheme.outline,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Belum ada foto USG',
                    style: TextStyle(color: theme.colorScheme.outline),
                  ),
                  if (!widget.isReadOnly) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Klik "Tambah" untuk upload foto',
                      style: TextStyle(
                        color: theme.colorScheme.outline,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 1,
            ),
            itemCount: _images.length,
            itemBuilder: (context, index) {
              final image = _images[index];
              return _buildImageTile(image, index, theme);
            },
          ),
      ],
    );
  }

  Widget _buildImageTile(Map<String, dynamic> image, int index, ThemeData theme) {
    final imageUrl = image['url'] ?? image['thumbnail'];
    final imageName = image['name'] ?? 'Image ${index + 1}';

    return Stack(
      children: [
        // Image container
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.colorScheme.outline.withOpacity(0.3)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: imageUrl != null
                ? Image.network(
                    imageUrl,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: double.infinity,
                    errorBuilder: (context, error, stackTrace) {
                      return _buildPlaceholder(imageName, theme);
                    },
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Center(
                        child: CircularProgressIndicator(
                          value: loadingProgress.expectedTotalBytes != null
                              ? loadingProgress.cumulativeBytesLoaded /
                                  loadingProgress.expectedTotalBytes!
                              : null,
                          strokeWidth: 2,
                        ),
                      );
                    },
                  )
                : _buildPlaceholder(imageName, theme),
          ),
        ),

        // Delete button
        if (!widget.isReadOnly)
          Positioned(
            top: 4,
            right: 4,
            child: Material(
              color: Colors.red,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () => _deleteImage(index),
                borderRadius: BorderRadius.circular(12),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close, size: 16, color: Colors.white),
                ),
              ),
            ),
          ),

        // View button
        Positioned(
          bottom: 4,
          left: 4,
          child: Material(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => _viewImage(image),
              borderRadius: BorderRadius.circular(12),
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.fullscreen, size: 16, color: Colors.white),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPlaceholder(String name, ThemeData theme) {
    return Container(
      color: theme.colorScheme.surfaceContainerHighest,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.image,
              size: 32,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 4),
            Text(
              name,
              style: TextStyle(
                fontSize: 10,
                color: theme.colorScheme.outline,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  void _viewImage(Map<String, dynamic> image) {
    final imageUrl = image['url'] ?? image['thumbnail'];
    final imageName = image['name'] ?? 'USG Image';

    if (imageUrl == null) return;

    showDialog(
      context: context,
      builder: (context) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppBar(
              title: Text(imageName),
              automaticallyImplyLeading: false,
              actions: [
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            Flexible(
              child: InteractiveViewer(
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) {
                    return const Center(
                      child: Text('Gagal memuat gambar'),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Simple dialog for web file selection
class _WebFilePickerDialog extends StatefulWidget {
  final Function(String name, Uint8List bytes) onFilePicked;

  const _WebFilePickerDialog({required this.onFilePicked});

  @override
  State<_WebFilePickerDialog> createState() => _WebFilePickerDialogState();
}

class _WebFilePickerDialogState extends State<_WebFilePickerDialog> {
  String? _selectedFileName;
  Uint8List? _selectedFileBytes;
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Upload Gambar USG'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Untuk upload gambar di versi web, gunakan fitur copy-paste atau drag & drop ke form.\n\n'
            'Atau gunakan URL gambar dari penyimpanan cloud.',
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'URL Gambar (opsional)',
              hintText: 'https://...',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              if (value.isNotEmpty) {
                setState(() {
                  _selectedFileName = value.split('/').last;
                });
              }
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: _selectedFileName != null
              ? () {
                  widget.onFilePicked(
                    _selectedFileName!,
                    _selectedFileBytes ?? Uint8List(0),
                  );
                }
              : null,
          child: const Text('Upload'),
        ),
      ],
    );
  }
}
