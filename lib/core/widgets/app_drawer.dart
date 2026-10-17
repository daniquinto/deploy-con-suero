import 'package:flutter/material.dart';

import '../../features/auth/login_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../theme/app_theme.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key, this.profileSelected = false});

  final bool profileSelected;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.ivory,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              child: Row(
                children: [
                  const Icon(
                    Icons.volunteer_activism_rounded,
                    color: AppColors.forest,
                    size: 32,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Mano Abierta',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w900),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            ListTile(
              selected: profileSelected,
              selectedTileColor: AppColors.paleGreen,
              leading: const Icon(Icons.person_outline_rounded),
              title: const Text('Perfil'),
              onTap: () {
                Navigator.pop(context);
                if (!profileSelected) {
                  Navigator.pushReplacementNamed(
                    context,
                    ProfileScreen.routeName,
                  );
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout_rounded),
              title: const Text('Cerrar sesión'),
              onTap: () {
                final navigator = Navigator.of(context);
                Navigator.pop(context);
                navigator.pushNamedAndRemoveUntil(
                  LoginScreen.routeName,
                  (route) => false,
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
