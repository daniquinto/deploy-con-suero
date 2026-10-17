import 'package:flutter/material.dart';

import '../auth/login_screen.dart';
import '../causes/causes_screen.dart';
import '../donations/my_donations_screen.dart';
import 'profile_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  static const routeName = '/profile';

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _service = ProfileService();
  late Future<UserProfile> _profile;
  bool _impactNotifications = true;

  @override
  void initState() {
    super.initState();
    _profile = _service.getProfile();
  }

  String _memberSince(DateTime date) {
    const months = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    return '${months[date.month - 1]} de ${date.year}';
  }

  Future<void> _editProfile(UserProfile profile) async {
    final formKey = GlobalKey<FormState>();
    final names = TextEditingController(text: profile.names);
    final lastNames = TextEditingController(text: profile.lastNames);
    final email = TextEditingController(text: profile.email);

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          4,
          24,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Editar información',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: names,
                decoration: const InputDecoration(labelText: 'Nombres'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Ingresa tus nombres'
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: lastNames,
                decoration: const InputDecoration(labelText: 'Apellidos'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Ingresa tus apellidos'
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Correo electrónico',
                ),
                validator: (value) => value != null && value.contains('@')
                    ? null
                    : 'Ingresa un correo válido',
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () async {
                  if (!formKey.currentState!.validate()) return;
                  await _service.updateProfile(
                    names: names.text.trim(),
                    lastNames: lastNames.text.trim(),
                    email: email.text.trim(),
                  );
                  if (context.mounted) Navigator.pop(context, true);
                },
                child: const Text('Guardar cambios'),
              ),
            ],
          ),
        ),
      ),
    );

    names.dispose();
    lastNames.dispose();
    email.dispose();
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Perfil actualizado')));
    }
  }

  void _logout() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      LoginScreen.routeName,
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: FutureBuilder<UserProfile>(
        future: _profile,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final profile = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 760),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ProfileHeader(
                        profile: profile,
                        memberSince: _memberSince(profile.memberSince),
                        onEdit: () => _editProfile(profile),
                      ),
                      const SizedBox(height: 18),
                      const _ImpactCard(),
                      const SizedBox(height: 18),
                      _Section(
                        title: 'Información personal',
                        children: [
                          _ProfileRow(
                            icon: Icons.email_outlined,
                            label: 'Correo',
                            value: profile.email,
                          ),
                          _ProfileRow(
                            icon: Icons.badge_outlined,
                            label: profile.documentType,
                            value: profile.document,
                          ),
                          _ProfileRow(
                            icon: Icons.person_outline_rounded,
                            label: 'Género',
                            value: profile.gender,
                            showDivider: false,
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _Section(
                        title: 'Preferencias',
                        children: [
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            secondary: const Icon(Icons.notifications_outlined),
                            title: const Text('Actualizaciones de impacto'),
                            subtitle: const Text(
                              'Recibe noticias de las causas que apoyaste',
                            ),
                            value: _impactNotifications,
                            onChanged: (value) {
                              setState(() => _impactNotifications = value);
                            },
                          ),
                          const Divider(height: 1),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.lock_outline_rounded),
                            title: const Text('Cambiar contraseña'),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: () {},
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      OutlinedButton.icon(
                        onPressed: _logout,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Theme.of(context).colorScheme.error,
                          side: BorderSide(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('Cerrar sesión'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 2,
        onDestinationSelected: (index) {
          if (index == 0) {
            Navigator.pushReplacementNamed(context, CausesScreen.routeName);
          } else if (index == 1) {
            Navigator.pushReplacementNamed(
              context,
              MyDonationsScreen.routeName,
            );
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            label: 'Explorar',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border_rounded),
            label: 'Mis apoyos',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({
    required this.profile,
    required this.memberSince,
    required this.onEdit,
  });

  final UserProfile profile;
  final String memberSince;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CircleAvatar(
          radius: 46,
          backgroundColor: const Color(0xFFDBE5FF),
          child: Text(
            profile.initials,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: const Color(0xFF2749B5),
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          profile.fullName,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 4),
        Text(
          'Donador desde $memberSince',
          style: const TextStyle(color: Color(0xFF65708A)),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: onEdit,
          icon: const Icon(Icons.edit_outlined),
          label: const Text('Editar perfil'),
        ),
      ],
    );
  }
}

class _ImpactCard extends StatelessWidget {
  const _ImpactCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF7F4),
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Row(
        children: [
          Icon(Icons.auto_awesome_rounded, color: Color(0xFF087F6D), size: 32),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Tu solidaridad está generando impacto',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 4),
                Text('Has apoyado 4 causas de 4 fundaciones.'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0xFFE6EAF2)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.value,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon),
          title: Text(label),
          subtitle: Text(value),
        ),
        if (showDivider) const Divider(height: 1),
      ],
    );
  }
}
