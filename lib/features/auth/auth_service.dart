class AuthService {
  Future<void> login({required String email, required String password}) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
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
