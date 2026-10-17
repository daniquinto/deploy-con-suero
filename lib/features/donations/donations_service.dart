enum DonationStatus { completed, processing }

class Donation {
  const Donation({
    required this.causeTitle,
    required this.organization,
    required this.amount,
    required this.date,
    required this.transactionId,
    required this.status,
    required this.category,
    this.impactUpdate,
  });

  final String causeTitle;
  final String organization;
  final int amount;
  final DateTime date;
  final String transactionId;
  final DonationStatus status;
  final String category;
  final String? impactUpdate;
}

class DonationsService {
  List<Donation> getMyDonations() => [
    Donation(
      causeTitle: 'Agua limpia para La Guajira',
      organization: 'Fundación Agua y Vida',
      amount: 150000,
      date: DateTime(2026, 10, 12),
      transactionId: 'DON-10482',
      status: DonationStatus.completed,
      category: 'Comunidades',
      impactUpdate: 'La instalación del primer tanque ya comenzó.',
    ),
    Donation(
      causeTitle: 'Una biblioteca para soñar',
      organization: 'Leer Nos Une',
      amount: 80000,
      date: DateTime(2026, 9, 28),
      transactionId: 'DON-09831',
      status: DonationStatus.completed,
      category: 'Educación',
      impactUpdate: 'Se entregaron los primeros 120 libros.',
    ),
    Donation(
      causeTitle: 'Bosques que vuelven a respirar',
      organization: 'Raíces Colombia',
      amount: 50000,
      date: DateTime(2026, 9, 3),
      transactionId: 'DON-09117',
      status: DonationStatus.completed,
      category: 'Ambiente',
    ),
    Donation(
      causeTitle: 'Atención médica sin fronteras',
      organization: 'Salud Cerca de Ti',
      amount: 100000,
      date: DateTime(2026, 10, 16),
      transactionId: 'DON-10624',
      status: DonationStatus.processing,
      category: 'Salud',
    ),
  ];
}
