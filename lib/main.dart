import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/widgets/app_feedback.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/causes/causes_screen.dart';
import 'features/causes/create_cause_screen.dart';
import 'features/causes/my_causes_screen.dart';
import 'features/donations/my_donations_screen.dart';
import 'features/donations/donation_status_screen.dart';
import 'features/landing/landing_screen.dart';
import 'features/profile/profile_screen.dart';

void main() {
  runApp(const App());
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mano Abierta',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: appScaffoldMessengerKey,
      theme: AppTheme.light,
      routes: {
        LandingScreen.routeName: (_) => LandingScreen(),
        LoginScreen.routeName: (_) => const LoginScreen(),
        RegisterScreen.routeName: (_) => const RegisterScreen(),
        CausesScreen.routeName: (_) => const CausesScreen(),
        CreateCauseScreen.routeName: (_) => const CreateCauseScreen(),
        MyCausesScreen.routeName: (_) => const MyCausesScreen(),
        MyDonationsScreen.routeName: (_) => const MyDonationsScreen(),
        ProfileScreen.routeName: (_) => const ProfileScreen(),
      },
      onGenerateRoute: (settings) {
        final name = settings.name ?? '';
        const prefix = '/donacion/';
        if (name.startsWith(prefix)) {
          final donationId = name.substring(prefix.length).split('?').first;
          return MaterialPageRoute(
            builder: (_) => DonationStatusScreen(donationId: donationId),
            settings: settings,
          );
        }
        return null;
      },
    );
  }
}
