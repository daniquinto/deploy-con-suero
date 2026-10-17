class UserProfile {
  const UserProfile({
    required this.names,
    required this.lastNames,
    required this.email,
    required this.documentType,
    required this.document,
    required this.gender,
    required this.memberSince,
  });

  final String names;
  final String lastNames;
  final String email;
  final String documentType;
  final String document;
  final String gender;
  final DateTime memberSince;

  String get fullName => '$names $lastNames';
  String get initials => '${names[0]}${lastNames[0]}'.toUpperCase();
}

class ProfileService {
  Future<UserProfile> getProfile() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return UserProfile(
      names: 'Andrés',
      lastNames: 'Cortés',
      email: 'andres@ejemplo.com',
      documentType: 'Cédula de ciudadanía',
      document: '••••••7890',
      gender: 'Masculino',
      memberSince: DateTime(2026, 8, 15),
    );
  }

  Future<void> updateProfile({
    required String names,
    required String lastNames,
    required String email,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
}
