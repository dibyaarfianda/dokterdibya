import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/drug_sale_model.dart';
import '../providers/drug_sale_provider.dart';

class DrugSaleScreen extends ConsumerStatefulWidget {
  const DrugSaleScreen({super.key});

  @override
  ConsumerState<DrugSaleScreen> createState() => _DrugSaleScreenState();
}

class _DrugSaleScreenState extends ConsumerState<DrugSaleScreen> {
  String? _selectedStatus;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(drugSaleProvider.notifier).loadSales();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(drugSaleProvider);

    final filteredSales = _selectedStatus == null
        ? state.sales
        : state.sales.where((s) => s.paymentStatus == _selectedStatus).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Penjualan Obat'),
        actions: [
          PopupMenuButton<String?>(
            icon: const Icon(Icons.filter_list),
            onSelected: (value) {
              setState(() => _selectedStatus = value);
            },
            itemBuilder: (context) => [
              const PopupMenuItem(value: null, child: Text('Semua')),
              const PopupMenuItem(value: 'pending', child: Text('Belum Bayar')),
              const PopupMenuItem(value: 'paid', child: Text('Lunas')),
            ],
          ),
        ],
      ),
      body: state.isLoading && state.sales.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : filteredSales.isEmpty
              ? _buildEmptyState()
              : _buildSalesList(filteredSales),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.point_of_sale_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Belum ada penjualan',
            style: TextStyle(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildSalesList(List<DrugSale> sales) {
    return RefreshIndicator(
      onRefresh: () => ref.read(drugSaleProvider.notifier).loadSales(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: sales.length,
        itemBuilder: (context, index) {
          final sale = sales[index];
          return _SaleCard(
            sale: sale,
            onMarkPaid: sale.paymentStatus != 'paid'
                ? () => _showPaymentDialog(sale)
                : null,
            onTap: () => _showSaleDetail(sale),
          );
        },
      ),
    );
  }

  void _showPaymentDialog(DrugSale sale) {
    String selectedMethod = 'cash';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Konfirmasi Pembayaran'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Total: ${sale.formattedTotal}'),
              const SizedBox(height: 16),
              const Text('Metode Pembayaran:'),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: selectedMethod,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('Cash')),
                  DropdownMenuItem(value: 'transfer', child: Text('Transfer')),
                  DropdownMenuItem(value: 'qris', child: Text('QRIS')),
                ],
                onChanged: (v) => setDialogState(() => selectedMethod = v!),
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
                final success = await ref
                    .read(drugSaleProvider.notifier)
                    .markAsPaid(sale.id, selectedMethod);

                if (mounted) {
                  Navigator.pop(context);
                  if (success) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Pembayaran berhasil dikonfirmasi')),
                    );
                  }
                }
              },
              child: const Text('Konfirmasi'),
            ),
          ],
        ),
      ),
    );
  }

  void _showSaleDetail(DrugSale sale) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => Padding(
          padding: const EdgeInsets.all(20),
          child: ListView(
            controller: scrollController,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      sale.invoiceNumber ?? 'Invoice #${sale.id}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: sale.paymentStatus == 'paid'
                          ? Colors.green.withValues(alpha: 0.1)
                          : Colors.orange.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      sale.paymentStatus == 'paid' ? 'Lunas' : 'Belum Bayar',
                      style: TextStyle(
                        color: sale.paymentStatus == 'paid'
                            ? Colors.green
                            : Colors.orange,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                DateFormat('d MMMM yyyy HH:mm', 'id_ID').format(sale.createdAt),
                style: TextStyle(color: Colors.grey[600]),
              ),
              if (sale.customerName != null) ...[
                const SizedBox(height: 4),
                Text('Pembeli: ${sale.customerName}'),
              ],
              const Divider(height: 32),
              const Text(
                'Item',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (sale.items.isEmpty)
                const Text('Tidak ada detail item')
              else
                ...sale.items.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.obatName ?? 'Item #${item.obatId}'),
                                Text(
                                  '${item.quantity} x Rp ${item.price.toStringAsFixed(0)}',
                                  style: TextStyle(
                                    color: Colors.grey[600],
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            'Rp ${item.subtotal.toStringAsFixed(0)}',
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    )),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total'),
                  Text(
                    sale.formattedTotal,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
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
}

class _SaleCard extends StatelessWidget {
  final DrugSale sale;
  final VoidCallback? onMarkPaid;
  final VoidCallback onTap;

  const _SaleCard({
    required this.sale,
    this.onMarkPaid,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      sale.invoiceNumber ?? 'Invoice #${sale.id}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: sale.paymentStatus == 'paid'
                          ? Colors.green.withValues(alpha: 0.1)
                          : Colors.orange.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      sale.paymentStatus == 'paid' ? 'Lunas' : 'Belum Bayar',
                      style: TextStyle(
                        fontSize: 11,
                        color: sale.paymentStatus == 'paid'
                            ? Colors.green
                            : Colors.orange,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (sale.customerName != null)
                Text(
                  sale.customerName!,
                  style: TextStyle(color: Colors.grey[700]),
                ),
              Text(
                DateFormat('d MMM yyyy HH:mm', 'id_ID').format(sale.createdAt),
                style: TextStyle(color: Colors.grey[500], fontSize: 12),
              ),
              const Divider(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      sale.formattedTotal,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  if (onMarkPaid != null)
                    ElevatedButton.icon(
                      onPressed: onMarkPaid,
                      icon: const Icon(Icons.payment, size: 18),
                      label: const Text('Bayar'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
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
}
