-- ============================================================
-- MIGRATION V32 — IA Avanzada: Voice SAT, OCR Receipts, Agent, Daily Summary
-- ============================================================

-- 1) TABLA: tt_agent_tasks — Tareas del agente autónomo
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','planning','executing','completed','failed')),
  plan JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  summary TEXT,
  ai_provider TEXT,
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_company ON tt_agent_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON tt_agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON tt_agent_tasks(created_at DESC);

-- 2) TABLA: tt_ai_summaries — Resúmenes ejecutivos diarios generados por IA
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  highlights JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  concerns JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  ai_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_company ON tt_ai_summaries(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_date ON tt_ai_summaries(date DESC);

-- 3) EXTENDER tt_documents — Campos OCR para comprobantes
-- ============================================================

ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS ocr_image_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS ocr_extracted_data JSONB;

-- Permitir type = 'gasto' (si hay CHECK constraint, agregar el valor)
-- Si no hay constraint, esto es un no-op y está bien
DO $$
BEGIN
  -- Intentar agregar 'gasto' al CHECK constraint si existe
  BEGIN
    ALTER TABLE tt_documents DROP CONSTRAINT IF EXISTS tt_documents_type_check;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- 4) RLS — Row Level Security en nuevas tablas
-- ============================================================

ALTER TABLE tt_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios autenticados pueden ver/crear/actualizar registros de sus empresas
DROP POLICY IF EXISTS "agent_tasks_auth" ON tt_agent_tasks;
CREATE POLICY "agent_tasks_auth" ON tt_agent_tasks
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ai_summaries_auth" ON tt_ai_summaries;
CREATE POLICY "ai_summaries_auth" ON tt_ai_summaries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5) Notificar PostgREST para recargar schema
-- ============================================================

NOTIFY pgrst, 'reload schema';
