"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOperator = runOperator;
const simple_git_1 = __importDefault(require("simple-git"));
const openai_1 = __importDefault(require("openai"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const audit_1 = require("../lib/audit");
// System prompt para o Operator Agent
const OPERATOR_SYSTEM_PROMPT = `Você é o Operator Agent do LegacyGuard, responsável por operações Git seguras e criação de PRs.

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
async function runOperator(task) {
    var _a, _b, _c;
    const repoPath = task.repoPath || process.cwd();
    const git = (0, simple_git_1.default)(repoPath);
    const llmEnabled = Boolean(process.env.OPENAI_API_KEY);
    // Determinar nome do branch
    const timestamp = Date.now();
    let branch = task.branchName;
    if (!branch) {
        const prefix = ((_a = task.action) === null || _a === void 0 ? void 0 : _a.includes('fix')) ? 'fix' :
            ((_b = task.action) === null || _b === void 0 ? void 0 : _b.includes('feat')) ? 'feat' : 'refactor';
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
        if (fs_1.default.existsSync(path_1.default.join(repoPath, dir))) {
            validations.hasTests = true;
            break;
        }
    }
    // Gerar descrições via LLM se disponível
    let commitMessage = task.prTitle || 'chore: apply automated patch';
    let prTitle = task.prTitle || `[LegacyGuard] Automated fix - ${branch}`;
    let prBody = task.prBody || '';
    let risks = [];
    let rollbackInstructions = '';
    if (llmEnabled && task.patch) {
        try {
            const llmResult = await generateOperatorDescriptions(task, branch);
            commitMessage = llmResult.commitMessage || commitMessage;
            prTitle = llmResult.prTitle || prTitle;
            prBody = llmResult.prBody || prBody;
            risks = llmResult.risks || [];
            rollbackInstructions = llmResult.rollbackInstructions || '';
        }
        catch (err) {
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
    if (task.patchFile && fs_1.default.existsSync(task.patchFile)) {
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
        }
        catch (err) {
            console.error('Push falhou:', err === null || err === void 0 ? void 0 : err.message);
            if ((_c = err === null || err === void 0 ? void 0 : err.message) === null || _c === void 0 ? void 0 : _c.includes('conflict')) {
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
    await (0, audit_1.logEvent)({
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
async function generateOperatorDescriptions(task, branch) {
    var _a, _b;
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
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
    const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
    const parsed = JSON.parse(content);
    return {
        commitMessage: parsed.commitMessage || '',
        prTitle: parsed.prTitle || '',
        prBody: parsed.prBody || '',
        risks: parsed.risks || [],
        rollbackInstructions: parsed.rollbackInstructions || '',
    };
}
function buildPrBodyFromTwin(twin, branch) {
    var _a, _b, _c, _d;
    let body = `## 🔬 Incident-Driven Fix by LegacyGuard

### Twin Context
- **Twin ID:** \`${twin.twinId}\`
- **Status:** ${twin.status}
`;
    if (twin.behavior) {
        body += `- **Risk Level:** ${twin.behavior.risk}\n`;
        body += `- **Behaviors:** ${twin.behavior.behaviors.join(', ')}\n`;
    }
    if ((_b = (_a = twin.impactGuardrails) === null || _a === void 0 ? void 0 : _a.warnings) === null || _b === void 0 ? void 0 : _b.length) {
        body += `\n### ⚠️ Impact Warnings\n`;
        twin.impactGuardrails.warnings.forEach(w => {
            body += `- ${w}\n`;
        });
    }
    if ((_d = (_c = twin.harness) === null || _c === void 0 ? void 0 : _c.commands) === null || _d === void 0 ? void 0 : _d.length) {
        body += `\n### 🧪 Suggested Test Commands\n`;
        twin.harness.commands.forEach(cmd => {
            body += `- **${cmd.name}:** \`${cmd.command}\`\n`;
        });
    }
    body += `\n### Rollback\n\`\`\`bash\ngit checkout main && git branch -D ${branch}\n\`\`\`\n`;
    return body;
}
