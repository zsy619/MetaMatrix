-- List, archive, and revision paths. Partial indexes match deleted_at filters.
CREATE INDEX IF NOT EXISTS idx_docs_owner_updated
  ON canvas_documents (owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_docs_owner_active_updated
  ON canvas_documents (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_docs_owner_archived
  ON canvas_documents (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revisions_doc_created
  ON canvas_revisions (document_id, created_at DESC);
