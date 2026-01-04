import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/schedule_model.dart';
import '../providers/schedule_provider.dart';

class ScheduleScreen extends ConsumerStatefulWidget {
  const ScheduleScreen({super.key});

  @override
  ConsumerState<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends ConsumerState<ScheduleScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(scheduleProvider.notifier).loadSchedules();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(scheduleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Jadwal Praktek'),
      ),
      body: state.isLoading && state.schedules.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : state.schedules.isEmpty
              ? _buildEmptyState()
              : _buildScheduleList(state),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.calendar_today_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Belum ada jadwal praktek',
            style: TextStyle(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleList(ScheduleState state) {
    final days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    return RefreshIndicator(
      onRefresh: () => ref.read(scheduleProvider.notifier).loadSchedules(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: days.length,
        itemBuilder: (context, index) {
          final day = days[index];
          final daySchedules = state.schedules
              .where((s) => s.dayName == day)
              .toList();

          return _DayScheduleCard(
            day: day,
            schedules: daySchedules,
            onEdit: (schedule) => _showEditDialog(schedule),
            onDelete: (id) => _confirmDelete(id),
          );
        },
      ),
    );
  }

  void _showCreateDialog() {
    String selectedDay = 'monday';
    String selectedLocation = 'klinik_private';
    final startTimeController = TextEditingController(text: '08:00');
    final endTimeController = TextEditingController(text: '12:00');

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Tambah Jadwal'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: selectedDay,
                  decoration: const InputDecoration(
                    labelText: 'Hari',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'monday', child: Text('Senin')),
                    DropdownMenuItem(value: 'tuesday', child: Text('Selasa')),
                    DropdownMenuItem(value: 'wednesday', child: Text('Rabu')),
                    DropdownMenuItem(value: 'thursday', child: Text('Kamis')),
                    DropdownMenuItem(value: 'friday', child: Text('Jumat')),
                    DropdownMenuItem(value: 'saturday', child: Text('Sabtu')),
                    DropdownMenuItem(value: 'sunday', child: Text('Minggu')),
                  ],
                  onChanged: (v) => setDialogState(() => selectedDay = v!),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedLocation,
                  decoration: const InputDecoration(
                    labelText: 'Lokasi',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'klinik_private', child: Text('Klinik Privat')),
                    DropdownMenuItem(value: 'rsia_melinda', child: Text('RSIA Melinda')),
                    DropdownMenuItem(value: 'rsud_gambiran', child: Text('RSUD Gambiran')),
                    DropdownMenuItem(value: 'rs_bhayangkara', child: Text('RS Bhayangkara')),
                  ],
                  onChanged: (v) => setDialogState(() => selectedLocation = v!),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: startTimeController,
                  decoration: const InputDecoration(
                    labelText: 'Jam Mulai',
                    border: OutlineInputBorder(),
                    hintText: 'HH:mm',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: endTimeController,
                  decoration: const InputDecoration(
                    labelText: 'Jam Selesai',
                    border: OutlineInputBorder(),
                    hintText: 'HH:mm',
                  ),
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
                  'day_of_week': selectedDay,
                  'location': selectedLocation,
                  'start_time': startTimeController.text,
                  'end_time': endTimeController.text,
                };

                final success = await ref
                    .read(scheduleProvider.notifier)
                    .createSchedule(data);

                if (success && mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Jadwal berhasil ditambahkan')),
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

  void _showEditDialog(PracticeSchedule schedule) {
    final startTimeController = TextEditingController(text: schedule.startTime);
    final endTimeController = TextEditingController(text: schedule.endTime);
    bool isActive = schedule.isActive;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Edit Jadwal'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${schedule.dayName} - ${schedule.locationName}'),
                const SizedBox(height: 16),
                TextField(
                  controller: startTimeController,
                  decoration: const InputDecoration(
                    labelText: 'Jam Mulai',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: endTimeController,
                  decoration: const InputDecoration(
                    labelText: 'Jam Selesai',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  title: const Text('Aktif'),
                  value: isActive,
                  onChanged: (v) => setDialogState(() => isActive = v),
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
                  'start_time': startTimeController.text,
                  'end_time': endTimeController.text,
                  'is_active': isActive ? 1 : 0,
                };

                final success = await ref
                    .read(scheduleProvider.notifier)
                    .updateSchedule(schedule.id, data);

                if (success && mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Jadwal berhasil diperbarui')),
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

  void _confirmDelete(int id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Jadwal'),
        content: const Text('Apakah Anda yakin ingin menghapus jadwal ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () async {
              final success = await ref
                  .read(scheduleProvider.notifier)
                  .deleteSchedule(id);

              if (mounted) {
                Navigator.pop(context);
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Jadwal berhasil dihapus')),
                  );
                }
              }
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }
}

class _DayScheduleCard extends StatelessWidget {
  final String day;
  final List<PracticeSchedule> schedules;
  final Function(PracticeSchedule) onEdit;
  final Function(int) onDelete;

  const _DayScheduleCard({
    required this.day,
    required this.schedules,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        title: Row(
          children: [
            Text(
              day,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(width: 8),
            if (schedules.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${schedules.length}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.primary,
                  ),
                ),
              ),
          ],
        ),
        children: schedules.isEmpty
            ? [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Tidak ada jadwal',
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              ]
            : schedules.map((schedule) {
                return ListTile(
                  leading: Container(
                    width: 8,
                    height: 48,
                    decoration: BoxDecoration(
                      color: schedule.isActive ? AppColors.primary : Colors.grey,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  title: Text(schedule.locationName),
                  subtitle: Text('${schedule.startTime} - ${schedule.endTime}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!schedule.isActive)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.grey.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'Nonaktif',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                        ),
                      IconButton(
                        icon: const Icon(Icons.edit, size: 20),
                        onPressed: () => onEdit(schedule),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete, size: 20, color: Colors.red),
                        onPressed: () => onDelete(schedule.id),
                      ),
                    ],
                  ),
                );
              }).toList(),
      ),
    );
  }
}
