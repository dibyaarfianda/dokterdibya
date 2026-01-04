import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/billing_model.dart';
import '../providers/billing_provider.dart';

class BillingPanel extends ConsumerStatefulWidget {
  final String mrId;
  final bool isReadOnly;

  const BillingPanel({
    super.key,
    required this.mrId,
    this.isReadOnly = false,
  });

  @override
  ConsumerState<BillingPanel> createState() => _BillingPanelState();
}

class _BillingPanelState extends ConsumerState<BillingPanel> {
  final _currencyFormat = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(billingProvider.notifier).loadBilling(widget.mrId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final billingState = ref.watch(billingProvider);

    if (billingState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        _buildHeader(billingState),
        const Divider(),

        // Items list
        Expanded(
          child: billingState.pendingItems.isEmpty
              ? _buildEmptyState()
              : _buildItemsList(billingState.pendingItems),
        ),

        // Totals
        _buildTotals(billingState),

        // Action buttons
        if (!widget.isReadOnly) _buildActions(billingState),
      ],
    );
  }

  Widget _buildHeader(BillingState state) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text(
            'Tagihan',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          if (state.billing != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _getStatusColor(state.billing!.status).withAlpha(25),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                state.billing!.statusDisplayName,
                style: TextStyle(
                  fontSize: 12,
                  color: _getStatusColor(state.billing!.status),
                  fontWeight: FontWeight.w500,
                ),
              ),
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
          Icon(Icons.receipt_long, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Belum ada item',
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          if (!widget.isReadOnly)
            ElevatedButton.icon(
              onPressed: _showAddItemDialog,
              icon: const Icon(Icons.add),
              label: const Text('Tambah Item'),
            ),
        ],
      ),
    );
  }

  Widget _buildItemsList(List<BillingItem> items) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: items.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final item = items[index];
        return ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(
            backgroundColor: item.isObat
                ? Colors.green.withAlpha(25)
                : Colors.blue.withAlpha(25),
            radius: 16,
            child: Icon(
              item.isObat ? Icons.medication : Icons.medical_services,
              size: 16,
              color: item.isObat ? Colors.green : Colors.blue,
            ),
          ),
          title: Text(
            item.itemName,
            style: const TextStyle(fontSize: 14),
          ),
          subtitle: Text(
            '${_currencyFormat.format(item.price)} x ${item.quantity}',
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _currencyFormat.format(item.total),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              if (!widget.isReadOnly) ...[
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.edit, size: 18),
                  onPressed: () => _showEditQuantityDialog(index, item),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                const SizedBox(width: 4),
                IconButton(
                  icon: const Icon(Icons.delete, size: 18, color: Colors.red),
                  onPressed: () => _removeItem(index),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildTotals(BillingState state) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        border: Border(
          top: BorderSide(color: Colors.grey[300]!),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Subtotal'),
              Text(_currencyFormat.format(state.subtotal)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Total',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              Text(
                _currencyFormat.format(state.total),
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActions(BillingState state) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Add item button
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _showAddItemDialog,
              icon: const Icon(Icons.add),
              label: const Text('Tambah Item'),
            ),
          ),
          const SizedBox(height: 8),

          // Save/Confirm buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: state.isSaving
                      ? null
                      : () => _saveBilling(status: 'draft'),
                  child: const Text('Simpan Draft'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: state.isSaving || state.pendingItems.isEmpty
                      ? null
                      : () => _confirmBilling(),
                  child: state.isSaving
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Konfirmasi'),
                ),
              ),
            ],
          ),

          // Print buttons (if confirmed)
          if (state.billing?.isConfirmed == true ||
              state.billing?.isPaid == true) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _generateInvoice(),
                    icon: const Icon(Icons.receipt),
                    label: const Text('Invoice'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _generateEtiket(),
                    icon: const Icon(Icons.label),
                    label: const Text('Etiket'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'draft':
        return Colors.grey;
      case 'confirmed':
        return Colors.orange;
      case 'paid':
        return Colors.green;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _showAddItemDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) {
          return AddItemSheet(
            scrollController: scrollController,
            onItemSelected: (item) {
              ref.read(billingProvider.notifier).addItem(item);
              Navigator.pop(context);
            },
          );
        },
      ),
    );
  }

  void _showEditQuantityDialog(int index, BillingItem item) {
    final controller = TextEditingController(text: item.quantity.toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Jumlah'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Jumlah',
            hintText: item.quantity.toString(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              final qty = int.tryParse(controller.text) ?? item.quantity;
              if (qty > 0) {
                ref.read(billingProvider.notifier).updateItemQuantity(index, qty);
              }
              Navigator.pop(context);
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _removeItem(int index) {
    ref.read(billingProvider.notifier).removeItem(index);
  }

  Future<void> _saveBilling({String status = 'draft'}) async {
    await ref.read(billingProvider.notifier).saveBilling(
          widget.mrId,
          status: status,
        );
  }

  Future<void> _confirmBilling() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Konfirmasi Tagihan'),
        content: const Text(
          'Setelah dikonfirmasi, tagihan tidak bisa diubah kecuali dengan permintaan revisi. Lanjutkan?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Konfirmasi'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      // Save first, then confirm
      await _saveBilling(status: 'draft');
      await ref.read(billingProvider.notifier).confirmBilling(widget.mrId);
    }
  }

  Future<void> _generateInvoice() async {
    final url = await ref.read(billingProvider.notifier).generateInvoice(widget.mrId);
    if (url != null && mounted) {
      // TODO: Open URL in browser or show download
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invoice: $url')),
      );
    }
  }

  Future<void> _generateEtiket() async {
    final url = await ref.read(billingProvider.notifier).generateEtiket(widget.mrId);
    if (url != null && mounted) {
      // TODO: Open URL in browser or show download
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Etiket: $url')),
      );
    }
  }
}

// Add Item Sheet Widget
class AddItemSheet extends ConsumerStatefulWidget {
  final ScrollController scrollController;
  final Function(BillingItem) onItemSelected;

  const AddItemSheet({
    super.key,
    required this.scrollController,
    required this.onItemSelected,
  });

  @override
  ConsumerState<AddItemSheet> createState() => _AddItemSheetState();
}

class _AddItemSheetState extends ConsumerState<AddItemSheet>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();
  final _currencyFormat = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    Future.microtask(() {
      ref.read(itemSearchProvider.notifier).loadInitialItems();
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
    final searchState = ref.watch(itemSearchProvider);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),

          // Title
          const Text(
            'Tambah Item',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),

          // Search field
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Cari obat atau tindakan...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              isDense: true,
            ),
            onChanged: (value) {
              if (_tabController.index == 0) {
                ref.read(itemSearchProvider.notifier).searchMedications(value);
              } else {
                ref.read(itemSearchProvider.notifier).searchServices(value);
              }
            },
          ),
          const SizedBox(height: 16),

          // Tabs
          TabBar(
            controller: _tabController,
            labelColor: AppColors.primary,
            unselectedLabelColor: Colors.grey,
            indicatorColor: AppColors.primary,
            tabs: const [
              Tab(text: 'Obat'),
              Tab(text: 'Tindakan'),
            ],
            onTap: (index) {
              ref.read(itemSearchProvider.notifier).setActiveTab(
                    index == 0 ? 'obat' : 'tindakan',
                  );
            },
          ),

          // Content
          Expanded(
            child: searchState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _buildMedicationsList(searchState.medications),
                      _buildServicesList(searchState.services),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildMedicationsList(List<Medication> medications) {
    if (medications.isEmpty) {
      return const Center(child: Text('Tidak ada obat ditemukan'));
    }

    return ListView.builder(
      controller: widget.scrollController,
      itemCount: medications.length,
      itemBuilder: (context, index) {
        final med = medications[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: Colors.green.withAlpha(25),
            child: const Icon(Icons.medication, color: Colors.green),
          ),
          title: Text(med.name),
          subtitle: Text(
            '${med.code} • Stok: ${med.stock} ${med.unit ?? ''}',
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
          trailing: Text(
            _currencyFormat.format(med.price),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          onTap: med.stock > 0 ? () => _selectMedication(med) : null,
          enabled: med.stock > 0,
        );
      },
    );
  }

  Widget _buildServicesList(List<Service> services) {
    if (services.isEmpty) {
      return const Center(child: Text('Tidak ada tindakan ditemukan'));
    }

    return ListView.builder(
      controller: widget.scrollController,
      itemCount: services.length,
      itemBuilder: (context, index) {
        final service = services[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: Colors.blue.withAlpha(25),
            child: const Icon(Icons.medical_services, color: Colors.blue),
          ),
          title: Text(service.name),
          subtitle: Text(
            service.code,
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
          trailing: Text(
            _currencyFormat.format(service.price),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          onTap: () => _selectService(service),
        );
      },
    );
  }

  void _selectMedication(Medication med) {
    final item = BillingItem(
      itemType: 'obat',
      itemCode: med.code,
      itemName: med.name,
      quantity: 1,
      price: med.price,
      total: med.price,
    );
    widget.onItemSelected(item);
  }

  void _selectService(Service service) {
    final item = BillingItem(
      itemType: 'tindakan',
      itemCode: service.code,
      itemName: service.name,
      quantity: 1,
      price: service.price,
      total: service.price,
    );
    widget.onItemSelected(item);
  }
}
