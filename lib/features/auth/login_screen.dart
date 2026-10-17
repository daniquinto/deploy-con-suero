import 'package:flutter/material.dart';

import '../causes/cause_detail_screen.dart';
import '../causes/causes_service.dart';
import '../causes/causes_screen.dart';
import '../causes/create_cause_screen.dart';
import '../donations/my_donations_screen.dart';
import '../profile/profile_screen.dart';
import 'auth_service.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  static const routeName = '/login';

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _authService = AuthService();

  bool _isLoading = false;
  bool _hidePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String? _validateEmail(String? value) {
    final email = value?.trim() ?? '';
    if (email.isEmpty) return 'Ingresa tu correo electrónico';
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      return 'Ingresa un correo electrónico válido';
    }
    return null;
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    try {
      await _authService.login(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      Navigator.pushNamedAndRemoveUntil(
        context,
        CausesScreen.routeName,
        (route) => false,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No fue posible iniciar sesión')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(
                      Icons.lock_person_rounded,
                      size: 64,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Bienvenido',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Ingresa tus datos para continuar',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge
                          ?.copyWith(color: Colors.black54),
                    ),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Correo electrónico',
                        prefixIcon: Icon(Icons.email_outlined),
                      ),
                      validator: _validateEmail,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _hidePassword,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _login(),
                      decoration: InputDecoration(
                        labelText: 'Contraseña',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _hidePassword
                              ? 'Mostrar contraseña'
                              : 'Ocultar contraseña',
                          onPressed: () =>
                              setState(() => _hidePassword = !_hidePassword),
                          icon: Icon(
                            _hidePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (value) => value == null || value.isEmpty
                          ? 'Ingresa tu contraseña'
                          : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _isLoading ? null : _login,
                      child: _isLoading
                          ? const SizedBox.square(
                              dimension: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Iniciar sesión'),
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text('¿No tienes una cuenta?'),
                        TextButton(
                          onPressed: () => Navigator.pushNamed(
                            context,
                            RegisterScreen.routeName,
                          ),
                          child: const Text('Regístrate'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Row(
                      children: [
                        Expanded(child: Divider()),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            'Vista previa temporal',
                            style: TextStyle(color: Colors.black54),
                          ),
                        ),
                        Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pushNamed(
                        context,
                        CausesScreen.routeName,
                      ),
                      icon: const Icon(Icons.explore_outlined),
                      label: const Text('Ver catálogo de causas'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () {
                        final cause = CausesService().getCauses().first;
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => CauseDetailScreen(cause: cause),
                          ),
                        );
                      },
                      icon: const Icon(Icons.article_outlined),
                      label: const Text('Ver detalle de una causa'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pushNamed(
                        context,
                        CreateCauseScreen.routeName,
                      ),
                      icon: const Icon(Icons.add_circle_outline_rounded),
                      label: const Text('Ver formulario para crear causa'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pushNamed(
                        context,
                        MyDonationsScreen.routeName,
                      ),
                      icon: const Icon(Icons.favorite_border_rounded),
                      label: const Text('Ver mis donaciones'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pushNamed(
                        context,
                        ProfileScreen.routeName,
                      ),
                      icon: const Icon(Icons.person_outline_rounded),
                      label: const Text('Ver mi perfil'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
