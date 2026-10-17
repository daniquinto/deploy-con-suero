import 'package:flutter/material.dart';

import 'causes_service.dart';

class CauseDetailScreen extends StatelessWidget {
  const CauseDetailScreen({super.key, required this.cause});

  final Cause cause;

  String _money(int value) {
    final text = value.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => '.',
    );
    return '\$$text';
  }

  void _showDonationSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          8,
          24,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Elige tu aporte',
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            const Text('Cada aporte nos acerca a la meta.'),
            const SizedBox(height: 20),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [25000, 50000, 100000, 200000]
                  .map(
                    (amount) => ActionChip(
                      label: Text(_money(amount)),
                      onPressed: () {},
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 16),
            const TextField(
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Otro valor',
                prefixText: '\$ ',
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
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
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            actions: [
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
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: cause.colors,
                  ),
                ),
                child: Stack(
                  children: [
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
      bottomSheet: SafeArea(
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
      ),
    );
  }
}
