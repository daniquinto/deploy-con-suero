enum UserRole { donor, foundation }

class AuthService {
  static const donorEmail = 'donador@gmail.com';
  static const foundationEmail = 'fundacion@gmail.com';
  static const demoPassword = 'password';
  static const donorWallet = 'https://ilp.interledger-test.dev/106c3c01';
  static const foundationWallet = 'https://ilp.interledger-test.dev/creating';

  Future<UserRole> login({
    required String email,
    required String password,
    required UserRole role,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));

    const credentials = {
      UserRole.donor: (donorEmail, demoPassword),
      UserRole.foundation: (foundationEmail, demoPassword),
    };
    final expected = credentials[role]!;

    if (email.trim().toLowerCase() != expected.$1 || password != expected.$2) {
      throw const FormatException('Credenciales demo inválidas');
    }

    return role;
  }

  Future<void> register({
    required String names,
    required String lastNames,
    required String documentType,
    required String document,
    required String gender,
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
  }
}
