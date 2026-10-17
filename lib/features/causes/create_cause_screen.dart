import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'causes_service.dart';

class CreateCauseScreen extends StatefulWidget {
  const CreateCauseScreen({super.key});

  static const routeName = '/causes/create';

  @override
  State<CreateCauseScreen> createState() => _CreateCauseScreenState();
}

class _CreateCauseScreenState extends State<CreateCauseScreen> {
  static const _categories = [
    'Educación',
    'Salud',
    'Ambiente',
    'Comunidades',
    'Animales',
    'Emergencias',
  ];

  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _organizationController = TextEditingController();
  final _locationController = TextEditingController();
  final _summaryController = TextEditingController();
  final _storyController = TextEditingController();
  final _fundsUseController = TextEditingController();
  final _goalController = TextEditingController();
  final _emailController = TextEditingController();
  final _service = CausesService();

  String? _category;
  DateTime? _endDate;
  bool _acceptedTerms = false;
  bool _isSubmitting = false;
  bool _showDateError = false;

  @override
  void dispose() {
    _titleController.dispose();
    _organizationController.dispose();
    _locationController.dispose();
    _summaryController.dispose();
    _storyController.dispose();
    _fundsUseController.dispose();
    _goalController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  String? _required(String? value, String message) {
    if (value == null || value.trim().isEmpty) return message;
    return null;
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  Future<void> _selectEndDate() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 30)),
      firstDate: now.add(const Duration(days: 1)),
      lastDate: DateTime(now.year + 2),
    );
    if (date != null) {
      setState(() {
        _endDate = date;
        _showDateError = false;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_endDate == null) {
      setState(() => _showDateError = true);
      return;
    }
    if (!_acceptedTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Debes confirmar que la información es verdadera'),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await _service.createCause(
        CauseDraft(
          title: _titleController.text.trim(),
          organization: _organizationController.text.trim(),
          category: _category!,
          location: _locationController.text.trim(),
          summary: _summaryController.text.trim(),
          story: _storyController.text.trim(),
          fundsUse: _fundsUseController.text.trim(),
          goal: int.parse(_goalController.text),
          endDate: _endDate!,
          contactEmail: _emailController.text.trim(),
        ),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(
            Icons.check_circle_rounded,
            color: Color(0xFF087F6D),
          ),
          title: const Text('Causa enviada'),
          content: const Text(
            'Revisaremos la información antes de publicar la causa.',
            textAlign: TextAlign.center,
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Entendido'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear una causa')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Convierte una necesidad en una causa que inspire',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: FontWeight.w900,
                              height: 1.2,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Completa la información con claridad. Todas las causas pasan por un proceso de verificación.',
                        style: TextStyle(color: Color(0xFF65708A), height: 1.5),
                      ),
                      const SizedBox(height: 28),
                      _Section(
                        title: 'Fundación responsable',
                        subtitle: 'Identifica quién lidera y responderá por la iniciativa.',
                        children: [
                          TextFormField(
                            controller: _organizationController,
                            textCapitalization: TextCapitalization.words,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Nombre de la fundación',
                              prefixIcon: Icon(Icons.apartment_rounded),
                            ),
                            validator: (value) => _required(
                              value,
                              'Ingresa el nombre de la fundación',
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Correo de contacto',
                              prefixIcon: Icon(Icons.email_outlined),
                            ),
                            validator: (value) {
                              final email = value?.trim() ?? '';
                              if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                  .hasMatch(email)) {
                                return 'Ingresa un correo válido';
                              }
                              return null;
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _Section(
                        title: 'Información de la causa',
                        subtitle:
                            'Explica qué quieres lograr y a quién beneficiará.',
                        children: [
                          TextFormField(
                            controller: _titleController,
                            textCapitalization: TextCapitalization.sentences,
                            textInputAction: TextInputAction.next,
                            maxLength: 70,
                            decoration: const InputDecoration(
                              labelText: 'Título de la causa',
                              hintText: 'Ej. Agua limpia para 120 familias',
                            ),
                            validator: (value) =>
                                _required(value, 'Escribe un título'),
                          ),
                          const SizedBox(height: 16),
                          DropdownButtonFormField<String>(
                            initialValue: _category,
                            decoration: const InputDecoration(
                              labelText: 'Categoría',
                              prefixIcon: Icon(Icons.category_outlined),
                            ),
                            items: _categories
                                .map(
                                  (category) => DropdownMenuItem(
                                    value: category,
                                    child: Text(category),
                                  ),
                                )
                                .toList(),
                            onChanged: (value) =>
                                setState(() => _category = value),
                            validator: (value) => value == null
                                ? 'Selecciona una categoría'
                                : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _locationController,
                            textCapitalization: TextCapitalization.words,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Ciudad o región',
                              prefixIcon: Icon(Icons.location_on_outlined),
                            ),
                            validator: (value) =>
                                _required(value, 'Indica la ubicación'),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _summaryController,
                            textCapitalization: TextCapitalization.sentences,
                            maxLines: 3,
                            maxLength: 180,
                            decoration: const InputDecoration(
                              labelText: 'Resumen',
                              hintText:
                                  'Describe brevemente el impacto esperado',
                              alignLabelWithHint: true,
                            ),
                            validator: (value) =>
                                _required(value, 'Escribe un resumen'),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _storyController,
                            textCapitalization: TextCapitalization.sentences,
                            maxLines: 6,
                            decoration: const InputDecoration(
                              labelText: 'Historia de la causa',
                              hintText: 'Cuenta el contexto, la necesidad y las personas beneficiadas',
                              alignLabelWithHint: true,
                            ),
                            validator: (value) => _required(
                              value,
                              'Cuenta la historia de la causa',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _Section(
                        title: 'Meta y transparencia',
                        subtitle: 'Detalla cuánto necesitas y cómo usarás los aportes.',
                        children: [
                          TextFormField(
                            controller: _goalController,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                            ],
                            decoration: const InputDecoration(
                              labelText: 'Meta de recaudación',
                              prefixText: '\$ ',
                              helperText: 'Valor en pesos colombianos',
                            ),
                            validator: (value) {
                              final goal = int.tryParse(value ?? '');
                              if (goal == null || goal < 100000) {
                                return 'La meta mínima es de \$100.000';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          InkWell(
                            onTap: _selectEndDate,
                            borderRadius: BorderRadius.circular(12),
                            child: InputDecorator(
                              decoration: InputDecoration(
                                labelText: 'Fecha límite',
                                prefixIcon: const Icon(Icons.event_outlined),
                                errorText: _showDateError
                                    ? 'Selecciona una fecha'
                                    : null,
                              ),
                              child: Text(
                                _endDate == null
                                    ? 'Seleccionar fecha'
                                    : _formatDate(_endDate!),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _fundsUseController,
                            textCapitalization: TextCapitalization.sentences,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              labelText: 'Uso de los recursos',
                              hintText: 'Explica en qué se invertirá el dinero recaudado',
                              alignLabelWithHint: true,
                            ),
                            validator: (value) => _required(
                              value,
                              'Explica cómo se usarán los recursos',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _Section(
                        title: 'Contenido visual',
                        subtitle: 'Una imagen clara ayuda a contar mejor la historia.',
                        children: [
                          OutlinedButton.icon(
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'La carga de imágenes se conectará más adelante',
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(
                              Icons.add_photo_alternate_outlined,
                            ),
                            label: const Text('Agregar imagen de portada'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _acceptedTerms,
                        onChanged: (value) =>
                            setState(() => _acceptedTerms = value ?? false),
                        controlAffinity: ListTileControlAffinity.leading,
                        title: const Text(
                          'Confirmo que la información suministrada es verdadera y verificable.',
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _isSubmitting ? null : _submit,
                        icon: _isSubmitting
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.send_rounded),
                        label: Text(
                          _isSubmitting
                              ? 'Enviando...'
                              : 'Enviar para revisión',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE6EAF2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: Color(0xFF65708A))),
          const SizedBox(height: 20),
          ...children,
        ],
      ),
    );
  }
}
