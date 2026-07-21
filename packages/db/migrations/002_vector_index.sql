CREATE TABLE IF NOT EXISTS memory_chunks (
  tenant_id UUID NOT NULL,
  chunk_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  source_type STRING NOT NULL,
  source_ref STRING NOT NULL,
  text_summary STRING NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  superseded BOOL NOT NULL DEFAULT false,
  checksum STRING NOT NULL,
  embedding VECTOR(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, chunk_id),
  VECTOR INDEX (tenant_id, embedding)
);
