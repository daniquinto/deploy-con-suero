import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  static const routeName = '/register';

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  static const _documentTypes = [
    'Cédula de ciudadanía',
    'Cédula de extranjería',
    'Pasaporte',
  ];
  static const _genders = [
    'Femenino',
    'Masculino',
    'Otro',
    'Prefiero no decirlo',
  ];

  final _formKey = GlobalKey<FormState>();
  final _namesController = TextEditingController();
  final _lastNamesController = TextEditingController();
  final _documentController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _authService = AuthService();

  String? _documentType;
  String? _gender;
  bool _isLoading = false;
  bool _hidePassword = true;

  @override
  void dispose() {
    _namesController.dispose();
    _lastNamesController.dispose();
    _documentController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  String? _required(String? value, String field) {
    if (value == null || value.trim().isEmpty) return 'Ingresa $field';
    return null;
  }

  String? _validateEmail(String? value) {
    final requiredMessage = _required(value, 'tu correo electrónico');
    if (requiredMessage != null) return requiredMessage;
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value!.trim())) {
      return 'Ingresa un correo electrónico válido';
    }
    return null;
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    try {
      await _authService.register(
        names: _namesController.text.trim(),
        lastNames: _lastNamesController.text.trim(),
        documentType: _documentType!,
        document: _documentController.text.trim(),
        gender: _gender!,
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cuenta creada. Ya puedes iniciar sesión.'),
        ),
      );
      Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No fue posible crear la cuenta')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Datos personales',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    const Text('Completa la información para crear tu cuenta.'),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _namesController,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.givenName],
                      decoration: const InputDecoration(
                        labelText: 'Nombres',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (value) => _required(value, 'tus nombres'),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _lastNamesController,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.familyName],
                      decoration: const InputDecoration(
                        labelText: 'Apellidos',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (value) => _required(value, 'tus apellidos'),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: _documentType,
                      decoration: const InputDecoration(
                        labelText: 'Tipo de documento',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                      items: _documentTypes
                          .map(
                            (type) => DropdownMenuItem(
                              value: type,
                              child: Text(type),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _documentType = value),
                      validator: (value) => value == null
                          ? 'Selecciona el tipo de documento'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _documentController,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(
                        labelText: 'Número de documento',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      validator: (value) => _required(value, 'tu documento'),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: _gender,
                      decoration: const InputDecoration(
                        labelText: 'Género',
                        prefixIcon: Icon(Icons.people_outline),
                      ),
                      items: _genders
                          .map(
                            (gender) => DropdownMenuItem(
                              value: gender,
                              child: Text(gender),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => setState(() => _gender = value),
                      validator: (value) =>
                          value == null ? 'Selecciona tu género' : null,
                    ),
                    const SizedBox(height: 16),
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
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.newPassword],
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
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Crea una contraseña';
                        }
                        if (value.length < 8) {
                          return 'Usa al menos 8 caracteres';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _confirmPasswordController,
                      obscureText: _hidePassword,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _register(),
                      decoration: const InputDecoration(
                        labelText: 'Confirmar contraseña',
                        prefixIcon: Icon(Icons.lock_outline),
                      ),
                      validator: (value) => value != _passwordController.text
                          ? 'Las contraseñas no coinciden'
                          : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _isLoading ? null : _register,
                      child: _isLoading
                          ? const SizedBox.square(
                              dimension: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Crear cuenta'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _isLoading
                          ? null
                          : () => Navigator.pop(context),
                      child: const Text('Ya tengo una cuenta'),
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
