import 'package:flutter/material.dart';

import '../causes/causes_screen.dart';
import '../../core/widgets/app_drawer.dart';
import 'donations_service.dart';

class MyDonationsScreen extends StatefulWidget {
  const MyDonationsScreen({super.key});

  static const routeName = '/donations';

  @override
  State<MyDonationsScreen> createState() => _MyDonationsScreenState();
}

class _MyDonationsScreenState extends State<MyDonationsScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _donations = DonationsService().getMyDonations();
  String _filter = 'Todas';

  List<Donation> get _visibleDonations {
    if (_filter == 'Completadas') {
      return _donations
          .where((donation) => donation.status == DonationStatus.completed)
          .toList();
    }
    if (_filter == 'En proceso') {
      return _donations
          .where((donation) => donation.status == DonationStatus.processing)
          .toList();
    }
    return _donations;
  }

  int get _totalDonated => _donations
      .where((donation) => donation.status == DonationStatus.completed)
      .fold(0, (total, donation) => total + donation.amount);

  String _money(int value) {
    return '\$${value.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Mis donaciones')),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 900),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Summary(
                        total: _money(_totalDonated),
                        donations: _donations.length,
                        foundations: _donations
                            .map((donation) => donation.organization)
                            .toSet()
                            .length,
                      ),
                      const SizedBox(height: 28),
                      Text(
                        'Historial de aportes',
                        style: Theme.of(context).textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Consulta el estado y el impacto de cada donación.',
                        style: TextStyle(color: Color(0xFF65708A)),
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        children: ['Todas', 'Completadas', 'En proceso']
                            .map(
                              (filter) => ChoiceChip(
                                label: Text(filter),
                                selected: _filter == filter,
                                onSelected: (_) =>
                                    setState(() => _filter = filter),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            sliver: SliverList.separated(
              itemCount: _visibleDonations.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final donation = _visibleDonations[index];
                return Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 900),
                    child: _DonationCard(donation: donation),
                  ),
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 1,
        onDestinationSelected: (index) {
          if (index == 0) {
            Navigator.pushReplacementNamed(context, CausesScreen.routeName);
          } else if (index == 2) {
            _scaffoldKey.currentState?.openDrawer();
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            label: 'Explorar',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border_rounded),
            selectedIcon: Icon(Icons.favorite_rounded),
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

class _Summary extends StatelessWidget {
  const _Summary({
    required this.total,
    required this.donations,
    required this.foundations,
  });

  final String total;
  final int donations;
  final int foundations;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0xFF174F42), Color(0xFF397B68)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'TU IMPACTO',
            style: TextStyle(
              color: Color(0xFFE9A46F),
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            total,
            style: Theme.of(context).textTheme.headlineLarge
                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          const Text(
            'donados hasta hoy',
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 22),
          Wrap(
            spacing: 28,
            runSpacing: 12,
            children: [
              _SummaryItem(value: '$donations', label: 'aportes'),
              _SummaryItem(value: '$foundations', label: 'fundaciones'),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }
}

class _DonationCard extends StatelessWidget {
  const _DonationCard({required this.donation});

  final Donation donation;

  String _money(int value) =>
      '\$${value.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.')}';

  String _date(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year}';

  @override
  Widget build(BuildContext context) {
    final completed = donation.status == DonationStatus.completed;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE6EAF2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF7F4),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(
                  Icons.volunteer_activism_rounded,
                  color: Color(0xFF087F6D),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      donation.causeTitle,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      donation.organization,
                      style: const TextStyle(color: Color(0xFF65708A)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _money(donation.amount),
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
          Wrap(
            spacing: 14,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _Metadata(icon: Icons.event_outlined, text: _date(donation.date)),
              _Metadata(
                icon: Icons.receipt_long_outlined,
                text: donation.transactionId,
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: completed
                      ? const Color(0xFFEAF7F4)
                      : const Color(0xFFFFF4D8),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  completed ? 'Completada' : 'En proceso',
                  style: TextStyle(
                    color: completed
                        ? const Color(0xFF087F6D)
                        : const Color(0xFF8A6100),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (donation.impactUpdate != null) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF4F7FC),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.auto_awesome_outlined,
                    size: 20,
                    color: Color(0xFF3759C7),
                  ),
                  const SizedBox(width: 9),
                  Expanded(child: Text(donation.impactUpdate!)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Metadata extends StatelessWidget {
  const _Metadata({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: const Color(0xFF65708A)),
        const SizedBox(width: 5),
        Text(text, style: const TextStyle(color: Color(0xFF65708A))),
      ],
    );
  }
}
