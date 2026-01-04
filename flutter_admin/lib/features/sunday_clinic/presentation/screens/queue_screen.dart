import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/medical_record_model.dart';
import '../providers/sunday_clinic_provider.dart';

class QueueScreen extends ConsumerStatefulWidget {
  const QueueScreen({super.key});

  @override
  ConsumerState<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends ConsumerState<QueueScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    Future.microtask(() {
      ref.read(queueProvider.notifier).loadQueue();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final queueState = ref.watch(queueProvider);

    return Column(
      children: [
        // Location selector and search
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: Column(
            children: [
              // Location dropdown
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: queueState.selectedLocation,
                      decoration: InputDecoration(
                        labelText: 'Lokasi',
                        prefixIcon: const Icon(Icons.location_on),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      items: VisitLocation.all.map((loc) {
                        return DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.name),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          ref.read(queueProvider.notifier).setLocation(value);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.person_add),
                    onPressed: _showAddToQueueDialog,
                    tooltip: 'Tambah ke Antrian',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Search
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Cari pasien...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            ref.read(queueProvider.notifier).setSearch(null);
                          },
                        )
                      : null,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                ),
                onChanged: (value) {
                  ref.read(queueProvider.notifier).setSearch(value);
                },
              ),
            ],
          ),
        ),
        // Tabs
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabController,
            labelColor: AppColors.primary,
            unselectedLabelColor: Colors.grey,
            indicatorColor: AppColors.primary,
            tabs: [
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Menunggu'),
                    const SizedBox(width: 4),
                    _buildBadge(queueState.pendingItems.length, Colors.orange),
                  ],
                ),
              ),
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Proses'),
                    const SizedBox(width: 4),
                    _buildBadge(queueState.inProgressItems.length, Colors.blue),
                  ],
                ),
              ),
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Selesai'),
                    const SizedBox(width: 4),
                    _buildBadge(queueState.completedItems.length, Colors.green),
                  ],
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        // Content
        Expanded(
          child: queueState.isLoading
              ? const Center(child: CircularProgressIndicator())
              : queueState.error != null
                  ? _buildError(queueState.error!)
                  : TabBarView(
                      controller: _tabController,
                      children: [
                        _buildQueueList(queueState.pendingItems, 'pending'),
                        _buildQueueList(queueState.inProgressItems, 'in_progress'),
                        _buildQueueList(queueState.completedItems, 'completed'),
                      ],
                    ),
        ),
      ],
    );
  }

  Widget _buildBadge(int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count.toString(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
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
            onPressed: () => ref.read(queueProvider.notifier).loadQueue(),
            child: const Text('Coba Lagi'),
          ),
        ],
      ),
    );
  }

  Widget _buildQueueList(List<QueueItem> items, String status) {
    final searchQuery = ref.watch(queueProvider).searchQuery?.toLowerCase();
    final filteredItems = searchQuery != null && searchQuery.isNotEmpty
        ? items.where((i) => i.patientName.toLowerCase().contains(searchQuery)).toList()
        : items;

    if (filteredItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              status == 'pending'
                  ? Icons.hourglass_empty
                  : status == 'in_progress'
                      ? Icons.medical_services_outlined
                      : Icons.check_circle_outline,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              status == 'pending'
                  ? 'Tidak ada pasien menunggu'
                  : status == 'in_progress'
                      ? 'Tidak ada pemeriksaan berlangsung'
                      : 'Belum ada yang selesai',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(queueProvider.notifier).refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: filteredItems.length,
        itemBuilder: (context, index) {
          final item = filteredItems[index];
          return _QueueItemCard(
            item: item,
            onTap: () => _openMedicalRecord(item),
            onRemove: item.isPending ? () => _removeFromQueue(item.id) : null,
          );
        },
      ),
    );
  }

  void _openMedicalRecord(QueueItem item) {
    final location = ref.read(queueProvider).selectedLocation;
    context.push('/sunday-clinic/record', extra: {
      'patientId': item.patientId,
      'patientName': item.patientName,
      'category': item.category ?? item.mrCategory ?? 'Obstetri',
      'location': location,
      'recordId': item.hasRecord ? item.id : null,
      'mrId': item.mrId,
    });
  }

  Future<void> _removeFromQueue(int queueId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus dari Antrian'),
        content: const Text('Yakin ingin menghapus pasien ini dari antrian?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final success = await ref.read(queueProvider.notifier).removeFromQueue(queueId);
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pasien dihapus dari antrian')),
        );
      }
    }
  }

  void _showAddToQueueDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) {
            return _AddToQueueSheet(scrollController: scrollController);
          },
        );
      },
    );
  }
}

class _QueueItemCard extends StatelessWidget {
  final QueueItem item;
  final VoidCallback onTap;
  final VoidCallback? onRemove;

  const _QueueItemCard({
    required this.item,
    required this.onTap,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: item.isCompleted
                ? Border.all(color: Colors.green.withValues(alpha: 0.3), width: 2)
                : null,
          ),
          child: Row(
            children: [
              // Avatar
              CircleAvatar(
                radius: 24,
                backgroundColor: _getStatusColor().withValues(alpha: 0.1),
                child: Text(
                  item.initials,
                  style: TextStyle(
                    color: _getStatusColor(),
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.patientName,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: item.isCompleted ? Colors.green[800] : null,
                            ),
                          ),
                        ),
                        if (item.mrId != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              item.mrId!,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (item.slotTime != null) ...[
                          Icon(Icons.access_time, size: 12, color: Colors.grey[600]),
                          const SizedBox(width: 2),
                          Text(
                            item.slotTime!,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        if (item.category != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: _getCategoryColor().withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              item.category!,
                              style: TextStyle(
                                fontSize: 10,
                                color: _getCategoryColor(),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (item.chiefComplaint != null && item.chiefComplaint!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        item.chiefComplaint!,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey[500],
                          fontStyle: FontStyle.italic,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              // Status & Actions
              Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getStatusColor().withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      item.statusText,
                      style: TextStyle(
                        fontSize: 11,
                        color: _getStatusColor(),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  if (onRemove != null) ...[
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: onRemove,
                      child: Icon(Icons.close, size: 18, color: Colors.grey[400]),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor() {
    if (item.isCompleted) return Colors.green;
    if (item.isInProgress) return Colors.blue;
    return Colors.orange;
  }

  Color _getCategoryColor() {
    switch (item.category) {
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

class _AddToQueueSheet extends ConsumerStatefulWidget {
  final ScrollController scrollController;

  const _AddToQueueSheet({required this.scrollController});

  @override
  ConsumerState<_AddToQueueSheet> createState() => _AddToQueueSheetState();
}

class _AddToQueueSheetState extends ConsumerState<_AddToQueueSheet> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _searchResults = [];
  bool _isSearching = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Tambah ke Antrian',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Cari pasien...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onChanged: _searchPatients,
          ),
          const SizedBox(height: 16),
          Expanded(
            child: _isSearching
                ? const Center(child: CircularProgressIndicator())
                : _searchResults.isEmpty
                    ? Center(
                        child: Text(
                          _searchController.text.isEmpty
                              ? 'Ketik nama pasien untuk mencari'
                              : 'Tidak ada hasil',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      )
                    : ListView.builder(
                        controller: widget.scrollController,
                        itemCount: _searchResults.length,
                        itemBuilder: (context, index) {
                          final patient = _searchResults[index];
                          return ListTile(
                            leading: CircleAvatar(
                              child: Text(
                                (patient['name'] as String?)?.isNotEmpty == true
                                    ? patient['name'][0].toUpperCase()
                                    : '?',
                              ),
                            ),
                            title: Text(patient['name'] ?? '-'),
                            subtitle: Text('${patient['age'] ?? '-'} tahun'),
                            trailing: const Icon(Icons.add_circle_outline),
                            onTap: () => _addPatient(patient),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Future<void> _searchPatients(String query) async {
    if (query.length < 2) {
      setState(() => _searchResults = []);
      return;
    }

    setState(() => _isSearching = true);

    // TODO: Implement actual search API call
    await Future.delayed(const Duration(milliseconds: 500));

    setState(() {
      _isSearching = false;
      _searchResults = []; // Would come from API
    });
  }

  Future<void> _addPatient(Map<String, dynamic> patient) async {
    final success = await ref.read(queueProvider.notifier).addToQueue(
          patientId: patient['id'].toString(),
        );

    if (success && mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${patient['name']} ditambahkan ke antrian')),
      );
    }
  }
}
