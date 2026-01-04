import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class PhysicalExamForm extends StatefulWidget {
  final String category;
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const PhysicalExamForm({
    super.key,
    required this.category,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<PhysicalExamForm> createState() => _PhysicalExamFormState();
}

class _PhysicalExamFormState extends State<PhysicalExamForm> {
  final _formKey = GlobalKey<FormState>();
  late DateTime _recordDatetime;

  // Vital signs
  final _tekananDarahController = TextEditingController();
  final _nadiController = TextEditingController();
  final _suhuController = TextEditingController();
  final _pernapasanController = TextEditingController();
  final _beratBadanController = TextEditingController();
  final _tinggiBadanController = TextEditingController();

  // General exam
  final _kesadaranController = TextEditingController();
  final _keadaanUmumController = TextEditingController();
  final _kepalaController = TextEditingController();
  final _mataController = TextEditingController();
  final _telingaController = TextEditingController();
  final _hidungController = TextEditingController();
  final _mulutController = TextEditingController();
  final _leherController = TextEditingController();
  final _thoraxController = TextEditingController();
  final _jantungController = TextEditingController();
  final _paruController = TextEditingController();
  final _abdomenController = TextEditingController();
  final _ekstremitasController = TextEditingController();

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

    _tekananDarahController.text = data['tekanan_darah'] ?? '';
    _nadiController.text = data['nadi'] ?? '';
    _suhuController.text = data['suhu'] ?? '';
    _pernapasanController.text = data['pernapasan'] ?? '';
    _beratBadanController.text = data['berat_badan'] ?? '';
    _tinggiBadanController.text = data['tinggi_badan'] ?? '';

    _kesadaranController.text = data['kesadaran'] ?? 'Composmentis';
    _keadaanUmumController.text = data['keadaan_umum'] ?? 'Baik';
    _kepalaController.text = data['kepala'] ?? 'Normocephali';
    _mataController.text = data['mata'] ?? 'Conjungtiva anemis -/-, sklera ikterik -/-';
    _telingaController.text = data['telinga'] ?? 'Dalam batas normal';
    _hidungController.text = data['hidung'] ?? 'Dalam batas normal';
    _mulutController.text = data['mulut'] ?? 'Dalam batas normal';
    _leherController.text = data['leher'] ?? 'Pembesaran KGB (-)';
    _thoraxController.text = data['thorax'] ?? 'Simetris';
    _jantungController.text = data['jantung'] ?? 'BJ I-II reguler, murmur (-)';
    _paruController.text = data['paru'] ?? 'Vesikuler +/+, rhonki -/-, wheezing -/-';
    _abdomenController.text = data['abdomen'] ?? '';
    _ekstremitasController.text = data['ekstremitas'] ?? 'Edema -/-, akral hangat';
  }

  @override
  void dispose() {
    _tekananDarahController.dispose();
    _nadiController.dispose();
    _suhuController.dispose();
    _pernapasanController.dispose();
    _beratBadanController.dispose();
    _tinggiBadanController.dispose();
    _kesadaranController.dispose();
    _keadaanUmumController.dispose();
    _kepalaController.dispose();
    _mataController.dispose();
    _telingaController.dispose();
    _hidungController.dispose();
    _mulutController.dispose();
    _leherController.dispose();
    _thoraxController.dispose();
    _jantungController.dispose();
    _paruController.dispose();
    _abdomenController.dispose();
    _ekstremitasController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Datetime picker
            _buildDatetimePicker(),
            const SizedBox(height: 24),

            // Vital Signs
            _buildSectionTitle('Tanda Vital'),
            _buildVitalSignsGrid(),
            const SizedBox(height: 24),

            // General Examination
            _buildSectionTitle('Pemeriksaan Umum'),
            _buildGeneralExamFields(),
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
                      : const Text('Simpan Pemeriksaan Fisik'),
                ),
              ),
          ],
        ),
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

  Widget _buildVitalSignsGrid() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        _buildVitalSignField(
          controller: _tekananDarahController,
          label: 'Tekanan Darah',
          suffix: 'mmHg',
          hint: '120/80',
        ),
        _buildVitalSignField(
          controller: _nadiController,
          label: 'Nadi',
          suffix: 'x/mnt',
          hint: '80',
        ),
        _buildVitalSignField(
          controller: _suhuController,
          label: 'Suhu',
          suffix: '°C',
          hint: '36.5',
        ),
        _buildVitalSignField(
          controller: _pernapasanController,
          label: 'Pernapasan',
          suffix: 'x/mnt',
          hint: '20',
        ),
        _buildVitalSignField(
          controller: _beratBadanController,
          label: 'Berat Badan',
          suffix: 'kg',
          hint: '60',
        ),
        _buildVitalSignField(
          controller: _tinggiBadanController,
          label: 'Tinggi Badan',
          suffix: 'cm',
          hint: '160',
        ),
      ],
    );
  }

  Widget _buildVitalSignField({
    required TextEditingController controller,
    required String label,
    required String suffix,
    String? hint,
  }) {
    return SizedBox(
      width: 150,
      child: TextFormField(
        controller: controller,
        decoration: InputDecoration(
          labelText: label,
          suffixText: suffix,
          hintText: hint,
          border: const OutlineInputBorder(),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
        readOnly: widget.isReadOnly,
        keyboardType: TextInputType.number,
      ),
    );
  }

  Widget _buildGeneralExamFields() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _buildTextField(_kesadaranController, 'Kesadaran')),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(_keadaanUmumController, 'Keadaan Umum')),
          ],
        ),
        const SizedBox(height: 12),
        _buildTextField(_kepalaController, 'Kepala'),
        const SizedBox(height: 12),
        _buildTextField(_mataController, 'Mata'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildTextField(_telingaController, 'Telinga')),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(_hidungController, 'Hidung')),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildTextField(_mulutController, 'Mulut')),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(_leherController, 'Leher')),
          ],
        ),
        const SizedBox(height: 12),
        _buildTextField(_thoraxController, 'Thorax'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildTextField(_jantungController, 'Jantung')),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(_paruController, 'Paru')),
          ],
        ),
        const SizedBox(height: 12),
        _buildTextField(_abdomenController, 'Abdomen', maxLines: 2),
        const SizedBox(height: 12),
        _buildTextField(_ekstremitasController, 'Ekstremitas'),
      ],
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, {int maxLines = 1}) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      maxLines: maxLines,
      readOnly: widget.isReadOnly,
    );
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'tekanan_darah': _tekananDarahController.text,
      'nadi': _nadiController.text,
      'suhu': _suhuController.text,
      'pernapasan': _pernapasanController.text,
      'berat_badan': _beratBadanController.text,
      'tinggi_badan': _tinggiBadanController.text,
      'kesadaran': _kesadaranController.text,
      'keadaan_umum': _keadaanUmumController.text,
      'kepala': _kepalaController.text,
      'mata': _mataController.text,
      'telinga': _telingaController.text,
      'hidung': _hidungController.text,
      'mulut': _mulutController.text,
      'leher': _leherController.text,
      'thorax': _thoraxController.text,
      'jantung': _jantungController.text,
      'paru': _paruController.text,
      'abdomen': _abdomenController.text,
      'ekstremitas': _ekstremitasController.text,
    };

    widget.onSave(data);
  }
}
