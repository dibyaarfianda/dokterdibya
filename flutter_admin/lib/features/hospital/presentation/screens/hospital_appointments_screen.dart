import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../appointments/data/repositories/appointment_repository.dart';
import '../../../appointments/data/models/appointment_model.dart';

class HospitalAppointmentsScreen extends ConsumerStatefulWidget {
  final String location;
  final String title;
  final Color color;

  const HospitalAppointmentsScreen({
    super.key,
    required this.location,
    required this.title,
    required this.color,
  });

  @override
  ConsumerState<HospitalAppointmentsScreen> createState() =>
      _HospitalAppointmentsScreenState();
}

class _HospitalAppointmentsScreenState
    extends ConsumerState<HospitalAppointmentsScreen> {
  DateTime _selectedDate = DateTime.now();
  List<Appointment> _appointments = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadAppointments();
  }

  Future<void> _loadAppointments() async {
    setState(() => _isLoading = true);

    try {
      final repository = ref.read(appointmentRepositoryProvider);
      final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);
      final appointments = await repository.getHospitalAppointments(
        widget.location,
        dateStr,
      );

      if (mounted) {
        setState(() {
          _appointments = appointments;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: widget.color,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // Date selector
          Container(
            color: widget.color.withValues(alpha: 0.1),
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () {
                    setState(() {
                      _selectedDate = _selectedDate.subtract(const Duration(days: 1));
                    });
                    _loadAppointments();
                  },
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => _selectDate(),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        DateFormat('EEEE, d MMMM yyyy', 'id_ID').format(_selectedDate),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () {
                    setState(() {
                      _selectedDate = _selectedDate.add(const Duration(days: 1));
                    });
                    _loadAppointments();
                  },
                ),
              ],
            ),
          ),

          // Appointments list
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _appointments.isEmpty
                    ? _buildEmptyState()
                    : _buildAppointmentsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.event_busy, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Tidak ada janji temu',
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          Text(
            DateFormat('d MMMM yyyy', 'id_ID').format(_selectedDate),
            style: TextStyle(color: Colors.grey[500], fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildAppointmentsList() {
    return RefreshIndicator(
      onRefresh: _loadAppointments,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _appointments.length,
        itemBuilder: (context, index) {
          final appointment = _appointments[index];
          return _AppointmentCard(
            appointment: appointment,
            color: widget.color,
          );
        },
      ),
    );
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );

    if (picked != null && picked != _selectedDate) {
      setState(() => _selectedDate = picked);
      _loadAppointments();
    }
  }
}

class _AppointmentCard extends StatelessWidget {
  final Appointment appointment;
  final Color color;

  const _AppointmentCard({
    required this.appointment,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 60,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    appointment.patientName ?? 'Pasien',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.access_time, size: 14, color: Colors.grey[600]),
                      const SizedBox(width: 4),
                      Text(
                        appointment.appointmentTime ?? '-',
                        style: TextStyle(color: Colors.grey[600], fontSize: 13),
                      ),
                    ],
                  ),
                  if (appointment.category != null) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        appointment.category!,
                        style: TextStyle(fontSize: 11, color: color),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _getStatusColor(appointment.status).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                _getStatusText(appointment.status),
                style: TextStyle(
                  fontSize: 12,
                  color: _getStatusColor(appointment.status),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String? status) {
    switch (status) {
      case 'confirmed':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  String _getStatusText(String? status) {
    switch (status) {
      case 'confirmed':
        return 'Dikonfirmasi';
      case 'completed':
        return 'Selesai';
      case 'cancelled':
        return 'Dibatalkan';
      default:
        return 'Pending';
    }
  }
}
