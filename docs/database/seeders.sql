-- =====================================================================
-- Mano Abierta — Datos de prueba (seeders)
-- Ejecutar después de scripts.sql:  psql -d mano_abierta -f seeders.sql
-- Datos ficticios. Montos en COP con asset_scale = 2 (centavos).
--
-- Todas las cuentas usan la contraseña:  password   (hash bcrypt real, costo 10)
-- Cuentas de la demo del hackathon:
--   donador@gmail.com    (DONANTE)
--   fundacion@gmail.com  (FUNDACION)
--
-- UUIDs fijos por entidad para referencias fáciles:
--   usuario 1000…  entidad 2000…  fundacion 3000…  donante 4000…
--   causa 5000…    donacion 6000…  gasto 7000…  evidencia 8000…  rechazo 9000…
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- USUARIO (1 admin, 2 gobierno, 4 fundación, 4 donantes)
-- ---------------------------------------------------------------------
INSERT INTO usuario (id, email, telefono, password_hash, nombre, rol, estado) VALUES
('10000000-0000-0000-0000-000000000001', 'admin@manoabierta.app',            '+573000000001', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Equipo Mano Abierta',       'ADMIN',     'ACTIVO'),
('10000000-0000-0000-0000-000000000002', 'riesgo@medellin.gov.co',           '+573000000002', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'DAGRD Medellín',            'GOBIERNO',  'ACTIVO'),
('10000000-0000-0000-0000-000000000003', 'emergencias@gestionriesgo.gov.co', '+573000000003', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Unidad Nacional de Riesgo', 'GOBIERNO',  'ACTIVO'),
('10000000-0000-0000-0000-000000000004', 'contacto@cruzsolidaria.org',       '+573000000004', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Cruz Solidaria Antioquia',  'FUNDACION', 'ACTIVO'),
('10000000-0000-0000-0000-000000000005', 'hola@riosdevida.org',              '+573000000005', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Fundación Ríos de Vida',    'FUNDACION', 'ACTIVO'),
('10000000-0000-0000-0000-000000000006', 'info@techosdeesperanza.org',       '+573000000006', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Techos de Esperanza',       'FUNDACION', 'PENDIENTE'),
('10000000-0000-0000-0000-000000000007', 'laura.gomez@example.com',          '+34600000007',  '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Laura Gómez',               'DONANTE',   'ACTIVO'),
('10000000-0000-0000-0000-000000000008', 'carlos.rios@example.com',          '+13050000008',  '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Carlos Ríos',               'DONANTE',   'ACTIVO'),
('10000000-0000-0000-0000-000000000009', 'ana.perez@example.com',            '+573000000009', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Ana Pérez',                 'DONANTE',   'ACTIVO'),
-- Cuentas de la demo
('10000000-0000-0000-0000-000000000010', 'donador@gmail.com',                '+573000000010', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Daniela Restrepo',          'DONANTE',   'ACTIVO'),
('10000000-0000-0000-0000-000000000011', 'fundacion@gmail.com',              '+573000000011', '$2b$10$ndQCOGP7JrkQSVi.GnPwXeSGUZesUeN2O2ybrsUlCXeI1q/EUCyrC', 'Fundación Puente Vivo',     'FUNDACION', 'ACTIVO');

-- ---------------------------------------------------------------------
-- ENTIDAD_GUBERNAMENTAL (registradas por el admin)
-- ---------------------------------------------------------------------
INSERT INTO entidad_gubernamental (id, usuario_id, registrada_por, nombre, nit, nivel, pais, departamento, municipio) VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
 'Departamento Administrativo de Gestión del Riesgo de Medellín', '800000001-1', 'MUNICIPAL', 'CO', 'Antioquia', 'Medellín'),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
 'Unidad Nacional para la Gestión del Riesgo', '800000002-2', 'NACIONAL', 'CO', NULL, NULL);

-- ---------------------------------------------------------------------
-- FUNDACION (3 activas, 1 pendiente de activación y sin entidad asignada)
-- ---------------------------------------------------------------------
INSERT INTO fundacion (id, usuario_id, entidad_gubernamental_id, razon_social, persona_responsable, tipo_identificacion, nit,
                       descripcion, pais, departamento, ciudad,
                       wallet_address, asset_code, asset_scale,
                       grant_access_token, grant_manage_url, grant_continue_uri, grant_limite, grant_intervalo, grant_otorgado_en,
                       estado, activada_en) VALUES
('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
 'Cruz Solidaria Antioquia', 'Marta Restrepo', 'NIT', '900000001-1',
 'Atención humanitaria en emergencias por lluvias en Antioquia.', 'CO', 'Antioquia', 'Medellín',
 'https://ilp.interledger-test.dev/cruz-solidaria', 'COP', 2,
 'seed-token-cruz-solidaria', 'https://auth.interledger-test.dev/token/seed-001', 'https://auth.interledger-test.dev/continue/seed-001',
 5000000000, 'R/2026-10-01T00:00:00Z/P1W', '2026-10-01 09:00:00-05',
 'ACTIVA', '2026-09-28 10:00:00-05'),
('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002',
 'Fundación Ríos de Vida', 'Jorge Mutis', 'NIT', '900000002-2',
 'Ayuda a comunidades afectadas por desastres en Colombia y la región andina.', 'CO', 'Putumayo', 'Mocoa',
 'https://ilp.interledger-test.dev/rios-de-vida', 'COP', 2,
 'seed-token-rios-de-vida', 'https://auth.interledger-test.dev/token/seed-002', 'https://auth.interledger-test.dev/continue/seed-002',
 3000000000, 'R/2026-10-01T00:00:00Z/P1W', '2026-10-02 11:00:00-05',
 'ACTIVA', '2026-09-30 15:00:00-05'),
('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000006', NULL,
 'Techos de Esperanza', 'Lucía Cardona', 'NIT', '900000003-3',
 'Vivienda temporal para familias desplazadas.', 'CO', 'Antioquia', 'Bello',
 NULL, 'COP', 2,
 NULL, NULL, NULL, NULL, NULL, NULL,
 'PENDIENTE', NULL),
('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001',
 'Fundación Puente Vivo', 'Andrés Palacios', 'NIT', '900412118-3',
 'Ayuda humanitaria en el Pacífico colombiano: alimentos, agua potable y salud para familias damnificadas.', 'CO', 'Chocó', 'Quibdó',
 'https://ilp.interledger-test.dev/puente-vivo', 'COP', 2,
 NULL, NULL, NULL, NULL, NULL, NULL,
 'ACTIVA', '2026-10-05 10:00:00-05');

-- ---------------------------------------------------------------------
-- DONANTE (España EUR, EE. UU. USD, Colombia COP, demo)
-- ---------------------------------------------------------------------
INSERT INTO donante (id, usuario_id, nombres, apellidos, tipo_documento, numero_documento, genero,
                     nombre_publico, pais, wallet_address, moneda_preferida, es_anonimo) VALUES
('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Laura', 'Gómez', 'PA', 'XDA123456', 'F',
 'Laura G.', 'ES', 'https://ilp.interledger-test.dev/laura-eur',  'EUR', FALSE),
('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000008', 'Carlos', 'Ríos', 'PA', 'US7788990', 'M',
 NULL, 'US', 'https://ilp.interledger-test.dev/carlos-usd', 'USD', TRUE),
('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000009', 'Ana', 'Pérez', 'CC', '1020304050', 'F',
 'Ana P.', 'CO', 'https://ilp.interledger-test.dev/ana-cop',    'COP', FALSE),
('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000010', 'Daniela', 'Restrepo', 'CC', '1037654321', 'F',
 NULL, 'ES', 'https://ilp.interledger-test.dev/106c3c01', 'EUR', FALSE);

-- ---------------------------------------------------------------------
-- CAUSA (montos ya consistentes con donaciones y gastos de abajo)
-- causa 1: recaudado 620.000 | liberado 620.000 | gastado 275.000
-- causa 2: recaudado 150.000 | liberado 0       | gastado 0
-- causa 3: sin donaciones aún
-- causa 4: de la fundación demo, sin donaciones aún
-- ---------------------------------------------------------------------
INSERT INTO causa (id, fundacion_id, titulo, slug, descripcion, tipo, pais, region, ciudad, latitud, longitud, fecha_evento,
                   asset_code, asset_scale, meta_monto, monto_recaudado, monto_liberado, monto_gastado, estado, fecha_inicio) VALUES
('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
 'Inundación en Salgar', 'inundacion-salgar-2026',
 'Desbordamiento de la quebrada La Liboriana deja 120 familias damnificadas.', 'INUNDACION',
 'CO', 'Antioquia', 'Salgar', 5.963900, -75.976700, '2026-10-12 04:30:00-05',
 'COP', 2, 5000000000, 62000000, 62000000, 27500000, 'ACTIVA', '2026-10-12 12:00:00-05'),
('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
 'Avalancha en Mocoa', 'avalancha-mocoa-2026',
 'Avenida torrencial afecta tres barrios; familias en albergues temporales.', 'INUNDACION',
 'CO', 'Putumayo', 'Mocoa', 1.152900, -76.646800, '2026-10-14 23:10:00-05',
 'COP', 2, 3000000000, 15000000, 0, 0, 'ACTIVA', '2026-10-15 08:00:00-05'),
('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002',
 'Sismo en Esmeraldas', 'sismo-esmeraldas-2026',
 'Sismo de magnitud 6,4 afecta viviendas en la costa norte de Ecuador.', 'SISMO',
 'EC', 'Esmeraldas', 'Esmeraldas', 0.968200, -79.651700, '2026-10-16 14:20:00-05',
 'COP', 2, 2000000000, 0, 0, 0, 'ACTIVA', '2026-10-16 18:00:00-05'),
('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004',
 'Agua potable en Río Claro', 'agua-potable-rio-claro-2026',
 'Agua potable y filtros para las veredas que quedaron sin acueducto después de la inundación.', 'INUNDACION',
 'CO', 'Chocó', 'Río Claro', 5.694800, -76.658200, '2026-10-15 06:00:00-05',
 'COP', 2, 800000000, 0, 0, 0, 'ACTIVA', '2026-10-15 12:00:00-05');

-- ---------------------------------------------------------------------
-- DONACION
-- 1: 50 EUR -> 220.000 COP (liberada)   2: 100 USD -> 400.000 COP (liberada)
-- 3: 150.000 COP recurrente mensual (aún sin liberar)
-- ---------------------------------------------------------------------
INSERT INTO donacion (id, donante_id, causa_id,
                      monto_enviado, moneda_enviada, escala_enviada, monto_recibido, moneda_recibida, escala_recibida, tasa_cambio,
                      es_recurrente, intervalo, mensaje,
                      incoming_payment_url, quote_url, outgoing_payment_url,
                      estado, completada_en,
                      estado_liberacion, liberacion_incoming_payment_url, liberacion_outgoing_payment_url, liberada_en,
                      token_trazabilidad, creado_en) VALUES
('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
 5000, 'EUR', 2, 22000000, 'COP', 2, 4400.00000000,
 FALSE, NULL, 'Fuerza Salgar, desde Madrid.',
 'https://ilp.interledger-test.dev/manoabierta/incoming-payments/seed-d1', 'https://ilp.interledger-test.dev/laura-eur/quotes/seed-d1', 'https://ilp.interledger-test.dev/laura-eur/outgoing-payments/seed-d1',
 'COMPLETADA', '2026-10-13 10:05:00-05',
 'LIBERADA', 'https://ilp.interledger-test.dev/cruz-solidaria/incoming-payments/seed-l1', 'https://ilp.interledger-test.dev/manoabierta/outgoing-payments/seed-l1', '2026-10-13 10:10:00-05',
 'trz_d1_7f3a9c', '2026-10-13 10:00:00-05'),
('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
 10000, 'USD', 2, 40000000, 'COP', 2, 4000.00000000,
 FALSE, NULL, NULL,
 'https://ilp.interledger-test.dev/manoabierta/incoming-payments/seed-d2', 'https://ilp.interledger-test.dev/carlos-usd/quotes/seed-d2', 'https://ilp.interledger-test.dev/carlos-usd/outgoing-payments/seed-d2',
 'COMPLETADA', '2026-10-13 18:42:00-05',
 'LIBERADA', 'https://ilp.interledger-test.dev/cruz-solidaria/incoming-payments/seed-l2', 'https://ilp.interledger-test.dev/manoabierta/outgoing-payments/seed-l2', '2026-10-13 18:50:00-05',
 'trz_d2_b81e4d', '2026-10-13 18:40:00-05'),
('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002',
 15000000, 'COP', 2, 15000000, 'COP', 2, 1.00000000,
 TRUE, 'R/2026-10-15T00:00:00Z/P1M', 'Con cariño para Mocoa.',
 'https://ilp.interledger-test.dev/manoabierta/incoming-payments/seed-d3', 'https://ilp.interledger-test.dev/ana-cop/quotes/seed-d3', 'https://ilp.interledger-test.dev/ana-cop/outgoing-payments/seed-d3',
 'COMPLETADA', '2026-10-15 09:20:00-05',
 'PENDIENTE', NULL, NULL, NULL,
 'trz_d3_c40f2a', '2026-10-15 09:15:00-05');

-- ---------------------------------------------------------------------
-- GASTO (2 completados, 2 rechazados)
-- ---------------------------------------------------------------------
INSERT INTO gasto (id, causa_id, tipo, categoria, descripcion, receptor_nombre, receptor_nit, receptor_wallet, beneficiario_ref, ciudad,
                   monto, asset_code, asset_scale, incoming_payment_url, quote_url, outgoing_payment_url,
                   estado, visible_publico, creado_en, ejecutado_en) VALUES
('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'COMPRA', 'ALIMENTOS',
 'Mercados básicos para 12 familias del albergue municipal.', 'Supermercado El Paisa', '901000001-1',
 'https://ilp.interledger-test.dev/super-el-paisa', NULL, 'Salgar',
 18000000, 'COP', 2,
 'https://ilp.interledger-test.dev/super-el-paisa/incoming-payments/seed-g1', 'https://ilp.interledger-test.dev/cruz-solidaria/quotes/seed-g1', 'https://ilp.interledger-test.dev/cruz-solidaria/outgoing-payments/seed-g1',
 'COMPLETADO', TRUE, '2026-10-14 09:00:00-05', '2026-10-14 09:01:00-05'),
('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'COMPRA', 'MEDICINAS',
 'Kit de primeros auxilios y medicamentos para el puesto de salud.', 'Droguería Salgar', '901000002-2',
 'https://ilp.interledger-test.dev/drogueria-salgar', 'FAM-SAL-007', 'Salgar',
 9500000, 'COP', 2,
 'https://ilp.interledger-test.dev/drogueria-salgar/incoming-payments/seed-g2', 'https://ilp.interledger-test.dev/cruz-solidaria/quotes/seed-g2', 'https://ilp.interledger-test.dev/cruz-solidaria/outgoing-payments/seed-g2',
 'COMPLETADO', TRUE, '2026-10-14 15:30:00-05', '2026-10-14 15:31:00-05'),
('70000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'TRANSFERENCIA', 'ALOJAMIENTO',
 'Transferencia para arriendo temporal de 20 familias.', 'Inmobiliaria Andina', '901000003-3',
 'https://ilp.interledger-test.dev/inmobiliaria-andina', NULL, 'Salgar',
 80000000, 'COP', 2,
 'https://ilp.interledger-test.dev/inmobiliaria-andina/incoming-payments/seed-g3', 'https://ilp.interledger-test.dev/cruz-solidaria/quotes/seed-g3', NULL,
 'RECHAZADO', TRUE, '2026-10-15 11:00:00-05', NULL),
('70000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', 'COMPRA', 'MATERIALES',
 'Tejas y plásticos para cubrir viviendas afectadas.', 'Ferretería El Putumayo', '901000004-4',
 'https://ilp.interledger-test.dev/ferreteria-putumayo', NULL, 'Mocoa',
 5000000, 'COP', 2,
 NULL, NULL, NULL,
 'RECHAZADO', TRUE, '2026-10-15 16:00:00-05', NULL);

-- ---------------------------------------------------------------------
-- EVIDENCIA_GASTO
-- ---------------------------------------------------------------------
INSERT INTO evidencia_gasto (id, gasto_id, tipo, archivo_url, hash_archivo, descripcion, verificada, verificada_por, verificada_en) VALUES
('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'FACTURA',
 'https://storage.manoabierta.app/evidencias/seed-g1-factura.pdf',
 'a3f1c9e2b7d84f60a1e5c3b9d2f7e8a4c6b1d9e3f5a7c2b8d4e6f1a9c3b5d7e2', 'Factura electrónica FE-4521', TRUE,
 '10000000-0000-0000-0000-000000000002', '2026-10-14 17:00:00-05'),
('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'FOTO',
 'https://storage.manoabierta.app/evidencias/seed-g1-entrega.jpg',
 'b4e2d0f3c8e95071b2f6d4c0e3a8f9b5d7c2e0f4a6b8d3c9e5f7a2b0d4c6e8f3', 'Entrega de mercados en el albergue', FALSE, NULL, NULL),
('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002', 'FACTURA',
 'https://storage.manoabierta.app/evidencias/seed-g2-factura.pdf',
 'c5f3e1a4d9fa6182c3a7e5d1f4b9a0c6e8d3f1a5b7c9e4d0f6a8b3c1e5d7f9a4', 'Factura droguería No. 889', FALSE, NULL, NULL);

-- ---------------------------------------------------------------------
-- RECHAZO_GASTO (automáticos)
-- ---------------------------------------------------------------------
INSERT INTO rechazo_gasto (id, gasto_id, origen, motivo, detalle, respuesta_api, rechazado_por) VALUES
('90000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'OPEN_PAYMENTS', 'LIMITE_GRANT_EXCEDIDO',
 'El monto supera el tope semanal autorizado en el grant de la fundación.',
 '{"status": 403, "error": {"code": "insufficient_grant", "description": "debitAmount exceeds grant limit"}}', NULL),
('90000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', 'SISTEMA', 'SALDO_INSUFICIENTE',
 'La causa aún no tiene fondos liberados a la wallet de la fundación.', NULL, NULL);

COMMIT;
