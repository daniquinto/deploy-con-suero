import 'package:app/main.dart';
import 'package:app/features/causes/widgets/cause_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> openLogin(WidgetTester tester) async {
    await tester.pumpWidget(const App());
    await tester.tap(find.text('Iniciar sesión'));
    await tester.pumpAndSettle();
  }

  testWidgets('muestra la landing como vista principal', (tester) async {
    await tester.pumpWidget(const App());

    expect(find.text('Tu ayuda puede cambiar una historia'), findsOneWidget);
    expect(find.text('Iniciar sesión'), findsOneWidget);
    expect(find.text('Regístrate'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Ayudas que necesitan de ti'),
      400,
    );
    expect(find.text('Ayudas que necesitan de ti'), findsOneWidget);
  });

  testWidgets('muestra dos causas por fila en móvil', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const App());

    await tester.scrollUntilVisible(
      find.text('Ayudas que necesitan de ti'),
      500,
    );
    await tester.pump();
    final cards = find.byType(CauseCard);

    expect(cards, findsAtLeastNWidgets(2));
    expect(
      tester.getTopLeft(cards.at(0)).dy,
      tester.getTopLeft(cards.at(1)).dy,
    );
  });

  testWidgets('permite abrir el formulario para crear una causa', (
    tester,
  ) async {
    await tester.pumpWidget(const App());

    await tester.scrollUntilVisible(find.text('Crear una causa'), 600);
    await tester.tap(find.text('Crear una causa'));
    await tester.pumpAndSettle();

    expect(
      find.text('Convierte una necesidad en una causa que inspire'),
      findsOneWidget,
    );
    expect(find.text('Fundación responsable'), findsOneWidget);
    expect(find.text('Nombre de la fundación'), findsOneWidget);
    expect(find.text('Correo de contacto'), findsOneWidget);
  });

  testWidgets('muestra el formulario de inicio de sesión', (tester) async {
    await openLogin(tester);

    expect(find.text('Bienvenido'), findsOneWidget);
    expect(find.text('Correo electrónico'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
    expect(find.text('Iniciar sesión'), findsOneWidget);
    expect(find.text('Ver catálogo de causas'), findsOneWidget);
    expect(find.text('Ver detalle de una causa'), findsOneWidget);
    expect(find.text('Ver formulario para crear causa'), findsOneWidget);
    expect(find.text('Ver mis donaciones'), findsOneWidget);
    expect(find.text('Ver mi perfil'), findsOneWidget);
  });

  testWidgets('permite abrir mi perfil desde el login', (tester) async {
    await openLogin(tester);

    final profileLink = find.text('Ver mi perfil');
    await tester.ensureVisible(profileLink);
    await tester.tap(profileLink);
    await tester.pumpAndSettle();

    expect(find.text('Mi perfil'), findsOneWidget);
    expect(find.text('Andrés Cortés'), findsOneWidget);
    expect(find.text('Editar perfil'), findsOneWidget);
    expect(find.text('Tu solidaridad está generando impacto'), findsOneWidget);
  });

  testWidgets('permite abrir mis donaciones desde el login', (tester) async {
    await openLogin(tester);

    final donationsLink = find.text('Ver mis donaciones');
    await tester.ensureVisible(donationsLink);
    await tester.tap(donationsLink);
    await tester.pumpAndSettle();

    expect(find.text('Mis donaciones'), findsOneWidget);
    expect(find.text('TU IMPACTO'), findsOneWidget);
    expect(find.text('Historial de aportes'), findsOneWidget);
    expect(find.text('Agua limpia para La Guajira'), findsOneWidget);
  });

  testWidgets('permite navegar al registro', (tester) async {
    await tester.pumpWidget(const App());

    await tester.tap(find.text('Regístrate'));
    await tester.pumpAndSettle();

    expect(find.text('Crear cuenta'), findsWidgets);
    expect(find.text('Nombres'), findsOneWidget);
    expect(find.text('Apellidos'), findsOneWidget);
    expect(find.text('Tipo de documento'), findsOneWidget);
    expect(find.text('Género'), findsOneWidget);
  });

  testWidgets('valida campos obligatorios del login', (tester) async {
    await openLogin(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Iniciar sesión'));
    await tester.pump();

    expect(find.text('Ingresa tu correo electrónico'), findsOneWidget);
    expect(find.text('Ingresa tu contraseña'), findsOneWidget);
  });

  testWidgets('navega al catálogo después de iniciar sesión', (tester) async {
    await openLogin(tester);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Correo electrónico'),
      'donador@ejemplo.com',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Contraseña'),
      'password123',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Iniciar sesión'));
    await tester.pumpAndSettle();

    expect(find.text('Causas que transforman'), findsOneWidget);
    expect(find.text('Agua limpia para La Guajira'), findsWidgets);
    expect(find.text('Explorar'), findsOneWidget);
  });

  testWidgets('permite abrir el catálogo desde la vista previa', (
    tester,
  ) async {
    await openLogin(tester);

    final previewLink = find.text('Ver catálogo de causas');
    await tester.ensureVisible(previewLink);
    await tester.tap(previewLink);
    await tester.pumpAndSettle();

    expect(find.text('Causas que transforman'), findsOneWidget);
  });
}
