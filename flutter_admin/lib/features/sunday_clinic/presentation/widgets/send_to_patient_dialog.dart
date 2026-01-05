import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../data/models/medical_record_model.dart';
import '../../data/repositories/sunday_clinic_repository.dart';

class SendToPatientDialog extends ConsumerStatefulWidget {
  final String mrId;
  final String? patientName;
  final String? patientPhone;
  final DocumentsSent? documentsSent;

  const SendToPatientDialog({
    super.key,
    required this.mrId,
    this.patientName,
    this.patientPhone,
    this.documentsSent,
  });

  @override
  ConsumerState<SendToPatientDialog> createState() => _SendToPatientDialogState();
}

class _SendToPatientDialogState extends ConsumerState<SendToPatientDialog> {
  bool _sendResumeMedis = true;
  bool _sendLabResults = false;
  bool _sendUsgPhotos = false;
  String _selectedChannel = 'portal';
  final _phoneController = TextEditingController();
  final _notesController = TextEditingController();
  bool _isProcessing = false;
  String? _lastGeneratedPdfUrl;

  @override
  void initState() {
    super.initState();
    if (widget.patientPhone != null) {
      _phoneController.text = _formatPhoneNumber(widget.patientPhone!);
    }
    // Pre-check documents that haven't been sent yet
    if (widget.documentsSent != null) {
      _sendResumeMedis = !widget.documentsSent!.resumeMedis;
      _sendLabResults = !widget.documentsSent!.labResults;
      _sendUsgPhotos = !widget.documentsSent!.usgPhotos;
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  String _formatPhoneNumber(String phone) {
    // Clean phone number - remove non-digits
    String cleaned = phone.replaceAll(RegExp(r'[^\d+]'), '');
    // Convert 0 prefix to 62
    if (cleaned.startsWith('0')) {
      cleaned = '62${cleaned.substring(1)}';
    }
    return cleaned;
  }

  Future<void> _generatePdf() async {
    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      final url = await repo.generateResumeMedisPdf(widget.mrId);
      setState(() {
        _lastGeneratedPdfUrl = url;
        _isProcessing = false;
      });

      if (url.isNotEmpty) {
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
      _showSuccess('PDF berhasil di-generate');
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _sendToPortal() async {
    if (!_sendResumeMedis && !_sendLabResults && !_sendUsgPhotos) {
      _showError('Pilih minimal satu dokumen untuk dikirim');
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      await repo.sendToPatientPortal(
        mrId: widget.mrId,
        sendResumeMedis: _sendResumeMedis,
        sendLabResults: _sendLabResults,
        sendUsgPhotos: _sendUsgPhotos,
        notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      );
      setState(() => _isProcessing = false);
      _showSuccess('Dokumen berhasil dikirim ke Portal Pasien');
      Navigator.pop(context, true);
    } catch (e) {
      setState(() => _isProcessing = false);
      _showError(e.toString());
    }
  }

  Future<void> _sendToWhatsApp() async {
    if (_phoneController.text.isEmpty) {
      _showError('Masukkan nomor WhatsApp');
      return;
    }

    if (!_sendResumeMedis && !_sendLabResults && !_sendUsgPhotos) {
      _showError('Pilih minimal satu dokumen untuk dikirim');
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final repo = ref.read(sundayClinicRepositoryProvider);
      await repo.sendToWhatsApp(
        mrId: widget.mrId,
        phone: _phoneController.text,
        sendResumeMedis: _sendResumeMedis,
        sendLabResults: _sendLabResults,
        sendUsgPhotos: _sendUsgPhotos,
        message: _notesController.text.isNotEmpty ? _notesController.text : null,
      );
      setState(() => _isProcessing = false);
      _showSuccess('Dokumen berhasil dikirim ke WhatsApp');
      Navigator.pop(context, true);
    } catch (e) {
      setState(() => _isProcessing = false);
      // Fallback to manual WhatsApp link
      _showManualWhatsAppOption();
    }
  }

  void _showManualWhatsAppOption() {
    final phone = _phoneController.text;
    final message = Uri.encodeComponent(
      'Halo ${widget.patientName ?? "Ibu"},\n\n'
      'Berikut hasil pemeriksaan Anda di Klinik dr. Dibya.\n\n'
      '${_notesController.text}',
    );
    final waUrl = 'https://wa.me/$phone?text=$message';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Kirim Manual'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Pengiriman otomatis gagal. Gunakan link WhatsApp manual:'),
            const SizedBox(height: 16),
            SelectableText(
              waUrl,
              style: const TextStyle(fontSize: 12, color: Colors.blue),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tutup'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(context);
              final uri = Uri.parse(waUrl);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
            child: const Text('Buka WhatsApp'),
          ),
        ],
      ),
    );
  }

  void _sendDocument() {
    if (_selectedChannel == 'portal') {
      _sendToPortal();
    } else {
      _sendToWhatsApp();
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

    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: const BoxConstraints(maxWidth: 500),
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
                  Icon(Icons.send, color: theme.colorScheme.onPrimaryContainer),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Kirim ke Pasien',
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
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),

            // Content
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Documents sent status
                  if (widget.documentsSent?.hasSentAny == true)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, color: Colors.green, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Dokumen sudah pernah dikirim via ${widget.documentsSent?.sentVia ?? "portal"}',
                              style: const TextStyle(color: Colors.green, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Document selection
                  Text('Pilih Dokumen:', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),

                  _buildDocumentCheckbox(
                    'Resume Medis',
                    _sendResumeMedis,
                    (v) => setState(() => _sendResumeMedis = v ?? false),
                    widget.documentsSent?.resumeMedis == true,
                  ),
                  _buildDocumentCheckbox(
                    'Hasil Lab',
                    _sendLabResults,
                    (v) => setState(() => _sendLabResults = v ?? false),
                    widget.documentsSent?.labResults == true,
                  ),
                  _buildDocumentCheckbox(
                    'Foto USG',
                    _sendUsgPhotos,
                    (v) => setState(() => _sendUsgPhotos = v ?? false),
                    widget.documentsSent?.usgPhotos == true,
                  ),

                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 16),

                  // Channel selection
                  Text('Kirim via:', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),

                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                        value: 'portal',
                        label: Text('Portal Pasien'),
                        icon: Icon(Icons.web),
                      ),
                      ButtonSegment(
                        value: 'whatsapp',
                        label: Text('WhatsApp'),
                        icon: Icon(Icons.chat),
                      ),
                    ],
                    selected: {_selectedChannel},
                    onSelectionChanged: (selection) {
                      setState(() => _selectedChannel = selection.first);
                    },
                  ),

                  const SizedBox(height: 16),

                  // WhatsApp phone input
                  if (_selectedChannel == 'whatsapp') ...[
                    TextField(
                      controller: _phoneController,
                      decoration: const InputDecoration(
                        labelText: 'Nomor WhatsApp',
                        hintText: '628123456789',
                        prefixIcon: Icon(Icons.phone),
                        border: OutlineInputBorder(),
                        helperText: 'Format: 628xxx (tanpa + atau spasi)',
                      ),
                      keyboardType: TextInputType.phone,
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Notes
                  TextField(
                    controller: _notesController,
                    decoration: const InputDecoration(
                      labelText: 'Catatan (opsional)',
                      hintText: 'Pesan tambahan untuk pasien...',
                      prefixIcon: Icon(Icons.note),
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 2,
                  ),
                ],
              ),
            ),

            // Actions
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  // Generate PDF button
                  OutlinedButton.icon(
                    onPressed: _isProcessing ? null : _generatePdf,
                    icon: const Icon(Icons.picture_as_pdf, size: 18),
                    label: const Text('PDF'),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Batal'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: _isProcessing ? null : _sendDocument,
                    icon: _isProcessing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send, size: 18),
                    label: Text(_selectedChannel == 'portal' ? 'Kirim ke Portal' : 'Kirim WhatsApp'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentCheckbox(
    String label,
    bool value,
    ValueChanged<bool?> onChanged,
    bool alreadySent,
  ) {
    return CheckboxListTile(
      title: Row(
        children: [
          Text(label),
          if (alreadySent) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'Sudah dikirim',
                style: TextStyle(fontSize: 10, color: Colors.green),
              ),
            ),
          ],
        ],
      ),
      value: value,
      onChanged: onChanged,
      dense: true,
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
