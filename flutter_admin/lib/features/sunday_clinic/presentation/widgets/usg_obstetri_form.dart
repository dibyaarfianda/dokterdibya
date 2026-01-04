import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';

class UsgObstetriForm extends StatefulWidget {
  final Map<String, dynamic> initialData;
  final bool isReadOnly;
  final Function(Map<String, dynamic>) onSave;
  final bool isSaving;

  const UsgObstetriForm({
    super.key,
    required this.initialData,
    this.isReadOnly = false,
    required this.onSave,
    this.isSaving = false,
  });

  @override
  State<UsgObstetriForm> createState() => _UsgObstetriFormState();
}

class _UsgObstetriFormState extends State<UsgObstetriForm>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late DateTime _recordDatetime;

  // Trimester 1 fields
  String? _t1EmbryoCount;
  final _t1GsController = TextEditingController();
  final _t1CrlController = TextEditingController();
  final _t1GaWeeksController = TextEditingController();
  final _t1HeartRateController = TextEditingController();
  String? _t1Implantation;
  DateTime? _t1Edd;
  final _t1NtController = TextEditingController();
  final _t1NotesController = TextEditingController();

  // Trimester 2 fields
  String? _t2FetusCount;
  String? _t2Gender;
  String? _t2FetusLie;
  String? _t2Presentation;
  final _t2BpdController = TextEditingController();
  final _t2AcController = TextEditingController();
  final _t2FlController = TextEditingController();
  final _t2HeartRateController = TextEditingController();
  String? _t2Placenta;
  final _t2PlacentaPreviaController = TextEditingController();
  final _t2AfiController = TextEditingController();
  final _t2EfwController = TextEditingController();
  DateTime? _t2Edd;
  final _t2NotesController = TextEditingController();

  // Trimester 3 fields (similar to T2 with additional fields)
  String? _t3FetusCount;
  String? _t3Gender;
  String? _t3FetusLie;
  String? _t3Presentation;
  final _t3BpdController = TextEditingController();
  final _t3AcController = TextEditingController();
  final _t3FlController = TextEditingController();
  final _t3HeartRateController = TextEditingController();
  String? _t3Placenta;
  final _t3AfiController = TextEditingController();
  final _t3EfwController = TextEditingController();
  DateTime? _t3Edd;
  String? _t3MembraneSweep;

  // Screening checkboxes
  bool _scrHemisphere = false;
  bool _scrLateralVent = false;
  bool _scrCavum = false;
  bool _scrProfile = false;
  bool _scrNasalBone = false;
  bool _scrUpperLip = false;
  bool _scr4Chamber = false;
  bool _scrHeartLeft = false;
  bool _scrApex = false;
  bool _scrHeartSize = false;
  bool _scrVertebra = false;
  bool _scrSkin = false;
  bool _scrUpperLimbs = false;
  bool _scrLowerLimbs = false;
  bool _scrStomach = false;
  bool _scrLiver = false;
  bool _scrKidneys = false;
  bool _scrBladder = false;
  bool _scrCord = false;
  bool _scrAbdominalWall = false;
  bool _scrNoAnomaly = false;
  bool _scrSuspect = false;
  final _scrSuspectNotesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
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

    // Determine initial tab from saved data
    final currentTrimester = data['current_trimester'] ?? 'first';
    switch (currentTrimester) {
      case 'second':
        _tabController.index = 1;
        break;
      case 'screening':
        _tabController.index = 2;
        break;
      case 'third':
        _tabController.index = 3;
        break;
      default:
        _tabController.index = 0;
    }

    // Initialize Trimester 1
    final t1 = data['trimester_1'] ?? {};
    _t1EmbryoCount = t1['embryo_count'];
    _t1GsController.text = t1['gs']?.toString() ?? '';
    _t1CrlController.text = t1['crl']?.toString() ?? '';
    _t1GaWeeksController.text = t1['ga_weeks']?.toString() ?? '';
    _t1HeartRateController.text = t1['heart_rate']?.toString() ?? '';
    _t1Implantation = t1['implantation'];
    if (t1['edd'] != null) _t1Edd = DateTime.tryParse(t1['edd']);
    _t1NtController.text = t1['nt']?.toString() ?? '';
    _t1NotesController.text = t1['notes'] ?? '';

    // Initialize Trimester 2
    final t2 = data['trimester_2'] ?? {};
    _t2FetusCount = t2['fetus_count'];
    _t2Gender = t2['gender'];
    _t2FetusLie = t2['fetus_lie'];
    _t2Presentation = t2['presentation'];
    _t2BpdController.text = t2['bpd']?.toString() ?? '';
    _t2AcController.text = t2['ac']?.toString() ?? '';
    _t2FlController.text = t2['fl']?.toString() ?? '';
    _t2HeartRateController.text = t2['heart_rate']?.toString() ?? '';
    _t2Placenta = t2['placenta'];
    _t2PlacentaPreviaController.text = t2['placenta_previa'] ?? '';
    _t2AfiController.text = t2['afi']?.toString() ?? '';
    _t2EfwController.text = t2['efw']?.toString() ?? '';
    if (t2['edd'] != null) _t2Edd = DateTime.tryParse(t2['edd']);
    _t2NotesController.text = t2['notes'] ?? '';

    // Initialize Trimester 3
    final t3 = data['trimester_3'] ?? {};
    _t3FetusCount = t3['fetus_count'];
    _t3Gender = t3['gender'];
    _t3FetusLie = t3['fetus_lie'];
    _t3Presentation = t3['presentation'];
    _t3BpdController.text = t3['bpd']?.toString() ?? '';
    _t3AcController.text = t3['ac']?.toString() ?? '';
    _t3FlController.text = t3['fl']?.toString() ?? '';
    _t3HeartRateController.text = t3['heart_rate']?.toString() ?? '';
    _t3Placenta = t3['placenta'];
    _t3AfiController.text = t3['afi']?.toString() ?? '';
    _t3EfwController.text = t3['efw']?.toString() ?? '';
    if (t3['edd'] != null) _t3Edd = DateTime.tryParse(t3['edd']);
    _t3MembraneSweep = t3['membrane_sweep'];

    // Initialize Screening
    final scr = data['screening'] ?? {};
    _scrHemisphere = scr['hemisphere'] ?? false;
    _scrLateralVent = scr['lateral_vent'] ?? false;
    _scrCavum = scr['cavum'] ?? false;
    _scrProfile = scr['profile'] ?? false;
    _scrNasalBone = scr['nasal_bone'] ?? false;
    _scrUpperLip = scr['upper_lip'] ?? false;
    _scr4Chamber = scr['4chamber'] ?? false;
    _scrHeartLeft = scr['heart_left'] ?? false;
    _scrApex = scr['apex'] ?? false;
    _scrHeartSize = scr['heart_size'] ?? false;
    _scrVertebra = scr['vertebra'] ?? false;
    _scrSkin = scr['skin'] ?? false;
    _scrUpperLimbs = scr['upper_limbs'] ?? false;
    _scrLowerLimbs = scr['lower_limbs'] ?? false;
    _scrStomach = scr['stomach'] ?? false;
    _scrLiver = scr['liver'] ?? false;
    _scrKidneys = scr['kidneys'] ?? false;
    _scrBladder = scr['bladder'] ?? false;
    _scrCord = scr['cord'] ?? false;
    _scrAbdominalWall = scr['abdominal_wall'] ?? false;
    _scrNoAnomaly = scr['no_anomaly'] ?? false;
    _scrSuspect = scr['suspect'] ?? false;
    _scrSuspectNotesController.text = scr['suspect_notes'] ?? '';
  }

  @override
  void dispose() {
    _tabController.dispose();
    _t1GsController.dispose();
    _t1CrlController.dispose();
    _t1GaWeeksController.dispose();
    _t1HeartRateController.dispose();
    _t1NtController.dispose();
    _t1NotesController.dispose();
    _t2BpdController.dispose();
    _t2AcController.dispose();
    _t2FlController.dispose();
    _t2HeartRateController.dispose();
    _t2PlacentaPreviaController.dispose();
    _t2AfiController.dispose();
    _t2EfwController.dispose();
    _t2NotesController.dispose();
    _t3BpdController.dispose();
    _t3AcController.dispose();
    _t3FlController.dispose();
    _t3HeartRateController.dispose();
    _t3AfiController.dispose();
    _t3EfwController.dispose();
    _scrSuspectNotesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Datetime picker
        _buildDatetimePicker(),
        const SizedBox(height: 16),

        // Tab bar
        Container(
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: TabBar(
            controller: _tabController,
            isScrollable: true,
            labelColor: Colors.white,
            unselectedLabelColor: AppColors.primary,
            indicator: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            tabs: const [
              Tab(text: 'Trimester 1'),
              Tab(text: 'Trimester 2'),
              Tab(text: 'Skrining'),
              Tab(text: 'Trimester 3'),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Tab content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildTrimester1(),
              _buildTrimester2(),
              _buildScreening(),
              _buildTrimester3(),
            ],
          ),
        ),

        // Save button
        if (!widget.isReadOnly)
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: widget.isSaving ? null : _save,
                child: widget.isSaving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Simpan USG Obstetri'),
              ),
            ),
          ),
      ],
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

  Widget _buildTrimester1() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle('TRIMESTER PERTAMA (1-13 minggu)'),
          const SizedBox(height: 16),

          // Embryo count
          const Text('Jumlah Embrio',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 16,
            children: [
              _buildRadioOption('Belum Tampak', 'not_visible', _t1EmbryoCount,
                  (v) => setState(() => _t1EmbryoCount = v)),
              _buildRadioOption('Tunggal', 'single', _t1EmbryoCount,
                  (v) => setState(() => _t1EmbryoCount = v)),
              _buildRadioOption('Multipel', 'multiple', _t1EmbryoCount,
                  (v) => setState(() => _t1EmbryoCount = v)),
            ],
          ),
          const SizedBox(height: 16),

          // Measurements row
          Row(
            children: [
              Expanded(
                child: _buildNumberField('GS', _t1GsController, 'minggu'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildNumberField('CRL', _t1CrlController, 'cm'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _buildNumberField(
                    'Usia Kehamilan', _t1GaWeeksController, 'minggu'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildNumberField(
                    'Detak Jantung', _t1HeartRateController, 'x/menit'),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Implantation
          const Text('Implantasi',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 16,
            children: [
              _buildRadioOption('Intrauterine', 'intrauterine', _t1Implantation,
                  (v) => setState(() => _t1Implantation = v)),
              _buildRadioOption('Ectopic', 'ectopic', _t1Implantation,
                  (v) => setState(() => _t1Implantation = v)),
            ],
          ),
          const SizedBox(height: 16),

          // EDD and NT
          Row(
            children: [
              Expanded(
                child: _buildDateField('HPL/EDD', _t1Edd,
                    (d) => setState(() => _t1Edd = d)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildNumberField('NT', _t1NtController, 'mm'),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Notes
          TextFormField(
            controller: _t1NotesController,
            decoration: const InputDecoration(
              labelText: 'Catatan',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
        ],
      ),
    );
  }

  Widget _buildTrimester2() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle('BIOMETRI JANIN - Trimester Kedua (14-27 minggu)'),
          const SizedBox(height: 16),

          // Fetus count and gender
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Jumlah Janin',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildRadioOption('Tunggal', 'single', _t2FetusCount,
                            (v) => setState(() => _t2FetusCount = v)),
                        _buildRadioOption('Multipel', 'multiple', _t2FetusCount,
                            (v) => setState(() => _t2FetusCount = v)),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Jenis Kelamin',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildRadioOption('Laki-laki', 'male', _t2Gender,
                            (v) => setState(() => _t2Gender = v)),
                        _buildRadioOption('Perempuan', 'female', _t2Gender,
                            (v) => setState(() => _t2Gender = v)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Fetus lie and presentation
          const Text('Letak Janin',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Membujur', 'longitudinal', _t2FetusLie,
                  (v) => setState(() => _t2FetusLie = v)),
              _buildRadioOption('Melintang', 'transverse', _t2FetusLie,
                  (v) => setState(() => _t2FetusLie = v)),
              _buildRadioOption('Oblique', 'oblique', _t2FetusLie,
                  (v) => setState(() => _t2FetusLie = v)),
            ],
          ),
          const SizedBox(height: 8),
          const Text('Presentasi',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Kepala', 'cephalic', _t2Presentation,
                  (v) => setState(() => _t2Presentation = v)),
              _buildRadioOption('Bokong', 'breech', _t2Presentation,
                  (v) => setState(() => _t2Presentation = v)),
              _buildRadioOption('Bahu', 'shoulder', _t2Presentation,
                  (v) => setState(() => _t2Presentation = v)),
            ],
          ),
          const SizedBox(height: 16),

          // Biometry
          _buildSectionTitle('Biometri'),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('BPD', _t2BpdController, 'minggu')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField('AC', _t2AcController, 'minggu')),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('FL', _t2FlController, 'minggu')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField(
                      'Detak Jantung', _t2HeartRateController, 'x/menit')),
            ],
          ),
          const SizedBox(height: 16),

          // Placenta
          _buildSectionTitle('Plasenta & Ketuban'),
          const Text('Lokasi Plasenta',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Anterior', 'anterior', _t2Placenta,
                  (v) => setState(() => _t2Placenta = v)),
              _buildRadioOption('Posterior', 'posterior', _t2Placenta,
                  (v) => setState(() => _t2Placenta = v)),
              _buildRadioOption('Fundus', 'fundus', _t2Placenta,
                  (v) => setState(() => _t2Placenta = v)),
              _buildRadioOption('Lateral', 'lateral', _t2Placenta,
                  (v) => setState(() => _t2Placenta = v)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('AFI', _t2AfiController, 'cm')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField('EFW', _t2EfwController, 'gram')),
            ],
          ),
          const SizedBox(height: 8),
          _buildDateField('HPL/EDD', _t2Edd, (d) => setState(() => _t2Edd = d)),
          const SizedBox(height: 16),

          // Notes
          TextFormField(
            controller: _t2NotesController,
            decoration: const InputDecoration(
              labelText: 'Catatan',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            readOnly: widget.isReadOnly,
          ),
        ],
      ),
    );
  }

  Widget _buildScreening() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle('SKRINING KELAINAN KONGENITAL (18-23 minggu)'),
          const SizedBox(height: 16),

          _buildSectionTitle('Kepala dan Otak:'),
          _buildCheckbox('Simetris hemisfer, Falx cerebri jelas', _scrHemisphere,
              (v) => setState(() => _scrHemisphere = v!)),
          _buildCheckbox('Ventrikel lateral, Atrium < 10 mm', _scrLateralVent,
              (v) => setState(() => _scrLateralVent = v!)),
          _buildCheckbox('Cavum septum pellucidum', _scrCavum,
              (v) => setState(() => _scrCavum = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('Muka dan Leher:'),
          _buildCheckbox('Profil muka normal', _scrProfile,
              (v) => setState(() => _scrProfile = v!)),
          _buildCheckbox('Tulang hidung tampak, ukuran normal', _scrNasalBone,
              (v) => setState(() => _scrNasalBone = v!)),
          _buildCheckbox('Garis bibir atas menyambung', _scrUpperLip,
              (v) => setState(() => _scrUpperLip = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('Jantung dan Rongga Dada:'),
          _buildCheckbox('Gambaran jelas 4-chamber view', _scr4Chamber,
              (v) => setState(() => _scr4Chamber = v!)),
          _buildCheckbox('Jantung di sebelah kiri', _scrHeartLeft,
              (v) => setState(() => _scrHeartLeft = v!)),
          _buildCheckbox('Apex jantung kearah kiri (~45°)', _scrApex,
              (v) => setState(() => _scrApex = v!)),
          _buildCheckbox('Besar jantung <1/3 area dada', _scrHeartSize,
              (v) => setState(() => _scrHeartSize = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('Tulang Belakang:'),
          _buildCheckbox('Tidak tampak kelainan vertebra', _scrVertebra,
              (v) => setState(() => _scrVertebra = v!)),
          _buildCheckbox('Garis kulit tampak baik', _scrSkin,
              (v) => setState(() => _scrSkin = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('Anggota Gerak:'),
          _buildCheckbox('Alat gerak kiri kanan atas normal', _scrUpperLimbs,
              (v) => setState(() => _scrUpperLimbs = v!)),
          _buildCheckbox('Alat gerak kiri kanan bawah normal', _scrLowerLimbs,
              (v) => setState(() => _scrLowerLimbs = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('Rongga Perut:'),
          _buildCheckbox('Lambung di sebelah kiri', _scrStomach,
              (v) => setState(() => _scrStomach = v!)),
          _buildCheckbox('Posisi liver dan echogenocity normal', _scrLiver,
              (v) => setState(() => _scrLiver = v!)),
          _buildCheckbox('Terlihat ginjal kiri & kanan', _scrKidneys,
              (v) => setState(() => _scrKidneys = v!)),
          _buildCheckbox('Kandung kemih terisi', _scrBladder,
              (v) => setState(() => _scrBladder = v!)),
          _buildCheckbox('Insersi tali pusat baik', _scrCord,
              (v) => setState(() => _scrCord = v!)),
          _buildCheckbox('Dinding perut tidak tampak defek', _scrAbdominalWall,
              (v) => setState(() => _scrAbdominalWall = v!)),
          const SizedBox(height: 16),

          _buildSectionTitle('KESIMPULAN'),
          _buildCheckbox('Tidak ditemukan kelainan', _scrNoAnomaly,
              (v) => setState(() => _scrNoAnomaly = v!)),
          _buildCheckbox('Kecurigaan', _scrSuspect,
              (v) => setState(() => _scrSuspect = v!)),
          if (_scrSuspect) ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: _scrSuspectNotesController,
              decoration: const InputDecoration(
                labelText: 'Jelaskan kecurigaan',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
              readOnly: widget.isReadOnly,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTrimester3() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle(
              'BIOMETRI JANIN - Trimester Ketiga (28+ minggu)'),
          const SizedBox(height: 16),

          // Similar to Trimester 2 but with additional fields
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Jumlah Janin',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildRadioOption('Tunggal', 'single', _t3FetusCount,
                            (v) => setState(() => _t3FetusCount = v)),
                        _buildRadioOption('Multipel', 'multiple', _t3FetusCount,
                            (v) => setState(() => _t3FetusCount = v)),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Jenis Kelamin',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildRadioOption('Laki-laki', 'male', _t3Gender,
                            (v) => setState(() => _t3Gender = v)),
                        _buildRadioOption('Perempuan', 'female', _t3Gender,
                            (v) => setState(() => _t3Gender = v)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Fetus lie and presentation
          const Text('Letak Janin',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Membujur', 'longitudinal', _t3FetusLie,
                  (v) => setState(() => _t3FetusLie = v)),
              _buildRadioOption('Melintang', 'transverse', _t3FetusLie,
                  (v) => setState(() => _t3FetusLie = v)),
              _buildRadioOption('Oblique', 'oblique', _t3FetusLie,
                  (v) => setState(() => _t3FetusLie = v)),
            ],
          ),
          const SizedBox(height: 8),
          const Text('Presentasi',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Kepala', 'cephalic', _t3Presentation,
                  (v) => setState(() => _t3Presentation = v)),
              _buildRadioOption('Bokong', 'breech', _t3Presentation,
                  (v) => setState(() => _t3Presentation = v)),
              _buildRadioOption('Bahu', 'shoulder', _t3Presentation,
                  (v) => setState(() => _t3Presentation = v)),
            ],
          ),
          const SizedBox(height: 16),

          // Biometry
          _buildSectionTitle('Biometri'),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('BPD', _t3BpdController, 'minggu')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField('AC', _t3AcController, 'minggu')),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('FL', _t3FlController, 'minggu')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField(
                      'Detak Jantung', _t3HeartRateController, 'x/menit')),
            ],
          ),
          const SizedBox(height: 16),

          // Placenta
          _buildSectionTitle('Plasenta & Ketuban'),
          const Text('Lokasi Plasenta',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Anterior', 'anterior', _t3Placenta,
                  (v) => setState(() => _t3Placenta = v)),
              _buildRadioOption('Posterior', 'posterior', _t3Placenta,
                  (v) => setState(() => _t3Placenta = v)),
              _buildRadioOption('Fundus', 'fundus', _t3Placenta,
                  (v) => setState(() => _t3Placenta = v)),
              _buildRadioOption('Lateral', 'lateral', _t3Placenta,
                  (v) => setState(() => _t3Placenta = v)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _buildNumberField('AFI', _t3AfiController, 'cm')),
              const SizedBox(width: 8),
              Expanded(
                  child: _buildNumberField('EFW', _t3EfwController, 'gram')),
            ],
          ),
          const SizedBox(height: 8),
          _buildDateField('HPL/EDD', _t3Edd, (d) => setState(() => _t3Edd = d)),
          const SizedBox(height: 16),

          // Membrane sweep
          _buildSectionTitle('Stripping of membrane'),
          Wrap(
            spacing: 8,
            children: [
              _buildRadioOption('Tidak', 'no', _t3MembraneSweep,
                  (v) => setState(() => _t3MembraneSweep = v)),
              _buildRadioOption('Berhasil', 'successful', _t3MembraneSweep,
                  (v) => setState(() => _t3MembraneSweep = v)),
              _buildRadioOption('Gagal', 'failed', _t3MembraneSweep,
                  (v) => setState(() => _t3MembraneSweep = v)),
            ],
          ),
        ],
      ),
    );
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

  Widget _buildRadioOption(
      String label, String value, String? groupValue, Function(String?) onChanged) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Radio<String>(
          value: value,
          groupValue: groupValue,
          onChanged: widget.isReadOnly ? null : onChanged,
        ),
        Text(label),
      ],
    );
  }

  Widget _buildCheckbox(String label, bool value, Function(bool?) onChanged) {
    return CheckboxListTile(
      title: Text(label, style: const TextStyle(fontSize: 14)),
      value: value,
      onChanged: widget.isReadOnly ? null : onChanged,
      dense: true,
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
    );
  }

  Widget _buildNumberField(
      String label, TextEditingController controller, String suffix) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        suffixText: suffix,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      readOnly: widget.isReadOnly,
    );
  }

  Widget _buildDateField(
      String label, DateTime? value, Function(DateTime?) onChanged) {
    return InkWell(
      onTap: widget.isReadOnly
          ? null
          : () async {
              final date = await showDatePicker(
                context: context,
                initialDate: value ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
              );
              onChanged(date);
            },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        child: Text(
          value != null ? DateFormat('yyyy-MM-dd').format(value) : '-',
        ),
      ),
    );
  }

  String _getCurrentTrimester() {
    switch (_tabController.index) {
      case 1:
        return 'second';
      case 2:
        return 'screening';
      case 3:
        return 'third';
      default:
        return 'first';
    }
  }

  void _save() {
    final data = <String, dynamic>{
      'record_datetime': _recordDatetime.toIso8601String(),
      'record_date': DateFormat('yyyy-MM-dd').format(_recordDatetime),
      'record_time': DateFormat('HH:mm').format(_recordDatetime),
      'current_trimester': _getCurrentTrimester(),
      'trimester_1': {
        'embryo_count': _t1EmbryoCount,
        'gs': _t1GsController.text,
        'crl': _t1CrlController.text,
        'ga_weeks': _t1GaWeeksController.text,
        'heart_rate': _t1HeartRateController.text,
        'implantation': _t1Implantation,
        'edd': _t1Edd?.toIso8601String().split('T').first,
        'nt': _t1NtController.text,
        'notes': _t1NotesController.text,
      },
      'trimester_2': {
        'fetus_count': _t2FetusCount,
        'gender': _t2Gender,
        'fetus_lie': _t2FetusLie,
        'presentation': _t2Presentation,
        'bpd': _t2BpdController.text,
        'ac': _t2AcController.text,
        'fl': _t2FlController.text,
        'heart_rate': _t2HeartRateController.text,
        'placenta': _t2Placenta,
        'placenta_previa': _t2PlacentaPreviaController.text,
        'afi': _t2AfiController.text,
        'efw': _t2EfwController.text,
        'edd': _t2Edd?.toIso8601String().split('T').first,
        'notes': _t2NotesController.text,
      },
      'trimester_3': {
        'fetus_count': _t3FetusCount,
        'gender': _t3Gender,
        'fetus_lie': _t3FetusLie,
        'presentation': _t3Presentation,
        'bpd': _t3BpdController.text,
        'ac': _t3AcController.text,
        'fl': _t3FlController.text,
        'heart_rate': _t3HeartRateController.text,
        'placenta': _t3Placenta,
        'afi': _t3AfiController.text,
        'efw': _t3EfwController.text,
        'edd': _t3Edd?.toIso8601String().split('T').first,
        'membrane_sweep': _t3MembraneSweep,
      },
      'screening': {
        'hemisphere': _scrHemisphere,
        'lateral_vent': _scrLateralVent,
        'cavum': _scrCavum,
        'profile': _scrProfile,
        'nasal_bone': _scrNasalBone,
        'upper_lip': _scrUpperLip,
        '4chamber': _scr4Chamber,
        'heart_left': _scrHeartLeft,
        'apex': _scrApex,
        'heart_size': _scrHeartSize,
        'vertebra': _scrVertebra,
        'skin': _scrSkin,
        'upper_limbs': _scrUpperLimbs,
        'lower_limbs': _scrLowerLimbs,
        'stomach': _scrStomach,
        'liver': _scrLiver,
        'kidneys': _scrKidneys,
        'bladder': _scrBladder,
        'cord': _scrCord,
        'abdominal_wall': _scrAbdominalWall,
        'no_anomaly': _scrNoAnomaly,
        'suspect': _scrSuspect,
        'suspect_notes': _scrSuspectNotesController.text,
      },
    };

    widget.onSave(data);
  }
}
