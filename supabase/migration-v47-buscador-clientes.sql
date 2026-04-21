-- Tabla de clientes del buscador público
CREATE TABLE IF NOT EXISTS buscador_clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name   text NOT NULL,
  company     text,
  phone       text,
  country     text,
  approved    boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE buscador_clientes ENABLE ROW LEVEL SECURITY;

-- El propio usuario puede leer su perfil
CREATE POLICY "buscador: user reads own" ON buscador_clientes
  FOR SELECT USING (auth.uid() = user_id);

-- El propio usuario puede insertar su perfil (solo 1 vez, por UNIQUE)
CREATE POLICY "buscador: user inserts own" ON buscador_clientes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
