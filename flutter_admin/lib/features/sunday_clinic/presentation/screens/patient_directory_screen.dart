import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/medical_record_model.dart';
import '../../data/repositories/sunday_clinic_repository.dart';
import '../widgets/billing_dialog.dart';
import '../widgets/send_to_patient_dialog.dart';

class PatientDirectoryScreen extends ConsumerStatefulWidget {
  const PatientDirectoryScreen({super.key});

  @override
  ConsumerState<PatientDirectoryScreen> createState() => _PatientDirectoryScreenState();
}

class _PatientDirectoryScreenState extends ConsumerState<PatientDirectoryScreen> {
  final _searchController = TextEditingController();
  String _selectedLocation = 'all';
  DateTime? _selectedDate;
  List<QueueItem> _directoryItems = [];
  bool _isLoading = false;
  String? _error;
  int _currentPage = 1;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _loadDirectory();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadDirectory({bool loadMore = false}) async {
    if (_isLoading) return;
    if (loadMore && !_hasMore) return;

    setState(() {
      _isLoading = true;
      _error = null;
      if (!loadMore) {
        _currentPage = 1;
        _directoryItems = [];
      }
    });

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final items = await repo.getDirectory(
        location: _selectedLocation == 'all' ? null : _selectedLocation,
        search: _searchController.text.isNotEmpty ? _searchController.text : null,
        date: _selectedDate != null
            ? DateFormat('yyyy-MM-dd').format(_selectedDate!)
            : null,
        page: _currentPage,
        limit: 20,
      );

      setState(() {
        if (loadMore) {
          _directoryItems.addAll(items);
        } else {
          _directoryItems = items;
        }
        _hasMore = items.length >= 20;
        _currentPage++;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  void _onSearch(String query) {
    _loadDirectory();
  }

  void _onLocationChanged(String? location) {
    if (location != null) {
      setState(() {
        _selectedLocation = location;
      });
      _loadDirectory();
    }
  }

  Future<void> _selectDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );

    if (date != null) {
      setState(() {
        _selectedDate = date;
      });
      _loadDirectory();
    }
  }

  void _clearDate() {
    setState(() {
      _selectedDate = null;
    });
    _loadDirectory();
  }

  void _openRecord(QueueItem item) {
    if (item.mrId != null && item.mrId!.isNotEmpty) {
      context.push(
        '/sunday-clinic/record',
        extra: {
          'patientId': item.patientId,
          'patientName': item.patientName,
          'category': item.category ?? 'Obstetri',
          'location': 'klinik_private',
          'mrId': item.mrId,
        },
      );
    }
  }

  void _showBilling(QueueItem item) {
    if (item.mrId != null) {
      showDialog(
        context: context,
        builder: (context) => BillingDialog(
          mrId: item.mrId!,
          patientName: item.patientName,
          visitLocation: 'klinik_private',
        ),
      );
    }
  }

  void _sendToPatient(QueueItem item) {
    if (item.mrId != null) {
      showDialog(
        context: context,
        builder: (context) => SendToPatientDialog(
          mrId: item.mrId!,
          patientName: item.patientName,
          patientPhone: item.patientPhone,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Direktori Pasien'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _loadDirectory(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search and filter section
          Container(
            padding: const EdgeInsets.all(16),
            color: theme.colorScheme.surfaceContainerHighest,
            child: Column(
              children: [
                // Search field
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Cari nama pasien, ID, atau MR ID...',
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                    isDense: true,
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              _loadDirectory();
                            },
                          )
                        : null,
                  ),
                  onSubmitted: _onSearch,
                ),
                const SizedBox(height: 12),

                // Filters row
                Row(
                  children: [
                    // Location filter
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _selectedLocation,
                        decoration: const InputDecoration(
                          labelText: 'Lokasi',
                          border: OutlineInputBorder(),
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'all', child: Text('Semua Lokasi')),
                          DropdownMenuItem(value: 'klinik_private', child: Text('Klinik Privat')),
                          DropdownMenuItem(value: 'rsia_melinda', child: Text('RSIA Melinda')),
                          DropdownMenuItem(value: 'rsud_gambiran', child: Text('RSUD Gambiran')),
                          DropdownMenuItem(value: 'rs_bhayangkara', child: Text('RS Bhayangkara')),
                        ],
                        onChanged: _onLocationChanged,
                      ),
                    ),
                    const SizedBox(width: 12),

                    // Date filter
                    Expanded(
                      child: InkWell(
                        onTap: _selectDate,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Tanggal',
                            border: const OutlineInputBorder(),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            suffixIcon: _selectedDate != null
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 18),
                                    onPressed: _clearDate,
                                  )
                                : const Icon(Icons.calendar_today, size: 18),
                          ),
                          child: Text(
                            _selectedDate != null
                                ? DateFormat('d MMM yyyy').format(_selectedDate!)
                                : 'Semua Tanggal',
                            style: TextStyle(
                              color: _selectedDate != null ? null : theme.hintColor,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Directory list
          Expanded(
            child: _error != null
                ? _buildError()
                : _directoryItems.isEmpty && !_isLoading
                    ? _buildEmpty()
                    : _buildList(),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => _loadDirectory(),
            child: const Text('Coba Lagi'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.folder_open, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Tidak ada data ditemukan',
            style: TextStyle(color: Colors.grey[600], fontSize: 16),
          ),
          const SizedBox(height: 8),
          Text(
            'Coba ubah filter atau kata pencarian',
            style: TextStyle(color: Colors.grey[500], fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification) {
          final metrics = notification.metrics;
          if (metrics.pixels >= metrics.maxScrollExtent - 200) {
            _loadDirectory(loadMore: true);
          }
        }
        return false;
      },
      child: RefreshIndicator(
        onRefresh: () => _loadDirectory(),
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _directoryItems.length + (_isLoading ? 1 : 0),
          itemBuilder: (context, index) {
            if (index >= _directoryItems.length) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              );
            }
            return _buildDirectoryItem(_directoryItems[index]);
          },
        ),
      ),
    );
  }

  Widget _buildDirectoryItem(QueueItem item) {
    final theme = Theme.of(context);
    final hasRecord = item.hasRecord && item.mrId != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: hasRecord ? () => _openRecord(item) : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                children: [
                  // Avatar
                  CircleAvatar(
                    backgroundColor: AppColors.primary.withOpacity(0.1),
                    child: Text(
                      item.initials,
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Patient info
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.patientName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Row(
                          children: [
                            if (item.mrId != null) ...[
                              Text(
                                item.mrId!,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(width: 8),
                            ],
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getCategoryColor(item.category).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                item.category ?? 'Obstetri',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: _getCategoryColor(item.category),
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Status badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: item.isCompleted
                          ? Colors.green.withOpacity(0.1)
                          : item.isInProgress
                              ? Colors.orange.withOpacity(0.1)
                              : Colors.grey.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      item.statusText,
                      style: TextStyle(
                        fontSize: 11,
                        color: item.isCompleted
                            ? Colors.green
                            : item.isInProgress
                                ? Colors.orange
                                : Colors.grey,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),

              // Details row
              Row(
                children: [
                  if (item.patientAge != null) ...[
                    Icon(Icons.cake, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(
                      '${item.patientAge} tahun',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                    const SizedBox(width: 16),
                  ],
                  if (item.appointmentDate != null) ...[
                    Icon(Icons.calendar_today, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(
                      _formatDate(item.appointmentDate!),
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ],
              ),

              // Complaint
              if (item.chiefComplaint != null && item.chiefComplaint!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Keluhan: ${item.chiefComplaint}',
                  style: TextStyle(fontSize: 13, color: Colors.grey[700]),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              // Action buttons
              if (hasRecord) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    // View record
                    OutlinedButton.icon(
                      onPressed: () => _openRecord(item),
                      icon: const Icon(Icons.description, size: 16),
                      label: const Text('Lihat'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Billing (only klinik_private)
                    OutlinedButton.icon(
                      onPressed: () => _showBilling(item),
                      icon: const Icon(Icons.receipt, size: 16),
                      label: const Text('Billing'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Send to patient
                    OutlinedButton.icon(
                      onPressed: () => _sendToPatient(item),
                      icon: const Icon(Icons.send, size: 16),
                      label: const Text('Kirim'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
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

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('d MMM yyyy').format(date);
    } catch (_) {
      return dateStr;
    }
  }
}
