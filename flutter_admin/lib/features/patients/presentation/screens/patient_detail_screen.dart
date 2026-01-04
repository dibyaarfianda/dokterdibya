import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/patient_model.dart';
import '../providers/patient_provider.dart';

class PatientDetailScreen extends ConsumerStatefulWidget {
  final String patientId;

  const PatientDetailScreen({
    super.key,
    required this.patientId,
  });

  @override
  ConsumerState<PatientDetailScreen> createState() => _PatientDetailScreenState();
}

class _PatientDetailScreenState extends ConsumerState<PatientDetailScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(patientDetailProvider.notifier).loadPatient(widget.patientId);
      ref.read(patientDetailProvider.notifier).loadHistory(widget.patientId);
    });
  }

  @override
  void dispose() {
    ref.read(patientDetailProvider.notifier).clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(patientDetailProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Pasien'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () {
              context.push('/patients/${widget.patientId}/edit');
            },
            tooltip: 'Edit Pasien',
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'delete') {
                _showDeleteDialog();
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'delete',
                child: Row(
                  children: [
                    Icon(Icons.delete, color: Colors.red, size: 20),
                    SizedBox(width: 8),
                    Text('Hapus Pasien', style: TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
              ? _buildError(state.error!)
              : state.patient == null
                  ? const Center(child: Text('Pasien tidak ditemukan'))
                  : _buildContent(state),
    );
  }

  Widget _buildError(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            'Gagal memuat data',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(error, style: TextStyle(color: Colors.grey[600])),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              ref.read(patientDetailProvider.notifier).loadPatient(widget.patientId);
            },
            child: const Text('Coba Lagi'),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(PatientDetailState state) {
    final patient = state.patient!;
    final isTablet = MediaQuery.of(context).size.width > 600;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: isTablet
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 2,
                  child: _buildPatientInfo(patient),
                ),
                const SizedBox(width: 16),
                Expanded(
                  flex: 3,
                  child: _buildVisitHistory(state.history),
                ),
              ],
            )
          : Column(
              children: [
                _buildPatientInfo(patient),
                const SizedBox(height: 16),
                _buildVisitHistory(state.history),
              ],
            ),
    );
  }

  Widget _buildPatientInfo(Patient patient) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with avatar
            Row(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: _getCategoryColor(patient.category).withValues(alpha: 0.1),
                  child: Text(
                    patient.initials,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: _getCategoryColor(patient.category),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        patient.name,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                      if (patient.mrId != null) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            patient.mrId!,
                            style: const TextStyle(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 16),

            // Patient details
            _InfoRow(
              icon: Icons.cake,
              label: 'Umur',
              value: patient.displayAge,
            ),
            if (patient.birthDate != null)
              _InfoRow(
                icon: Icons.calendar_today,
                label: 'Tanggal Lahir',
                value: DateFormat('d MMMM yyyy', 'id_ID').format(patient.birthDate!),
              ),
            if (patient.category != null)
              _InfoRow(
                icon: Icons.category,
                label: 'Kategori',
                value: patient.category!,
                valueColor: _getCategoryColor(patient.category),
              ),
            if (patient.phone != null)
              _InfoRow(
                icon: Icons.phone,
                label: 'Telepon',
                value: patient.phone!,
                onTap: () => _makeCall(patient.phone!),
              ),
            if (patient.whatsapp != null)
              _InfoRow(
                icon: Icons.chat,
                label: 'WhatsApp',
                value: patient.whatsapp!,
                onTap: () => _openWhatsApp(patient.whatsapp!),
                valueColor: Colors.green,
              ),
            if (patient.email != null)
              _InfoRow(
                icon: Icons.email,
                label: 'Email',
                value: patient.email!,
                onTap: () => _sendEmail(patient.email!),
              ),
            if (patient.husbandName != null && patient.husbandName!.isNotEmpty)
              _InfoRow(
                icon: Icons.person,
                label: 'Nama Suami',
                value: patient.husbandName!,
              ),
            if (patient.address != null && patient.address!.isNotEmpty)
              _InfoRow(
                icon: Icons.location_on,
                label: 'Alamat',
                value: patient.address!,
              ),
            const SizedBox(height: 16),

            // Quick actions
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (patient.phone != null)
                  _ActionChip(
                    icon: Icons.phone,
                    label: 'Telepon',
                    onTap: () => _makeCall(patient.phone!),
                  ),
                if (patient.whatsapp != null)
                  _ActionChip(
                    icon: Icons.chat,
                    label: 'WhatsApp',
                    color: Colors.green,
                    onTap: () => _openWhatsApp(patient.whatsapp!),
                  ),
                _ActionChip(
                  icon: Icons.medical_services,
                  label: 'Buat Rekam Medis',
                  color: AppColors.primary,
                  onTap: () {
                    // Navigate to create medical record
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVisitHistory(Map<String, dynamic>? history) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Riwayat Kunjungan',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                if (history != null && (history['visits'] as List?)?.isNotEmpty == true)
                  TextButton(
                    onPressed: () {
                      // Navigate to full history
                    },
                    child: const Text('Lihat Semua'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (history == null || (history['visits'] as List?)?.isEmpty == true)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.history, size: 48, color: Colors.grey),
                      SizedBox(height: 8),
                      Text('Belum ada riwayat kunjungan'),
                    ],
                  ),
                ),
              )
            else
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: (history['visits'] as List).length > 5
                    ? 5
                    : (history['visits'] as List).length,
                separatorBuilder: (context, index) => const Divider(),
                itemBuilder: (context, index) {
                  final visit = (history['visits'] as List)[index];
                  return _VisitCard(visit: visit);
                },
              ),
          ],
        ),
      ),
    );
  }

  Color _getCategoryColor(String? category) {
    switch (category) {
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

  void _showDeleteDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Pasien'),
        content: const Text(
          'Apakah Anda yakin ingin menghapus pasien ini? Tindakan ini tidak dapat dibatalkan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () async {
              final navigator = Navigator.of(context);
              final scaffoldMessenger = ScaffoldMessenger.of(context);
              navigator.pop();
              final success = await ref
                  .read(patientFormProvider.notifier)
                  .deletePatient(widget.patientId);
              if (success && mounted) {
                ref.read(patientListProvider.notifier).refresh();
                navigator.pop();
                scaffoldMessenger.showSnackBar(
                  const SnackBar(content: Text('Pasien berhasil dihapus')),
                );
              }
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }

  Future<void> _makeCall(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openWhatsApp(String number) async {
    String formattedNumber = number.replaceAll(RegExp(r'[^0-9]'), '');
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '62${formattedNumber.substring(1)}';
    }
    final uri = Uri.parse('https://wa.me/$formattedNumber');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _sendEmail(String email) async {
    final uri = Uri(scheme: 'mailto', path: email);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;
  final VoidCallback? onTap;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Row(
          children: [
            Icon(icon, size: 20, color: Colors.grey[600]),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: valueColor ?? AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right, size: 20, color: Colors.grey[400]),
          ],
        ),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  final VoidCallback onTap;

  const _ActionChip({
    required this.icon,
    required this.label,
    this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? AppColors.secondary;
    return ActionChip(
      avatar: Icon(icon, size: 18, color: chipColor),
      label: Text(label),
      labelStyle: TextStyle(color: chipColor),
      backgroundColor: chipColor.withValues(alpha: 0.1),
      side: BorderSide.none,
      onPressed: onTap,
    );
  }
}

class _VisitCard extends StatelessWidget {
  final Map<String, dynamic> visit;

  const _VisitCard({required this.visit});

  @override
  Widget build(BuildContext context) {
    final createdAt = DateTime.tryParse(visit['created_at'] ?? '');
    final location = visit['visit_location'] ?? 'klinik_private';
    final status = visit['record_status'] ?? 'draft';

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: _getLocationColor(location).withValues(alpha: 0.1),
        child: Icon(
          Icons.medical_services,
          color: _getLocationColor(location),
          size: 20,
        ),
      ),
      title: Text(
        visit['mr_id'] ?? 'DRD-',
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_getLocationName(location)),
          if (createdAt != null)
            Text(
              DateFormat('d MMM yyyy HH:mm', 'id_ID').format(createdAt),
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
        ],
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: status == 'finalized' ? Colors.green.withValues(alpha: 0.1) : Colors.orange.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          status == 'finalized' ? 'Selesai' : 'Draft',
          style: TextStyle(
            fontSize: 11,
            color: status == 'finalized' ? Colors.green : Colors.orange,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Color _getLocationColor(String location) {
    switch (location) {
      case 'klinik_private':
        return AppColors.primary;
      case 'rsia_melinda':
        return Colors.pink;
      case 'rsud_gambiran':
        return Colors.blue;
      case 'rs_bhayangkara':
        return Colors.teal;
      default:
        return AppColors.secondary;
    }
  }

  String _getLocationName(String location) {
    switch (location) {
      case 'klinik_private':
        return 'Klinik Privat';
      case 'rsia_melinda':
        return 'RSIA Melinda';
      case 'rsud_gambiran':
        return 'RSUD Gambiran';
      case 'rs_bhayangkara':
        return 'RS Bhayangkara';
      default:
        return location;
    }
  }
}
