import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../providers/stock_movement_provider.dart';

class ActivityLogScreen extends ConsumerStatefulWidget {
  const ActivityLogScreen({super.key});

  @override
  ConsumerState<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends ConsumerState<ActivityLogScreen> {
  final _scrollController = ScrollController();
  final _dateFormat = DateFormat('dd/MM/yyyy HH:mm');
  final _expiryFormat = DateFormat('dd/MM/yyyy');

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
    });

    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        final state = ref.read(stockMovementProvider);
        if (!state.isLoading && state.movements.length < state.total) {
          ref.read(stockMovementProvider.notifier).loadActivityLog();
        }
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(stockMovementProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Log Aktivitas Obat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(state),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true),
          ),
        ],
      ),
      body: Column(
        children: [
          // Active filters
          if (state.selectedMovementType != null ||
              state.selectedUser != null ||
              state.startDate != null ||
              state.endDate != null)
            Container(
              padding: const EdgeInsets.all(8),
              color: AppColors.primary.withValues(alpha: 0.1),
              child: Row(
                children: [
                  const Icon(Icons.filter_alt, size: 16, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Wrap(
                      spacing: 8,
                      children: [
                        if (state.selectedMovementType != null)
                          Chip(
                            label: Text(_getMovementTypeLabel(state.selectedMovementType!)),
                            onDeleted: () {
                              ref.read(stockMovementProvider.notifier).setFilter(
                                    movementType: null,
                                  );
                              ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
                            },
                          ),
                        if (state.selectedUser != null)
                          Chip(
                            label: Text(state.selectedUser!),
                            onDeleted: () {
                              ref.read(stockMovementProvider.notifier).setFilter(
                                    user: null,
                                  );
                              ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
                            },
                          ),
                        if (state.startDate != null || state.endDate != null)
                          Chip(
                            label: Text(
                                '${state.startDate ?? ''} - ${state.endDate ?? ''}'),
                            onDeleted: () {
                              ref.read(stockMovementProvider.notifier).setFilter(
                                    startDate: null,
                                    endDate: null,
                                  );
                              ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
                            },
                          ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      ref.read(stockMovementProvider.notifier).clearFilters();
                      ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
                    },
                    child: const Text('Reset'),
                  ),
                ],
              ),
            ),

          // List
          Expanded(
            child: state.isLoading && state.movements.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.movements.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.history, size: 64, color: Colors.grey[400]),
                            const SizedBox(height: 16),
                            Text(
                              'Tidak ada log aktivitas',
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () => ref
                            .read(stockMovementProvider.notifier)
                            .loadActivityLog(reset: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: state.movements.length + (state.isLoading ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == state.movements.length) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            }

                            final movement = state.movements[index];
                            return _MovementCard(
                              movement: movement,
                              dateFormat: _dateFormat,
                              expiryFormat: _expiryFormat,
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  String _getMovementTypeLabel(String type) {
    switch (type) {
      case 'stock_in':
        return 'Stok Masuk';
      case 'stock_out':
        return 'Stok Keluar';
      case 'sale':
        return 'Penjualan';
      case 'adjustment':
        return 'Penyesuaian';
      case 'return':
        return 'Retur';
      case 'billing':
        return 'Tagihan';
      default:
        return type;
    }
  }

  void _showFilterDialog(StockMovementState state) {
    String? movementType = state.selectedMovementType;
    String? selectedUser = state.selectedUser;
    DateTime? startDate =
        state.startDate != null ? DateTime.tryParse(state.startDate!) : null;
    DateTime? endDate =
        state.endDate != null ? DateTime.tryParse(state.endDate!) : null;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Filter Log'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Movement type
                const Text('Jenis Aktivitas',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: movementType,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  hint: const Text('Semua'),
                  items: const [
                    DropdownMenuItem(value: null, child: Text('Semua')),
                    DropdownMenuItem(value: 'stock_in', child: Text('Stok Masuk')),
                    DropdownMenuItem(value: 'stock_out', child: Text('Stok Keluar')),
                    DropdownMenuItem(value: 'sale', child: Text('Penjualan')),
                    DropdownMenuItem(value: 'adjustment', child: Text('Penyesuaian')),
                    DropdownMenuItem(value: 'return', child: Text('Retur')),
                    DropdownMenuItem(value: 'billing', child: Text('Tagihan')),
                  ],
                  onChanged: (value) => setState(() => movementType = value),
                ),
                const SizedBox(height: 16),

                // User
                if (state.users.isNotEmpty) ...[
                  const Text('Oleh', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: selectedUser,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    hint: const Text('Semua'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Semua')),
                      ...state.users.map(
                          (u) => DropdownMenuItem(value: u, child: Text(u))),
                    ],
                    onChanged: (value) => setState(() => selectedUser = value),
                  ),
                  const SizedBox(height: 16),
                ],

                // Date range
                const Text('Periode', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: startDate ?? DateTime.now(),
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setState(() => startDate = date);
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            contentPadding:
                                EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            labelText: 'Dari',
                          ),
                          child: Text(
                            startDate != null
                                ? DateFormat('dd/MM/yyyy').format(startDate!)
                                : '-',
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: endDate ?? DateTime.now(),
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setState(() => endDate = date);
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            contentPadding:
                                EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            labelText: 'Sampai',
                          ),
                          child: Text(
                            endDate != null
                                ? DateFormat('dd/MM/yyyy').format(endDate!)
                                : '-',
                          ),
                        ),
                      ),
                    ),
                  ],
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
              onPressed: () {
                ref.read(stockMovementProvider.notifier).setFilter(
                      movementType: movementType,
                      user: selectedUser,
                      startDate: startDate?.toIso8601String().split('T').first,
                      endDate: endDate?.toIso8601String().split('T').first,
                    );
                ref.read(stockMovementProvider.notifier).loadActivityLog(reset: true);
                Navigator.pop(context);
              },
              child: const Text('Terapkan'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MovementCard extends StatelessWidget {
  final dynamic movement;
  final DateFormat dateFormat;
  final DateFormat expiryFormat;

  const _MovementCard({
    required this.movement,
    required this.dateFormat,
    required this.expiryFormat,
  });

  @override
  Widget build(BuildContext context) {
    final isIncoming = movement.isIncoming;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: (isIncoming ? Colors.green : Colors.red).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    isIncoming ? Icons.add_circle_outline : Icons.remove_circle_outline,
                    color: isIncoming ? Colors.green : Colors.red,
                  ),
                ),
                const SizedBox(width: 12),
                // Info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        movement.obatName,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      if (movement.obatCode != null)
                        Text(
                          movement.obatCode!,
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                ),
                // Quantity
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: (isIncoming ? Colors.green : Colors.red).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${isIncoming ? '+' : '-'}${movement.quantity}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: isIncoming ? Colors.green : Colors.red,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            // Details
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                _DetailItem(
                  icon: Icons.category_outlined,
                  label: movement.movementTypeDisplay,
                ),
                if (movement.batchNumber != null)
                  _DetailItem(
                    icon: Icons.confirmation_number_outlined,
                    label: 'Batch: ${movement.batchNumber}',
                  ),
                if (movement.expiryDate != null)
                  _DetailItem(
                    icon: Icons.event_outlined,
                    label: 'Exp: ${expiryFormat.format(movement.expiryDate!)}',
                  ),
                if (movement.createdBy != null)
                  _DetailItem(
                    icon: Icons.person_outline,
                    label: movement.createdBy!,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              dateFormat.format(movement.createdAt),
              style: TextStyle(
                color: Colors.grey[500],
                fontSize: 12,
              ),
            ),
            if (movement.notes != null && movement.notes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  children: [
                    Icon(Icons.note_outlined, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        movement.notes!,
                        style: TextStyle(
                          color: Colors.grey[700],
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailItem extends StatelessWidget {
  final IconData icon;
  final String label;

  const _DetailItem({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: Colors.grey[600]),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: Colors.grey[700],
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}
