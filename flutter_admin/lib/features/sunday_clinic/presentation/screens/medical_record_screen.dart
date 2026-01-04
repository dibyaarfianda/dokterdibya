import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/medical_record_model.dart';
import '../providers/sunday_clinic_provider.dart';
import '../widgets/anamnesa_form.dart';
import '../widgets/physical_exam_form.dart';
import '../widgets/diagnosis_form.dart';
import '../widgets/plan_form.dart';
import '../widgets/usg_obstetri_form.dart';
import '../widgets/usg_gynecology_form.dart';
import '../widgets/obstetric_exam_form.dart';
import '../widgets/supporting_exam_form.dart';

class MedicalRecordScreen extends ConsumerStatefulWidget {
  final String patientId;
  final String patientName;
  final String category;
  final String location;
  final int? recordId;
  final String? mrId;

  const MedicalRecordScreen({
    super.key,
    required this.patientId,
    required this.patientName,
    required this.category,
    required this.location,
    this.recordId,
    this.mrId,
  });

  @override
  ConsumerState<MedicalRecordScreen> createState() => _MedicalRecordScreenState();
}

class _MedicalRecordScreenState extends ConsumerState<MedicalRecordScreen> {
  List<String> get _sections {
    // Return category-specific sections
    if (widget.category == 'Obstetri') {
      return [
        'anamnesa',
        'physical_exam',
        'obstetric_exam',
        'supporting',
        'usg_obstetri',
        'diagnosis',
        'plan',
      ];
    } else {
      // Gyn/Repro or Ginekologi
      return [
        'anamnesa',
        'physical_exam',
        'supporting',
        'usg_gynecology',
        'diagnosis',
        'plan',
      ];
    }
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (widget.mrId != null && widget.mrId!.isNotEmpty) {
        ref.read(medicalRecordProvider.notifier).loadRecordByMrId(widget.mrId!);
      } else {
        ref.read(medicalRecordProvider.notifier).loadOrCreateRecord(
              patientId: widget.patientId,
              category: widget.category,
              location: widget.location,
              existingMrId: widget.mrId,
            );
      }
    });
  }

  @override
  void dispose() {
    ref.read(medicalRecordProvider.notifier).clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final recordState = ref.watch(medicalRecordProvider);
    final isTablet = MediaQuery.of(context).size.width > 800;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.patientName, style: const TextStyle(fontSize: 16)),
            Text(
              recordState.record?.mrId ?? 'Memuat...',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal),
            ),
          ],
        ),
        actions: [
          if (recordState.record != null && !recordState.record!.isFinalized)
            TextButton.icon(
              onPressed: recordState.isSaving ? null : _finalizeRecord,
              icon: const Icon(Icons.check_circle, color: Colors.white),
              label: const Text('Selesaikan', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: recordState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : recordState.error != null
              ? _buildError(recordState.error!)
              : isTablet
                  ? _buildTabletLayout(recordState)
                  : _buildMobileLayout(recordState),
    );
  }

  Widget _buildError(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(error),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              ref.read(medicalRecordProvider.notifier).loadOrCreateRecord(
                    patientId: widget.patientId,
                    category: widget.category,
                    location: widget.location,
                  );
            },
            child: const Text('Coba Lagi'),
          ),
        ],
      ),
    );
  }

  Widget _buildTabletLayout(MedicalRecordState state) {
    return Row(
      children: [
        // Section navigation
        Container(
          width: 200,
          color: Colors.grey[100],
          child: Column(
            children: [
              // Patient info card
              _buildPatientInfoCard(state),
              const Divider(height: 1),
              // Section list
              Expanded(
                child: ListView.builder(
                  itemCount: _sections.length,
                  itemBuilder: (context, index) {
                    final section = _sections[index];
                    return _SectionNavItem(
                      section: section,
                      isActive: state.activeSection == section,
                      onTap: () {
                        ref.read(medicalRecordProvider.notifier).setActiveSection(section);
                      },
                    );
                  },
                ),
              ),
              // History button
              _buildHistoryButton(state),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        // Form content
        Expanded(
          child: _buildSectionForm(state),
        ),
      ],
    );
  }

  Widget _buildMobileLayout(MedicalRecordState state) {
    return Column(
      children: [
        // Patient info
        _buildPatientInfoCard(state),
        // Section tabs
        Container(
          color: Colors.white,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: _sections.map((section) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(_getSectionName(section)),
                    selected: state.activeSection == section,
                    onSelected: (_) {
                      ref.read(medicalRecordProvider.notifier).setActiveSection(section);
                    },
                    selectedColor: AppColors.primary.withValues(alpha: 0.2),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
        const Divider(height: 1),
        // Form content
        Expanded(
          child: _buildSectionForm(state),
        ),
      ],
    );
  }

  Widget _buildPatientInfoCard(MedicalRecordState state) {
    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.white,
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.primary.withValues(alpha: 0.1),
            child: Text(
              widget.patientName.isNotEmpty ? widget.patientName[0].toUpperCase() : '?',
              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.patientName,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _getCategoryColor().withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        widget.category,
                        style: TextStyle(
                          fontSize: 10,
                          color: _getCategoryColor(),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      VisitLocation.fromId(widget.location).name,
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (state.record != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: state.record!.isFinalized
                    ? Colors.green.withValues(alpha: 0.1)
                    : Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                state.record!.isFinalized ? 'Selesai' : 'Draft',
                style: TextStyle(
                  fontSize: 11,
                  color: state.record!.isFinalized ? Colors.green : Colors.orange,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildHistoryButton(MedicalRecordState state) {
    return Container(
      padding: const EdgeInsets.all(12),
      child: OutlinedButton.icon(
        onPressed: () => _showPatientHistory(state.patientHistory),
        icon: const Icon(Icons.history),
        label: Text('Riwayat (${state.patientHistory.length})'),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 40),
        ),
      ),
    );
  }

  Widget _buildSectionForm(MedicalRecordState state) {
    if (state.record == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final isReadOnly = state.record!.isFinalized;

    switch (state.activeSection) {
      case 'anamnesa':
        return AnamnesaForm(
          category: widget.category,
          initialData: state.record!.anamnesaData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('anamnesa', data),
          isSaving: state.isSaving,
        );
      case 'physical_exam':
        return PhysicalExamForm(
          category: widget.category,
          initialData: state.record!.physicalExamData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('physical_exam', data),
          isSaving: state.isSaving,
        );
      case 'obstetric_exam':
        return ObstetricExamForm(
          initialData: state.record!.obstetricsExamData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('pemeriksaan_obstetri', data),
          isSaving: state.isSaving,
        );
      case 'supporting':
        return SupportingExamForm(
          initialData: state.record!.supportingData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('penunjang', data),
          isSaving: state.isSaving,
        );
      case 'usg_obstetri':
        return UsgObstetriForm(
          initialData: state.record!.usgObstetriData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('usg_obstetri', data),
          isSaving: state.isSaving,
        );
      case 'usg_gynecology':
        return UsgGynecologyForm(
          initialData: state.record!.usgGynecologyData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('usg', data),
          isSaving: state.isSaving,
        );
      case 'diagnosis':
        return DiagnosisForm(
          initialData: state.record!.diagnosisData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('diagnosis', data),
          isSaving: state.isSaving,
        );
      case 'plan':
        return PlanForm(
          initialData: state.record!.planData ?? {},
          isReadOnly: isReadOnly,
          onSave: (data) => _saveSection('plan', data),
          isSaving: state.isSaving,
        );
      default:
        return Center(
          child: Text('Section ${state.activeSection} - Coming soon'),
        );
    }
  }

  Future<void> _saveSection(String section, Map<String, dynamic> data) async {
    final success = await ref.read(medicalRecordProvider.notifier).saveSection(
          section: section,
          data: data,
        );

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Data disimpan' : 'Gagal menyimpan'),
          backgroundColor: success ? Colors.green : Colors.red,
        ),
      );
    }
  }

  Future<void> _finalizeRecord() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Selesaikan Rekam Medis'),
        content: const Text(
          'Setelah diselesaikan, rekam medis tidak bisa diedit lagi. Lanjutkan?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Selesaikan'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final success = await ref.read(medicalRecordProvider.notifier).finalize();
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Rekam medis berhasil diselesaikan'),
            backgroundColor: Colors.green,
          ),
        );
        context.pop();
      }
    }
  }

  void _showPatientHistory(List<MedicalRecord> history) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.6,
          expand: false,
          builder: (context, scrollController) {
            return Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Riwayat Kunjungan',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: history.isEmpty
                        ? const Center(child: Text('Belum ada riwayat'))
                        : ListView.builder(
                            controller: scrollController,
                            itemCount: history.length,
                            itemBuilder: (context, index) {
                              final record = history[index];
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: record.isFinalized
                                      ? Colors.green.withValues(alpha: 0.1)
                                      : Colors.orange.withValues(alpha: 0.1),
                                  child: Icon(
                                    Icons.medical_services,
                                    color: record.isFinalized ? Colors.green : Colors.orange,
                                    size: 20,
                                  ),
                                ),
                                title: Text(record.mrId ?? '-'),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(record.locationDisplayName),
                                    if (record.createdAt != null)
                                      Text(
                                        DateFormat('d MMM yyyy HH:mm').format(record.createdAt!),
                                        style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                                      ),
                                  ],
                                ),
                                trailing: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: record.isFinalized
                                        ? Colors.green.withValues(alpha: 0.1)
                                        : Colors.orange.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    record.isFinalized ? 'Selesai' : 'Draft',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: record.isFinalized ? Colors.green : Colors.orange,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  String _getSectionName(String section) {
    switch (section) {
      case 'anamnesa':
        return 'Anamnesa';
      case 'physical_exam':
        return 'Pem. Fisik';
      case 'obstetric_exam':
        return 'Pem. Obstetri';
      case 'supporting':
        return 'Penunjang';
      case 'usg_obstetri':
        return 'USG Obstetri';
      case 'usg_gynecology':
        return 'USG Gyn';
      case 'diagnosis':
        return 'Diagnosis';
      case 'plan':
        return 'Planning';
      default:
        return section;
    }
  }

  Color _getCategoryColor() {
    switch (widget.category) {
      case 'Obstetri':
        return AppColors.obstetri;
      case 'Gyn/Repro':
        return AppColors.gynRepro;
      case 'Ginekologi':
        return AppColors.gynSpecial;
      default:
        return AppColors.secondary;
    }
  }
}

class _SectionNavItem extends StatelessWidget {
  final String section;
  final bool isActive;
  final VoidCallback onTap;

  const _SectionNavItem({
    required this.section,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(
        _getIcon(),
        color: isActive ? AppColors.primary : Colors.grey,
      ),
      title: Text(
        _getName(),
        style: TextStyle(
          color: isActive ? AppColors.primary : null,
          fontWeight: isActive ? FontWeight.bold : null,
        ),
      ),
      selected: isActive,
      selectedTileColor: AppColors.primary.withValues(alpha: 0.1),
      onTap: onTap,
    );
  }

  IconData _getIcon() {
    switch (section) {
      case 'anamnesa':
        return Icons.question_answer;
      case 'physical_exam':
        return Icons.monitor_heart;
      case 'obstetric_exam':
        return Icons.pregnant_woman;
      case 'supporting':
        return Icons.science;
      case 'usg_obstetri':
        return Icons.wifi_tethering;
      case 'usg_gynecology':
        return Icons.wifi_tethering;
      case 'diagnosis':
        return Icons.assignment;
      case 'plan':
        return Icons.checklist;
      default:
        return Icons.article;
    }
  }

  String _getName() {
    switch (section) {
      case 'anamnesa':
        return 'Anamnesa';
      case 'physical_exam':
        return 'Pemeriksaan Fisik';
      case 'obstetric_exam':
        return 'Pemeriksaan Obstetri';
      case 'supporting':
        return 'Penunjang';
      case 'usg_obstetri':
        return 'USG Obstetri';
      case 'usg_gynecology':
        return 'USG Ginekologi';
      case 'diagnosis':
        return 'Diagnosis';
      case 'plan':
        return 'Planning';
      default:
        return section;
    }
  }
}
