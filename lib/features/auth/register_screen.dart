import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
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
  bool _isFoundation = false;
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
        documentType: _isFoundation ? 'NIT' : _documentType!,
        document: _documentController.text.trim(),
        gender: _isFoundation ? 'No aplica' : _gender!,
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
                    _AccountTypeSelector(
                      isFoundation: _isFoundation,
                      onChanged: (value) {
                        setState(() {
                          _isFoundation = value;
                          _documentType = null;
                          _gender = null;
                        });
                      },
                    ),
                    const SizedBox(height: 28),
                    Text(
                      _isFoundation
                          ? 'Datos de la fundación'
                          : 'Datos personales',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _isFoundation
                          ? 'Registra tu organización para recibir aportes con transparencia.'
                          : 'Completa la información para crear tu cuenta.',
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _namesController,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.givenName],
                      decoration: InputDecoration(
                        labelText: _isFoundation
                            ? 'Nombre de la fundación'
                            : 'Nombres',
                        prefixIcon: Icon(Icons.volunteer_activism_outlined),
                      ),
                      validator: (value) => _required(
                        value,
                        _isFoundation
                            ? 'el nombre de la fundación'
                            : 'tus nombres',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _lastNamesController,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.familyName],
                      decoration: InputDecoration(
                        labelText: _isFoundation
                            ? 'Persona responsable'
                            : 'Apellidos',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (value) => _required(
                        value,
                        _isFoundation
                            ? 'la persona responsable'
                            : 'tus apellidos',
                      ),
                    ),
                    if (!_isFoundation) ...[
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
                    ],
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _documentController,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(
                        labelText: _isFoundation
                            ? 'NIT'
                            : 'Número de documento',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      validator: (value) => _required(
                        value,
                        _isFoundation ? 'el NIT' : 'tu documento',
                      ),
                    ),
                    if (!_isFoundation) ...[
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
                    ],
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

class _AccountTypeSelector extends StatelessWidget {
  const _AccountTypeSelector({
    required this.isFoundation,
    required this.onChanged,
  });

  final bool isFoundation;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '¿Cómo quieres participar?',
          style: Theme.of(context).textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 6),
        const Text('Elige el tipo de cuenta que mejor describe tu propósito.'),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _AccountTypeCard(
                icon: Icons.favorite_outline_rounded,
                title: 'Soy donante',
                description: 'Quiero apoyar causas',
                selected: !isFoundation,
                onTap: () => onChanged(false),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _AccountTypeCard(
                icon: Icons.volunteer_activism_outlined,
                title: 'Soy fundación',
                description: 'Quiero recibir aportes',
                selected: isFoundation,
                onTap: () => onChanged(true),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _AccountTypeCard extends StatelessWidget {
  const _AccountTypeCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.paleGreen : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: selected ? AppColors.forest : AppColors.border,
          width: selected ? 2 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icon,
                color: selected ? AppColors.forest : AppColors.transparentGreen,
              ),
              const SizedBox(height: 10),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(
                description,
                style: const TextStyle(fontSize: 12, color: AppColors.charcoal),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
