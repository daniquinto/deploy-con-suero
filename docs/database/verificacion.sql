-- =====================================================================
-- Mano Abierta — Verificación del esquema y los seeders
-- Ejecutar después de scripts.sql y seeders.sql:
--   psql -d mano_abierta -f verificacion.sql
-- Cada consulta debe devolver lo indicado en su comentario.
-- =====================================================================

-- 1. Conteo por tabla (usuarios 11, entidades 2, fundaciones 4, donantes 4, causas 4,
--    donaciones 3, gastos 4, evidencias 3, rechazos 2)
SELECT 'usuario' AS tabla, count(*) FROM usuario
UNION ALL SELECT 'entidad_gubernamental', count(*) FROM entidad_gubernamental
UNION ALL SELECT 'fundacion', count(*) FROM fundacion
UNION ALL SELECT 'donante', count(*) FROM donante
UNION ALL SELECT 'causa', count(*) FROM causa
UNION ALL SELECT 'donacion', count(*) FROM donacion
UNION ALL SELECT 'gasto', count(*) FROM gasto
UNION ALL SELECT 'evidencia_gasto', count(*) FROM evidencia_gasto
UNION ALL SELECT 'rechazo_gasto', count(*) FROM rechazo_gasto;

-- 2. Saldos de cada causa vs. sus donaciones y gastos (todas las filas deben decir "ok")
SELECT c.titulo,
       c.monto_recaudado = coalesce((SELECT sum(d.monto_recibido) FROM donacion d WHERE d.causa_id = c.id AND d.estado = 'COMPLETADA'), 0) AS recaudado_ok,
       c.monto_liberado  = coalesce((SELECT sum(d.monto_recibido) FROM donacion d WHERE d.causa_id = c.id AND d.estado_liberacion = 'LIBERADA'), 0) AS liberado_ok,
       c.monto_gastado   = coalesce((SELECT sum(g.monto) FROM gasto g WHERE g.causa_id = c.id AND g.estado = 'COMPLETADO'), 0) AS gastado_ok
  FROM causa c
 ORDER BY c.titulo;

-- 3. Causas visibles para donar: causa ACTIVA de fundación ACTIVA (debe devolver 4)
SELECT count(*) AS causas_publicas
  FROM causa c JOIN fundacion f ON f.id = c.fundacion_id
 WHERE c.estado = 'ACTIVA' AND f.estado = 'ACTIVA';

-- 4. Cuentas de la demo (deben existir con su perfil)
SELECT u.email, u.rol, coalesce(f.razon_social, d.nombres || ' ' || d.apellidos) AS perfil
  FROM usuario u
  LEFT JOIN fundacion f ON f.usuario_id = u.id
  LEFT JOIN donante  d ON d.usuario_id = u.id
 WHERE u.email IN ('donador@gmail.com', 'fundacion@gmail.com');
