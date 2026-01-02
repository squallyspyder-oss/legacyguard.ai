"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExecutor = runExecutor;
const octokit_1 = require("octokit");
const audit_1 = require("../lib/audit");
// System prompt para o Executor Agent
const EXECUTOR_SYSTEM_PROMPT = `Você é o Executor Agent do LegacyGuard, responsável por ações privilegiadas como merge de PRs e deploy.

RESPONSABILIDADES:
1. Validar que PR passou por review antes do merge
2. Verificar status de CI/CD (checks passando)
3. Garantir que não há conflitos
4. Documentar a ação tomada
5. Preparar rollback em caso de falha

VALIDAÇÕES OBRIGATÓRIAS ANTES DO MERGE:
- PR aprovada por reviewer
- CI/CD checks passando
- Sem conflitos com base branch
- Sandbox passou (se configurado)

FORMATO DE RESPOSTA (JSON):
{
  "action": "merge|deploy|abort",
  "reason": "Motivo da decisão",
  "validations": {
    "approved": true,
    "checksPass": true,
    "noConflicts": true,
    "sandboxPassed": true
  },
  "risks": ["lista de riscos"],
  "rollbackPlan": "Plano de rollback detalhado",
  "postMergeActions": ["ações recomendadas pós-merge"]
}`;
async function runExecutor(task) {
    var _a, _b, _c, _d, _e;
    // Validações iniciais
    const validations = {
        hasToken: Boolean(task.token),
        prExists: false,
        approved: (_a = task.reviewerApproved) !== null && _a !== void 0 ? _a : false,
        checksPass: false,
        noConflicts: false,
        sandboxPassed: (_b = task.sandboxPassed) !== null && _b !== void 0 ? _b : true,
    };
    if (!task.token) {
        await (0, audit_1.logEvent)({
            action: 'executor.denied',
            severity: 'error',
            message: 'Token ausente para executor',
            metadata: { prNumber: task.prNumber, owner: task.owner, repo: task.repo },
        }).catch(() => undefined);
        const prNum = (_c = task.prNumber) !== null && _c !== void 0 ? _c : -1;
        return {
            role: 'executor',
            action: 'aborted',
            merged: false,
            prNumber: prNum,
            prUrl: task.owner && task.repo && task.prNumber ? `https://github.com/${task.owner}/${task.repo}/pull/${task.prNumber}` : 'unknown',
            validations,
            reason: 'Token de autenticação ausente',
            risks: ['Operação não autorizada'],
            rollbackPlan: 'N/A - operação não executada',
            postMergeActions: [],
        };
    }
    const octo = new octokit_1.Octokit({ auth: task.token });
    const { owner, repo, prNumber } = task;
    // Ensure required GitHub identifiers are present
    if (!owner || !repo || typeof prNumber !== 'number') {
        const prNum = prNumber !== null && prNumber !== void 0 ? prNumber : -1;
        return {
            role: 'executor',
            action: 'aborted',
            merged: false,
            prNumber: prNum,
            prUrl: owner && repo && typeof prNumber === 'number' ? `https://github.com/${owner}/${repo}/pull/${prNumber}` : 'unknown',
            validations,
            reason: 'Missing owner/repo/prNumber for executor operation',
            risks: ['Insufficient context for PR operations'],
            rollbackPlan: 'N/A',
            postMergeActions: [],
        };
    }
    // Buscar informações da PR
    let prData;
    try {
        const prResponse = await octo.rest.pulls.get({ owner, repo, pull_number: prNumber });
        prData = prResponse.data;
        validations.prExists = true;
        validations.noConflicts = prData.mergeable === true;
    }
    catch (err) {
        const prNum = prNumber !== null && prNumber !== void 0 ? prNumber : -1;
        return {
            role: 'executor',
            action: 'aborted',
            merged: false,
            prNumber: prNum,
            prUrl: owner && repo && prNumber ? `https://github.com/${owner}/${repo}/pull/${prNumber}` : 'unknown',
            validations,
            reason: `PR não encontrada: ${(err === null || err === void 0 ? void 0 : err.message) || err}`,
            risks: ['PR pode ter sido fechada ou deletada'],
            rollbackPlan: 'N/A',
            postMergeActions: [],
        };
    }
    // Verificar status dos checks
    try {
        const checksResponse = await octo.rest.checks.listForRef({
            owner,
            repo,
            ref: prData.head.sha,
        });
        const allChecks = checksResponse.data.check_runs;
        const failedChecks = allChecks.filter((c) => c.conclusion === 'failure');
        validations.checksPass = failedChecks.length === 0;
    }
    catch {
        // Se não conseguir verificar, assume que não passou
        validations.checksPass = false;
    }
    // Verificar reviews/aprovações
    try {
        const reviewsResponse = await octo.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: prNumber,
        });
        const approvals = reviewsResponse.data.filter((r) => r.state === 'APPROVED');
        validations.approved = approvals.length > 0 || task.reviewerApproved === true;
    }
    catch {
        // Manter valor padrão
    }
    // Avaliar se deve prosseguir com merge
    const canMerge = validations.approved &&
        validations.checksPass &&
        validations.noConflicts &&
        validations.sandboxPassed;
    const risks = [];
    if (!validations.approved)
        risks.push('PR não aprovada por reviewer');
    if (!validations.checksPass)
        risks.push('CI/CD checks não passaram');
    if (!validations.noConflicts)
        risks.push('Existem conflitos com a branch base');
    if (!validations.sandboxPassed)
        risks.push('Sandbox não validou as mudanças');
    // Gerar plano de rollback
    const rollbackPlan = `
1. Identificar o commit de merge: \`${prData.head.sha.slice(0, 7)}\`
2. Reverter com: \`git revert -m 1 <merge-commit-sha>\`
3. Criar PR de rollback
4. Se necessário, cherry-pick commits específicos para manter
5. Notificar equipe sobre rollback
`.trim();
    // Ações pós-merge recomendadas
    const postMergeActions = [];
    if (task.twinContext) {
        postMergeActions.push('Verificar se incidente foi resolvido');
        postMergeActions.push('Executar testes de regressão');
        if (((_d = task.twinContext.behavior) === null || _d === void 0 ? void 0 : _d.risk) === 'high') {
            postMergeActions.push('Monitorar métricas por 24h');
        }
    }
    postMergeActions.push('Atualizar documentação se necessário');
    postMergeActions.push('Comunicar mudanças à equipe');
    if (!canMerge) {
        await (0, audit_1.logEvent)({
            action: 'executor.blocked',
            severity: 'warn',
            message: `Merge bloqueado: ${risks.join(', ')}`,
            metadata: { prNumber, owner, repo, validations },
        }).catch(() => undefined);
        return {
            role: 'executor',
            action: 'aborted',
            merged: false,
            prNumber,
            prUrl: prData.html_url,
            validations,
            reason: `Merge bloqueado: ${risks.join('; ')}`,
            risks,
            rollbackPlan: 'N/A - merge não executado',
            postMergeActions: ['Resolver issues antes de tentar novamente'],
        };
    }
    // Executar merge
    let mergeCommitSha;
    try {
        const mergeResponse = await octo.rest.pulls.merge({
            owner,
            repo,
            pull_number: prNumber,
            merge_method: task.mergeMethod || 'squash',
            commit_title: task.commitTitle || `Merge PR #${prNumber} via LegacyGuard`,
            commit_message: task.commitMessage || buildMergeCommitMessage(task, prData),
        });
        mergeCommitSha = mergeResponse.data.sha;
        await (0, audit_1.logEvent)({
            action: 'executor.merged',
            severity: 'info',
            message: `PR #${prNumber} merged successfully`,
            metadata: {
                prNumber,
                owner,
                repo,
                sha: mergeCommitSha,
                twinId: (_e = task.twinContext) === null || _e === void 0 ? void 0 : _e.twinId,
            },
        }).catch(() => undefined);
        return {
            role: 'executor',
            action: 'merged',
            merged: true,
            prNumber,
            prUrl: prData.html_url,
            mergeCommitSha,
            validations,
            reason: 'PR merged successfully',
            risks: [],
            rollbackPlan,
            postMergeActions,
        };
    }
    catch (err) {
        await (0, audit_1.logEvent)({
            action: 'executor.failed',
            severity: 'error',
            message: `Merge falhou: ${(err === null || err === void 0 ? void 0 : err.message) || err}`,
            metadata: { prNumber, owner, repo },
        }).catch(() => undefined);
        return {
            role: 'executor',
            action: 'aborted',
            merged: false,
            prNumber,
            prUrl: prData.html_url,
            validations,
            reason: `Merge falhou: ${(err === null || err === void 0 ? void 0 : err.message) || err}`,
            risks: ['Erro durante operação de merge'],
            rollbackPlan: 'N/A - merge não completado',
            postMergeActions: ['Investigar erro e tentar novamente'],
        };
    }
}
function buildMergeCommitMessage(task, prData) {
    let message = `Merged via LegacyGuard\n\n`;
    message += `PR: #${task.prNumber}\n`;
    message += `Title: ${prData.title}\n`;
    if (task.twinContext) {
        message += `\n## Incident Context\n`;
        message += `Twin ID: ${task.twinContext.twinId}\n`;
        if (task.twinContext.behavior) {
            message += `Risk: ${task.twinContext.behavior.risk}\n`;
        }
    }
    return message;
}
