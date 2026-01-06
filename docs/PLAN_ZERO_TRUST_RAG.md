# Plano de Execução — Sandbox Zero-Trust + RAG Multinível

Este plano complementa o REAL_IMPLEMENTATION_PLAN com foco em isolamento forte e RAG semântico. Entregáveis são incrementais para evitar regressões.

## Fase A — Sandbox Zero-Trust (gVisor + Docker)
- **A.1 Runtime gVisor**: detectar `runsc` e usar `--runtime=runsc` quando disponível; fallback para runc. Expor capacidades em `getSandboxCapabilities`.
- **A.2 Imagem base runner**: imagem `legacyguard-runner` com Node 20, Python 3.11, Go; configurável por flag `sandbox.image`.
- **A.3 Políticas de isolamento**: `--network=none`, `--memory=512m`, `--cpus=0.5`, `--read-only`, `--tmpfs=/tmp`; opt-in para egress via proxy controlado.
- **A.4 Rollback rápido**: snapshot do workspace antes da execução (integra com pipeline de rollback da Fase 5.2). Fallback para restore via tar/rsync.
- **A.5 Testes**: unit com mocks de child_process (detecção docker/runsc); integração opcional validando flags de runtime e network=none.

## Fase B — RAG Semântico Multinível
- **B.1 Embeddings v3 + chunking por símbolo/AST**: usar `text-embedding-3-small|large`, quebrar por funções/classes; fallback para chunk por linhas se AST falhar.
- **B.2 Knowledge Graph**: persistir grafo (JSON/PG) de dependências e símbolos; API retorna nó + vizinhos (callers/callees/globals tocados).
- **B.3 Re-ranking**: após top-20 vetoriais, re-ranquear com BGE/Cohere Rerank para top-3; opt-in via config com timeout e cache.
- **B.4 Avaliação**: conjunto de queries fixas e métricas de precisão antes/depois; testes de contrato para símbolo+vizinho+snippet.

## Fase C — Integração e Operação
- **C.1 Toggles**: `sandbox.runtime`, `sandbox.image`, `sandbox.egressProxy`; `rag.embeddingModel`, `rag.reranker`, `rag.graphBackend`.
- **C.2 Observabilidade**: logs de runtime selecionado/fallback; métricas de sucesso/falha sandbox, latência reranker, acurácia RAG.
- **C.3 Segurança**: testes de fuga (curl/apt) em pipeline de CI opcional; reforçar validador de comandos perigosos.

## Status Atual (bootstrap)
- Runtime gVisor: autodetecção adicionada (runsc) e suporte a `runtime`/`image` no sandbox; limites padrão mais restritos (mem=512m, cpu=0.5) e tmpfs configurado; envs `LEGACYGUARD_SANDBOX_RUNTIME`/`LEGACYGUARD_SANDBOX_IMAGE` expostos via API/orchestrator.
- Capabilities expõem `runsc` e imagem customizável; tests cobrem runtime flag e fallbacks.
- Snapshot/rollback: implementado pipeline com snapshot + restore automático em falha (tests em tests/execution-pipeline.test.ts) e integrado no sandbox via `snapshotOnFail` (tests/sandbox-snapshot.test.ts) para execuções readwrite; padrão ativo quando fsPolicy=readwrite.
- **LOA→snapshotOnFail**: orchestrator agora classifica intent e força `snapshotOnFail=true` quando LOA ≥ 2 ou fsPolicy=readwrite; snapshot events são auditados (`snapshot.created`, `snapshot.restored`, `snapshot.restore_failed`); tests em `tests/loa-snapshot-mapping.test.ts`.
- RAG: chunking AST por símbolo/classe para TS/JS e fallback por linhas; metadados (imports/exports) e grafo de dependências persistido em tabelas `code_graph_nodes`/`code_graph_edges` quando `RAG_GRAPH_ENABLED=true`; API `/api/search` pode opcionalmente retornar vizinhos de grafo.
- **Reranker + AST multilíngue**: módulo `src/lib/reranker.ts` aplica graph-neighbor boost (0.15 padrão) em resultados de busca; suporta integração opcional com Cohere Rerank API; AST chunking agora suporta Python (def/class/async/imports) e Go (func/methods/types/imports) via regex; tests em `tests/reranker-ast.test.ts` (15 testes); feature flags: `RAG_RERANKER_ENABLED`, `RAG_GRAPH_BOOST_WEIGHT`, `RAG_EXTERNAL_RERANKER`, `COHERE_API_KEY`.
- Próximos passos sugeridos:
  1) ✅ ~~Ligar snapshotOnFail por padrão em execuções LOA>1/FS readwrite no fluxo real.~~ (Concluído)
  2) ✅ ~~Expor consumo real do grafo no reranker/contexto (boost vizinhos) e suportar AST para Python/Go.~~ (Concluído)
  3) Integrar benchmarks de reranker (B.4) e conjunto de queries de avaliação de precisão.
  4) Testes de fuga sandbox (C.3) e observabilidade (C.2).
