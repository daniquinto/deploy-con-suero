import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'causes_service.dart';
import '../donations/open_payments_service.dart';
import '../auth/auth_service.dart';

class CauseDetailScreen extends StatelessWidget {
  const CauseDetailScreen({
    super.key,
    required this.cause,
    this.canDonate = true,
  });

  final Cause cause;
  final bool canDonate;

  String _money(int value) {
    final text = value.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => '.',
    );
    return '\$$text';
  }

  List<String> _fundUseItems() {
    if (cause.fundsUse.isNotEmpty) return cause.fundsUse;
    return switch (cause.category) {
      'Educación' => const [
        'Materiales y kits educativos',
        'Acompañamiento pedagógico',
        'Transporte y logística local',
      ],
      'Salud' => const [
        'Medicamentos y atención primaria',
        'Equipos para brigadas médicas',
        'Traslados de pacientes',
      ],
      'Ambiente' => const [
        'Restauración y herramientas',
        'Jornales para familias locales',
        'Seguimiento del ecosistema',
      ],
      _ => const [
        'Ayudas y suministros esenciales',
        'Transporte y distribución',
        'Acompañamiento a las familias',
      ],
    };
  }

  List<String> _updates() => cause.updates.isNotEmpty
      ? cause.updates
      : const [
          'La campaña fue verificada y publicada en Mano Abierta.',
          'La organización está preparando la primera entrega.',
        ];

  void _showDonationSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _DonationCheckoutSheet(cause: cause),
      /*
        const SizedBox.shrink(),
            const SizedBox.shrink(),
            const SizedBox.shrink(),
                  const SnackBar(
                    content: Text('El flujo de pago se conectará más adelante'),
                  ),
                );
              },
              child: const Text('Continuar con el aporte'),
            ),
          ],
        ),
      ),
      */
    );
  }

  @override
  Widget build(BuildContext context) {
    final isVeryNarrow = MediaQuery.sizeOf(context).width < 360;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            actions: isVeryNarrow
                ? const []
                : [
                    IconButton(
                      onPressed: () {},
                      tooltip: 'Compartir',
                      icon: const Icon(Icons.ios_share_rounded),
                    ),
                    IconButton(
                      onPressed: () {},
                      tooltip: 'Guardar',
                      icon: const Icon(Icons.bookmark_border_rounded),
                    ),
                  ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      cause.imageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: cause.colors),
                        ),
                      ),
                    ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.08),
                            Colors.black.withValues(alpha: 0.58),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      right: -20,
                      bottom: -30,
                      child: Icon(cause.icon, size: 230, color: Colors.white12),
                    ),
                    Positioned(
                      left: 24,
                      right: 24,
                      bottom: 28,
                      child: Text(
                        cause.title,
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              height: 1.1,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 120),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: cause.colors.last.withValues(
                              alpha: 0.12,
                            ),
                            child: Icon(cause.icon, color: cause.colors.first),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        cause.organization,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    const Icon(
                                      Icons.verified_rounded,
                                      size: 18,
                                      color: Color(0xFF2675E8),
                                    ),
                                  ],
                                ),
                                Text(
                                  cause.location,
                                  style: const TextStyle(
                                    color: Color(0xFF65708A),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: cause.progress,
                          minHeight: 10,
                          backgroundColor: const Color(0xFFE9EDF5),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _money(cause.raised),
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w900),
                              ),
                              Text(
                                'de ${_money(cause.goal)}',
                                style: const TextStyle(
                                  color: Color(0xFF65708A),
                                ),
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '${cause.donors}',
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w900),
                              ),
                              const Text(
                                'personas apoyaron',
                                style: TextStyle(color: Color(0xFF65708A)),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _InfoCard(
                        title: 'Resumen de la campaña',
                        child: Wrap(
                          spacing: 24,
                          runSpacing: 18,
                          children: [
                            _InfoMetric(
                              icon: Icons.people_alt_outlined,
                              label: 'Personas beneficiadas',
                              value:
                                  '${cause.beneficiaries == 0 ? cause.donors ~/ 2 : cause.beneficiaries}',
                            ),
                            _InfoMetric(
                              icon: Icons.schedule_outlined,
                              label: 'Cierre estimado',
                              value: cause.deadline,
                            ),
                            _InfoMetric(
                              icon: Icons.category_outlined,
                              label: 'Categoría',
                              value: cause.category,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      Text(
                        'Sobre esta causa',
                        style: Theme.of(context).textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        cause.description,
                        style: const TextStyle(fontSize: 16, height: 1.6),
                      ),
                      const SizedBox(height: 28),
                      _InfoCard(
                        title: 'En qué se usarán los fondos',
                        child: Column(
                          children: _fundUseItems()
                              .map(
                                (item) => Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Icon(
                                        Icons.check_circle_outline_rounded,
                                        size: 20,
                                        color: Color(0xFF397B68),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(child: Text(item)),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                      const SizedBox(height: 28),
                      _InfoCard(
                        title: 'Actualizaciones de la causa',
                        child: Column(
                          children: _updates()
                              .map(
                                (update) => ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: const CircleAvatar(
                                    radius: 16,
                                    backgroundColor: Color(0xFFE5F0EA),
                                    child: Icon(
                                      Icons.update_rounded,
                                      size: 18,
                                      color: Color(0xFF174F42),
                                    ),
                                  ),
                                  title: Text(update),
                                  subtitle: const Text('Mano Abierta'),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                      const SizedBox(height: 28),
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF7F4),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.shield_outlined,
                              color: Color(0xFF087F6D),
                            ),
                            SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Causa verificada: revisamos la identidad de la organización y el destino de los recursos.',
                                style: TextStyle(height: 1.4),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomSheet: canDonate
          ? SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE6EAF2))),
                ),
                child: FilledButton.icon(
                  onPressed: () => _showDonationSheet(context),
                  icon: const Icon(Icons.favorite_rounded),
                  label: const Text('Apoyar esta causa'),
                ),
              ),
            )
          : null,
    );
  }
}

class _DonationCheckoutSheet extends StatefulWidget {
  const _DonationCheckoutSheet({required this.cause});

  final Cause cause;

  @override
  State<_DonationCheckoutSheet> createState() => _DonationCheckoutSheetState();
}

class _DonationCheckoutSheetState extends State<_DonationCheckoutSheet> {
  final _walletController = TextEditingController(
    text: AuthService.donorWallet,
  );
  final _amountController = TextEditingController(text: '1');
  final _service = OpenPaymentsService();
  WalletConnection? _connection;
  FundInfo? _fund;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadFund();
  }

  @override
  void dispose() {
    _walletController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _loadFund() async {
    try {
      final fund = await _service.getFund();
      if (mounted) setState(() => _fund = fund);
    } on OpenPaymentsException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Exception {
      if (mounted) {
        setState(() => _error = 'No fue posible conectar con Open Payments.');
      }
    }
  }

  Future<void> _connectWallet() async {
    final wallet = _walletController.text.trim();
    if (wallet.isEmpty) {
      setState(() => _error = 'Ingresa la wallet desde la que donarás.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final connection = await _service.connectWallet(wallet);
      if (mounted) setState(() => _connection = connection);
    } on OpenPaymentsException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Exception {
      if (mounted) {
        setState(
          () => _error = 'No fue posible iniciar el aporte. Intenta de nuevo.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startDonation() async {
    final amount = _amountController.text.trim();
    if (_connection == null) {
      await _connectWallet();
      if (_connection == null) return;
    }
    if (amount.isEmpty ||
        double.tryParse(amount.replaceAll(',', '.')) == null) {
      setState(() => _error = 'Ingresa un monto válido.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payment = await _service.createDonation(
        donorWalletAddress: _walletController.text.trim(),
        amount: amount,
        description: widget.cause.title,
        donorName: 'Donante Mano Abierta',
      );
      if (!mounted) return;
      final redirectUrl = payment.redirectUrl;
      if (redirectUrl == null || redirectUrl.isEmpty) {
        setState(
          () => _error = 'El proveedor no devolvió la URL de autorización.',
        );
        return;
      }
      final opened = await launchUrl(
        Uri.parse(redirectUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        setState(() => _error = 'No fue posible abrir el proveedor de pagos.');
      } else if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Autoriza el aporte en la ventana del proveedor.'),
          ),
        );
      }
    } on OpenPaymentsException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Exception {
      if (mounted) {
        setState(
          () => _error = 'No fue posible iniciar el aporte. Intenta de nuevo.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final donorCode = _connection?.donorAssetCode ?? 'moneda de tu wallet';
    final fundCode = _fund?.assetCode ?? 'moneda del fondo';
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        8,
        24,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Aporta con Open Payments',
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text('El fondo recibirá los aportes en $fundCode.'),
            const SizedBox(height: 18),
            TextField(
              controller: _walletController,
              readOnly: true,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Wallet del donante',
                helperText: 'Wallet demo fija de donador@gmail.com',
                prefixIcon: Icon(Icons.account_balance_wallet_outlined),
              ),
              onSubmitted: (_) => _connectWallet(),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _loading ? null : _connectWallet,
              icon: const Icon(Icons.link_rounded),
              label: const Text('Validar wallet'),
            ),
            if (_connection != null) ...[
              const SizedBox(height: 10),
              Text(
                _connection!.sameAsset
                    ? 'Tu aporte se procesará en $donorCode.'
                    : 'Pagarás en $donorCode y el fondo recibirá $fundCode.',
                style: const TextStyle(color: Color(0xFF397B68)),
              ),
            ],
            const SizedBox(height: 14),
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Monto a aportar',
                suffixText: donorCode,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _loading ? null : _startDonation,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Continuar con el aporte'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD9E2DC)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _InfoMetric extends StatelessWidget {
  const _InfoMetric({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 180,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF397B68)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 2),
                Text(label, style: const TextStyle(color: Color(0xFF65708A))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
