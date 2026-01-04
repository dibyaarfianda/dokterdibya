import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class SupportingExamForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const SupportingExamForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<SupportingExamForm> createState() => _SupportingExamFormState();
}

class _SupportingExamFormState extends State<SupportingExamForm> {
  late DateTime _recordDatetime;
  final _interpretationController = TextEditingController();
  List<Map<String, dynamic>> _uploadedFiles = [];

  @override
  void initState() {
    super.initState();
    _initializeForm();
  }

  void _initializeForm() {
    final data = widget.initialData;

    if (data['record_datetime'] != null) {
      _recordDatetime =
          DateTime.tryParse(data['record_datetime']) ?? DateTime.now();
    } else {
      _recordDatetime = DateTime.now();
    }

    _interpretationController.text = data['interpretation'] ?? '';

    if (data['files'] != null && data['files'] is List) {
      _uploadedFiles = List<Map<String, dynamic>>.from(
        (data['files'] as List).map((f) => Map<String, dynamic>.from(f)),
      );
    }
  }

  @override
  void dispose() {
    _interpretationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Datetime picker
          _buildDatetimePicker(),
          const SizedBox(height: 24),

          _buildSectionTitle('Upload Hasil Laboratorium'),
          const SizedBox(height: 8),

          // Upload section
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Upload button
                  if (!widget.isReadOnly)
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _pickFiles,
                        icon: const Icon(Icons.upload_file),
                        label: const Text('Pilih File'),
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    'Format: JPG, PNG, PDF. Maksimal 10MB per file.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Uploaded files list
          if (_uploadedFiles.isNotEmpty) ...[
            _buildSectionTitle('File yang Diupload'),
            const SizedBox(height: 8),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _uploadedFiles.length,
              itemBuilder: (context, index) {
                final file = _uploadedFiles[index];
                return Card(
                  child: ListTile(
                    leading: Icon(
                      _getFileIcon(file['type'] ?? ''),
                      color: AppColors.primary,
                    ),
                    title: Text(
                      file['name'] ?? 'File ${index + 1}',
                      style: const TextStyle(fontSize: 14),
                    ),
                    subtitle: file['size'] != null
                        ? Text(_formatFileSize(file['size']))
                        : null,
                    trailing: widget.isReadOnly
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () => _removeFile(index),
                          ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),

            // AI Interpretation button
            if (!widget.isReadOnly && _interpretationController.text.isEmpty)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _interpretWithAI,
                  icon: const Icon(Icons.smart_toy),
                  label: const Text('Interpretasi dengan AI'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue,
                  ),
                ),
              ),
          ] else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Column(
                    children: [
                      Icon(
                        Icons.upload_file,
                        size: 48,
                        color: Colors.grey[400],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Belum ada file yang diupload',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),

          // Interpretation
          if (_interpretationController.text.isNotEmpty ||
              !widget.isReadOnly) ...[
            _buildSectionTitle('Interpretasi Hasil'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _interpretationController,
              decoration: const InputDecoration(
                labelText: 'Interpretasi',
                hintText: 'Tuliskan interpretasi hasil lab...',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
              maxLines: 6,
              readOnly: widget.isReadOnly,
            ),
            const SizedBox(height: 24),
          ],

          // Save button
          if (!widget.isReadOnly)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: widget.isSaving ? null : _save,
                child: widget.isSaving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Simpan Pemeriksaan Penunjang'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDatetimePicker() {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.access_time, color: AppColors.primary),
        title: const Text('Waktu Pemeriksaan'),
        subtitle: Text(
          DateFormat('d MMMM yyyy, HH:mm').format(_recordDatetime),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        trailing: widget.isReadOnly
            ? null
            : IconButton(
                icon: const Icon(Icons.edit),
                onPressed: _pickDatetime,
              ),
      ),
    );
  }

  Future<void> _pickDatetime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _recordDatetime,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );

    if (date != null && mounted) {
      final time = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(_recordDatetime),
      );

      if (time != null) {
        setState(() {
          _recordDatetime = DateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
          );
        });
      }
    }
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: AppColors.primary,
      ),
    );
  }

  IconData _getFileIcon(String type) {
    if (type.contains('pdf')) {
      return Icons.picture_as_pdf;
    } else if (type.contains('image')) {
      return Icons.image;
    }
    return Icons.insert_drive_file;
  }

  String _formatFileSize(dynamic size) {
    if (size == null) return '';
    final bytes = size is int ? size : int.tryParse(size.toString()) ?? 0;
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _pickFiles() async {
    // TODO: Implement file picker using file_picker package
    // This is a placeholder - in production, use FilePicker.platform.pickFiles
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Fitur upload akan diimplementasikan dengan file_picker'),
      ),
    );
  }

  void _removeFile(int index) {
    setState(() {
      _uploadedFiles.removeAt(index);
    });
  }

  Future<void> _interpretWithAI() async {
    // TODO: Implement AI interpretation
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Fitur AI interpretation akan diimplementasikan'),
      ),
    );
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'files': _uploadedFiles,
      'interpretation': _interpretationController.text.trim(),
    };

    widget.onSave(data);
  }
}
