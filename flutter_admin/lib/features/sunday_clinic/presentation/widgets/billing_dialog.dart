import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../data/models/medical_record_model.dart';
import '../../data/repositories/sunday_clinic_repository.dart';

class BillingDialog extends ConsumerStatefulWidget {
  final String mrId;
  final String? patientName;
  final String visitLocation;

  const BillingDialog({
    super.key,
    required this.mrId,
    this.patientName,
    required this.visitLocation,
  });

  @override
  ConsumerState<BillingDialog> createState() => _BillingDialogState();
}

class _BillingDialogState extends ConsumerState<BillingDialog> {
  Billing? _billing;
  bool _isLoading = true;
  String? _error;
  bool _isProcessing = false;

  // For adding items
  String _selectedItemType = 'tindakan';
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _searchResults = [];
  bool _isSearching = false;

  final _currencyFormat = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _loadBilling();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadBilling() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final billing = await repo.getBilling(widget.mrId);
      setState(() {
        _billing = billing ?? Billing(mrId: widget.mrId, patientName: widget.patientName);
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _searchItems(String query) async {
    if (query.isEmpty) {
      setState(() => _searchResults = []);
      return;
    }

    setState(() => _isSearching = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final results = _selectedItemType == 'obat'
          ? await repo.searchObat(query)
          : await repo.searchTindakan(query);
      setState(() {
        _searchResults = results;
        _isSearching = false;
      });
    } catch (e) {
      setState(() => _isSearching = false);
    }
  }

  Future<void> _addItem(Map<String, dynamic> item) async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final billing = await repo.addBillingItem(
        mrId: widget.mrId,
        type: _selectedItemType,
        name: item['name'] ?? item['nama'] ?? '',
        code: item['code'] ?? item['kode'],
        quantity: 1,
        price: (item['price'] ?? item['harga'] ?? 0).toDouble(),
      );
      setState(() {
        _billing = billing;
        _searchResults = [];
        _searchController.clear();
        _isProcessing = false;
      });
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _deleteItem(int itemId) async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      await repo.deleteBillingItem(widget.mrId, itemId);
      await _loadBilling();
      setState(() => _isProcessing = false);
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _confirmBilling() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Konfirmasi Billing'),
        content: Text(
          'Total tagihan: ${_currencyFormat.format(_billing?.grandTotal ?? 0)}\n\n'
          'Apakah Anda yakin ingin mengkonfirmasi billing ini?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Konfirmasi'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final billing = await repo.confirmBilling(widget.mrId);
      setState(() {
        _billing = billing;
        _isProcessing = false;
      });
      _showSuccess('Billing berhasil dikonfirmasi');
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _markPaid() async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final billing = await repo.markBillingPaid(widget.mrId);
      setState(() {
        _billing = billing;
        _isProcessing = false;
      });
      _showSuccess('Status pembayaran diupdate');
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _printInvoice() async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final url = await repo.printInvoice(widget.mrId);
      setState(() => _isProcessing = false);

      if (url.isNotEmpty) {
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _printEtiket() async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final url = await repo.printEtiket(widget.mrId);
      setState(() => _isProcessing = false);

      if (url.isNotEmpty) {
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasBilling = widget.visitLocation == 'klinik_private';

    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  Icon(Icons.receipt_long, color: theme.colorScheme.onPrimaryContainer),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Billing - ${widget.mrId}',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onPrimaryContainer,
                          ),
                        ),
                        if (widget.patientName != null)
                          Text(
                            widget.patientName!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onPrimaryContainer.withOpacity(0.8),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (_billing != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: _billing!.isPaid
                            ? Colors.green
                            : _billing!.isConfirmed
                                ? Colors.orange
                                : Colors.grey,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _billing!.statusDisplayName,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),

            // Content
            Flexible(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.error, size: 48, color: theme.colorScheme.error),
                              const SizedBox(height: 16),
                              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: _loadBilling,
                                child: const Text('Coba Lagi'),
                              ),
                            ],
                          ),
                        )
                      : !hasBilling
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(32),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.info, size: 48, color: theme.colorScheme.primary),
                                    const SizedBox(height: 16),
                                    Text(
                                      'Billing hanya tersedia untuk Klinik Privat',
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.bodyLarge,
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : SingleChildScrollView(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // Add Item Section (only if draft)
                                  if (_billing?.isDraft == true) ...[
                                    _buildAddItemSection(theme),
                                    const SizedBox(height: 16),
                                    const Divider(),
                                    const SizedBox(height: 16),
                                  ],

                                  // Items List
                                  _buildItemsList(theme),

                                  const Divider(height: 32),

                                  // Totals
                                  _buildTotals(theme),
                                ],
                              ),
                            ),
            ),

            // Actions
            if (hasBilling && _billing != null && !_isLoading)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
                ),
                child: _buildActions(theme),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAddItemSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Tambah Item', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),

        // Item type selector
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'tindakan', label: Text('Tindakan')),
            ButtonSegment(value: 'obat', label: Text('Obat')),
          ],
          selected: {_selectedItemType},
          onSelectionChanged: (selection) {
            setState(() {
              _selectedItemType = selection.first;
              _searchResults = [];
              _searchController.clear();
            });
          },
        ),
        const SizedBox(height: 8),

        // Search field
        TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Cari ${_selectedItemType == 'obat' ? 'obat' : 'tindakan'}...',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _isSearching
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : null,
            border: const OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (value) {
            if (value.length >= 2) {
              _searchItems(value);
            } else {
              setState(() => _searchResults = []);
            }
          },
        ),

        // Search results
        if (_searchResults.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 8),
            constraints: const BoxConstraints(maxHeight: 200),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outline),
              borderRadius: BorderRadius.circular(8),
            ),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: _searchResults.length,
              itemBuilder: (context, index) {
                final item = _searchResults[index];
                final name = item['name'] ?? item['nama'] ?? '';
                final price = item['price'] ?? item['harga'] ?? 0;

                return ListTile(
                  dense: true,
                  title: Text(name),
                  subtitle: Text(_currencyFormat.format(price)),
                  trailing: _isProcessing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : IconButton(
                          icon: const Icon(Icons.add_circle),
                          onPressed: () => _addItem(item),
                        ),
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _buildItemsList(ThemeData theme) {
    final items = _billing?.items ?? [];

    if (items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        child: Center(
          child: Column(
            children: [
              Icon(Icons.receipt, size: 48, color: theme.colorScheme.outline),
              const SizedBox(height: 8),
              Text(
                'Belum ada item',
                style: TextStyle(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Items', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        ...items.map((item) => _buildItemRow(item, theme)),
      ],
    );
  }

  Widget _buildItemRow(BillingItem item, ThemeData theme) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: item.type == 'obat'
                    ? Colors.green.withOpacity(0.2)
                    : Colors.blue.withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                item.typeDisplayName,
                style: TextStyle(
                  fontSize: 10,
                  color: item.type == 'obat' ? Colors.green : Colors.blue,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: theme.textTheme.bodyMedium),
                  Text(
                    '${item.quantity} x ${_currencyFormat.format(item.price)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              _currencyFormat.format(item.total),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            if (_billing?.isDraft == true)
              IconButton(
                icon: Icon(Icons.delete, color: theme.colorScheme.error, size: 20),
                onPressed: item.id != null ? () => _deleteItem(item.id!) : null,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTotals(ThemeData theme) {
    return Column(
      children: [
        _buildTotalRow('Subtotal', _billing?.subtotal ?? 0, theme),
        if ((_billing?.discount ?? 0) > 0)
          _buildTotalRow('Diskon', -(_billing?.discount ?? 0), theme),
        if ((_billing?.tax ?? 0) > 0)
          _buildTotalRow('Pajak', _billing?.tax ?? 0, theme),
        const Divider(),
        _buildTotalRow('Total', _billing?.grandTotal ?? 0, theme, isTotal: true),
      ],
    );
  }

  Widget _buildTotalRow(String label, double amount, ThemeData theme, {bool isTotal = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: isTotal
                ? theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)
                : theme.textTheme.bodyMedium,
          ),
          Text(
            _currencyFormat.format(amount),
            style: isTotal
                ? theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  )
                : theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }

  Widget _buildActions(ThemeData theme) {
    if (_isProcessing) {
      return const Center(child: CircularProgressIndicator());
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.end,
      children: [
        // Print buttons (always available if has items)
        if (_billing?.items.isNotEmpty == true) ...[
          OutlinedButton.icon(
            onPressed: _printEtiket,
            icon: const Icon(Icons.label, size: 18),
            label: const Text('Etiket'),
          ),
          OutlinedButton.icon(
            onPressed: _printInvoice,
            icon: const Icon(Icons.print, size: 18),
            label: const Text('Invoice'),
          ),
        ],

        // Status actions
        if (_billing?.isDraft == true && (_billing?.items.isNotEmpty ?? false))
          FilledButton.icon(
            onPressed: _confirmBilling,
            icon: const Icon(Icons.check, size: 18),
            label: const Text('Konfirmasi'),
          ),

        if (_billing?.isConfirmed == true)
          FilledButton.icon(
            onPressed: _markPaid,
            icon: const Icon(Icons.payments, size: 18),
            label: const Text('Tandai Lunas'),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.green,
            ),
          ),
      ],
    );
  }
}
