import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../src/lib/audit', () => ({
  logEvent: vi.fn().mockResolvedValue(1),
}));

import { buildExecutionPlan, indexConversation } from '../src/lib/execution-journal';
import { logEvent } from '../src/lib/audit';

describe('execution-journal', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('buildExecutionPlan gera markdown e loga evento', () => {
    const { planId, markdown } = buildExecutionPlan({
      intent: 'refatorar auth',
      objectives: ['aumentar segurança', 'melhorar testes'],
      safetyLevel: 2,
      approver: 'admin@test',
      steps: [
        { title: 'mapear fluxo', detail: 'levantar endpoints e dependências' },
        { title: 'adicionar testes', detail: 'criar suíte para login/refresh' },
      ],
      notes: 'rodar em sandbox',
      sources: ['docs/auth.md'],
    });

    expect(planId).toMatch(/^plan_/);
    expect(markdown).toContain('Plano de Execução');
    expect(markdown).toContain('Objetivos');
    expect(markdown).toContain('## Passos');
    expect(markdown).toContain('mapear fluxo');
    expect(markdown).toContain('adicionar testes');
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'execution_plan.created', metadata: expect.objectContaining({ planId }) })
    );
  });

  it('indexConversation grava transcript com planMarkdown e sanitiza planId', async () => {
    const planMarkdown = '# Plano\n1. fazer x\n2. fazer y';
    const planId = 'plan id com espaços/#weird';

    const { filePath } = await indexConversation({
      planId,
      planMarkdown,
      conversation: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá' },
        { role: 'tool', content: 'resultado' },
      ],
      repoPath: tempDir,
    });

    // Caminho deve usar planId sanitizado
    expect(filePath).toContain('plan_id_com_espa_os__weird');

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('# Conversa');
    expect(content).toContain('## Plano');
    expect(content).toContain(planMarkdown);
    expect(content).toContain('## Transcript');
    expect(content).toContain('### USER');
    expect(content).toContain('### ASSISTANT');
    expect(content).toContain('### TOOL');

    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'execution_conversation.indexed', metadata: expect.objectContaining({ planId: 'plan_id_com_espa_os__weird' }) })
    );
  });
});
