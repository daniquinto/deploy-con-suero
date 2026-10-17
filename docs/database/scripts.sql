-- =====================================================================
-- Alivio — Esquema de base de datos (PostgreSQL 13+)
--
-- Flujo del dinero (Open Payments):
--   1. Donante (cualquier país/moneda) -> wallet de la APLICACIÓN.
--   2. La aplicación LIBERA cada donación -> wallet de la FUNDACIÓN.
--   3. La fundación paga a comercios o transfiere desde SU wallet,
--      usando un grant que le otorga a la aplicación.
--
-- Montos en enteros + asset_code + asset_scale (formato Open Payments).
--
-- Estructura pensada para importadores de diagramas (dbdiagram.io,
-- DrawSQL, pgAdmin ERD, DBeaver):
--   1. Tipos ENUM
--   2. Tablas (solo columnas, PK, NOT NULL, UNIQUE, DEFAULT)
--   3. Llaves foráneas (ALTER TABLE)
--   4. Reglas CHECK (ALTER TABLE)  -> omitir si el importador falla
--   5. Índices                      -> omitir si el importador falla
-- =====================================================================


-- =====================================================================
-- 1. TIPOS ENUM
-- =====================================================================
CREATE TYPE rol_usuario       AS ENUM ('ADMIN', 'GOBIERNO', 'FUNDACION', 'DONANTE');   -- ADMIN = dueño del negocio
CREATE TYPE estado_usuario    AS ENUM ('ACTIVO', 'PENDIENTE', 'SUSPENDIDO');
CREATE TYPE nivel_gobierno    AS ENUM ('NACIONAL', 'DEPARTAMENTAL', 'MUNICIPAL');
CREATE TYPE estado_fundacion  AS ENUM ('PENDIENTE', 'ACTIVA', 'SUSPENDIDA');
CREATE TYPE tipo_causa        AS ENUM ('EMERGENCIA', 'DESPLAZAMIENTO', 'DESASTRE', 'PROYECTO', 'ENFERMEDAD');
CREATE TYPE estado_causa      AS ENUM ('BORRADOR', 'ACTIVA', 'PAUSADA', 'CERRADA');
CREATE TYPE estado_donacion   AS ENUM ('PENDIENTE', 'AUTORIZADA', 'COMPLETADA', 'FALLIDA', 'CANCELADA');
CREATE TYPE estado_liberacion AS ENUM ('PENDIENTE', 'LIBERADA', 'FALLIDA');
CREATE TYPE tipo_gasto        AS ENUM ('COMPRA', 'TRANSFERENCIA');
CREATE TYPE categoria_gasto   AS ENUM ('ALIMENTOS', 'MEDICINAS', 'HIGIENE', 'MATERIALES', 'TRANSPORTE', 'ALOJAMIENTO', 'EFECTIVO', 'OTRO');
CREATE TYPE estado_gasto      AS ENUM ('PENDIENTE', 'COMPLETADO', 'RECHAZADO', 'FALLIDO');
CREATE TYPE tipo_evidencia    AS ENUM ('FACTURA', 'FOTO', 'COMPROBANTE_PAGO', 'ACTA_ENTREGA', 'OTRO');
CREATE TYPE origen_rechazo    AS ENUM ('SISTEMA', 'OPEN_PAYMENTS', 'GOBIERNO', 'ADMIN');
CREATE TYPE motivo_rechazo    AS ENUM ('LIMITE_GRANT_EXCEDIDO', 'GRANT_INVALIDO', 'FUNDACION_INACTIVA',
                                       'SALDO_INSUFICIENTE', 'CAUSA_INACTIVA', 'CATEGORIA_NO_PERMITIDA',
                                       'EVIDENCIA_INVALIDA', 'SOSPECHA_FRAUDE', 'ERROR_TECNICO', 'OTRO');


-- =====================================================================
-- 2. TABLAS
-- =====================================================================

-- Cuenta de acceso (admin, gobierno, fundación o donante)
CREATE TABLE usuario (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255)    NOT NULL UNIQUE,
    telefono        VARCHAR(30),
    password_hash   VARCHAR(255)    NOT NULL,
    nombre          VARCHAR(150)    NOT NULL,
    rol             rol_usuario     NOT NULL,
    estado          estado_usuario  NOT NULL DEFAULT 'PENDIENTE',
    ultimo_acceso   TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- HU: el dueño del negocio registra entidades gubernamentales
CREATE TABLE entidad_gubernamental (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID            NOT NULL UNIQUE,     -- cuenta de acceso de la entidad
    registrada_por  UUID            NOT NULL,            -- usuario ADMIN que la registró
    nombre          VARCHAR(200)    NOT NULL,
    nit             VARCHAR(20)     NOT NULL UNIQUE,
    nivel           nivel_gobierno  NOT NULL,
    pais            VARCHAR(2)      NOT NULL DEFAULT 'CO',
    departamento    VARCHAR(100),
    municipio       VARCHAR(100),
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- HU: la entidad registra y activa fundaciones con su wallet
CREATE TABLE fundacion (
    id                        UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id                UUID              NOT NULL UNIQUE,
    entidad_gubernamental_id  UUID              NOT NULL,     -- quien la registró y la activa
    razon_social              VARCHAR(200)      NOT NULL,
    nit                       VARCHAR(20)       NOT NULL UNIQUE,
    descripcion               TEXT,
    logo_url                  VARCHAR(500),
    sitio_web                 VARCHAR(300),
    pais                      VARCHAR(2)        NOT NULL DEFAULT 'CO',
    departamento              VARCHAR(100),
    ciudad                    VARCHAR(100),
    -- Wallet donde recibe el dinero liberado y desde la que paga
    wallet_address            VARCHAR(500)      NOT NULL UNIQUE,
    asset_code                VARCHAR(3)        NOT NULL DEFAULT 'COP',
    asset_scale               SMALLINT          NOT NULL DEFAULT 2,
    -- Grant que la fundación otorga a la app para pagar a comercios
    grant_access_token        TEXT,                           -- cifrado
    grant_manage_url          VARCHAR(500),                   -- para rotar el token
    grant_continue_uri        VARCHAR(500),
    grant_limite              BIGINT,                         -- tope por intervalo
    grant_intervalo           VARCHAR(60),                    -- ISO 8601, ej. R/2026-10-17T00:00:00Z/P1W
    grant_otorgado_en         TIMESTAMPTZ,
    -- Activación por la entidad gubernamental
    estado                    estado_fundacion  NOT NULL DEFAULT 'PENDIENTE',
    activada_en               TIMESTAMPTZ,
    creado_en                 TIMESTAMPTZ       NOT NULL DEFAULT now(),
    actualizado_en            TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Persona o empresa que dona (siempre con cuenta)
CREATE TABLE donante (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID          NOT NULL UNIQUE,
    nombre_publico    VARCHAR(150),
    pais              VARCHAR(2)    NOT NULL,
    wallet_address    VARCHAR(500)  NOT NULL,   -- wallet desde la que paga (cualquier país)
    moneda_preferida  VARCHAR(3),
    es_anonimo        BOOLEAN       NOT NULL DEFAULT FALSE,
    creado_en         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- HU: ver los desastres más recientes en el mundo
CREATE TABLE causa (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    fundacion_id     UUID          NOT NULL,
    titulo           VARCHAR(200)  NOT NULL,
    slug             VARCHAR(200)  NOT NULL UNIQUE,
    descripcion      TEXT          NOT NULL,
    tipo             tipo_causa    NOT NULL,
    -- Ubicación (cualquier país)
    pais             VARCHAR(2)    NOT NULL,
    region           VARCHAR(100),
    ciudad           VARCHAR(100),
    latitud          NUMERIC(9, 6),
    longitud         NUMERIC(9, 6),
    fecha_evento     TIMESTAMPTZ   NOT NULL,          -- cuándo ocurrió el desastre (orden "más recientes")
    imagen_url       VARCHAR(500),
    -- Montos en la moneda de la fundación
    asset_code       VARCHAR(3)    NOT NULL,
    asset_scale      SMALLINT      NOT NULL,
    meta_monto       BIGINT        NOT NULL,
    monto_recaudado  BIGINT        NOT NULL DEFAULT 0,   -- donado (en la wallet de la app)
    monto_liberado   BIGINT        NOT NULL DEFAULT 0,   -- transferido a la wallet de la fundación
    monto_gastado    BIGINT        NOT NULL DEFAULT 0,   -- pagado a comercios o transferido
    estado           estado_causa  NOT NULL DEFAULT 'BORRADOR',
    fecha_inicio     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fecha_fin        TIMESTAMPTZ,
    creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- HU: donar a una fundación/causa desde cualquier país
CREATE TABLE donacion (
    id                               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    donante_id                       UUID               NOT NULL,
    causa_id                         UUID               NOT NULL,
    -- Lo que paga el donante
    monto_enviado                    BIGINT             NOT NULL,
    moneda_enviada                   VARCHAR(3)         NOT NULL,
    escala_enviada                   SMALLINT           NOT NULL,
    -- Lo que recibe la causa
    monto_recibido                   BIGINT,
    moneda_recibida                  VARCHAR(3)         NOT NULL,
    escala_recibida                  SMALLINT           NOT NULL,
    tasa_cambio                      NUMERIC(20, 8),
    es_recurrente                    BOOLEAN            NOT NULL DEFAULT FALSE,
    intervalo                        VARCHAR(60),
    mensaje                          VARCHAR(280),
    -- Paso 1: donante -> wallet de la app
    incoming_payment_url             VARCHAR(500),
    quote_url                        VARCHAR(500),
    outgoing_payment_url             VARCHAR(500),
    grant_continue_uri               VARCHAR(500),
    estado                           estado_donacion    NOT NULL DEFAULT 'PENDIENTE',
    completada_en                    TIMESTAMPTZ,
    -- Paso 2: wallet de la app -> wallet de la fundación
    estado_liberacion                estado_liberacion  NOT NULL DEFAULT 'PENDIENTE',
    liberacion_incoming_payment_url  VARCHAR(500),
    liberacion_outgoing_payment_url  VARCHAR(500),
    liberada_en                      TIMESTAMPTZ,
    -- HU: ver en qué se gastó mi dinero
    token_trazabilidad               VARCHAR(64)        NOT NULL UNIQUE,
    creado_en                        TIMESTAMPTZ        NOT NULL DEFAULT now()
);

-- HU: la fundación paga a comercios o transfiere (desde su wallet)
CREATE TABLE gasto (
    id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    causa_id              UUID             NOT NULL,
    tipo                  tipo_gasto       NOT NULL,
    categoria             categoria_gasto  NOT NULL,
    descripcion           VARCHAR(500)     NOT NULL,
    receptor_nombre       VARCHAR(200)     NOT NULL,   -- comercio o persona
    receptor_nit          VARCHAR(20),
    receptor_wallet       VARCHAR(500)     NOT NULL,
    beneficiario_ref      VARCHAR(100),                -- código de la familia, sin datos personales
    ciudad                VARCHAR(100),
    monto                 BIGINT           NOT NULL,
    asset_code            VARCHAR(3)       NOT NULL,
    asset_scale           SMALLINT         NOT NULL,
    incoming_payment_url  VARCHAR(500),
    quote_url             VARCHAR(500),
    outgoing_payment_url  VARCHAR(500),
    estado                estado_gasto     NOT NULL DEFAULT 'PENDIENTE',
    visible_publico       BOOLEAN          NOT NULL DEFAULT TRUE,
    creado_en             TIMESTAMPTZ      NOT NULL DEFAULT now(),
    ejecutado_en          TIMESTAMPTZ
);

-- Soportes del gasto (factura, foto, acta)
CREATE TABLE evidencia_gasto (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    gasto_id        UUID            NOT NULL,
    tipo            tipo_evidencia  NOT NULL,
    archivo_url     VARCHAR(500)    NOT NULL,
    hash_archivo    VARCHAR(128),               -- SHA-256 para integridad
    descripcion     VARCHAR(500),
    verificada      BOOLEAN         NOT NULL DEFAULT FALSE,
    verificada_por  UUID,                       -- usuario gobierno/admin que la valida
    verificada_en   TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Rechazo de un gasto (automático o manual), uno por gasto
CREATE TABLE rechazo_gasto (
    id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    gasto_id       UUID            NOT NULL UNIQUE,
    origen         origen_rechazo  NOT NULL,
    motivo         motivo_rechazo  NOT NULL,
    detalle        TEXT,
    respuesta_api  JSONB,                       -- error devuelto por Open Payments, si aplica
    rechazado_por  UUID,                        -- NULL si fue automático
    creado_en      TIMESTAMPTZ     NOT NULL DEFAULT now()
);


-- =====================================================================
-- 3. LLAVES FORÁNEAS
-- =====================================================================
ALTER TABLE entidad_gubernamental ADD CONSTRAINT fk_entidad_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario (id);

ALTER TABLE entidad_gubernamental ADD CONSTRAINT fk_entidad_registrada_por
    FOREIGN KEY (registrada_por) REFERENCES usuario (id);

ALTER TABLE fundacion ADD CONSTRAINT fk_fundacion_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario (id);

ALTER TABLE fundacion ADD CONSTRAINT fk_fundacion_entidad
    FOREIGN KEY (entidad_gubernamental_id) REFERENCES entidad_gubernamental (id);

ALTER TABLE donante ADD CONSTRAINT fk_donante_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario (id);

ALTER TABLE causa ADD CONSTRAINT fk_causa_fundacion
    FOREIGN KEY (fundacion_id) REFERENCES fundacion (id);

ALTER TABLE donacion ADD CONSTRAINT fk_donacion_donante
    FOREIGN KEY (donante_id) REFERENCES donante (id);

ALTER TABLE donacion ADD CONSTRAINT fk_donacion_causa
    FOREIGN KEY (causa_id) REFERENCES causa (id);

ALTER TABLE gasto ADD CONSTRAINT fk_gasto_causa
    FOREIGN KEY (causa_id) REFERENCES causa (id);

ALTER TABLE evidencia_gasto ADD CONSTRAINT fk_evidencia_gasto
    FOREIGN KEY (gasto_id) REFERENCES gasto (id) ON DELETE CASCADE;

ALTER TABLE evidencia_gasto ADD CONSTRAINT fk_evidencia_verificador
    FOREIGN KEY (verificada_por) REFERENCES usuario (id);

ALTER TABLE rechazo_gasto ADD CONSTRAINT fk_rechazo_gasto
    FOREIGN KEY (gasto_id) REFERENCES gasto (id) ON DELETE CASCADE;

ALTER TABLE rechazo_gasto ADD CONSTRAINT fk_rechazo_usuario
    FOREIGN KEY (rechazado_por) REFERENCES usuario (id);


-- =====================================================================
-- 4. REGLAS CHECK  (omitir si el importador de diagramas falla)
-- =====================================================================
ALTER TABLE fundacion ADD CONSTRAINT chk_fundacion_activa
    CHECK (estado <> 'ACTIVA' OR activada_en IS NOT NULL);

ALTER TABLE causa ADD CONSTRAINT chk_causa_meta
    CHECK (meta_monto > 0);
ALTER TABLE causa ADD CONSTRAINT chk_causa_fechas
    CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio);
ALTER TABLE causa ADD CONSTRAINT chk_causa_saldos
    CHECK (monto_liberado <= monto_recaudado AND monto_gastado <= monto_liberado);

ALTER TABLE donacion ADD CONSTRAINT chk_donacion_monto
    CHECK (monto_enviado > 0);
ALTER TABLE donacion ADD CONSTRAINT chk_donacion_recurrente
    CHECK (es_recurrente = FALSE OR intervalo IS NOT NULL);

ALTER TABLE gasto ADD CONSTRAINT chk_gasto_monto
    CHECK (monto > 0);

ALTER TABLE rechazo_gasto ADD CONSTRAINT chk_rechazo_manual
    CHECK (origen IN ('SISTEMA', 'OPEN_PAYMENTS') OR rechazado_por IS NOT NULL);


-- =====================================================================
-- 5. ÍNDICES  (omitir si el importador de diagramas falla)
-- =====================================================================
CREATE INDEX idx_fundacion_entidad     ON fundacion (entidad_gubernamental_id);
CREATE INDEX idx_fundacion_estado      ON fundacion (estado);
CREATE INDEX idx_causa_fundacion       ON causa (fundacion_id);
CREATE INDEX idx_causa_recientes       ON causa (estado, fecha_evento DESC);
CREATE INDEX idx_causa_pais            ON causa (pais);
CREATE INDEX idx_donacion_causa        ON donacion (causa_id);
CREATE INDEX idx_donacion_donante      ON donacion (donante_id);
CREATE INDEX idx_donacion_liberacion   ON donacion (estado_liberacion);
CREATE INDEX idx_gasto_causa           ON gasto (causa_id);
CREATE INDEX idx_gasto_estado          ON gasto (estado);
CREATE INDEX idx_evidencia_gasto       ON evidencia_gasto (gasto_id);