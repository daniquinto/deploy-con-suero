import 'package:flutter/material.dart';

import '../auth/login_screen.dart';
import '../auth/register_screen.dart';
import '../causes/cause_detail_screen.dart';
import '../causes/causes_screen.dart';
import '../causes/causes_service.dart';
import '../causes/create_cause_screen.dart';
import '../causes/widgets/cause_card.dart';
import '../../core/theme/app_theme.dart';

class LandingScreen extends StatelessWidget {
  LandingScreen({super.key});

  static const routeName = '/';

  final List<Cause> _causes = CausesService().getCauses();

  void _openCause(BuildContext context, Cause cause) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CauseDetailScreen(cause: cause)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header()),
            SliverToBoxAdapter(child: _Hero()),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 56, 24, 22),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1180),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Ayudas que necesitan de ti',
                                style: Theme.of(context).textTheme.headlineSmall
                                    ?.copyWith(fontWeight: FontWeight.w900),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Conoce su historia, revisa su progreso y elige dónde generar impacto.',
                                style: TextStyle(
                                  color: Color(0xFF65708A),
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pushNamed(
                            context,
                            CausesScreen.routeName,
                          ),
                          child: const Text('Ver todas'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 64),
              sliver: SliverLayoutBuilder(
                builder: (context, constraints) {
                  final columns = constraints.crossAxisExtent >= 1200
                      ? 4
                      : constraints.crossAxisExtent >= 720
                      ? 3
                      : 2;
                  return SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      mainAxisSpacing: 16,
                      crossAxisSpacing: 16,
                      mainAxisExtent: constraints.crossAxisExtent < 720
                          ? 290
                          : 360,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => CauseCard(
                        cause: _causes[index],
                        onTap: () => _openCause(context, _causes[index]),
                      ),
                      childCount: _causes.length,
                    ),
                  );
                },
              ),
            ),
            const SliverToBoxAdapter(child: _CreateCauseCallout()),
            const SliverToBoxAdapter(child: _TrustSection()),
          ],
        ),
      ),
    );
  }
}

class _CreateCauseCallout extends StatelessWidget {
  const _CreateCauseCallout();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 48),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            children: [
              Text(
                '¿Representas una fundación?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              const Text(
                'Presenta una iniciativa y conecta con personas dispuestas a ayudar.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF65708A)),
              ),
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: () =>
                    Navigator.pushNamed(context, CreateCauseScreen.routeName),
                icon: const Icon(Icons.add_circle_outline_rounded),
                label: const Text('Crear una causa'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1180),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 520;
              return Row(
                children: [
                  Icon(
                    Icons.volunteer_activism_rounded,
                    color: Theme.of(context).colorScheme.primary,
                    size: 30,
                  ),
                  if (!compact) ...[
                    const SizedBox(width: 8),
                    Text(
                      'Mano Abierta',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ],
                  const Spacer(),
                  TextButton(
                    onPressed: () =>
                        Navigator.pushNamed(context, LoginScreen.routeName),
                    child: Text(compact ? 'Ingresar' : 'Iniciar sesión'),
                  ),
                  const SizedBox(width: 4),
                  FilledButton(
                    onPressed: () =>
                        Navigator.pushNamed(context, RegisterScreen.routeName),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 44),
                      padding: EdgeInsets.symmetric(
                        horizontal: compact ? 12 : 16,
                      ),
                    ),
                    child: Text(compact ? 'Registro' : 'Regístrate'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.forest, AppColors.transparentGreen],
        ),
      ),
      child: Stack(
        children: [
          const Positioned(
            right: -100,
            top: -150,
            child: _DecorativeCircle(size: 420, opacity: 0.06),
          ),
          const Positioned(
            left: -160,
            bottom: -240,
            child: _DecorativeCircle(size: 480, opacity: 0.04),
          ),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 72,
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final wide = constraints.maxWidth >= 760;
                    final message = _HeroMessage();
                    final impact = const _ImpactVisual();

                    if (!wide) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [message, const SizedBox(height: 48), impact],
                      );
                    }

                    return Row(
                      children: [
                        Expanded(flex: 3, child: message),
                        const SizedBox(width: 64),
                        const Expanded(flex: 2, child: _ImpactVisual()),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroMessage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'MANO ABIERTA, CORAZÓN ABIERTO',
          style: TextStyle(
            color: AppColors.peach,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.5,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Cuando ayudar importa, cada segundo cuenta',
          style: Theme.of(context).textTheme.displaySmall?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w900,
            height: 1.18,
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Ayudar debería ser fácil. Confiar debería serlo también. Conectamos personas solidarias con causas verificadas para convertir cada aporte en oportunidades reales.',
          style: TextStyle(color: Colors.white70, fontSize: 17, height: 1.5),
        ),
      ],
    );
  }
}

class _ImpactVisual extends StatelessWidget {
  const _ImpactVisual();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Impacto de la comunidad',
      child: Column(
        children: [
          const Wrap(
            spacing: 30,
            runSpacing: 18,
            alignment: WrapAlignment.center,
            children: [
              _ImpactNumber(value: '10', label: 'causas activas'),
              _ImpactNumber(value: '3', label: 'fundaciones'),
            ],
          ),
        ],
      ),
    );
  }
}

class _ImpactNumber extends StatelessWidget {
  const _ImpactNumber({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        Text(label, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }
}

class _DecorativeCircle extends StatelessWidget {
  const _DecorativeCircle({required this.size, required this.opacity});

  final double size;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: opacity),
      ),
    );
  }
}

class _TrustSection extends StatelessWidget {
  const _TrustSection();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.paleGreen,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      child: const Center(
        child: Wrap(
          spacing: 40,
          runSpacing: 20,
          alignment: WrapAlignment.center,
          children: [
            _TrustItem(
              icon: Icons.verified_user_outlined,
              text: 'Fundaciones verificadas',
            ),
            _TrustItem(
              icon: Icons.visibility_outlined,
              text: 'Aportes transparentes',
            ),
            _TrustItem(
              icon: Icons.insights_outlined,
              text: 'Impacto que puedes seguir',
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustItem extends StatelessWidget {
  const _TrustItem({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: AppColors.transparentGreen),
        const SizedBox(width: 8),
        Text(text, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    );
  }
}
