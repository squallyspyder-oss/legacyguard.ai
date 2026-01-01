import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { simpleGit } from 'simple-git';
import { Octokit } from 'octokit';
import fs from 'fs';
import path from 'path';
import os from 'os';

function getExecSync() {
  // Dynamically require to avoid bundling child_process in edge/SSR builds
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('child_process').execSync;
}

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  let semgrepResults = '';
  let depVulnResults = '';
  let filesContext = '';
  let message = 'Analise o código fornecido com foco em segurança e refatoração.';
  let githubUrl: string | null = null;
  let accessToken: string | undefined = undefined;

  try {
    let body: any = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ reply: 'JSON inválido.' }, { status: 400 });
      }
    }

    if (body && 'githubUrl' in body) {
      message = body.message || 'Analise o repositório completo.';
      githubUrl = body.githubUrl.trim();

      if (!githubUrl || !githubUrl.includes('github.com')) {
        return NextResponse.json({ reply: 'URL do GitHub inválida.' });
      }

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacyguard-github-'));

      accessToken = body.accessToken as string | undefined;
      const cloneUrl = accessToken ? githubUrl.replace('https://', `https://${accessToken}@`) : githubUrl;

      try {
        await simpleGit().clone(cloneUrl, tempDir, ['--depth', '1', '--quiet']);
      } catch (e: any) {
        return NextResponse.json({ reply: `Erro ao clonar: ${e.message}` });
      }
    } else {
      const formData = await req.formData();
      message = (formData.get('message') as string) || 'Analise os arquivos.';
      const uploadedFiles = formData.getAll('files') as File[];

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacyguard-upload-'));

      for (const file of uploadedFiles) {
        if (file.size === 0 || file.size > 1000000) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(tempDir, safeName);
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
      }
    }

    if (!tempDir || fs.readdirSync(tempDir).length === 0) {
      return NextResponse.json({ reply: 'Nenhum código carregado.' });
    }

    // === Semgrep ===
    try {
      const output = getExecSync()( `npx semgrep scan --config=auto --quiet --json "${tempDir}"`, { timeout: 120000 } ).toString();
      const results = JSON.parse(output);
      const findings = results.results || [];

      if (findings.length > 0) {
        semgrepResults += `### ⚠️ ${findings.length} Vulnerabilidade(s) no Código Fonte (Semgrep)\n\n`;
        for (const f of findings.slice(0, 20)) {
          semgrepResults += `**${(f.extra.severity || 'info').toUpperCase()}** — ${f.extra.message}\n`;
          semgrepResults += `📄 \`${f.path}\` (linha ${f.start.line})\n\n`;
        }
      } else {
        semgrepResults += `### ✅ Nenhuma vulnerabilidade no código fonte detectada\n`;
      }
    } catch {
      semgrepResults += `### ⚠️ Falha no Semgrep — continuando com análise geral\n`;
    }

    // === Checks de Compliance (GDPR/SOC2) básicos ===
    // Heurísticas simples: busca por logs de dados sensíveis e uso de PII sem mascarar.
    try {
      const privacyFindings: string[] = [];
      const piiPatterns = [
        /cpf|cnpj|ssn|passport/i,
        /credit_card|card_number/i,
        /\btoken\b|api_key|secret/i,
        /documento_pessoal/i,
      ];

      const walkFiles: { path: string; content: string }[] = [];
      const walk = (dir: string, base = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.join(base, entry.name);
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) continue;
          const ext = path.extname(rel).toLowerCase();
          if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'].includes(ext)) continue;
          const content = fs.readFileSync(full, 'utf8');
          walkFiles.push({ path: rel, content });
        }
      };
      walk(tempDir, '');

      for (const f of walkFiles) {
        piiPatterns.forEach((re) => {
          if (re.test(f.content)) {
            privacyFindings.push(`Possível dado sensível em ${f.path} (padrão ${re.source})`);
          }
        });
        if (/console\.log\(.*token|api_key|secret/i.test(f.content)) {
          privacyFindings.push(`Token possivelmente logado em ${f.path}`);
        }
      }

      if (privacyFindings.length > 0) {
        semgrepResults += `### 🚨 Compliance (GDPR/SOC2) — Riscos de dados sensíveis\n\n`;
        privacyFindings.slice(0, 20).forEach((f) => {
          semgrepResults += `- ${f}\n`;
        });
      } else {
        semgrepResults += `### ✅ Compliance (GDPR/SOC2) — Nenhum padrão sensível encontrado (heurístico)\n`;
      }
    } catch {
      semgrepResults += `### ⚠️ Compliance check falhou (heurística)\n`;
    }

    // === Scan de Dependências Gratuito (npm audit + pip-audit) ===
    try {
      const hasPackageJson = fs.existsSync(path.join(tempDir, 'package.json'));
      const hasRequirementsTxt = fs.existsSync(path.join(tempDir, 'requirements.txt'));

      if (hasPackageJson) {
        console.log('Executando npm audit...');
        try {
          const auditOutput = getExecSync()(`npm audit --json`, { cwd: tempDir, timeout: 60000 }).toString();
          const audit = JSON.parse(auditOutput);
          const vulns = audit.metadata.vulnerabilities;

          const total = vulns.info + vulns.low + vulns.moderate + vulns.high + vulns.critical;
          if (total > 0) {
            depVulnResults += `### 🚨 ${total} Vulnerabilidade(s) em Dependências (npm audit)\n\n`;
            depVulnResults += `Critical: ${vulns.critical} | High: ${vulns.high} | Moderate: ${vulns.moderate} | Low: ${vulns.low}\n\n`;
            depVulnResults += `Execute \`npm audit\` para detalhes e correções.\n\n`;
          } else {
            depVulnResults += `### ✅ Nenhuma vulnerabilidade em dependências npm\n`;
          }
        } catch (npmError: any) {
          depVulnResults += `### ⚠️ npm audit falhou\n`;
        }
      }

      if (hasRequirementsTxt) {
        try {
          getExecSync()(`pip install pip-audit`, { stdio: 'ignore' });
          const auditOutput = getExecSync()(`pip-audit --json`, { cwd: tempDir }).toString();
          const audit = JSON.parse(auditOutput);
          if (audit.vulnerabilities.length > 0) {
            depVulnResults += `### 🚨 ${audit.vulnerabilities.length} Vulnerabilidade(s) em pacotes Python\n\n`;
            for (const v of audit.vulnerabilities.slice(0, 10)) {
              depVulnResults += `**${v.severity.toUpperCase()}** — ${v.name} ${v.version}\n`;
            }
          } else {
            depVulnResults += `### ✅ Nenhuma vulnerabilidade em pacotes Python\n`;
          }
        } catch {
          depVulnResults += `### ⚠️ pip-audit não disponível\n`;
        }
      }

      if (!hasPackageJson && !hasRequirementsTxt) {
        depVulnResults += `### ℹ️ Nenhum package.json ou requirements.txt encontrado — skip scan de dependências\n`;
      }
    } catch (e) {
      depVulnResults += `### ⚠️ Falha no scan de dependências\n`;
    }

    // === Leitura de arquivos ===
    const allowed = /\.(js|ts|jsx|tsx|py|java|go|rs|php|rb|html|css|json|yaml|yml|md|txt)$/i;
    const walk = (dir: string, base = '') => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.join(base, entry.name);
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) continue;
          try {
            const stat = fs.statSync(full);
            if (allowed.test(entry.name) && stat.size < 100000) {
              const content = fs.readFileSync(full, 'utf-8');
              const trunc = content.length > 12000 ? content.slice(0, 12000) + '\n[...]' : content;
              filesContext += `\n\n=== ${rel} ===\n${trunc}\n=== Fim ===`;
            }
          } catch {}
        }
      } catch {}
    };

    walk(tempDir);

    const fullPrompt = `${semgrepResults}\n${depVulnResults}\n${message}\n\nArquivos:${filesContext}`;

    let reply: string;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: `Você é o LegacyGuard Agent.

Use os resultados do Semgrep e npm audit como base.
Gere relatório claro com patches em \`\`\`diff quando houver vulnerabilidades.
Além disso, gere testes unitários correspondentes sempre que possível.
Instruções para os testes:
- Inclua os arquivos de teste em blocos de código com o cabeçalho indicando o caminho do arquivo usando o formato \`\`\`file:tests/<nome_do_arquivo>.<ext>\\n<conteúdo>\\n\`\`\`.
- Suporte formatos comuns: Jest (JavaScript/TypeScript), pytest (Python).
- Não altere outros arquivos diretamente aqui — apenas gere o conteúdo dos testes.
Se for necessário, inclua sugestões de comandos para executar os testes.
Seja profissional e priorize segurança.`
          },
          { role: 'user', content: fullPrompt },
        ],
      });

      reply = completion.choices[0]?.message?.content?.trim() || 'Análise concluída.';
    } catch {
      reply = `**Modo simulado**\nSemgrep e npm audit executados.\nAdicione saldo na OpenAI para relatório completo.`;
    }

    // --- Extraia blocos de arquivos de teste do reply ---
    const tests: { file: string; content: string }[] = [];
    try {
      const fileRegex = /```file:([^\n]+)\n([\s\S]*?)```/g;
      let fm;
      while ((fm = fileRegex.exec(reply)) !== null) {
        const file = fm[1].trim();
        const content = fm[2].replace(/\r\n/g, '\n');
        tests.push({ file, content });
      }
    } catch {}

    const finalReply = `### 🔒 Relatório Completo de Segurança\n**LegacyGuard Agent**\n\n${reply}`;

    // Auto-apply patches if requested
    if (body && body.autoApply && githubUrl && accessToken) {
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        return NextResponse.json({ reply: finalReply + '\n\nErro: URL inválida para auto-apply.' });
      }
      const owner = urlMatch[1];
      const repo = urlMatch[2];
      const octokit = new Octokit({ auth: accessToken });

      // Extract diffs from reply
      const diffRegex = /```diff\n([\s\S]*?)\n```/g;
      let match;
      const diffs = [];
      while ((match = diffRegex.exec(reply)) !== null) {
        diffs.push(match[1]);
      }

      // If there are no diffs and no tests, nothing to apply
      if (diffs.length === 0 && tests.length === 0) {
        return NextResponse.json({ reply: finalReply + '\n\nNenhum patch ou teste encontrado para aplicar.' });
      }

      const git = simpleGit(tempDir);
      try {
        // Create new branch first so commits land on it
        const branchName = `legacyguard-fix-${Date.now()}`;
        await git.checkoutLocalBranch(branchName);

        // Apply each diff (if any)
        for (const diff of diffs) {
          await git.applyPatch(diff);
        }

        // Write generated test files (if any)
        for (const t of tests) {
          try {
            const target = path.join(tempDir, t.file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, t.content, 'utf-8');
          } catch (e) {
            // ignore individual write errors but continue
          }
        }

        // Add a GitHub Actions workflow to run tests on the PR branch
        try {
          const workflowDir = path.join(tempDir, '.github', 'workflows');
          fs.mkdirSync(workflowDir, { recursive: true });
          const workflowPath = path.join(workflowDir, 'run-tests.yml');
          const workflowLines = [
            "name: CI - Run tests",
            "",
            "on:",
            "  pull_request:",
            "    types: [opened, synchronize, reopened]",
            "",
            "jobs:",
            "  node-tests:",
            "    name: Node tests",
            "    runs-on: ubuntu-latest",
            "    strategy:",
            "      matrix:",
            "        node-version: [18, 20]",
            "    steps:",
            "      - uses: actions/checkout@v4",
            "",
            "      - name: Cache node modules",
            "        uses: actions/cache@v4",
            "        with:",
            "          path: ~/.npm",
            "          key: ${{ runner.os }}-node-${{ matrix.node-version }}-${{ hashFiles('**/package-lock.json') }}",
            "          restore-keys: |",
            "          - ${{ runner.os }}-node-${{ matrix.node-version }}-",
            "",
            "      - name: Setup Node.js",
            "        uses: actions/setup-node@v4",
            "        with:",
            "          node-version: ${{ matrix.node-version }}",
            "",
            "      - name: Install dependencies",
            "        run: npm ci --if-present",
            "",
            "      - name: Run tests and collect JUnit report",
            "        run: |",
            "          npm test --if-present -- --reporters=default --reporter=junit || true",
            "        env:",
            "          CI: true",
            "",
            "      - name: Upload JUnit (node)",
            "        uses: actions/upload-artifact@v4",
            "        with:",
            "          name: junit-node-${{ github.run_id }}",
            "          path: '**/junit-report*.xml'",
            "",
            "  python-tests:",
            "    name: Python tests",
            "    runs-on: ubuntu-latest",
            "    strategy:",
            "      matrix:",
            "        python-version: [3.10, 3.11]",
            "    steps:",
            "      - uses: actions/checkout@v4",
            "",
            "      - name: Cache pip",
            "        uses: actions/cache@v4",
            "        with:",
            "          path: ~/.cache/pip",
            "          key: ${{ runner.os }}-pip-${{ matrix.python-version }}-${{ hashFiles('**/requirements.txt') }}",
            "          restore-keys: |",
            "          - ${{ runner.os }}-pip-${{ matrix.python-version }}-",
            "",
            "      - name: Setup Python",
            "        uses: actions/setup-python@v4",
            "        with:",
            "          python-version: ${{ matrix.python-version }}",
            "",
            "      - name: Install requirements",
            "        run: python -m pip install -r requirements.txt || true",
            "",
            "      - name: Run pytest with JUnit",
            "        run: |",
            "          pytest --junitxml=pytest-junit.xml || true",
            "",
            "      - name: Upload JUnit (pytest)",
            "        uses: actions/upload-artifact@v4",
            "        with:",
            "          name: junit-pytest-${{ github.run_id }}",
            "          path: pytest-junit.xml",
          ];
          const workflowYaml = workflowLines.join('\n');
          fs.writeFileSync(workflowPath, workflowYaml, 'utf-8');
        } catch (e) {
          // ignore workflow write errors
        }

        // Commit changes
        await git.add('.');
        await git.commit('Auto-fix and tests by LegacyGuard Agent');

        // Push branch
        await git.push('origin', branchName);

        // Get default branch
        const repoInfo = await octokit.rest.repos.get({ owner, repo });
        const base = repoInfo.data.default_branch;

        // Create PR
        const pr = await octokit.rest.pulls.create({
          owner,
          repo,
          title: 'LegacyGuard Security Fixes',
          head: branchName,
          base,
          body: finalReply,
        });

        return NextResponse.json({ reply: finalReply + `\n\n✅ Patches aplicados automaticamente. PR criado: ${pr.data.html_url}`, tests });
      } catch (e: any) {
        return NextResponse.json({ reply: finalReply + `\n\nErro ao aplicar patches: ${e.message}`, tests });
      }
    }

    return NextResponse.json({ reply: finalReply, tests });

  } catch (error: any) {
    return NextResponse.json({ reply: `### Erro crítico\n${error.message}` });
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// No App Router, body parsing is handled automatically by NextRequest
// The old Pages Router config export is not needed