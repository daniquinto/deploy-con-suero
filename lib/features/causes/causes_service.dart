import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class Cause {
  const Cause({
    required this.title,
    required this.organization,
    required this.category,
    required this.location,
    required this.description,
    required this.imageUrl,
    required this.raised,
    required this.goal,
    required this.donors,
    required this.icon,
    required this.colors,
    this.beneficiaries = 0,
    this.fundsUse = const [],
    this.updates = const [],
    this.deadline = '31/12/2026',
    this.isVerified = true,
  });

  final String title;
  final String organization;
  final String category;
  final String location;
  final String description;
  final String imageUrl;
  final int raised;
  final int goal;
  final int donors;
  final IconData icon;
  final List<Color> colors;
  final int beneficiaries;
  final List<String> fundsUse;
  final List<String> updates;
  final String deadline;
  final bool isVerified;

  double get progress => (raised / goal).clamp(0, 1);
}

class CausesService {
  Future<void> createCause(CauseDraft draft) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
  }

  static const allCauses = <Cause>[
    Cause(
      title: 'Agua limpia para La Guajira',
      imageUrl: 'https://images.unsplash.com/photo-1504159506876-f8338247a14a?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Agua y Vida',
      category: 'Comunidades',
      location: 'Uribia, La Guajira',
      description: 'Construiremos sistemas de almacenamiento y filtración de agua para 120 familias de comunidades rurales.',
      raised: 38450000,
      goal: 50000000,
      donors: 428,
      icon: Icons.water_drop_rounded,
      colors: [AppColors.forest, AppColors.transparentGreen],
    ),
    Cause(
      title: 'Una biblioteca para soñar',
      imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Niñez con Futuro',
      category: 'Educación',
      location: 'Buenaventura, Valle',
      description: 'Crearemos un espacio seguro con libros, tecnología y acompañamiento escolar para más de 300 niños y jóvenes.',
      raised: 18200000,
      goal: 30000000,
      donors: 216,
      icon: Icons.auto_stories_rounded,
      colors: [Color(0xFF245D4D), AppColors.peach],
    ),
    Cause(
      title: 'Bosques que vuelven a respirar',
      imageUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
      organization: 'Red Solidaria Colombia',
      category: 'Ambiente',
      location: 'Sierra Nevada de Santa Marta',
      description: 'Restauraremos 20 hectáreas con especies nativas y trabajo remunerado para familias de la región.',
      raised: 24750000,
      goal: 45000000,
      donors: 301,
      icon: Icons.forest_rounded,
      colors: [Color(0xFF235D3F), AppColors.transparentGreen],
    ),
    Cause(
      title: 'Atención médica sin fronteras',
      imageUrl: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Agua y Vida',
      category: 'Salud',
      location: 'Pacífico colombiano',
      description: 'Llevaremos brigadas médicas, medicamentos y atención preventiva a comunidades de difícil acceso.',
      raised: 12600000,
      goal: 40000000,
      donors: 173,
      icon: Icons.health_and_safety_rounded,
      colors: [AppColors.forest, AppColors.peach],
    ),
    Cause(
      title: 'Refugio para familias después de la inundación',
      imageUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
      organization: 'Red Solidaria Colombia',
      category: 'Comunidades',
      location: 'Santa Cruz de Mompox, Bolívar',
      description: 'Entregaremos kits de emergencia, alimentos y soluciones temporales de vivienda a familias afectadas.',
      raised: 21900000,
      goal: 35000000,
      donors: 287,
      icon: Icons.house_siding_rounded,
      colors: [AppColors.transparentGreen, AppColors.peach],
    ),
    Cause(
      title: 'Alimentación para crecer',
      imageUrl: 'https://images.unsplash.com/photo-1602030028438-4cf153cbae9e?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Niñez con Futuro',
      category: 'Comunidades',
      location: 'Soacha, Cundinamarca',
      description: 'Aseguraremos complementos alimentarios para 180 niños durante el año escolar.',
      raised: 15800000,
      goal: 28000000,
      donors: 192,
      icon: Icons.restaurant_rounded,
      colors: [AppColors.forest, AppColors.peach],
    ),
    Cause(
      title: 'Reconstrucción de hogares',
      imageUrl: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=900&q=80',
      organization: 'Red Solidaria Colombia',
      category: 'Comunidades',
      location: 'Quibdó, Chocó',
      description: 'Repararemos viviendas afectadas por deslizamientos y devolveremos seguridad a 35 familias.',
      raised: 30200000,
      goal: 60000000,
      donors: 344,
      icon: Icons.home_work_rounded,
      colors: [AppColors.transparentGreen, AppColors.forest],
    ),
    Cause(
      title: 'Primera infancia segura',
      imageUrl: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Niñez con Futuro',
      category: 'Salud',
      location: 'Tumaco, Nariño',
      description: 'Fortaleceremos la atención integral y la protección de 90 niños en sus primeros años de vida.',
      raised: 19400000,
      goal: 32000000,
      donors: 229,
      icon: Icons.child_care_rounded,
      colors: [AppColors.peach, AppColors.transparentGreen],
    ),
    Cause(
      title: 'Kits escolares para volver a clases',
      imageUrl: 'https://images.unsplash.com/photo-1509099836639-18ba02c0c1a0?auto=format&fit=crop&w=900&q=80',
      organization: 'Fundación Agua y Vida',
      category: 'Educación',
      location: 'Cúcuta, Norte de Santander',
      description: 'Entregaremos útiles y uniformes a 250 estudiantes para que puedan continuar su formación.',
      raised: 9800000,
      goal: 18000000,
      donors: 156,
      icon: Icons.backpack_rounded,
      colors: [AppColors.forest, AppColors.peach],
    ),
    Cause(
      title: 'Manglares para proteger la costa',
      imageUrl: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=80',
      organization: 'Red Solidaria Colombia',
      category: 'Ambiente',
      location: 'Nuquí, Chocó',
      description: 'Restauraremos manglares junto a las comunidades para proteger la costa y recuperar la biodiversidad.',
      raised: 11600000,
      goal: 25000000,
      donors: 138,
      icon: Icons.eco_rounded,
      colors: [AppColors.transparentGreen, AppColors.forest],
    ),
  ];

  List<Cause> getCauses() => allCauses;
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
