"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReviewer = runReviewer;
exports.formatReviewForDisplay = formatReviewForDisplay;
const openai_1 = __importDefault(require("openai"));
const REVIEWER_SYSTEM_PROMPT = `Você é o Reviewer Agent do LegacyGuard, especializado em revisar código e garantir qualidade e compliance.

Sua função é analisar patches/mudanças propostas e validar:
1. SEGURANÇA: Não introduz vulnerabilidades (SQL Injection, XSS, etc.)
2. QUALIDADE: Código limpo, legível, bem estruturado
3. PERFORMANCE: Não degrada performance significativamente
4. COMPLIANCE: Respeita GDPR, SOC2, e boas práticas
5. TESTES: Mudanças têm cobertura de testes adequada

CRITÉRIOS DE APROVAÇÃO:
- Score >= 70: Aprovado com ressalvas
- Score >= 85: Aprovado
- Score < 70: Reprovado (precisa correções)

CHECKS DE COMPLIANCE:
- GDPR: Dados pessoais tratados corretamente
- SOC2: Logs de auditoria, controle de acesso
- OWASP: Top 10 vulnerabilidades web
- Clean Code: Princípios SOLID, DRY, KISS

Responda APENAS com JSON válido no formato:
{
  "approved": true/false,
  "score": 85,
  "issues": [
    {
      "severity": "warning",
      "category": "security",
      "file": "src/auth.ts",
      "line": 42,
      "message": "Token exposto em log",
      "suggestion": "Remover log ou mascarar token"
    }
  ],
  "suggestions": ["Adicionar testes para edge cases"],
  "complianceChecks": [
    {"rule": "GDPR-001", "passed": true, "details": "Dados pessoais criptografados"},
    {"rule": "OWASP-SQL", "passed": false, "details": "Query sem parametrização"}
  ],
  "summary": "Código aprovado com ressalvas menores"
}`;
async function runReviewer(task) {
    var _a, _b, _c;
    // Modo mock para testes/offline
    if (process.env.LEGACYGUARD_REVIEWER_MODE === 'mock' || (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === 'test')) {
        return {
            role: 'reviewer',
            approved: true,
            score: 85,
            issues: [],
            suggestions: ['Mock reviewer ativo: inclua código real para validação completa.'],
            complianceChecks: [],
            summary: 'Revisão mock (offline) aprovada para testes.',
        };
    }
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const codeToReview = task.patch || task.diff || task.code || '';
    if (!codeToReview.trim()) {
        return {
            role: 'reviewer',
            approved: false,
            score: 0,
            issues: [{ severity: 'error', category: 'quality', message: 'Nenhum código para revisar' }],
            suggestions: [],
            complianceChecks: [],
            summary: 'Nenhum código fornecido para revisão',
        };
    }
    const userPrompt = `
CÓDIGO/PATCH PARA REVISÃO:
\`\`\`
${codeToReview.slice(0, 15000)}
\`\`\`

${task.context ? `CONTEXTO:\n${task.context}` : ''}

${task.strictMode ? 'MODO ESTRITO: Seja mais rigoroso na avaliação.' : ''}

Faça uma revisão completa seguindo os critérios estabelecidos.
`;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
    });
    const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        throw new Error('Reviewer retornou JSON inválido');
    }
    const result = {
        role: 'reviewer',
        approved: (_c = parsed.approved) !== null && _c !== void 0 ? _c : false,
        score: Math.min(100, Math.max(0, parsed.score || 0)),
        issues: (parsed.issues || []).map((issue) => ({
            severity: issue.severity || 'info',
            category: issue.category || 'quality',
            file: issue.file,
            line: issue.line,
            message: issue.message || '',
            suggestion: issue.suggestion,
        })),
        suggestions: parsed.suggestions || [],
        complianceChecks: (parsed.complianceChecks || []).map((check) => {
            var _a;
            return ({
                rule: check.rule || 'UNKNOWN',
                passed: (_a = check.passed) !== null && _a !== void 0 ? _a : false,
                details: check.details || '',
            });
        }),
        summary: parsed.summary || 'Revisão concluída',
    };
    // Forçar reprovação se houver issues de segurança com severity error
    const criticalSecurityIssues = result.issues.filter((i) => i.severity === 'error' && i.category === 'security');
    if (criticalSecurityIssues.length > 0) {
        result.approved = false;
        result.score = Math.min(result.score, 50);
    }
    return result;
}
function formatReviewForDisplay(review) {
    const lines = [];
    const emoji = review.approved ? '✅' : '❌';
    lines.push(`## ${emoji} Revisão de Código (Score: ${review.score}/100)`);
    lines.push('');
    lines.push(`**Status:** ${review.approved ? 'APROVADO' : 'REPROVADO'}`);
    lines.push(`**Resumo:** ${review.summary}`);
    lines.push('');
    if (review.issues.length > 0) {
        lines.push('### 🔍 Issues Encontradas');
        lines.push('');
        for (const issue of review.issues) {
            const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            const location = issue.file ? ` em \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
            lines.push(`${icon} **[${issue.category.toUpperCase()}]** ${issue.message}${location}`);
            if (issue.suggestion) {
                lines.push(`   💡 ${issue.suggestion}`);
            }
        }
        lines.push('');
    }
    if (review.complianceChecks.length > 0) {
        lines.push('### 📋 Checks de Compliance');
        lines.push('');
        for (const check of review.complianceChecks) {
            const icon = check.passed ? '✅' : '❌';
            lines.push(`${icon} **${check.rule}**: ${check.details}`);
        }
        lines.push('');
    }
    if (review.suggestions.length > 0) {
        lines.push('### 💡 Sugestões');
        lines.push('');
        for (const sug of review.suggestions) {
            lines.push(`- ${sug}`);
        }
    }
    return lines.join('\n');
}
