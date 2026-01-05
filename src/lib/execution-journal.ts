import fs from 'fs/promises';
import path from 'path';

export type ExecutionStep = {
  title: string;
  detail: string;
};

export type ConversationTurn = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
};

export function buildExecutionPlan(params: {
  intent: string;
  objectives: string[];
  safetyLevel?: number;
  steps: ExecutionStep[];
  approver?: string;
  notes?: string;
  sources?: string[];
}): { planId: string; markdown: string } {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const lines: string[] = [];
  lines.push(`# Plano de Execução — ${params.intent}`);
  lines.push('');
  lines.push(`- ID: ${planId}`);
  if (params.safetyLevel !== undefined) {
    lines.push(`- LOA/Safety: ${params.safetyLevel}`);
  }
  if (params.approver) {
    lines.push(`- Aprovador: ${params.approver}`);
  }
  lines.push('- Objetivos:');
  for (const obj of params.objectives) {
    lines.push(`  - ${obj}`);
  }
  lines.push('');
  lines.push('## Passos');
  params.steps.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step.title}`);
    lines.push(`   - ${step.detail}`);
  });
  if (params.sources && params.sources.length > 0) {
    lines.push('');
    lines.push('## Fontes / Referências');
    params.sources.forEach((s) => lines.push(`- ${s}`));
  }
  if (params.notes) {
    lines.push('');
    lines.push('## Notas');
    lines.push(params.notes);
  }
  return { planId, markdown: lines.join('\n') };
}

function sanitizePlanId(planId: string): string {
  const cleaned = planId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return cleaned || `plan_${Date.now()}`;
}

export async function indexConversation(params: {
  planId: string;
  conversation: ConversationTurn[];
  planMarkdown?: string;
  repoPath?: string;
}): Promise<{ filePath: string }> {
  const safePlanId = sanitizePlanId(params.planId);
  const repoPath = params.repoPath || process.cwd();
  const dir = path.join(repoPath, 'docs', 'conversas');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safePlanId}.md`);

  const lines: string[] = [];
  lines.push(`# Conversa — ${safePlanId}`);
  lines.push('');
  if (params.planMarkdown) {
    lines.push('## Plano');
    lines.push(params.planMarkdown);
    lines.push('');
  }
  lines.push('## Transcript');
  for (const turn of params.conversation) {
    lines.push(`### ${turn.role.toUpperCase()}`);
    lines.push(turn.content);
    lines.push('');
  }

  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
  return { filePath };
}
