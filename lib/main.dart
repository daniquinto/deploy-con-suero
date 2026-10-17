import 'package:flutter/material.dart';

import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/causes/causes_screen.dart';
import 'features/causes/create_cause_screen.dart';
import 'features/donations/my_donations_screen.dart';
import 'features/landing/landing_screen.dart';
import 'features/profile/profile_screen.dart';

void main() {
  runApp(const App());
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF3759C7);

    return MaterialApp(
      title: 'Mi App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: primaryColor),
        scaffoldBackgroundColor: const Color(0xFFF7F8FC),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDDE1EC)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDDE1EC)),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      initialRoute: LandingScreen.routeName,
      routes: {
        LandingScreen.routeName: (_) => LandingScreen(),
        LoginScreen.routeName: (_) => const LoginScreen(),
        RegisterScreen.routeName: (_) => const RegisterScreen(),
        CausesScreen.routeName: (_) => const CausesScreen(),
        CreateCauseScreen.routeName: (_) => const CreateCauseScreen(),
        MyDonationsScreen.routeName: (_) => const MyDonationsScreen(),
        ProfileScreen.routeName: (_) => const ProfileScreen(),
      },
    );
  }
}
