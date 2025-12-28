-- Schema completo para RAG com pgvector
-- Neon PostgreSQL já possui a extensão vector habilitada

-- Habilita extensão (idempotente)
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela principal de chunks de código
CREATE TABLE IF NOT EXISTS code_chunks (
  id SERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL,
  path TEXT NOT NULL,
  chunk_index INT DEFAULT 0,
  embedding vector(1536),
  content TEXT NOT NULL,
  symbols TEXT[] DEFAULT '{}',
  language TEXT,
  start_line INT,
  end_line INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, path, chunk_index)
);

-- Tabela de documentação indexada
CREATE TABLE IF NOT EXISTS doc_chunks (
  id SERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL,
  path TEXT NOT NULL,
  chunk_index INT DEFAULT 0,
  embedding vector(1536),
  content TEXT NOT NULL,
  title TEXT,
  doc_type TEXT, -- readme, markdown, comment, docstring
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, path, chunk_index)
);

-- Tabela de embeddings de queries para cache
CREATE TABLE IF NOT EXISTS query_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  embedding vector(1536),
  results JSONB,
  hit_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de repositórios indexados
CREATE TABLE IF NOT EXISTS indexed_repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  branch TEXT DEFAULT 'main',
  total_files INT DEFAULT 0,
  total_chunks INT DEFAULT 0,
  languages JSONB DEFAULT '{}',
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending', -- pending, indexing, ready, failed
  error_message TEXT
);

-- Índices HNSW para busca vetorial (mais rápido que IVFFlat para datasets médios)
CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding 
  ON code_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding 
  ON doc_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_query_cache_embedding 
  ON query_cache 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índices para filtros comuns
CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_path ON code_chunks(path);
CREATE INDEX IF NOT EXISTS idx_code_chunks_language ON code_chunks(language);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_repo ON doc_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_indexed_repos_status ON indexed_repos(status);

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-update
DROP TRIGGER IF EXISTS code_chunks_updated_at ON code_chunks;
CREATE TRIGGER code_chunks_updated_at
  BEFORE UPDATE ON code_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Função de busca híbrida (semântica + keyword)
CREATE OR REPLACE FUNCTION search_code(
  query_embedding vector(1536),
  query_text TEXT,
  repo_filter TEXT DEFAULT NULL,
  lang_filter TEXT DEFAULT NULL,
  max_results INT DEFAULT 10
)
RETURNS TABLE (
  id INT,
  repo_id TEXT,
  path TEXT,
  content TEXT,
  symbols TEXT[],
  language TEXT,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.repo_id,
    c.path,
    c.content,
    c.symbols,
    c.language,
    1 - (c.embedding <=> query_embedding) AS semantic_score,
    CASE 
      WHEN c.content ILIKE '%' || query_text || '%' THEN 0.3
      ELSE 0.0
    END AS keyword_score,
    (1 - (c.embedding <=> query_embedding)) + 
    CASE WHEN c.content ILIKE '%' || query_text || '%' THEN 0.3 ELSE 0.0 END AS combined_score
  FROM code_chunks c
  WHERE 
    (repo_filter IS NULL OR c.repo_id = repo_filter)
    AND (lang_filter IS NULL OR c.language = lang_filter)
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Função para limpar cache antigo
CREATE OR REPLACE FUNCTION cleanup_query_cache(days_old INT DEFAULT 7)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM query_cache 
  WHERE last_used_at < NOW() - (days_old || ' days')::INTERVAL
    AND hit_count < 5;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Estatísticas iniciais
COMMENT ON TABLE code_chunks IS 'Chunks de código indexados com embeddings para RAG';
COMMENT ON TABLE doc_chunks IS 'Chunks de documentação indexados para RAG';
COMMENT ON TABLE query_cache IS 'Cache de embeddings de queries frequentes';
COMMENT ON TABLE indexed_repos IS 'Repositórios indexados e status';
