import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class DiagnosisForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const DiagnosisForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<DiagnosisForm> createState() => _DiagnosisFormState();
}

class _DiagnosisFormState extends State<DiagnosisForm> {
  late DateTime _recordDatetime;
  final _diagnosisUtamaController = TextEditingController();
  final _diagnosisSekunderController = TextEditingController();
  final _icdCodeController = TextEditingController();
  final _keteranganController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initializeForm();
  }

  void _initializeForm() {
    final data = widget.initialData;

    if (data['record_datetime'] != null) {
      _recordDatetime = DateTime.tryParse(data['record_datetime']) ?? DateTime.now();
    } else {
      _recordDatetime = DateTime.now();
    }

    _diagnosisUtamaController.text = data['diagnosis_utama'] ?? '';
    _diagnosisSekunderController.text = data['diagnosis_sekunder'] ?? '';
    _icdCodeController.text = data['icd_code'] ?? '';
    _keteranganController.text = data['keterangan'] ?? '';
  }

  @override
  void dispose() {
    _diagnosisUtamaController.dispose();
    _diagnosisSekunderController.dispose();
    _icdCodeController.dispose();
    _keteranganController.dispose();
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

          _buildSectionTitle('Diagnosis'),
          TextFormField(
            controller: _diagnosisUtamaController,
            decoration: const InputDecoration(
              labelText: 'Diagnosis Utama *',
              hintText: 'Masukkan diagnosis utama',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _diagnosisSekunderController,
            decoration: const InputDecoration(
              labelText: 'Diagnosis Sekunder',
              hintText: 'Masukkan diagnosis sekunder (jika ada)',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _icdCodeController,
            decoration: const InputDecoration(
              labelText: 'Kode ICD-10',
              hintText: 'Contoh: O80.0',
              border: OutlineInputBorder(),
            ),
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _keteranganController,
            decoration: const InputDecoration(
              labelText: 'Keterangan Tambahan',
              hintText: 'Keterangan tambahan (opsional)',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 24),

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
                    : const Text('Simpan Diagnosis'),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: AppColors.primary,
        ),
      ),
    );
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'diagnosis_utama': _diagnosisUtamaController.text,
      'diagnosis_sekunder': _diagnosisSekunderController.text,
      'icd_code': _icdCodeController.text,
      'keterangan': _keteranganController.text,
    };

    widget.onSave(data);
  }
}
