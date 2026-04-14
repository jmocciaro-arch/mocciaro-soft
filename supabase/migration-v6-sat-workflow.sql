-- =====================================================
-- Migration v6: SAT Workflow — metadata column + indexes
-- =====================================================
-- Adds JSONB metadata column to tt_sat_tickets for storing
-- the 5-step SAT workflow data (diagnostico, cotizacion,
-- reparacion, torque, cierre) and pause/resume state.

-- 1. Add metadata column (JSONB, default empty object)
ALTER TABLE tt_sat_tickets
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Add diagnosis column if not exists (used by workflow for pre-fill)
ALTER TABLE tt_sat_tickets
  ADD COLUMN IF NOT EXISTS diagnosis TEXT;

-- 3. Add work_address column if not exists
ALTER TABLE tt_sat_tickets
  ADD COLUMN IF NOT EXISTS work_address TEXT;

-- 4. Index for querying tickets with active workflows
CREATE INDEX IF NOT EXISTS idx_sat_tickets_metadata_workflow
  ON tt_sat_tickets USING gin (metadata);

-- 5. Index for filtering by status (used heavily in SAT page)
CREATE INDEX IF NOT EXISTS idx_sat_tickets_status
  ON tt_sat_tickets (status);

-- 6. Index for filtering by priority
CREATE INDEX IF NOT EXISTS idx_sat_tickets_priority
  ON tt_sat_tickets (priority);

-- 7. Relax CHECK constraints to accept English status values
-- (the app uses 'open', 'in_progress', etc.)
ALTER TABLE tt_sat_tickets DROP CONSTRAINT IF EXISTS tt_sat_tickets_status_check;
ALTER TABLE tt_sat_tickets ADD CONSTRAINT tt_sat_tickets_status_check
  CHECK (status IN (
    'abierto', 'en_proceso', 'esperando_repuesto', 'resuelto', 'cerrado',
    'open', 'in_progress', 'waiting_parts', 'resolved', 'closed'
  ));

ALTER TABLE tt_sat_tickets DROP CONSTRAINT IF EXISTS tt_sat_tickets_priority_check;
ALTER TABLE tt_sat_tickets ADD CONSTRAINT tt_sat_tickets_priority_check
  CHECK (priority IN (
    'baja', 'normal', 'alta', 'urgente',
    'low', 'high', 'urgent'
  ));

-- 8. Drop NOT NULL on title if it exists (some inserts use description only)
ALTER TABLE tt_sat_tickets ALTER COLUMN title DROP NOT NULL;
