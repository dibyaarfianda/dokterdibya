import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../data/models/inventory_model.dart';
import '../providers/inventory_provider.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen>
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
      ref.read(obatListProvider.notifier).loadItems();
      ref.read(tindakanListProvider.notifier).loadItems();
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventori'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(text: 'Obat'),
            Tab(text: 'Tindakan'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterSheet(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Cari obat atau tindakan...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                isDense: true,
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          _onSearch('');
                        },
                      )
                    : null,
              ),
              onChanged: _onSearch,
            ),
          ),

          // Content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildObatList(),
                _buildTindakanList(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddDialog(),
        icon: const Icon(Icons.add),
        label: Text(_tabController.index == 0 ? 'Tambah Obat' : 'Tambah Tindakan'),
      ),
    );
  }

  void _onSearch(String query) {
    if (_tabController.index == 0) {
      ref.read(obatListProvider.notifier).setSearch(query.isEmpty ? null : query);
    } else {
      ref.read(tindakanListProvider.notifier).setSearch(query.isEmpty ? null : query);
    }
  }

  Widget _buildObatList() {
    final obatState = ref.watch(obatListProvider);

    if (obatState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (obatState.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.medication, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada obat ditemukan',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(obatListProvider.notifier).refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 80),
        itemCount: obatState.items.length,
        itemBuilder: (context, index) => _buildObatCard(obatState.items[index]),
      ),
    );
  }

  Widget _buildObatCard(Obat obat) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: () => _showObatDetails(obat),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Stock indicator
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: _getStockColor(obat).withAlpha(25),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      obat.stok.toString(),
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: _getStockColor(obat),
                      ),
                    ),
                    Text(
                      obat.satuan ?? 'pcs',
                      style: TextStyle(
                        fontSize: 10,
                        color: _getStockColor(obat),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      obat.nama,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          obat.kode,
                          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        ),
                        if (obat.kategori != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.blue.withAlpha(25),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              obat.kategori!,
                              style: const TextStyle(fontSize: 10, color: Colors.blue),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              // Price
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _currencyFormat.format(obat.hargaJual),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  if (obat.isLowStock)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange.withAlpha(25),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'Stok Rendah',
                        style: TextStyle(fontSize: 10, color: Colors.orange),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTindakanList() {
    final tindakanState = ref.watch(tindakanListProvider);

    if (tindakanState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (tindakanState.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.medical_services, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada tindakan ditemukan',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(tindakanListProvider.notifier).refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 80),
        itemCount: tindakanState.items.length,
        itemBuilder: (context, index) => _buildTindakanCard(tindakanState.items[index]),
      ),
    );
  }

  Widget _buildTindakanCard(Tindakan tindakan) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Colors.blue.withAlpha(25),
          child: const Icon(Icons.medical_services, color: Colors.blue),
        ),
        title: Text(tindakan.nama),
        subtitle: Text(tindakan.kode),
        trailing: Text(
          _currencyFormat.format(tindakan.harga),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        onTap: () => _showTindakanDetails(tindakan),
      ),
    );
  }

  Color _getStockColor(Obat obat) {
    if (obat.isOutOfStock) return Colors.red;
    if (obat.isLowStock) return Colors.orange;
    return Colors.green;
  }

  void _showFilterSheet() {
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
            const Text(
              'Filter',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Consumer(
              builder: (context, ref, _) {
                final obatState = ref.watch(obatListProvider);
                return SwitchListTile(
                  title: const Text('Stok Rendah Saja'),
                  value: obatState.showLowStockOnly,
                  onChanged: (value) {
                    ref.read(obatListProvider.notifier).toggleLowStockFilter();
                    Navigator.pop(context);
                  },
                );
              },
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  ref.read(obatListProvider.notifier).loadItems();
                  Navigator.pop(context);
                },
                child: const Text('Reset Filter'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showObatDetails(Obat obat) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        expand: false,
        builder: (context, scrollController) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: ListView(
              controller: scrollController,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            obat.nama,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          Text(obat.kode, style: TextStyle(color: Colors.grey[600])),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _buildDetailItem('Kategori', obat.kategori ?? '-'),
                _buildDetailItem('Harga Beli', _currencyFormat.format(obat.hargaBeli)),
                _buildDetailItem('Harga Jual', _currencyFormat.format(obat.hargaJual)),
                _buildDetailItem('Stok', '${obat.stok} ${obat.satuan ?? 'pcs'}'),
                _buildDetailItem('Stok Minimum', '${obat.stokMinimum} ${obat.satuan ?? 'pcs'}'),
                if (obat.expiredDate != null)
                  _buildDetailItem('Expired', DateFormat('d MMM yyyy').format(obat.expiredDate!)),
                if (obat.keterangan != null && obat.keterangan!.isNotEmpty)
                  _buildDetailItem('Keterangan', obat.keterangan!),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _showAdjustStockDialog(obat);
                        },
                        icon: const Icon(Icons.add_circle_outline),
                        label: const Text('Adjust Stok'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _showEditObatDialog(obat);
                        },
                        icon: const Icon(Icons.edit),
                        label: const Text('Edit'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildDetailItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600])),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  void _showTindakanDetails(Tindakan tindakan) {
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tindakan.nama,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      Text(tindakan.kode, style: TextStyle(color: Colors.grey[600])),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildDetailItem('Kategori', tindakan.kategori ?? '-'),
            _buildDetailItem('Harga', _currencyFormat.format(tindakan.harga)),
            if (tindakan.keterangan != null && tindakan.keterangan!.isNotEmpty)
              _buildDetailItem('Keterangan', tindakan.keterangan!),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _showEditTindakanDialog(tindakan);
                },
                icon: const Icon(Icons.edit),
                label: const Text('Edit'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddDialog() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Tambah ${_tabController.index == 0 ? 'obat' : 'tindakan'} baru')),
    );
  }

  void _showEditObatDialog(Obat obat) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Edit obat: ${obat.nama}')),
    );
  }

  void _showEditTindakanDialog(Tindakan tindakan) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Edit tindakan: ${tindakan.nama}')),
    );
  }

  void _showAdjustStockDialog(Obat obat) {
    final qtyController = TextEditingController();
    String type = 'in';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Adjust Stok'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Stok saat ini: ${obat.stok} ${obat.satuan ?? 'pcs'}'),
              const SizedBox(height: 16),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'in', label: Text('Masuk')),
                  ButtonSegment(value: 'out', label: Text('Keluar')),
                ],
                selected: {type},
                onSelectionChanged: (value) {
                  setState(() => type = value.first);
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: qtyController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Jumlah',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              onPressed: () {
                final qty = int.tryParse(qtyController.text) ?? 0;
                if (qty > 0) {
                  ref.read(obatListProvider.notifier).adjustStock(obat.id, qty, type);
                  Navigator.pop(context);
                }
              },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
  }
}
