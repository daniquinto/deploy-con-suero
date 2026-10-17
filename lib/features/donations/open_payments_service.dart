import 'dart:convert';

import 'package:http/http.dart' as http;

class OpenPaymentsException implements Exception {
  const OpenPaymentsException(this.message, {this.code, this.statusCode});

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}

class FundInfo {
  const FundInfo({
    required this.walletAddress,
    required this.publicName,
    required this.assetCode,
    required this.assetScale,
    required this.suggestedAmounts,
  });

  final String walletAddress;
  final String publicName;
  final String assetCode;
  final int assetScale;
  final List<String> suggestedAmounts;

  factory FundInfo.fromJson(Map<String, dynamic> json) => FundInfo(
    walletAddress: json['walletAddress'] as String? ?? '',
    publicName: json['publicName'] as String? ?? '',
    assetCode: json['assetCode'] as String? ?? '',
    assetScale: json['assetScale'] as int? ?? 0,
    suggestedAmounts: (json['suggestedAmounts'] as List<dynamic>? ?? [])
        .map((value) => value.toString())
        .toList(),
  );
}

class WalletConnection {
  const WalletConnection({
    required this.donorAssetCode,
    required this.donorAssetScale,
    required this.fundAssetCode,
    required this.sameAsset,
    required this.conversionNotice,
  });

  final String donorAssetCode;
  final int donorAssetScale;
  final String fundAssetCode;
  final bool sameAsset;
  final String? conversionNotice;

  factory WalletConnection.fromJson(Map<String, dynamic> json) {
    final donor = json['donor'] as Map<String, dynamic>? ?? {};
    final fund = json['fund'] as Map<String, dynamic>? ?? {};
    return WalletConnection(
      donorAssetCode: donor['assetCode'] as String? ?? '',
      donorAssetScale: donor['assetScale'] as int? ?? 0,
      fundAssetCode: fund['assetCode'] as String? ?? '',
      sameAsset: json['sameAsset'] as bool? ?? false,
      conversionNotice: json['conversionNotice'] as String?,
    );
  }
}

class DonationPayment {
  const DonationPayment({
    required this.donationId,
    required this.status,
    required this.debitFormatted,
    required this.receiveFormatted,
    required this.redirectUrl,
    required this.expiresAt,
    this.failureReason,
  });

  final String donationId;
  final String status;
  final String debitFormatted;
  final String receiveFormatted;
  final String? redirectUrl;
  final DateTime? expiresAt;
  final String? failureReason;

  factory DonationPayment.fromJson(Map<String, dynamic> json) {
    final amounts = json['amounts'] as Map<String, dynamic>? ?? {};
    final debit = amounts['debit'] as Map<String, dynamic>? ?? {};
    final receive = amounts['receive'] as Map<String, dynamic>? ?? {};
    final interact = json['interact'] as Map<String, dynamic>? ?? {};
    return DonationPayment(
      donationId: json['donationId'] as String? ?? '',
      status: json['status'] as String? ?? 'unknown',
      debitFormatted: debit['formatted'] as String? ?? '',
      receiveFormatted: receive['formatted'] as String? ?? '',
      redirectUrl: interact['redirectUrl'] as String?,
      expiresAt: DateTime.tryParse(interact['expiresAt'] as String? ?? ''),
      failureReason: json['failureReason'] as String?,
    );
  }
}

class OpenPaymentsService {
  OpenPaymentsService({http.Client? client})
    : _client = client ?? http.Client();

  static const apiBaseUrl = 'https://deploy.szapatar.dev';
  static const foundationWallet = 'https://ilp.interledger-test.dev/creating';
  static const _requestTimeout = Duration(seconds: 15);
  final http.Client _client;

  Future<FundInfo> getFund() async {
    final response = await _get(Uri.parse('$apiBaseUrl/api/fund'));
    return FundInfo.fromJson(await _body(response));
  }

  Future<WalletConnection> connectWallet(String walletAddress) async {
    final response = await _post(
      Uri.parse('$apiBaseUrl/api/wallet/connect'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'walletAddress': walletAddress}),
    );
    return WalletConnection.fromJson(await _body(response));
  }

  Future<DonationPayment> createDonation({
    required String donorWalletAddress,
    required String amount,
    required String description,
    required String donorName,
  }) async {
    final externalRef = 'mano-abierta-${DateTime.now().microsecondsSinceEpoch}';
    final response = await _post(
      Uri.parse('$apiBaseUrl/api/donations'),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': externalRef,
      },
      body: jsonEncode({
        'donorWalletAddress': donorWalletAddress,
        'amount': amount.replaceAll(',', '.'),
        'amountMode': 'send',
        'description': description,
        'donorName': donorName,
        'externalRef': externalRef,
      }),
    );
    return DonationPayment.fromJson(await _body(response));
  }

  Future<DonationPayment> getDonation(String donationId) async {
    final response = await _get(
      Uri.parse('$apiBaseUrl/api/donations/$donationId'),
    );
    return DonationPayment.fromJson(await _body(response));
  }

  Future<http.Response> _get(Uri uri) async {
    try {
      return await _client.get(uri).timeout(_requestTimeout);
    } catch (error) {
      throw OpenPaymentsException(_connectionError(error));
    }
  }

  Future<http.Response> _post(
    Uri uri, {
    required Map<String, String> headers,
    required String body,
  }) async {
    try {
      return await _client
          .post(uri, headers: headers, body: body)
          .timeout(_requestTimeout);
    } catch (error) {
      throw OpenPaymentsException(_connectionError(error));
    }
  }

  String _connectionError(Object error) {
    final detail = error.toString();
    if (detail.contains('XMLHttpRequest') || detail.contains('CORS')) {
      return 'El backend bloqueó esta aplicación por CORS. Agrega el origen local en CORS_ALLOWED_ORIGINS.';
    }
    return 'No fue posible conectar con Open Payments. Verifica que el backend esté disponible. Detalle: $detail';
  }

  Future<Map<String, dynamic>> _body(http.Response response) async {
    Map<String, dynamic> json;
    try {
      json = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw OpenPaymentsException(
        'El servidor devolvió una respuesta inválida.',
        statusCode: response.statusCode,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = json['error'] as Map<String, dynamic>? ?? json;
      throw OpenPaymentsException(
        error['message'] as String? ?? 'No fue posible procesar la donación.',
        code: error['code'] as String?,
        statusCode: response.statusCode,
      );
    }
    return json;
  }
}
