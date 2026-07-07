-- migration-v77-company-documents-align.sql
-- Repara deriva de esquema en tt_company_documents (tabla con 0 filas).
--
-- El código (documentCreateSchema en lib/schemas/companies.ts, la API
-- /api/companies/[id]/documents y el wizard tab-documents) espera columnas
-- que nunca se migraron en prod: doc_kind, label, storage_path,
-- storage_bucket, is_active, vencimientos, etc. Por eso la feature de
-- documentos de empresa estaba rota (el GET filtra por is_active y el
-- INSERT usa doc_kind/label/storage_path → error de columna inexistente)
-- y la tabla siguió vacía. Con 0 filas, renombrar/agregar es seguro.
--
-- Esta migración alinea la tabla al contrato del código y habilita la
-- biblioteca central de documentos (/archivo).

ALTER TABLE tt_company_documents RENAME COLUMN doc_type  TO doc_kind;
ALTER TABLE tt_company_documents RENAME COLUMN name      TO label;
ALTER TABLE tt_company_documents RENAME COLUMN file_path TO storage_path;
ALTER TABLE tt_company_documents RENAME COLUMN notes     TO description;

ALTER TABLE tt_company_documents
  ADD COLUMN IF NOT EXISTS storage_bucket    text NOT NULL DEFAULT 'company-documents',
  ADD COLUMN IF NOT EXISTS checksum_sha256   text,
  ADD COLUMN IF NOT EXISTS issued_at         date,
  ADD COLUMN IF NOT EXISTS expires_at        date,
  ADD COLUMN IF NOT EXISTS issuing_authority text,
  ADD COLUMN IF NOT EXISTS reference_number  text,
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true;

-- Dominio cerrado de doc_kind (mismos valores que DOC_KINDS en
-- lib/schemas/companies.ts). CHECK obligatorio por convención del repo.
ALTER TABLE tt_company_documents
  ADD CONSTRAINT tt_company_documents_doc_kind_check CHECK (doc_kind = ANY (ARRAY[
    'escritura_constitutiva','estatutos','poderes','alta_fiscal',
    'certificado_digital','firma_electronica','ticketbai_cert',
    'registro_mercantil','cuit_constancia','iibb_constancia',
    'ein_letter','articles_of_incorporation','operating_agreement',
    'cfdi_csd','rfc_constancia','cnpj_card','sintegra','rut_constancia',
    'logo','banner','signature_image','id_document','passport',
    'contract','addendum','other'
  ]));

CREATE INDEX IF NOT EXISTS idx_company_documents_company_active
  ON tt_company_documents (company_id, is_active);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_company_documents_company_active;
-- ALTER TABLE tt_company_documents DROP CONSTRAINT IF EXISTS tt_company_documents_doc_kind_check;
-- ALTER TABLE tt_company_documents
--   DROP COLUMN IF EXISTS storage_bucket,
--   DROP COLUMN IF EXISTS checksum_sha256,
--   DROP COLUMN IF EXISTS issued_at,
--   DROP COLUMN IF EXISTS expires_at,
--   DROP COLUMN IF EXISTS issuing_authority,
--   DROP COLUMN IF EXISTS reference_number,
--   DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE tt_company_documents RENAME COLUMN doc_kind     TO doc_type;
-- ALTER TABLE tt_company_documents RENAME COLUMN label        TO name;
-- ALTER TABLE tt_company_documents RENAME COLUMN storage_path TO file_path;
-- ALTER TABLE tt_company_documents RENAME COLUMN description  TO notes;
