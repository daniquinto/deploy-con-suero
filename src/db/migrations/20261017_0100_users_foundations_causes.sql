-- Usuarios, fundaciones y causas.
-- Las donaciones y los pagos de Open Payments van en migraciones propias del equipo.
-- gen_random_uuid() viene incluido en PostgreSQL 13+.

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role           text NOT NULL CHECK (role IN ('donor', 'foundation')),
  name           text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  -- Wallet address de Open Payments (https://...). Opcional por ahora.
  wallet_address text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Perfil público de la fundación. Uno por usuario con role = 'foundation'.
CREATE TABLE foundations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  -- Persona responsable ante la plataforma.
  legal_representative text NOT NULL CHECK (length(legal_representative) BETWEEN 3 AND 120),
  id_type        text NOT NULL CHECK (id_type IN ('NIT', 'RUT', 'REGISTRO_EXTRANJERO', 'OTRO')),
  id_number      text NOT NULL CHECK (id_number ~ '^[0-9A-Za-z.-]{4,20}$'),
  location       text NOT NULL DEFAULT '',
  description    text NOT NULL DEFAULT '',
  -- Donde recibe las donaciones. Opcional por ahora.
  wallet_address text,
  -- Moneda en la que recibe (la de su wallet).
  currency       text NOT NULL DEFAULT 'COP',
  -- Nace PENDIENTE; solo ACTIVA puede crear causas y recibir donaciones.
  status         text NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'ACTIVA', 'SUSPENDIDA')),
  activated_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_type, id_number),
  CHECK (status <> 'ACTIVA' OR activated_at IS NOT NULL)
);

-- Campaña concreta de una fundación: a esto donan los donantes.
CREATE TABLE causes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_id uuid NOT NULL REFERENCES foundations (id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (length(title) BETWEEN 5 AND 80),
  description   text NOT NULL CHECK (length(description) BETWEEN 20 AND 600),
  location      text NOT NULL,
  -- Meta en unidades enteras de la moneda (COP sin decimales).
  goal_amount   bigint NOT NULL CHECK (goal_amount > 0),
  currency      text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX causes_foundation_idx ON causes (foundation_id, created_at DESC);
CREATE INDEX causes_active_idx ON causes (created_at DESC) WHERE status = 'active';
