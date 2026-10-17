import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'open_payments_service.dart';

class DonationStatusScreen extends StatefulWidget {
  const DonationStatusScreen({super.key, required this.donationId});

  final String donationId;

  @override
  State<DonationStatusScreen> createState() => _DonationStatusScreenState();
}

class _DonationStatusScreenState extends State<DonationStatusScreen> {
  final _service = OpenPaymentsService();
  Timer? _pollTimer;
  DonationPayment? _payment;
  String? _error;
  bool _loading = true;

  bool get _isFinal => switch (_payment?.status) {
    'completed' || 'failed' || 'expired' || 'cancelled' => true,
    _ => false,
  };

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final payment = await _service.getDonation(widget.donationId);
      if (!mounted) return;
      setState(() {
        _payment = payment;
        _loading = false;
        _error = null;
      });
      _pollTimer?.cancel();
      if (!_isFinal) {
        _pollTimer = Timer(const Duration(seconds: 3), _refresh);
      }
    } on OpenPaymentsException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
      _pollTimer?.cancel();
    }
  }

  String get _title => switch (_payment?.status) {
    'completed' => '¡Aporte completado!',
    'failed' => 'El aporte no pudo completarse',
    'expired' => 'La autorización expiró',
    'cancelled' => 'Aporte cancelado',
    'authorized' || 'sending' => 'Procesando tu aporte',
    _ => 'Esperando autorización',
  };

  String get _description => switch (_payment?.status) {
    'completed' => 'Gracias por convertir tu solidaridad en acción.',
    'failed' => _payment?.failureReason ?? 'Puedes intentarlo nuevamente.',
    'expired' => 'La cotización venció. Inicia un nuevo aporte.',
    'cancelled' => 'No se realizó ningún cobro.',
    'authorized' ||
    'sending' => 'El dinero está viajando. Seguiremos consultando su estado.',
    _ => 'Autoriza el aporte en tu proveedor para continuar.',
  };

  @override
  Widget build(BuildContext context) {
    final payment = _payment;
    return Scaffold(
      appBar: AppBar(title: const Text('Estado del aporte')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: _loading
                ? const CircularProgressIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        _isFinal && payment?.status == 'completed'
                            ? Icons.check_circle_rounded
                            : Icons.schedule_rounded,
                        size: 72,
                        color: _isFinal && payment?.status == 'completed'
                            ? AppColors.transparentGreen
                            : AppColors.peach,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        _error == null
                            ? _title
                            : 'No pudimos consultar el aporte',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _error ?? _description,
                        textAlign: TextAlign.center,
                        style: const TextStyle(height: 1.5),
                      ),
                      if (payment != null) ...[
                        const SizedBox(height: 24),
                        _SummaryRow(label: 'Estado', value: payment.status),
                        if (payment.debitFormatted.isNotEmpty)
                          _SummaryRow(
                            label: 'Aportaste',
                            value: payment.debitFormatted,
                          ),
                        if (payment.receiveFormatted.isNotEmpty)
                          _SummaryRow(
                            label: 'Recibe el fondo',
                            value: payment.receiveFormatted,
                          ),
                        _SummaryRow(
                          label: 'Referencia',
                          value: payment.donationId,
                        ),
                      ],
                      const SizedBox(height: 28),
                      FilledButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Volver a causas'),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _refresh,
                          child: const Text('Reintentar consulta'),
                        ),
                      ],
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: Color(0xFF65708A))),
        ),
        const SizedBox(width: 16),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );
}
