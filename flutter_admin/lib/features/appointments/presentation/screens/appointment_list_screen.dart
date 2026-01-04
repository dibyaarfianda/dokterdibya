import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/appointment_model.dart';
import '../providers/appointment_provider.dart';

class AppointmentListScreen extends ConsumerStatefulWidget {
  const AppointmentListScreen({super.key});

  @override
  ConsumerState<AppointmentListScreen> createState() => _AppointmentListScreenState();
}

class _AppointmentListScreenState extends ConsumerState<AppointmentListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _dateFormat = DateFormat('d MMM yyyy');

  final List<Map<String, String>> _locations = [
    {'id': '', 'name': 'Semua Lokasi'},
    {'id': 'klinik_private', 'name': 'Klinik Privat'},
    {'id': 'rsia_melinda', 'name': 'RSIA Melinda'},
    {'id': 'rsud_gambiran', 'name': 'RSUD Gambiran'},
    {'id': 'rs_bhayangkara', 'name': 'RS Bhayangkara'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    Future.microtask(() {
      ref.read(appointmentListProvider.notifier).loadUpcoming();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final aptState = ref.watch(appointmentListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Jadwal Janji'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(text: 'Hari Ini'),
            Tab(text: 'Mendatang'),
            Tab(text: 'Kalender'),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (location) {
              ref.read(appointmentListProvider.notifier).setLocation(
                location.isEmpty ? null : location,
              );
            },
            itemBuilder: (context) => _locations.map((loc) {
              return PopupMenuItem(
                value: loc['id'],
                child: Text(loc['name']!),
              );
            }).toList(),
          ),
        ],
      ),
      body: aptState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildTodayList(aptState.todayAppointments),
                _buildUpcomingList(aptState.upcomingAppointments),
                _buildCalendarView(aptState),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateAppointmentDialog(),
        icon: const Icon(Icons.add),
        label: const Text('Buat Janji'),
      ),
    );
  }

  Widget _buildTodayList(List<Appointment> appointments) {
    if (appointments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_available, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada janji hari ini',
              style: TextStyle(color: Colors.grey[600], fontSize: 16),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: appointments.length,
      itemBuilder: (context, index) => _buildAppointmentCard(appointments[index]),
    );
  }

  Widget _buildUpcomingList(List<Appointment> appointments) {
    if (appointments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.calendar_today, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada janji mendatang',
              style: TextStyle(color: Colors.grey[600], fontSize: 16),
            ),
          ],
        ),
      );
    }

    // Group by date
    final grouped = <String, List<Appointment>>{};
    for (final apt in appointments) {
      final dateKey = _dateFormat.format(apt.appointmentDate);
      grouped.putIfAbsent(dateKey, () => []).add(apt);
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: grouped.length,
      itemBuilder: (context, index) {
        final dateKey = grouped.keys.elementAt(index);
        final dayAppointments = grouped[dateKey]!;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                dateKey,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ),
            ...dayAppointments.map((apt) => _buildAppointmentCard(apt)),
          ],
        );
      },
    );
  }

  Widget _buildCalendarView(AppointmentListState state) {
    return Column(
      children: [
        // Simple date picker
        CalendarDatePicker(
          initialDate: state.selectedDate ?? DateTime.now(),
          firstDate: DateTime.now().subtract(const Duration(days: 365)),
          lastDate: DateTime.now().add(const Duration(days: 365)),
          onDateChanged: (date) {
            ref.read(appointmentListProvider.notifier).setDate(date);
          },
        ),
        const Divider(),
        // Appointments for selected date
        Expanded(
          child: state.selectedDate != null
              ? _buildDateAppointments(state)
              : const Center(child: Text('Pilih tanggal')),
        ),
      ],
    );
  }

  Widget _buildDateAppointments(AppointmentListState state) {
    final dateAppointments = state.appointments.where((a) {
      return a.appointmentDate.year == state.selectedDate!.year &&
             a.appointmentDate.month == state.selectedDate!.month &&
             a.appointmentDate.day == state.selectedDate!.day;
    }).toList();

    if (dateAppointments.isEmpty) {
      return Center(
        child: Text(
          'Tidak ada janji pada ${_dateFormat.format(state.selectedDate!)}',
          style: TextStyle(color: Colors.grey[600]),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: dateAppointments.length,
      itemBuilder: (context, index) => _buildAppointmentCard(dateAppointments[index]),
    );
  }

  Widget _buildAppointmentCard(Appointment apt) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => _showAppointmentDetails(apt),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Time
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withAlpha(25),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  children: [
                    Text(
                      apt.appointmentTime ?? '--:--',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                    if (!apt.isToday)
                      Text(
                        DateFormat('d/M').format(apt.appointmentDate),
                        style: TextStyle(fontSize: 10, color: Colors.grey[600]),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 16),

              // Patient info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      apt.patientName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.location_on, size: 14, color: Colors.grey[600]),
                        const SizedBox(width: 4),
                        Text(
                          apt.locationDisplayName,
                          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        ),
                        if (apt.category != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: _getCategoryColor(apt.category!).withAlpha(25),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              apt.category!,
                              style: TextStyle(
                                fontSize: 10,
                                color: _getCategoryColor(apt.category!),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              // Status
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getStatusColor(apt.status).withAlpha(25),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  apt.statusDisplayName,
                  style: TextStyle(
                    fontSize: 11,
                    color: _getStatusColor(apt.status),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue;
      case 'confirmed':
        return Colors.green;
      case 'completed':
        return Colors.grey;
      case 'cancelled':
        return Colors.red;
      case 'no_show':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'Obstetri':
        return AppColors.obstetri;
      case 'Gyn/Repro':
        return AppColors.gynRepro;
      case 'Ginekologi':
        return AppColors.gynSpecial;
      default:
        return Colors.grey;
    }
  }

  void _showAppointmentDetails(Appointment apt) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  apt.patientName,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildDetailRow(Icons.calendar_today, _dateFormat.format(apt.appointmentDate)),
            _buildDetailRow(Icons.access_time, apt.appointmentTime ?? '-'),
            _buildDetailRow(Icons.location_on, apt.locationDisplayName),
            if (apt.category != null)
              _buildDetailRow(Icons.category, apt.category!),
            if (apt.notes != null && apt.notes!.isNotEmpty)
              _buildDetailRow(Icons.note, apt.notes!),
            const SizedBox(height: 24),

            // Action buttons
            if (apt.status == 'scheduled') ...[
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        _cancelAppointment(apt);
                      },
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                      child: const Text('Batalkan'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        ref.read(appointmentListProvider.notifier).confirmAppointment(apt.id);
                      },
                      child: const Text('Konfirmasi'),
                    ),
                  ),
                ],
              ),
            ] else if (apt.status == 'confirmed') ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    ref.read(appointmentListProvider.notifier).markAsCompleted(apt.id);
                  },
                  child: const Text('Tandai Selesai'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 12),
          Text(text),
        ],
      ),
    );
  }

  void _cancelAppointment(Appointment apt) {
    showDialog(
      context: context,
      builder: (context) {
        final controller = TextEditingController();
        return AlertDialog(
          title: const Text('Batalkan Janji'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(
              labelText: 'Alasan pembatalan',
              hintText: 'Opsional',
            ),
            maxLines: 2,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Kembali'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ref.read(appointmentListProvider.notifier).cancelAppointment(
                  apt.id,
                  reason: controller.text.isNotEmpty ? controller.text : null,
                );
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Batalkan'),
            ),
          ],
        );
      },
    );
  }

  void _showCreateAppointmentDialog() {
    // TODO: Implement create appointment dialog with patient search
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Fitur buat janji akan diimplementasikan')),
    );
  }
}
