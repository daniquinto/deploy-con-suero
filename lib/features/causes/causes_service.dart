import 'package:flutter/material.dart';

class Cause {
  const Cause({
    required this.title,
    required this.organization,
    required this.category,
    required this.location,
    required this.description,
    required this.raised,
    required this.goal,
    required this.donors,
    required this.icon,
    required this.colors,
    this.isVerified = true,
  });

  final String title;
  final String organization;
  final String category;
  final String location;
  final String description;
  final int raised;
  final int goal;
  final int donors;
  final IconData icon;
  final List<Color> colors;
  final bool isVerified;

  double get progress => (raised / goal).clamp(0, 1);
}

class CausesService {
  Future<void> createCause(CauseDraft draft) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
  }

  List<Cause> getCauses() => const [
    Cause(
      title: 'Agua limpia para La Guajira',
      organization: 'Fundación Agua y Vida',
      category: 'Comunidades',
      location: 'Uribia, La Guajira',
      description: 'Construiremos sistemas de almacenamiento y filtración de agua para 120 familias de comunidades rurales.',
      raised: 38450000,
      goal: 50000000,
      donors: 428,
      icon: Icons.water_drop_rounded,
      colors: [Color(0xFF0D47A1), Color(0xFF0097A7)],
    ),
    Cause(
      title: 'Una biblioteca para soñar',
      organization: 'Leer Nos Une',
      category: 'Educación',
      location: 'Buenaventura, Valle',
      description: 'Un espacio seguro con libros, tecnología y acompañamiento escolar para más de 300 niños y jóvenes.',
      raised: 18200000,
      goal: 30000000,
      donors: 216,
      icon: Icons.auto_stories_rounded,
      colors: [Color(0xFF4527A0), Color(0xFF7E57C2)],
    ),
    Cause(
      title: 'Bosques que vuelven a respirar',
      organization: 'Raíces Colombia',
      category: 'Ambiente',
      location: 'Sierra Nevada de Santa Marta',
      description: 'Restauraremos 20 hectáreas con especies nativas y trabajo remunerado para familias de la región.',
      raised: 24750000,
      goal: 45000000,
      donors: 301,
      icon: Icons.forest_rounded,
      colors: [Color(0xFF1B5E20), Color(0xFF43A047)],
    ),
    Cause(
      title: 'Atención médica sin fronteras',
      organization: 'Salud Cerca de Ti',
      category: 'Salud',
      location: 'Pacífico colombiano',
      description: 'Llevaremos brigadas médicas, medicamentos y atención preventiva a comunidades de difícil acceso.',
      raised: 12600000,
      goal: 40000000,
      donors: 173,
      icon: Icons.health_and_safety_rounded,
      colors: [Color(0xFFB71C1C), Color(0xFFEF5350)],
    ),
  ];
}

class CauseDraft {
  const CauseDraft({
    required this.title,
    required this.organization,
    required this.category,
    required this.location,
    required this.summary,
    required this.story,
    required this.fundsUse,
    required this.goal,
    required this.endDate,
    required this.contactEmail,
  });

  final String title;
  final String organization;
  final String category;
  final String location;
  final String summary;
  final String story;
  final String fundsUse;
  final int goal;
  final DateTime endDate;
  final String contactEmail;
}
