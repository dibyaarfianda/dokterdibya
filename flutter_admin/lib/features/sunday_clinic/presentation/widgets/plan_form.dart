import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class PlanForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const PlanForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<PlanForm> createState() => _PlanFormState();
}

class _PlanFormState extends State<PlanForm> {
  late DateTime _recordDatetime;
  final _tindakanController = TextEditingController();
  final _terapiController = TextEditingController();
  final _edukasiController = TextEditingController();
  final _kontrolController = TextEditingController();
  final _rujukanController = TextEditingController();
  final _catatanController = TextEditingController();

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

    _tindakanController.text = data['tindakan'] ?? '';
    _terapiController.text = data['terapi'] ?? '';
    _edukasiController.text = data['edukasi'] ?? '';
    _kontrolController.text = data['kontrol'] ?? '';
    _rujukanController.text = data['rujukan'] ?? '';
    _catatanController.text = data['catatan'] ?? '';
  }

  @override
  void dispose() {
    _tindakanController.dispose();
    _terapiController.dispose();
    _edukasiController.dispose();
    _kontrolController.dispose();
    _rujukanController.dispose();
    _catatanController.dispose();
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

          _buildSectionTitle('Tindakan'),
          TextFormField(
            controller: _tindakanController,
            decoration: const InputDecoration(
              labelText: 'Tindakan yang Dilakukan',
              hintText: 'Masukkan tindakan yang dilakukan',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          _buildSectionTitle('Terapi / Resep'),
          TextFormField(
            controller: _terapiController,
            decoration: const InputDecoration(
              labelText: 'Terapi / Resep Obat',
              hintText: 'Masukkan resep obat',
              border: OutlineInputBorder(),
            ),
            maxLines: 4,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          _buildSectionTitle('Edukasi'),
          TextFormField(
            controller: _edukasiController,
            decoration: const InputDecoration(
              labelText: 'Edukasi Pasien',
              hintText: 'Edukasi yang diberikan kepada pasien',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
          const SizedBox(height: 16),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSectionTitle('Jadwal Kontrol'),
                    TextFormField(
                      controller: _kontrolController,
                      decoration: const InputDecoration(
                        labelText: 'Jadwal Kontrol',
                        hintText: 'Contoh: 2 minggu lagi',
                        border: OutlineInputBorder(),
                      ),
                      readOnly: widget.isReadOnly,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSectionTitle('Rujukan'),
                    TextFormField(
                      controller: _rujukanController,
                      decoration: const InputDecoration(
                        labelText: 'Rujukan (jika ada)',
                        hintText: 'Nama RS/Dokter',
                        border: OutlineInputBorder(),
                      ),
                      readOnly: widget.isReadOnly,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          _buildSectionTitle('Catatan Tambahan'),
          TextFormField(
            controller: _catatanController,
            decoration: const InputDecoration(
              labelText: 'Catatan Tambahan',
              hintText: 'Catatan lainnya',
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
                    : const Text('Simpan Planning'),
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
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 14,
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
      'tindakan': _tindakanController.text,
      'terapi': _terapiController.text,
      'edukasi': _edukasiController.text,
      'kontrol': _kontrolController.text,
      'rujukan': _rujukanController.text,
      'catatan': _catatanController.text,
    };

    widget.onSave(data);
  }
}
