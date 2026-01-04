import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class AnamnesaForm extends StatefulWidget {
  final String category;
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const AnamnesaForm({
    super.key,
    required this.category,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<AnamnesaForm> createState() => _AnamnesaFormState();
}

class _AnamnesaFormState extends State<AnamnesaForm> {
  final _formKey = GlobalKey<FormState>();
  late DateTime _recordDatetime;

  // Common fields
  final _keluhanUtamaController = TextEditingController();
  final _riwayatPenyakitController = TextEditingController();
  final _alergiObatController = TextEditingController();
  final _alergiMakananController = TextEditingController();
  final _alergiLingkunganController = TextEditingController();
  final _riwayatKeluargaController = TextEditingController();

  // Obstetri fields
  final _gravidaController = TextEditingController();
  final _paraController = TextEditingController();
  final _abortusController = TextEditingController();
  final _anakHidupController = TextEditingController();
  final _hphtController = TextEditingController();
  final _hplController = TextEditingController();

  // Gyn/Repro fields
  final _usiaMenarcheController = TextEditingController();
  final _lamaSiklusController = TextEditingController();
  String? _siklusTeratur;
  final _metodeKbController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initializeForm();
  }

  void _initializeForm() {
    final data = widget.initialData;

    // Parse datetime
    if (data['record_datetime'] != null) {
      _recordDatetime = DateTime.tryParse(data['record_datetime']) ?? DateTime.now();
    } else {
      _recordDatetime = DateTime.now();
    }

    // Common fields
    _keluhanUtamaController.text = data['keluhan_utama'] ?? '';
    _riwayatPenyakitController.text = data['detail_riwayat_penyakit'] ?? '';
    _alergiObatController.text = data['alergi_obat'] ?? '-';
    _alergiMakananController.text = data['alergi_makanan'] ?? '-';
    _alergiLingkunganController.text = data['alergi_lingkungan'] ?? '-';
    _riwayatKeluargaController.text = data['riwayat_keluarga'] ?? '-';

    // Obstetri
    _gravidaController.text = data['gravida']?.toString() ?? '';
    _paraController.text = data['para']?.toString() ?? '';
    _abortusController.text = data['abortus']?.toString() ?? '';
    _anakHidupController.text = data['anak_hidup']?.toString() ?? '';
    _hphtController.text = data['hpht'] ?? '';
    _hplController.text = data['hpl'] ?? '';

    // Gyn/Repro
    _usiaMenarcheController.text = data['usia_menarche'] ?? '';
    _lamaSiklusController.text = data['lama_siklus'] ?? '';
    _siklusTeratur = data['siklus_teratur'];
    _metodeKbController.text = data['metode_kb_terakhir'] ?? '';
  }

  @override
  void dispose() {
    _keluhanUtamaController.dispose();
    _riwayatPenyakitController.dispose();
    _alergiObatController.dispose();
    _alergiMakananController.dispose();
    _alergiLingkunganController.dispose();
    _riwayatKeluargaController.dispose();
    _gravidaController.dispose();
    _paraController.dispose();
    _abortusController.dispose();
    _anakHidupController.dispose();
    _hphtController.dispose();
    _hplController.dispose();
    _usiaMenarcheController.dispose();
    _lamaSiklusController.dispose();
    _metodeKbController.dispose();
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

            // Keluhan Utama
            _buildSectionTitle('Keluhan Utama'),
            _buildTextField(
              controller: _keluhanUtamaController,
              label: 'Keluhan Utama',
              maxLines: 3,
              required: true,
            ),
            const SizedBox(height: 16),

            // Category-specific fields
            if (widget.category == 'Obstetri') ...[
              _buildSectionTitle('Data Obstetri'),
              _buildObstetriFields(),
              const SizedBox(height: 16),
            ],

            if (widget.category == 'Gyn/Repro' || widget.category == 'Ginekologi') ...[
              _buildSectionTitle('Data Ginekologi'),
              _buildGynecologyFields(),
              const SizedBox(height: 16),
            ],

            // Riwayat Penyakit
            _buildSectionTitle('Riwayat Penyakit'),
            _buildTextField(
              controller: _riwayatPenyakitController,
              label: 'Riwayat Penyakit Sebelumnya',
              maxLines: 2,
            ),
            const SizedBox(height: 16),

            // Alergi
            _buildSectionTitle('Alergi'),
            Row(
              children: [
                Expanded(
                  child: _buildTextField(
                    controller: _alergiObatController,
                    label: 'Alergi Obat',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTextField(
                    controller: _alergiMakananController,
                    label: 'Alergi Makanan',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _alergiLingkunganController,
              label: 'Alergi Lingkungan',
            ),
            const SizedBox(height: 16),

            // Riwayat Keluarga
            _buildSectionTitle('Riwayat Keluarga'),
            _buildTextField(
              controller: _riwayatKeluargaController,
              label: 'Riwayat Penyakit Keluarga',
              maxLines: 2,
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
                      : const Text('Simpan Anamnesa'),
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
      padding: const EdgeInsets.only(bottom: 8),
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

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    int maxLines = 1,
    bool required = false,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: required ? '$label *' : label,
        border: const OutlineInputBorder(),
      ),
      maxLines: maxLines,
      readOnly: widget.isReadOnly,
      keyboardType: keyboardType,
      validator: required
          ? (value) {
              if (value == null || value.isEmpty) {
                return '$label wajib diisi';
              }
              return null;
            }
          : null,
    );
  }

  Widget _buildObstetriFields() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                controller: _gravidaController,
                label: 'Gravida (G)',
                keyboardType: TextInputType.number,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildTextField(
                controller: _paraController,
                label: 'Para (P)',
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                controller: _abortusController,
                label: 'Abortus (A)',
                keyboardType: TextInputType.number,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildTextField(
                controller: _anakHidupController,
                label: 'Anak Hidup',
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildDateField(
                controller: _hphtController,
                label: 'HPHT',
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildDateField(
                controller: _hplController,
                label: 'HPL',
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildGynecologyFields() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                controller: _usiaMenarcheController,
                label: 'Usia Menarche',
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildTextField(
                controller: _lamaSiklusController,
                label: 'Lama Siklus (hari)',
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _siklusTeratur,
          decoration: const InputDecoration(
            labelText: 'Siklus Teratur',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'teratur', child: Text('Teratur')),
            DropdownMenuItem(value: 'tidak_teratur', child: Text('Tidak Teratur')),
          ],
          onChanged: widget.isReadOnly
              ? null
              : (value) {
                  setState(() => _siklusTeratur = value);
                },
        ),
        const SizedBox(height: 12),
        _buildTextField(
          controller: _metodeKbController,
          label: 'Metode KB Terakhir',
        ),
      ],
    );
  }

  Widget _buildDateField({
    required TextEditingController controller,
    required String label,
  }) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        suffixIcon: widget.isReadOnly
            ? null
            : IconButton(
                icon: const Icon(Icons.calendar_today),
                onPressed: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                  );
                  if (date != null) {
                    controller.text = DateFormat('yyyy-MM-dd').format(date);
                  }
                },
              ),
      ),
      readOnly: widget.isReadOnly,
    );
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;

    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'keluhan_utama': _keluhanUtamaController.text,
      'detail_riwayat_penyakit': _riwayatPenyakitController.text,
      'alergi_obat': _alergiObatController.text,
      'alergi_makanan': _alergiMakananController.text,
      'alergi_lingkungan': _alergiLingkunganController.text,
      'riwayat_keluarga': _riwayatKeluargaController.text,
    };

    if (widget.category == 'Obstetri') {
      data['gravida'] = _gravidaController.text;
      data['para'] = _paraController.text;
      data['abortus'] = _abortusController.text;
      data['anak_hidup'] = _anakHidupController.text;
      data['hpht'] = _hphtController.text;
      data['hpl'] = _hplController.text;
    }

    if (widget.category == 'Gyn/Repro' || widget.category == 'Ginekologi') {
      data['usia_menarche'] = _usiaMenarcheController.text;
      data['lama_siklus'] = _lamaSiklusController.text;
      data['siklus_teratur'] = _siklusTeratur;
      data['metode_kb_terakhir'] = _metodeKbController.text;
    }

    widget.onSave(data);
  }
}
