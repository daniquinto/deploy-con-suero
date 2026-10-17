-- Perfil de donante (uno por usuario con role = 'donor').
-- Alineado con la tabla `donante` del modelo en main, más los datos de
-- identificación que pide el formulario de registro.

CREATE TABLE donors (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  first_names        text NOT NULL CHECK (length(first_names) BETWEEN 2 AND 80),
  last_names         text NOT NULL CHECK (length(last_names) BETWEEN 2 AND 80),
  -- CC cédula de ciudadanía · CE cédula de extranjería · TI tarjeta de identidad
  -- PA pasaporte · PPT permiso por protección temporal · DNI documento extranjero
  document_type      text NOT NULL CHECK (document_type IN ('CC', 'CE', 'TI', 'PA', 'PPT', 'DNI')),
  document_number    text NOT NULL CHECK (document_number ~ '^[0-9A-Za-z-]{4,20}$'),
  -- F femenino · M masculino · NB no binario · ND prefiere no decir
  gender             text NOT NULL CHECK (gender IN ('F', 'M', 'NB', 'ND')),
  -- Cómo aparece en las donaciones; NULL = su nombre.
  public_name        text CHECK (public_name IS NULL OR length(public_name) BETWEEN 2 AND 120),
  -- ISO 3166-1 alfa-2 (CO, ES, US...)
  country            char(2) NOT NULL DEFAULT 'CO' CHECK (country = upper(country)),
  preferred_currency char(3) CHECK (preferred_currency IS NULL OR preferred_currency = upper(preferred_currency)),
  is_anonymous       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_number)
);
