# RNER (Rede Neural de Engenharia Reversa)

> Versão básica para v0 — guia de como estruturar e integrar o protótipo. Será evoluída em próximas iterações.

## Objetivo
Criar um pipeline leve para perfilar binários/trechos legados, extrair sinais de comportamento e sugerir fixtures/comandos para o Twin Builder sem comprometer segurança.

## Escopo Mínimo (v0)
- Entrada: artefato ou caminho para binário/script + metadados (stack, SO, hints)
- Saída: "perfil" com classes de comportamento, hotspots e comandos sugeridos para reprodução no Twin
- Execução: sempre dentro de sandbox Docker (rede bloqueada, FS readonly), com limites de CPU/memória/tempo

## Pipeline Proposto
1) **Ingestão**: receber caminho/bytes + metadados; validar tamanho e tipo; recusar arquivos acima do limite.
2) **Lifting/IR** (opcional no v0): coleta leve de strings/símbolos e entropia; não armazenar binário completo.
3) **Features**: extrair sinais rápidos (strings-chave, seções, entropia, presença de URLs/hosts, comandos suspeitos).
4) **Classificação**: classificar comportamentos em classes simples: `network-client`, `network-server`, `fs-heavy`, `crypto`, `installer`, `scripting`.
5) **Saída/Twin**: montar recomendações de comandos/fixtures para o Twin Builder e alertas de risco.

## Campos de Saída (v0)
```json
{
  "artifactId": "uuid",
  "risk": "low|medium|high|critical",
  "behaviors": ["network-client"],
  "reasons": ["found string: https://"],
  "hotspots": [".text:0x1a2b", "strings:curl"] ,
  "suggestedCommands": [
    { "name": "run-basic", "command": "./artifact --help", "notes": "capturar stderr" },
    { "name": "trace-fs", "command": "strace -f -e trace=file -s 128 ./artifact", "notes": "rede bloqueada" }
  ],
  "fixtures": [
    { "name": "config-default", "content": "" }
  ]
}
```

## Segurança e Limites
- Rodar somente em container isolado (use `scripts/runner_sandbox.sh` ou equivalente).
- Rede: desabilitada (`--network none`).
- FS: montar somente volume de trabalho em modo readonly quando possível.
- Limites: CPU (1–2 cores), memória (512–1024MB), timeout (≤ 60s), saída truncada.
- Mascaramento: aplicar o mascaramento de `src/lib/secrets.ts` a toda saída/log.

## Dependências Externas Recomendadas
- **Ferramentas de análise leve**: `strings`, `file`, `xxd`, `objdump` (já presentes em imagens base Ubuntu/Debian). Opcional: `radare2` para listagem de símbolos (modo headless).
- **Sandbox**: Docker disponível no host; runner deve usar imagem base com tools mínimas (ex.: `debian:stable` + `binutils` + `strace`).

## Integração sugerida
- Criar um executor específico no worker para tarefas `rner.profile` que:
  1. Valida input e grava artefato em diretório temporário isolado.
  2. Executa script de features (strings/entropia/heurísticas) em container sem rede.
  3. Classifica com heurísticas simples (regex + contagem de tokens).
  4. Retorna `TwinBuilderResult` parcial com `impactGuardrails.warnings` populado.
- Expor endpoint interno (não público) para enfileirar tarefa RNER via Redis (similar ao fluxo atual de sandbox).

## Backlog (após v0)
- Adicionar coleta de syscalls controlada (`strace`) e CFG leve (radare2) para enriquecer features.
- Migrar heurística para modelo leve (Transformer ou MLP) treinado em dataset público de binários com labels de comportamento.
- Adicionar testes sintéticos automáticos para cada classe detectada (fixtures dinâmicas).
- Métricas: cobertura de classes, falso-positivo em rede/FS, tempo médio de perfil.

## Como testar (mínimo viável)
- Build imagem slim com ferramentas: `docker build -t legacyguard-rner -f Dockerfile.worker .` (ou imagem específica).
- Rodar local: `./scripts/runner_sandbox.sh /path/para/repo "npm test -- -i tests/orchestrator-sandbox.test.ts"` (para validar sandbox).
- Adicionar teste dedicado quando heurística inicial estiver implementada.
