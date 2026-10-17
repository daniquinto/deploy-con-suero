import 'package:flutter/material.dart';

import '../../core/widgets/app_drawer.dart';
import 'cause_detail_screen.dart';
import 'causes_service.dart';
import 'create_cause_screen.dart';
import 'widgets/cause_card.dart';

class MyCausesScreen extends StatelessWidget {
  const MyCausesScreen({super.key});

  static const routeName = '/my-causes';
  static const foundationName = 'Fundación Niñez con Futuro';

  List<Cause> get _causes => CausesService()
      .getCauses()
      .where((cause) => cause.organization == foundationName)
      .toList();

  void _openCause(BuildContext context, Cause cause) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CauseDetailScreen(cause: cause, canDonate: false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final causes = _causes;

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('Mis causas'),
        actions: [
          IconButton(
            onPressed: () {},
            tooltip: 'Notificaciones',
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Center(
                child: SizedBox(
                  width: double.infinity,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 980),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _FoundationHeader(causes: causes),
                        const SizedBox(height: 28),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Tus causas',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(fontWeight: FontWeight.w900),
                                  ),
                                  const SizedBox(height: 6),
                                  const Text(
                                    'Administra tus campañas y comparte su impacto con la comunidad.',
                                    style: TextStyle(color: Color(0xFF65708A)),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            FilledButton.icon(
                              onPressed: () => Navigator.pushNamed(
                                context,
                                CreateCauseScreen.routeName,
                              ),
                              style: FilledButton.styleFrom(
                                minimumSize: const Size(0, 48),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                ),
                              ),
                              icon: const Icon(Icons.add_rounded),
                              label: const Text('Nueva causa'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
            sliver: SliverLayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.crossAxisExtent >= 1200 ? 4 : 2;
                return SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    mainAxisExtent: constraints.crossAxisExtent < 600
                        ? 290
                        : 360,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) => CauseCard(
                      cause: causes[index],
                      onTap: () => _openCause(context, causes[index]),
                    ),
                    childCount: causes.length,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FoundationHeader extends StatelessWidget {
  const _FoundationHeader({required this.causes});

  final List<Cause> causes;

  @override
  Widget build(BuildContext context) {
    final raised = causes.fold<int>(0, (total, cause) => total + cause.raised);
    final donors = causes.fold<int>(0, (total, cause) => total + cause.donors);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF174F42), Color(0xFF397B68)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PANEL DE FUNDACIÓN',
            style: TextStyle(
              color: Color(0xFFE9A46F),
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            MyCausesScreen.foundationName,
            style: TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Conecta tus iniciativas con personas que quieren ayudar.',
            style: TextStyle(color: Colors.white70, height: 1.4),
          ),
          const SizedBox(height: 22),
          Wrap(
            spacing: 24,
            runSpacing: 14,
            children: [
              _FoundationMetric(
                value: '${causes.length}',
                label: 'causas activas',
              ),
              _FoundationMetric(value: _money(raised), label: 'recaudado'),
              _FoundationMetric(value: '$donors', label: 'donantes'),
            ],
          ),
        ],
      ),
    );
  }

  String _money(int value) => '\$${(value / 1000000).toStringAsFixed(1)} M';
}

class _FoundationMetric extends StatelessWidget {
  const _FoundationMetric({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        Text(label, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }
}
