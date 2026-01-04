import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/booking_settings_model.dart';
import '../providers/booking_settings_provider.dart';

class BookingSettingsScreen extends ConsumerStatefulWidget {
  const BookingSettingsScreen({super.key});

  @override
  ConsumerState<BookingSettingsScreen> createState() => _BookingSettingsScreenState();
}

class _BookingSettingsScreenState extends ConsumerState<BookingSettingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _dateFormat = DateFormat('dd/MM/yyyy');

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    Future.microtask(() {
      ref.read(bookingSettingsProvider.notifier).loadAll();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(bookingSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengaturan Booking'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(bookingSettingsProvider.notifier).loadAll(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.schedule), text: 'Sesi'),
            Tab(icon: Icon(Icons.calendar_today), text: 'Booking'),
          ],
        ),
      ),
      body: state.isLoading && state.sessions.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildSessionsTab(state),
                _buildBookingsTab(state),
              ],
            ),
      floatingActionButton: _tabController.index == 0
          ? FloatingActionButton(
              onPressed: () => _showSessionDialog(null),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  Widget _buildSessionsTab(BookingSettingsState state) {
    if (state.sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.schedule, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Belum ada sesi booking',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => _showSessionDialog(null),
              icon: const Icon(Icons.add),
              label: const Text('Tambah Sesi'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(bookingSettingsProvider.notifier).loadSessions(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.sessions.length,
        itemBuilder: (context, index) {
          final session = state.sessions[index];
          return _SessionCard(
            session: session,
            onEdit: () => _showSessionDialog(session),
            onDelete: () => _confirmDeleteSession(session),
          );
        },
      ),
    );
  }

  Widget _buildBookingsTab(BookingSettingsState state) {
    if (state.bookings.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.calendar_today, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada booking mendatang',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(bookingSettingsProvider.notifier).loadBookings(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.bookings.length,
        itemBuilder: (context, index) {
          final booking = state.bookings[index];
          return _BookingCard(
            booking: booking,
            dateFormat: _dateFormat,
            onCancel: () => _showCancelDialog(booking),
          );
        },
      ),
    );
  }

  void _showSessionDialog(BookingSession? session) {
    final isEdit = session != null;
    final sessionNumberController =
        TextEditingController(text: session?.sessionNumber.toString() ?? '');
    final sessionNameController =
        TextEditingController(text: session?.sessionName ?? '');
    final startTimeController =
        TextEditingController(text: session?.startTime ?? '09:00');
    final endTimeController =
        TextEditingController(text: session?.endTime ?? '12:00');
    final slotDurationController =
        TextEditingController(text: session?.slotDuration.toString() ?? '15');
    final maxSlotsController =
        TextEditingController(text: session?.maxSlots.toString() ?? '10');
    bool isActive = session?.isActive ?? true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(isEdit ? 'Edit Sesi' : 'Tambah Sesi'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: sessionNumberController,
                  decoration: const InputDecoration(
                    labelText: 'Nomor Sesi',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                  enabled: !isEdit,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: sessionNameController,
                  decoration: const InputDecoration(
                    labelText: 'Nama Sesi',
                    border: OutlineInputBorder(),
                    hintText: 'Pagi / Siang / Sore',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: startTimeController,
                        decoration: const InputDecoration(
                          labelText: 'Mulai',
                          border: OutlineInputBorder(),
                          hintText: 'HH:MM',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: endTimeController,
                        decoration: const InputDecoration(
                          labelText: 'Selesai',
                          border: OutlineInputBorder(),
                          hintText: 'HH:MM',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: slotDurationController,
                        decoration: const InputDecoration(
                          labelText: 'Durasi (menit)',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: maxSlotsController,
                        decoration: const InputDecoration(
                          labelText: 'Maks Slot',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  title: const Text('Aktif'),
                  value: isActive,
                  onChanged: (value) => setState(() => isActive = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              onPressed: () async {
                final data = {
                  'session_number': int.tryParse(sessionNumberController.text) ?? 0,
                  'session_name': sessionNameController.text,
                  'start_time': startTimeController.text,
                  'end_time': endTimeController.text,
                  'slot_duration': int.tryParse(slotDurationController.text) ?? 15,
                  'max_slots': int.tryParse(maxSlotsController.text) ?? 10,
                  'is_active': isActive,
                };

                bool success;
                if (isEdit) {
                  success = await ref
                      .read(bookingSettingsProvider.notifier)
                      .updateSession(session.id, data);
                } else {
                  success = await ref
                      .read(bookingSettingsProvider.notifier)
                      .createSession(data);
                }

                if (success && mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(isEdit
                          ? 'Sesi berhasil diupdate'
                          : 'Sesi berhasil ditambahkan'),
                    ),
                  );
                }
              },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDeleteSession(BookingSession session) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Sesi'),
        content: Text('Yakin ingin menghapus sesi "${session.sessionName}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              final success = await ref
                  .read(bookingSettingsProvider.notifier)
                  .deleteSession(session.id);

              if (mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(success
                        ? 'Sesi berhasil dihapus'
                        : 'Gagal menghapus sesi'),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }

  void _showCancelDialog(Booking booking) {
    final reasonController = TextEditingController();
    bool notifyPatient = true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Batalkan Booking'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Pasien: ${booking.patientName}'),
              Text('Tanggal: ${_dateFormat.format(booking.appointmentDate)}'),
              Text('Waktu: ${booking.slotTime ?? '-'}'),
              const SizedBox(height: 16),
              TextField(
                controller: reasonController,
                decoration: const InputDecoration(
                  labelText: 'Alasan Pembatalan',
                  border: OutlineInputBorder(),
                ),
                maxLines: 3,
              ),
              const SizedBox(height: 8),
              CheckboxListTile(
                title: const Text('Kirim notifikasi ke pasien'),
                value: notifyPatient,
                onChanged: (value) => setState(() => notifyPatient = value!),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (reasonController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alasan harus diisi')),
                  );
                  return;
                }

                final success = await ref
                    .read(bookingSettingsProvider.notifier)
                    .cancelBooking(booking.id, reasonController.text, notifyPatient);

                if (mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(success
                          ? 'Booking berhasil dibatalkan'
                          : 'Gagal membatalkan booking'),
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
              child: const Text('Batalkan'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final BookingSession session;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _SessionCard({
    required this.session,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      '${session.sessionNumber}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                        fontSize: 18,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            session.sessionName,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: session.isActive
                                  ? Colors.green.withValues(alpha: 0.1)
                                  : Colors.grey.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              session.isActive ? 'Aktif' : 'Nonaktif',
                              style: TextStyle(
                                fontSize: 11,
                                color: session.isActive ? Colors.green : Colors.grey,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '${session.startTime} - ${session.endTime}',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') onEdit();
                    if (value == 'delete') onDelete();
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Text('Hapus', style: TextStyle(color: AppColors.danger)),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _DetailChip(
                  icon: Icons.timer_outlined,
                  label: '${session.slotDuration} menit/slot',
                ),
                const SizedBox(width: 8),
                _DetailChip(
                  icon: Icons.people_outlined,
                  label: 'Maks ${session.maxSlots} slot',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _DetailChip({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.grey[600]),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: Colors.grey[700]),
          ),
        ],
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  final Booking booking;
  final DateFormat dateFormat;
  final VoidCallback onCancel;

  const _BookingCard({
    required this.booking,
    required this.dateFormat,
    required this.onCancel,
  });

  Color _getStatusColor() {
    switch (booking.status) {
      case 'pending':
        return Colors.orange;
      case 'confirmed':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking.patientName,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      if (booking.patientPhone != null)
                        Text(
                          booking.patientPhone!,
                          style: TextStyle(color: Colors.grey[600], fontSize: 13),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor().withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    booking.statusDisplay,
                    style: TextStyle(
                      fontSize: 12,
                      color: _getStatusColor(),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 16, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  dateFormat.format(booking.appointmentDate),
                  style: TextStyle(color: Colors.grey[700]),
                ),
                const SizedBox(width: 16),
                Icon(Icons.schedule, size: 16, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  booking.slotTime ?? '-',
                  style: TextStyle(color: Colors.grey[700]),
                ),
              ],
            ),
            if (booking.chiefComplaint != null &&
                booking.chiefComplaint!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Keluhan: ${booking.chiefComplaint}',
                style: TextStyle(color: Colors.grey[600], fontSize: 13),
              ),
            ],
            if (booking.status == 'pending' || booking.status == 'confirmed') ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton.icon(
                  onPressed: onCancel,
                  icon: const Icon(Icons.cancel, size: 18),
                  label: const Text('Batalkan'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.danger,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
