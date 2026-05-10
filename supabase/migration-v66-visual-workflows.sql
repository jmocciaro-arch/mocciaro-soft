-- =====================================================
-- v66 — Visual Workflow Builder (estilo Make / n8n)
-- =====================================================
-- Permite al usuario:
--   1. Definir plantillas de flujo visualmente con drag-and-drop
--   2. Adjuntar notas y archivos a cada nodo
--   3. Visualizar el progreso de un cliente / OC como diagrama
--
-- No reemplaza al Process Engine existente (tt_process_*) —
-- lo complementa: estos diagramas son la representación visual
-- editable, los procesos son las instancias en ejecución.
-- =====================================================

-- =====================================================
-- 1. PLANTILLAS DE WORKFLOW
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_visual_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'custom' CHECK (scope IN ('client', 'opportunity', 'order', 'sat', 'custom')),

  -- Si está vinculado a una entidad específica (cliente, OC, etc.)
  -- queda como instancia. Si no, es una plantilla reutilizable.
  entity_type TEXT,
  entity_id UUID,

  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  is_template BOOLEAN NOT NULL DEFAULT false,
  parent_template_id UUID REFERENCES tt_visual_workflows(id) ON DELETE SET NULL,

  created_by_user_id UUID REFERENCES tt_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_workflows_entity ON tt_visual_workflows(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_visual_workflows_template ON tt_visual_workflows(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_visual_workflows_company ON tt_visual_workflows(company_id);

-- =====================================================
-- 2. NODOS DEL WORKFLOW
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES tt_visual_workflows(id) ON DELETE CASCADE,

  -- Tipo de nodo: similar a Make (trigger, action, condition, etc.)
  node_type TEXT NOT NULL DEFAULT 'stage' CHECK (node_type IN (
    'trigger', 'stage', 'action', 'condition', 'document', 'approval', 'note', 'integration'
  )),
  -- Subtipo más específico (ej: 'email', 'create_quote', 'wait_payment')
  node_subtype TEXT,

  -- Display
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#FF6600',

  -- Estado de ejecución (cuando es instancia)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked', 'failed')),

  -- Posición en el canvas (drag-and-drop)
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,

  -- Configuración del nodo (json libre — depende del tipo)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Notas del usuario (markdown)
  notes TEXT,

  -- Archivos adjuntos
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Vínculo opcional al sistema real
  document_id UUID REFERENCES tt_documents(id) ON DELETE SET NULL,
  process_stage_id UUID REFERENCES tt_process_stages(id) ON DELETE SET NULL,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON tt_workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_document ON tt_workflow_nodes(document_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_status ON tt_workflow_nodes(status);

-- =====================================================
-- 3. CONEXIONES (EDGES) ENTRE NODOS
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES tt_visual_workflows(id) ON DELETE CASCADE,

  source_node_id UUID NOT NULL REFERENCES tt_workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES tt_workflow_nodes(id) ON DELETE CASCADE,

  -- Handles para ramificaciones (e.g. condition: 'true' / 'false')
  source_handle TEXT,
  target_handle TEXT,

  -- Etiqueta opcional sobre la flecha
  label TEXT,

  -- Tipo (smoothstep, straight, bezier, animated)
  edge_type TEXT DEFAULT 'smoothstep',
  animated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No edges duplicadas con el mismo par source-target-handle
  CONSTRAINT unique_edge UNIQUE (source_node_id, target_node_id, source_handle, target_handle)
);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow ON tt_workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_source ON tt_workflow_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_target ON tt_workflow_edges(target_node_id);

-- =====================================================
-- 4. TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION tt_visual_workflow_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visual_workflows_touch ON tt_visual_workflows;
CREATE TRIGGER trg_visual_workflows_touch
  BEFORE UPDATE ON tt_visual_workflows
  FOR EACH ROW EXECUTE FUNCTION tt_visual_workflow_touch();

DROP TRIGGER IF EXISTS trg_workflow_nodes_touch ON tt_workflow_nodes;
CREATE TRIGGER trg_workflow_nodes_touch
  BEFORE UPDATE ON tt_workflow_nodes
  FOR EACH ROW EXECUTE FUNCTION tt_visual_workflow_touch();

-- =====================================================
-- 5. RLS
-- =====================================================
ALTER TABLE tt_visual_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_workflow_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visual_workflows_all_authenticated" ON tt_visual_workflows;
CREATE POLICY "visual_workflows_all_authenticated"
  ON tt_visual_workflows FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workflow_nodes_all_authenticated" ON tt_workflow_nodes;
CREATE POLICY "workflow_nodes_all_authenticated"
  ON tt_workflow_nodes FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workflow_edges_all_authenticated" ON tt_workflow_edges;
CREATE POLICY "workflow_edges_all_authenticated"
  ON tt_workflow_edges FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- 6. PLANTILLAS POR DEFECTO
-- =====================================================
-- Plantilla "Lead-to-Cash" (la del flujo comercial estándar)
INSERT INTO tt_visual_workflows (id, name, description, scope, is_template)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Lead-to-Cash (estándar)',
  'Flujo comercial completo desde lead hasta cobro',
  'custom',
  true
) ON CONFLICT (id) DO NOTHING;

-- Plantilla "OC Cliente"
INSERT INTO tt_visual_workflows (id, name, description, scope, is_template)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'OC de cliente — desde recepción hasta cobro',
  'Cuando llega una orden de compra del cliente: validar, convertir a pedido, entregar, facturar y cobrar',
  'order',
  true
) ON CONFLICT (id) DO NOTHING;
