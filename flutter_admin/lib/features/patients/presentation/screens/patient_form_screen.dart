import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../providers/patient_provider.dart';

class PatientFormScreen extends ConsumerStatefulWidget {
  final String? patientId;

  const PatientFormScreen({
    super.key,
    this.patientId,
  });

  @override
  ConsumerState<PatientFormScreen> createState() => _PatientFormScreenState();
}

class _PatientFormScreenState extends ConsumerState<PatientFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _whatsappController = TextEditingController();
  final _addressController = TextEditingController();
  final _husbandNameController = TextEditingController();
  final _ageController = TextEditingController();

  DateTime? _birthDate;
  String? _category;
  bool _isLoading = false;

  bool get isEditMode => widget.patientId != null;

  @override
  void initState() {
    super.initState();
    if (isEditMode) {
      _loadPatientData();
    }
  }

  Future<void> _loadPatientData() async {
    setState(() => _isLoading = true);
    await ref.read(patientDetailProvider.notifier).loadPatient(widget.patientId!);
    final state = ref.read(patientDetailProvider);

    if (state.patient != null) {
      final patient = state.patient!;
      _nameController.text = patient.name;
      _emailController.text = patient.email ?? '';
      _phoneController.text = patient.phone ?? '';
      _whatsappController.text = patient.whatsapp ?? '';
      _addressController.text = patient.address ?? '';
      _husbandNameController.text = patient.husbandName ?? '';
      _ageController.text = patient.age?.toString() ?? '';
      _birthDate = patient.birthDate;
      _category = patient.category;
    }

    setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _husbandNameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final formState = ref.watch(patientFormProvider);
    final isTablet = MediaQuery.of(context).size.width > 600;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEditMode ? 'Edit Pasien' : 'Tambah Pasien'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: isTablet
                    ? _buildTabletLayout()
                    : _buildMobileLayout(),
              ),
            ),
      bottomNavigationBar: _buildBottomBar(formState),
    );
  }

  Widget _buildTabletLayout() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Informasi Dasar',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 16),
                  _buildNameField(),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: _buildAgeField()),
                      const SizedBox(width: 16),
                      Expanded(child: _buildBirthDateField()),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildCategoryField(),
                  const SizedBox(height: 16),
                  _buildHusbandNameField(),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Kontak',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 16),
                  _buildPhoneField(),
                  const SizedBox(height: 16),
                  _buildWhatsAppField(),
                  const SizedBox(height: 16),
                  _buildEmailField(),
                  const SizedBox(height: 16),
                  _buildAddressField(),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMobileLayout() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Informasi Dasar',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 16),
                _buildNameField(),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _buildAgeField()),
                    const SizedBox(width: 16),
                    Expanded(child: _buildBirthDateField()),
                  ],
                ),
                const SizedBox(height: 16),
                _buildCategoryField(),
                const SizedBox(height: 16),
                _buildHusbandNameField(),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Kontak',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 16),
                _buildPhoneField(),
                const SizedBox(height: 16),
                _buildWhatsAppField(),
                const SizedBox(height: 16),
                _buildEmailField(),
                const SizedBox(height: 16),
                _buildAddressField(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildNameField() {
    return TextFormField(
      controller: _nameController,
      decoration: const InputDecoration(
        labelText: 'Nama Lengkap *',
        hintText: 'Masukkan nama lengkap pasien',
        prefixIcon: Icon(Icons.person),
        border: OutlineInputBorder(),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Nama wajib diisi';
        }
        return null;
      },
      textCapitalization: TextCapitalization.words,
    );
  }

  Widget _buildAgeField() {
    return TextFormField(
      controller: _ageController,
      decoration: const InputDecoration(
        labelText: 'Umur',
        hintText: 'Tahun',
        prefixIcon: Icon(Icons.cake),
        border: OutlineInputBorder(),
      ),
      keyboardType: TextInputType.number,
    );
  }

  Widget _buildBirthDateField() {
    return InkWell(
      onTap: _selectBirthDate,
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Tanggal Lahir',
          prefixIcon: Icon(Icons.calendar_today),
          border: OutlineInputBorder(),
        ),
        child: Text(
          _birthDate != null
              ? DateFormat('d MMM yyyy').format(_birthDate!)
              : 'Pilih tanggal',
          style: TextStyle(
            color: _birthDate != null ? null : Colors.grey[600],
          ),
        ),
      ),
    );
  }

  Future<void> _selectBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime.now().subtract(const Duration(days: 365 * 25)),
      firstDate: DateTime(1920),
      lastDate: DateTime.now(),
      locale: const Locale('id', 'ID'),
    );
    if (picked != null) {
      setState(() {
        _birthDate = picked;
        final now = DateTime.now();
        _ageController.text = (now.year - picked.year).toString();
      });
    }
  }

  Widget _buildCategoryField() {
    return DropdownButtonFormField<String>(
      value: _category,
      decoration: const InputDecoration(
        labelText: 'Kategori',
        prefixIcon: Icon(Icons.category),
        border: OutlineInputBorder(),
      ),
      items: const [
        DropdownMenuItem(value: 'Obstetri', child: Text('Obstetri')),
        DropdownMenuItem(value: 'Gyn/Repro', child: Text('Gyn/Repro')),
        DropdownMenuItem(value: 'Ginekologi', child: Text('Ginekologi')),
      ],
      onChanged: (value) {
        setState(() => _category = value);
      },
    );
  }

  Widget _buildHusbandNameField() {
    return TextFormField(
      controller: _husbandNameController,
      decoration: const InputDecoration(
        labelText: 'Nama Suami',
        hintText: 'Masukkan nama suami (opsional)',
        prefixIcon: Icon(Icons.person_outline),
        border: OutlineInputBorder(),
      ),
      textCapitalization: TextCapitalization.words,
    );
  }

  Widget _buildPhoneField() {
    return TextFormField(
      controller: _phoneController,
      decoration: const InputDecoration(
        labelText: 'Nomor Telepon',
        hintText: '08xxxxxxxxxx',
        prefixIcon: Icon(Icons.phone),
        border: OutlineInputBorder(),
      ),
      keyboardType: TextInputType.phone,
    );
  }

  Widget _buildWhatsAppField() {
    return TextFormField(
      controller: _whatsappController,
      decoration: InputDecoration(
        labelText: 'WhatsApp',
        hintText: '08xxxxxxxxxx',
        prefixIcon: const Icon(Icons.chat, color: Colors.green),
        border: const OutlineInputBorder(),
        suffixIcon: IconButton(
          icon: const Icon(Icons.copy),
          onPressed: () {
            if (_phoneController.text.isNotEmpty) {
              _whatsappController.text = _phoneController.text;
            }
          },
          tooltip: 'Salin dari telepon',
        ),
      ),
      keyboardType: TextInputType.phone,
    );
  }

  Widget _buildEmailField() {
    return TextFormField(
      controller: _emailController,
      decoration: const InputDecoration(
        labelText: 'Email',
        hintText: 'contoh@email.com',
        prefixIcon: Icon(Icons.email),
        border: OutlineInputBorder(),
      ),
      keyboardType: TextInputType.emailAddress,
      validator: (value) {
        if (value != null && value.isNotEmpty) {
          if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
            return 'Format email tidak valid';
          }
        }
        return null;
      },
    );
  }

  Widget _buildAddressField() {
    return TextFormField(
      controller: _addressController,
      decoration: const InputDecoration(
        labelText: 'Alamat',
        hintText: 'Masukkan alamat lengkap',
        prefixIcon: Icon(Icons.location_on),
        border: OutlineInputBorder(),
      ),
      maxLines: 3,
      textCapitalization: TextCapitalization.sentences,
    );
  }

  Widget _buildBottomBar(PatientFormState formState) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => context.pop(),
                child: const Text('Batal'),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: formState.isLoading ? null : _submitForm,
                child: formState.isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(isEditMode ? 'Simpan Perubahan' : 'Tambah Pasien'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) return;

    final data = <String, dynamic>{
      'name': _nameController.text.trim(),
    };

    if (_emailController.text.isNotEmpty) {
      data['email'] = _emailController.text.trim();
    }
    if (_phoneController.text.isNotEmpty) {
      data['phone'] = _phoneController.text.trim();
    }
    if (_whatsappController.text.isNotEmpty) {
      data['whatsapp'] = _whatsappController.text.trim();
    }
    if (_addressController.text.isNotEmpty) {
      data['address'] = _addressController.text.trim();
    }
    if (_husbandNameController.text.isNotEmpty) {
      data['husband_name'] = _husbandNameController.text.trim();
    }
    if (_ageController.text.isNotEmpty) {
      data['age'] = int.tryParse(_ageController.text);
    }
    if (_birthDate != null) {
      data['birth_date'] = DateFormat('yyyy-MM-dd').format(_birthDate!);
    }
    if (_category != null) {
      data['category'] = _category;
    }

    final notifier = ref.read(patientFormProvider.notifier);
    bool success;

    if (isEditMode) {
      success = await notifier.updatePatient(widget.patientId!, data);
    } else {
      success = await notifier.createPatient(data);
    }

    if (success && mounted) {
      ref.read(patientListProvider.notifier).refresh();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isEditMode ? 'Pasien berhasil diperbarui' : 'Pasien berhasil ditambahkan',
          ),
          backgroundColor: Colors.green,
        ),
      );

      context.pop();
    } else if (mounted) {
      final error = ref.read(patientFormProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error ?? 'Terjadi kesalahan'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
