import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class UsgGynecologyForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const UsgGynecologyForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<UsgGynecologyForm> createState() => _UsgGynecologyFormState();
}

class _UsgGynecologyFormState extends State<UsgGynecologyForm> {
  late DateTime _recordDatetime;

  // USG Type
  bool _transabdominal = false;
  bool _transvaginal = false;
  bool _keduanya = false;

  // Uterus
  String? _uterusPosisi;
  final _uterusLengthController = TextEditingController();
  final _uterusWidthController = TextEditingController();
  final _uterusDepthController = TextEditingController();
  final _uterusVolumeController = TextEditingController();
  String? _mioma;
  String? _adenomyosis;

  // Mioma detail
  bool _miomaSubmukosa = false;
  bool _miomaIntramural = false;
  bool _miomaSubserosa = false;
  final _miomaSize1Controller = TextEditingController();
  final _miomaSize2Controller = TextEditingController();
  final _miomaSize3Controller = TextEditingController();
  String? _miomaMultiple;

  // Endometrium
  final _endometriumThicknessController = TextEditingController();
  bool _endoTrilaminar = false;
  bool _endoEchogenic = false;
  bool _endoIrregular = false;
  bool _endoNormal = false;
  bool _endoThick = false;
  bool _endoPolyp = false;
  bool _endoFluid = false;

  // Ovarium
  bool _ovariumKananVisible = false;
  bool _ovariumKiriVisible = false;
  final _ovariumKanan1Controller = TextEditingController();
  final _ovariumKanan2Controller = TextEditingController();
  final _ovariumKanan3Controller = TextEditingController();
  final _folikelKananMinController = TextEditingController();
  final _folikelKananMaxController = TextEditingController();
  final _ovariumKiri1Controller = TextEditingController();
  final _ovariumKiri2Controller = TextEditingController();
  final _ovariumKiri3Controller = TextEditingController();
  final _folikelKiriMinController = TextEditingController();
  final _folikelKiriMaxController = TextEditingController();
  bool _ovariumPco = false;
  bool _ovariumMassa = false;

  // Massa detail
  final _massaSize1Controller = TextEditingController();
  final _massaSize2Controller = TextEditingController();
  bool _massaKistaSederhana = false;
  bool _massaKistaKompleks = false;
  bool _massaPadat = false;
  bool _massaCampuran = false;
  bool _echoAnekoik = false;
  bool _echoRendah = false;
  bool _echoEchogenik = false;
  String? _septa;
  String? _dinding;

  // Kesan
  final _kesanController = TextEditingController();

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

    // USG Type
    _transabdominal = data['transabdominal'] ?? false;
    _transvaginal = data['transvaginal'] ?? false;
    _keduanya = data['keduanya'] ?? false;

    // Uterus
    _uterusPosisi = data['uterus_posisi'];
    _uterusLengthController.text = data['uterus_length']?.toString() ?? '';
    _uterusWidthController.text = data['uterus_width']?.toString() ?? '';
    _uterusDepthController.text = data['uterus_depth']?.toString() ?? '';
    _uterusVolumeController.text = data['uterus_volume']?.toString() ?? '';
    _mioma = data['mioma'];
    _adenomyosis = data['adenomyosis'];

    // Mioma detail
    _miomaSubmukosa = data['mioma_submukosa'] ?? false;
    _miomaIntramural = data['mioma_intramural'] ?? false;
    _miomaSubserosa = data['mioma_subserosa'] ?? false;
    _miomaSize1Controller.text = data['mioma_size_1']?.toString() ?? '';
    _miomaSize2Controller.text = data['mioma_size_2']?.toString() ?? '';
    _miomaSize3Controller.text = data['mioma_size_3']?.toString() ?? '';
    _miomaMultiple = data['mioma_multiple'];

    // Endometrium
    _endometriumThicknessController.text =
        data['endometrium_thickness']?.toString() ?? '';
    _endoTrilaminar = data['endo_trilaminar'] ?? false;
    _endoEchogenic = data['endo_echogenic'] ?? false;
    _endoIrregular = data['endo_irregular'] ?? false;
    _endoNormal = data['endo_normal'] ?? false;
    _endoThick = data['endo_thick'] ?? false;
    _endoPolyp = data['endo_polyp'] ?? false;
    _endoFluid = data['endo_fluid'] ?? false;

    // Ovarium
    _ovariumKananVisible = data['ovarium_kanan_visible'] ?? false;
    _ovariumKiriVisible = data['ovarium_kiri_visible'] ?? false;
    _ovariumKanan1Controller.text = data['ovarium_kanan_1']?.toString() ?? '';
    _ovariumKanan2Controller.text = data['ovarium_kanan_2']?.toString() ?? '';
    _ovariumKanan3Controller.text = data['ovarium_kanan_3']?.toString() ?? '';
    _folikelKananMinController.text =
        data['folikel_kanan_min']?.toString() ?? '';
    _folikelKananMaxController.text =
        data['folikel_kanan_max']?.toString() ?? '';
    _ovariumKiri1Controller.text = data['ovarium_kiri_1']?.toString() ?? '';
    _ovariumKiri2Controller.text = data['ovarium_kiri_2']?.toString() ?? '';
    _ovariumKiri3Controller.text = data['ovarium_kiri_3']?.toString() ?? '';
    _folikelKiriMinController.text =
        data['folikel_kiri_min']?.toString() ?? '';
    _folikelKiriMaxController.text =
        data['folikel_kiri_max']?.toString() ?? '';
    _ovariumPco = data['ovarium_pco'] ?? false;
    _ovariumMassa = data['ovarium_massa'] ?? false;

    // Massa detail
    _massaSize1Controller.text = data['massa_size_1']?.toString() ?? '';
    _massaSize2Controller.text = data['massa_size_2']?.toString() ?? '';
    _massaKistaSederhana = data['massa_kista_sederhana'] ?? false;
    _massaKistaKompleks = data['massa_kista_kompleks'] ?? false;
    _massaPadat = data['massa_padat'] ?? false;
    _massaCampuran = data['massa_campuran'] ?? false;
    _echoAnekoik = data['echo_anekoik'] ?? false;
    _echoRendah = data['echo_rendah'] ?? false;
    _echoEchogenik = data['echo_echogenik'] ?? false;
    _septa = data['septa'];
    _dinding = data['dinding'];

    // Kesan
    _kesanController.text = data['kesan'] ?? '';
  }

  @override
  void dispose() {
    _uterusLengthController.dispose();
    _uterusWidthController.dispose();
    _uterusDepthController.dispose();
    _uterusVolumeController.dispose();
    _miomaSize1Controller.dispose();
    _miomaSize2Controller.dispose();
    _miomaSize3Controller.dispose();
    _endometriumThicknessController.dispose();
    _ovariumKanan1Controller.dispose();
    _ovariumKanan2Controller.dispose();
    _ovariumKanan3Controller.dispose();
    _folikelKananMinController.dispose();
    _folikelKananMaxController.dispose();
    _ovariumKiri1Controller.dispose();
    _ovariumKiri2Controller.dispose();
    _ovariumKiri3Controller.dispose();
    _folikelKiriMinController.dispose();
    _folikelKiriMaxController.dispose();
    _massaSize1Controller.dispose();
    _massaSize2Controller.dispose();
    _kesanController.dispose();
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

          // USG Type
          _buildSectionTitle('Jenis USG'),
          Wrap(
            spacing: 16,
            children: [
              _buildCheckbox('Transabdominal', _transabdominal,
                  (v) => setState(() => _transabdominal = v!)),
              _buildCheckbox('Transvaginal', _transvaginal,
                  (v) => setState(() => _transvaginal = v!)),
              _buildCheckbox('Keduanya', _keduanya,
                  (v) => setState(() => _keduanya = v!)),
            ],
          ),
          const SizedBox(height: 24),

          // Uterus section
          _buildUterusSection(),
          const SizedBox(height: 24),

          // Endometrium section
          _buildEndometriumSection(),
          const SizedBox(height: 24),

          // Ovarium section
          _buildOvariumSection(),
          const SizedBox(height: 24),

          // Kesan
          _buildSectionTitle('Kesan / Kesimpulan'),
          TextFormField(
            controller: _kesanController,
            decoration: const InputDecoration(
              labelText: 'Kesan/Kesimpulan USG',
              hintText: 'Tuliskan kesan/kesimpulan...',
              border: OutlineInputBorder(),
            ),
            maxLines: 4,
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
                    : const Text('Simpan USG Ginekologi'),
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

  Widget _buildUterusSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionTitle('Rahim (Uterus)'),

            // Posisi
            const Text('Posisi', style: TextStyle(fontWeight: FontWeight.bold)),
            Wrap(
              spacing: 8,
              children: [
                _buildRadioOption('Anteverted', 'anteverted', _uterusPosisi,
                    (v) => setState(() => _uterusPosisi = v)),
                _buildRadioOption('Retroverted', 'retroverted', _uterusPosisi,
                    (v) => setState(() => _uterusPosisi = v)),
                _buildRadioOption('Anteflexed', 'anteflexed', _uterusPosisi,
                    (v) => setState(() => _uterusPosisi = v)),
                _buildRadioOption('Retroflexed', 'retroflexed', _uterusPosisi,
                    (v) => setState(() => _uterusPosisi = v)),
              ],
            ),
            const SizedBox(height: 16),

            // Ukuran
            const Text('Ukuran Uterus',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                    child: _buildNumberField('L', _uterusLengthController, 'cm')),
                const SizedBox(width: 8),
                Expanded(
                    child: _buildNumberField('W', _uterusWidthController, 'cm')),
                const SizedBox(width: 8),
                Expanded(
                    child: _buildNumberField('D', _uterusDepthController, 'cm')),
                const SizedBox(width: 8),
                Expanded(
                    child: _buildNumberField('V', _uterusVolumeController, 'ml')),
              ],
            ),
            const SizedBox(height: 16),

            // Mioma & Adenomyosis
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mioma',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      Row(
                        children: [
                          _buildRadioOption('Ada', 'ada', _mioma,
                              (v) => setState(() => _mioma = v)),
                          _buildRadioOption('Tidak', 'tidak_ada', _mioma,
                              (v) => setState(() => _mioma = v)),
                        ],
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Adenomyosis',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      Row(
                        children: [
                          _buildRadioOption('Ada', 'ada', _adenomyosis,
                              (v) => setState(() => _adenomyosis = v)),
                          _buildRadioOption('Tidak', 'tidak_ada', _adenomyosis,
                              (v) => setState(() => _adenomyosis = v)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // Mioma detail (shown when mioma = ada)
            if (_mioma == 'ada') ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Detail Mioma:',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildSmallCheckbox('Submukosa', _miomaSubmukosa,
                            (v) => setState(() => _miomaSubmukosa = v!)),
                        _buildSmallCheckbox('Intramural', _miomaIntramural,
                            (v) => setState(() => _miomaIntramural = v!)),
                        _buildSmallCheckbox('Subserosa', _miomaSubserosa,
                            (v) => setState(() => _miomaSubserosa = v!)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                'Ukuran', _miomaSize1Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _miomaSize2Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _miomaSize3Controller, 'cm')),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEndometriumSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionTitle('Endometrium'),

            Row(
              children: [
                SizedBox(
                  width: 150,
                  child: _buildNumberField(
                      'Ketebalan', _endometriumThicknessController, 'mm'),
                ),
              ],
            ),
            const SizedBox(height: 16),

            const Text('Morfologi',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                _buildSmallCheckbox('Trilaminar', _endoTrilaminar,
                    (v) => setState(() => _endoTrilaminar = v!)),
                _buildSmallCheckbox('Echogenic', _endoEchogenic,
                    (v) => setState(() => _endoEchogenic = v!)),
                _buildSmallCheckbox('Tidak teratur', _endoIrregular,
                    (v) => setState(() => _endoIrregular = v!)),
                _buildSmallCheckbox('Normal', _endoNormal,
                    (v) => setState(() => _endoNormal = v!)),
                _buildSmallCheckbox('Tebal', _endoThick,
                    (v) => setState(() => _endoThick = v!)),
                _buildSmallCheckbox('Polip', _endoPolyp,
                    (v) => setState(() => _endoPolyp = v!)),
                _buildSmallCheckbox('Cairan', _endoFluid,
                    (v) => setState(() => _endoFluid = v!)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOvariumSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionTitle('Ovarium (Indung Telur)'),

            // Teridentifikasi
            const Text('Teridentifikasi',
                style: TextStyle(fontWeight: FontWeight.bold)),
            Row(
              children: [
                _buildSmallCheckbox('Kanan', _ovariumKananVisible,
                    (v) => setState(() => _ovariumKananVisible = v!)),
                const SizedBox(width: 16),
                _buildSmallCheckbox('Kiri', _ovariumKiriVisible,
                    (v) => setState(() => _ovariumKiriVisible = v!)),
              ],
            ),
            const SizedBox(height: 16),

            // Ovarium Kanan
            if (_ovariumKananVisible) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Ovarium KANAN',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('Ukuran:'),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKanan1Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKanan2Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKanan3Controller, 'cm')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('Folikel:'),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                'Min', _folikelKananMinController, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('-'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                'Max', _folikelKananMaxController, 'mm')),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],

            // Ovarium Kiri
            if (_ovariumKiriVisible) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Ovarium KIRI',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('Ukuran:'),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKiri1Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKiri2Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _ovariumKiri3Controller, 'cm')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('Folikel:'),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                'Min', _folikelKiriMinController, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('-'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                'Max', _folikelKiriMaxController, 'mm')),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],

            const SizedBox(height: 8),
            Row(
              children: [
                _buildSmallCheckbox('PCO (Polycystic)', _ovariumPco,
                    (v) => setState(() => _ovariumPco = v!)),
                const SizedBox(width: 16),
                _buildSmallCheckbox('Ada Massa', _ovariumMassa,
                    (v) => setState(() => _ovariumMassa = v!)),
              ],
            ),

            // Massa detail
            if (_ovariumMassa) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Detail Massa:',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                            child: _buildNumberField(
                                'Ukuran', _massaSize1Controller, '')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Text('x'),
                        ),
                        Expanded(
                            child: _buildNumberField(
                                '', _massaSize2Controller, 'cm')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('Jenis:'),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildSmallCheckbox('Kista sederhana', _massaKistaSederhana,
                            (v) => setState(() => _massaKistaSederhana = v!)),
                        _buildSmallCheckbox('Kista kompleks', _massaKistaKompleks,
                            (v) => setState(() => _massaKistaKompleks = v!)),
                        _buildSmallCheckbox('Padat', _massaPadat,
                            (v) => setState(() => _massaPadat = v!)),
                        _buildSmallCheckbox('Campuran', _massaCampuran,
                            (v) => setState(() => _massaCampuran = v!)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
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

  Widget _buildRadioOption(
      String label, String value, String? groupValue, Function(String?) onChanged) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Radio<String>(
          value: value,
          groupValue: groupValue,
          onChanged: widget.isReadOnly ? null : onChanged,
          visualDensity: VisualDensity.compact,
        ),
        Text(label, style: const TextStyle(fontSize: 13)),
      ],
    );
  }

  Widget _buildCheckbox(String label, bool value, Function(bool?) onChanged) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Checkbox(
          value: value,
          onChanged: widget.isReadOnly ? null : onChanged,
          visualDensity: VisualDensity.compact,
        ),
        Text(label),
      ],
    );
  }

  Widget _buildSmallCheckbox(
      String label, bool value, Function(bool?) onChanged) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Checkbox(
            value: value,
            onChanged: widget.isReadOnly ? null : onChanged,
            visualDensity: VisualDensity.compact,
          ),
        ),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }

  Widget _buildNumberField(
      String label, TextEditingController controller, String suffix) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label.isNotEmpty ? label : null,
        suffixText: suffix.isNotEmpty ? suffix : null,
        border: const OutlineInputBorder(),
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      ),
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      readOnly: widget.isReadOnly,
    );
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),

      // USG Type
      'transabdominal': _transabdominal,
      'transvaginal': _transvaginal,
      'keduanya': _keduanya,

      // Uterus
      'uterus_posisi': _uterusPosisi,
      'uterus_length': _uterusLengthController.text,
      'uterus_width': _uterusWidthController.text,
      'uterus_depth': _uterusDepthController.text,
      'uterus_volume': _uterusVolumeController.text,
      'mioma': _mioma,
      'adenomyosis': _adenomyosis,

      // Mioma detail
      'mioma_submukosa': _miomaSubmukosa,
      'mioma_intramural': _miomaIntramural,
      'mioma_subserosa': _miomaSubserosa,
      'mioma_size_1': _miomaSize1Controller.text,
      'mioma_size_2': _miomaSize2Controller.text,
      'mioma_size_3': _miomaSize3Controller.text,
      'mioma_multiple': _miomaMultiple,

      // Endometrium
      'endometrium_thickness': _endometriumThicknessController.text,
      'endo_trilaminar': _endoTrilaminar,
      'endo_echogenic': _endoEchogenic,
      'endo_irregular': _endoIrregular,
      'endo_normal': _endoNormal,
      'endo_thick': _endoThick,
      'endo_polyp': _endoPolyp,
      'endo_fluid': _endoFluid,

      // Ovarium
      'ovarium_kanan_visible': _ovariumKananVisible,
      'ovarium_kiri_visible': _ovariumKiriVisible,
      'ovarium_kanan_1': _ovariumKanan1Controller.text,
      'ovarium_kanan_2': _ovariumKanan2Controller.text,
      'ovarium_kanan_3': _ovariumKanan3Controller.text,
      'folikel_kanan_min': _folikelKananMinController.text,
      'folikel_kanan_max': _folikelKananMaxController.text,
      'ovarium_kiri_1': _ovariumKiri1Controller.text,
      'ovarium_kiri_2': _ovariumKiri2Controller.text,
      'ovarium_kiri_3': _ovariumKiri3Controller.text,
      'folikel_kiri_min': _folikelKiriMinController.text,
      'folikel_kiri_max': _folikelKiriMaxController.text,
      'ovarium_pco': _ovariumPco,
      'ovarium_massa': _ovariumMassa,

      // Massa detail
      'massa_size_1': _massaSize1Controller.text,
      'massa_size_2': _massaSize2Controller.text,
      'massa_kista_sederhana': _massaKistaSederhana,
      'massa_kista_kompleks': _massaKistaKompleks,
      'massa_padat': _massaPadat,
      'massa_campuran': _massaCampuran,
      'echo_anekoik': _echoAnekoik,
      'echo_rendah': _echoRendah,
      'echo_echogenik': _echoEchogenik,
      'septa': _septa,
      'dinding': _dinding,

      // Kesan
      'kesan': _kesanController.text,
    };

    widget.onSave(data);
  }
}
