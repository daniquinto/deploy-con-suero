import 'package:flutter/material.dart';

import '../donations/my_donations_screen.dart';
import '../profile/profile_screen.dart';
import 'cause_detail_screen.dart';
import 'causes_service.dart';
import 'widgets/cause_card.dart';

class CausesScreen extends StatefulWidget {
  const CausesScreen({super.key});

  static const routeName = '/causes';

  @override
  State<CausesScreen> createState() => _CausesScreenState();
}

class _CausesScreenState extends State<CausesScreen> {
  final _causes = CausesService().getCauses();
  String _selectedCategory = 'Todas';

  List<Cause> get _visibleCauses => _selectedCategory == 'Todas'
      ? _causes
      : _causes.where((cause) => cause.category == _selectedCategory).toList();

  void _openCause(Cause cause) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CauseDetailScreen(cause: cause)),
    );
  }

  @override
  Widget build(BuildContext context) {
    const categories = [
      'Todas',
      'Educación',
      'Salud',
      'Ambiente',
      'Comunidades',
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.volunteer_activism_rounded),
            SizedBox(width: 8),
            Text('Causas'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () {},
            tooltip: 'Notificaciones',
            icon: const Badge(
              smallSize: 7,
              child: Icon(Icons.notifications_none_rounded),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _HeroBanner(cause: _causes.first, onTap: _openCause),
                  const SizedBox(height: 28),
                  Text(
                    'Causas que transforman',
                    style: Theme.of(context).textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Descubre iniciativas verificadas y apoya la que más te inspire.',
                    style: TextStyle(color: Color(0xFF65708A), height: 1.4),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 42,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: categories.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final category = categories[index];
                        return ChoiceChip(
                          label: Text(category),
                          selected: category == _selectedCategory,
                          onSelected: (_) {
                            setState(() => _selectedCategory = category);
                          },
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 18),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
            sliver: SliverLayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.crossAxisExtent >= 900
                    ? 3
                    : constraints.crossAxisExtent >= 600
                    ? 2
                    : 1;
                return SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    mainAxisExtent: 360,
                  ),
                  delegate: SliverChildBuilderDelegate((context, index) {
                    final cause = _visibleCauses[index];
                    return CauseCard(
                      cause: cause,
                      onTap: () => _openCause(cause),
                    );
                  }, childCount: _visibleCauses.length),
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          if (index == 1) {
            Navigator.pushReplacementNamed(
              context,
              MyDonationsScreen.routeName,
            );
          } else if (index == 2) {
            Navigator.pushReplacementNamed(context, ProfileScreen.routeName);
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            selectedIcon: Icon(Icons.explore_rounded),
            label: 'Explorar',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border_rounded),
            label: 'Mis apoyos',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({required this.cause, required this.onTap});

  final Cause cause;
  final ValueChanged<Cause> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF142B6F), Color(0xFF167D91)],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x29142B6F),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -18,
            bottom: -25,
            child: Icon(cause.icon, size: 170, color: Colors.white10),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'CAUSA DESTACADA',
                style: TextStyle(
                  color: Color(0xFF9EE6E8),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: Text(
                  cause.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '${(cause.progress * 100).round()}% de la meta alcanzada',
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 18),
              FilledButton.tonal(
                onPressed: () => onTap(cause),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF142B6F),
                ),
                child: const Text('Conocer la causa'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
