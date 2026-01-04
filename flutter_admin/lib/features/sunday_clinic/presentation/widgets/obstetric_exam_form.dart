import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class ObstetricExamForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const ObstetricExamForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<ObstetricExamForm> createState() => _ObstetricExamFormState();
}

class _ObstetricExamFormState extends State<ObstetricExamForm> {
  late DateTime _recordDatetime;
  final _findingsController = TextEditingController();

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

    _findingsController.text = data['findings'] ?? 'TFU:\nDJJ:\nVT:';
  }

  @override
  void dispose() {
    _findingsController.dispose();
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

          _buildSectionTitle('Hasil Pemeriksaan Obstetri'),
          const SizedBox(height: 8),

          TextFormField(
            controller: _findingsController,
            decoration: const InputDecoration(
              labelText: 'Hasil Pemeriksaan',
              hintText: 'TFU:\nDJJ:\nVT:',
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
            maxLines: 10,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 8),

          Text(
            'TFU = Tinggi Fundus Uteri\nDJJ = Denyut Jantung Janin\nVT = Vaginal Toucher',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 24),

          // Quick input buttons
          if (!widget.isReadOnly) ...[
            _buildSectionTitle('Template Cepat'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildQuickButton('TFU Normal', 'TFU: sesuai usia kehamilan\n'),
                _buildQuickButton('DJJ Normal', 'DJJ: 120-160 x/menit, reguler\n'),
                _buildQuickButton('VT Tertutup', 'VT: portio tertutup, tidak ada pembukaan\n'),
                _buildQuickButton('Presentasi Kepala', 'Presentasi: kepala\n'),
                _buildQuickButton('Letak Memanjang', 'Letak: memanjang\n'),
              ],
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
                    : const Text('Simpan Pemeriksaan Obstetri'),
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

  Widget _buildQuickButton(String label, String text) {
    return OutlinedButton(
      onPressed: () {
        final currentText = _findingsController.text;
        final cursorPosition = _findingsController.selection.baseOffset;

        if (cursorPosition >= 0) {
          final newText =
              currentText.substring(0, cursorPosition) +
              text +
              currentText.substring(cursorPosition);
          _findingsController.text = newText;
          _findingsController.selection = TextSelection.collapsed(
            offset: cursorPosition + text.length,
          );
        } else {
          _findingsController.text = currentText + text;
        }
      },
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'findings': _findingsController.text.trim(),
    };

    widget.onSave(data);
  }
}
