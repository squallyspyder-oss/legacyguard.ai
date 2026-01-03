import simpleGit, { SimpleGit } from 'simple-git';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { TwinBuilderResult } from './twin-builder';
import { logEvent } from '../lib/audit';
import { LEGACYGUARD_COMPACT_CONTEXT } from '../lib/system-context';

// System prompt para o Operator Agent
const OPERATOR_SYSTEM_PROMPT = `Você é o **Operator Agent** do LegacyGuard, responsável por operações Git seguras e criação de PRs.

## Contexto do Sistema
${LEGACYGUARD_COMPACT_CONTEXT}

## Seu Papel
Você executa operações Git controladas. O Orchestrator te chama para criar branches e patches.
- Você nunca faz merge diretamente (isso é do Executor)
- Suas PRs passam pelo Reviewer antes do merge
- Você deve sempre incluir instruções de rollback

RESPONSABILIDADES:
1. Criar branches seguindo convenções (lg/fix-*, lg/feat-*, lg/refactor-*)
2. Validar patches antes de aplicar
3. Gerar mensagens de commit descritivas
4. Criar PRs com descrição detalhada do que foi alterado
5. Documentar riscos e rollback instructions

VALIDAÇÕES OBRIGATÓRIAS:
- Nunca commitar em main/master diretamente
- Verificar se há conflitos antes de push
- Validar que o patch não introduz secrets
- Garantir que testes passam (se sandbox habilitado)

FORMATO DE RESPOSTA (JSON):
{
  "branchName": "lg/fix-issue-123",
  "commitMessage": "fix: resolve memory leak in cache module",
  "prTitle": "Fix: Memory leak in cache module",
  "prBody": "## Descrição\\n...\\n## Mudanças\\n...\\n## Testes\\n...\\n## Rollback\\n...",
  "validations": {
    "noSecrets": true,
    "notMainBranch": true,
    "hasTests": false
  },
  "risks": ["lista de riscos identificados"],
  "rollbackInstructions": "git revert <commit-sha>"
}`;

export type OperatorInput = {
  repoPath?: string;
  branchName?: string;
  patch?: string;
  patchFile?: string;
  prTitle?: string;
  prBody?: string;
  action?: string;
  push?: boolean;
  twinContext?: TwinBuilderResult;
  dependencyContext?: Record<string, unknown>;
};

export type OperatorOutput = {
  role: 'operator';
  branch: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  validations: {
    noSecrets: boolean;
    notMainBranch: boolean;
    hasTests: boolean;
    noConflicts: boolean;
  };
  risks: string[];
  rollbackInstructions: string;
  filesChanged: string[];
  pushed: boolean;
};

export async function runOperator(task: OperatorInput): Promise<OperatorOutput> {
  const repoPath = task.repoPath || process.cwd();
  const git: SimpleGit = simpleGit(repoPath);
  const llmEnabled = Boolean(process.env.OPENAI_API_KEY);
  
  // Determinar nome do branch
  const timestamp = Date.now();
  let branch = task.branchName;
  if (!branch) {
    const prefix = task.action?.includes('fix') ? 'fix' : 
                   task.action?.includes('feat') ? 'feat' : 'refactor';
    branch = `lg/${prefix}-${timestamp}`;
  }

  // Validações de segurança
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']).catch(() => 'unknown');
  const validations = {
    noSecrets: true,
    notMainBranch: !['main', 'master'].includes(currentBranch),
    hasTests: false,
    noConflicts: true,
  };

  // Verificar secrets no patch
  if (task.patch) {
    const secretPatterns = [/sk-[a-zA-Z0-9]{20,}/g, /ghp_[a-zA-Z0-9]{36}/g, /password\s*[:=]\s*['"][^'"]+['"]/gi];
    for (const pattern of secretPatterns) {
      if (pattern.test(task.patch)) {
        validations.noSecrets = false;
        break;
      }
    }
  }

  // Verificar se há testes no repo
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  for (const dir of testDirs) {
    if (fs.existsSync(path.join(repoPath, dir))) {
      validations.hasTests = true;
      break;
    }
  }

  // Gerar descrições via LLM se disponível
  let commitMessage = task.prTitle || 'chore: apply automated patch';
  let prTitle = task.prTitle || `[LegacyGuard] Automated fix - ${branch}`;
  let prBody = task.prBody || '';
  let risks: string[] = [];
  let rollbackInstructions = '';

  if (llmEnabled && task.patch) {
    try {
      const llmResult = await generateOperatorDescriptions(task, branch);
      commitMessage = llmResult.commitMessage || commitMessage;
      prTitle = llmResult.prTitle || prTitle;
      prBody = llmResult.prBody || prBody;
      risks = llmResult.risks || [];
      rollbackInstructions = llmResult.rollbackInstructions || '';
    } catch (err) {
      console.error('Operator LLM falhou, usando defaults', err);
    }
  }

  // Contexto de twin para PR body
  if (task.twinContext && !prBody) {
    prBody = buildPrBodyFromTwin(task.twinContext, branch);
  }

  if (!prBody) {
    prBody = `## Automated Change by LegacyGuard

### Branch: \`${branch}\`

### Validations
- No secrets in patch: ${validations.noSecrets ? '✅' : '❌'}
- Not main branch: ${validations.notMainBranch ? '✅' : '❌'}
- Has tests: ${validations.hasTests ? '✅' : '⚠️ No tests found'}

### Rollback
\`\`\`bash
git revert HEAD
\`\`\`
`;
  }

  // Executar operações Git
  await git.checkoutLocalBranch(branch);
  
  // Aplicar patch se fornecido como arquivo
  if (task.patchFile && fs.existsSync(task.patchFile)) {
    await git.raw(['apply', task.patchFile]);
  }

  await git.add('.');
  
  // Obter arquivos alterados
  const status = await git.status();
  const filesChanged = [...status.modified, ...status.created, ...status.deleted];

  await git.commit(commitMessage);

  // Push se solicitado
  let pushed = false;
  if (task.push !== false) {
    try {
      await git.push('origin', branch, ['--set-upstream']);
      pushed = true;
    } catch (err: any) {
      console.error('Push falhou:', err?.message);
      if (err?.message?.includes('conflict')) {
        validations.noConflicts = false;
      }
    }
  }

  // Rollback instructions
  if (!rollbackInstructions) {
    const lastCommit = await git.revparse(['HEAD']).catch(() => 'unknown');
    rollbackInstructions = `git checkout main && git branch -D ${branch}\n# ou para reverter: git revert ${lastCommit}`;
  }

  // Audit log
  await logEvent({
    action: 'operator.branch_created',
    severity: 'info',
    message: `Branch ${branch} criada com ${filesChanged.length} arquivos`,
    metadata: { branch, filesChanged: filesChanged.slice(0, 10), pushed, validations },
  }).catch(() => undefined);

  return {
    role: 'operator',
    branch,
    commitMessage,
    prTitle,
    prBody,
    validations,
    risks,
    rollbackInstructions,
    filesChanged,
    pushed,
  };
}

async function generateOperatorDescriptions(task: OperatorInput, branch: string): Promise<{
  commitMessage: string;
  prTitle: string;
  prBody: string;
  risks: string[];
  rollbackInstructions: string;
}> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let userPrompt = `Gere descrições para as seguintes mudanças:\n\n`;
  userPrompt += `Branch: ${branch}\n`;
  userPrompt += `Ação: ${task.action || 'automated fix'}\n\n`;
  
  if (task.patch) {
    userPrompt += `Patch/Diff:\n\`\`\`\n${task.patch.slice(0, 5000)}\n\`\`\`\n\n`;
  }

  if (task.twinContext) {
    userPrompt += `Contexto de Incidente:\n`;
    userPrompt += `- Twin ID: ${task.twinContext.twinId}\n`;
    userPrompt += `- Mensagem: ${task.twinContext.message}\n`;
    if (task.twinContext.behavior) {
      userPrompt += `- Risco: ${task.twinContext.behavior.risk}\n`;
    }
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: OPERATOR_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return {
    commitMessage: parsed.commitMessage || '',
    prTitle: parsed.prTitle || '',
    prBody: parsed.prBody || '',
    risks: parsed.risks || [],
    rollbackInstructions: parsed.rollbackInstructions || '',
  };
}

function buildPrBodyFromTwin(twin: TwinBuilderResult, branch: string): string {
  let body = `## 🔬 Incident-Driven Fix by LegacyGuard

### Twin Context
- **Twin ID:** \`${twin.twinId}\`
- **Status:** ${twin.status}
`;

  if (twin.behavior) {
    body += `- **Risk Level:** ${twin.behavior.risk}\n`;
    body += `- **Behaviors:** ${twin.behavior.behaviors.join(', ')}\n`;
  }

  if (twin.impactGuardrails?.warnings?.length) {
    body += `\n### ⚠️ Impact Warnings\n`;
    twin.impactGuardrails.warnings.forEach(w => {
      body += `- ${w}\n`;
    });
  }

  if (twin.harness?.commands?.length) {
    body += `\n### 🧪 Suggested Test Commands\n`;
    twin.harness.commands.forEach(cmd => {
      body += `- **${cmd.name}:** \`${cmd.command}\`\n`;
    });
  }

  body += `\n### Rollback\n\`\`\`bash\ngit checkout main && git branch -D ${branch}\n\`\`\`\n`;

  return body;
}
