"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const indexer_1 = require("../src/lib/indexer");
const indexer_pgvector_1 = require("../src/lib/indexer-pgvector");
// Execução concorrente simples sem dependências externas
async function runLimited(items, limit, fn) {
    const queue = [...items];
    const workers = [];
    const runWorker = async () => {
        while (queue.length) {
            const item = queue.shift();
            if (!item)
                return;
            await fn(item);
        }
    };
    for (let i = 0; i < limit; i++) {
        workers.push(runWorker());
    }
    await Promise.all(workers);
}
async function findPackageRoots(root) {
    const roots = new Set();
    roots.add(root);
    const candidates = ['packages', 'apps', 'services'];
    for (const c of candidates) {
        const p = path_1.default.join(root, c);
        if (!fs_1.default.existsSync(p))
            continue;
        const entries = fs_1.default.readdirSync(p, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            const pkgJson = path_1.default.join(p, e.name, 'package.json');
            if (fs_1.default.existsSync(pkgJson))
                roots.add(path_1.default.join(p, e.name));
        }
    }
    // support workspaces field in root package.json
    try {
        const rootPkg = path_1.default.join(root, 'package.json');
        if (fs_1.default.existsSync(rootPkg)) {
            const pj = JSON.parse(fs_1.default.readFileSync(rootPkg, 'utf8'));
            if (pj.workspaces) {
                const ws = Array.isArray(pj.workspaces) ? pj.workspaces : Object.values(pj.workspaces || {});
                for (const pattern of ws) {
                    // basic glob for pattern like 'packages/*'
                    if (pattern.endsWith('/*')) {
                        const base = pattern.replace(/\/*$/, '').replace(/\*$/, '');
                        const p = path_1.default.join(root, base.replace(/\/^\//, ''));
                        if (!fs_1.default.existsSync(p))
                            continue;
                        const entries = fs_1.default.readdirSync(p, { withFileTypes: true });
                        for (const e of entries) {
                            const candidate = path_1.default.join(p, e.name);
                            const pkgJson2 = path_1.default.join(candidate, 'package.json');
                            if (fs_1.default.existsSync(pkgJson2))
                                roots.add(candidate);
                        }
                    }
                }
            }
        }
    }
    catch (err) {
        console.warn('Falha ao ler package.json workspaces', err);
    }
    return Array.from(roots);
}
async function indexRoot(root) {
    console.log(`\nIndexando: ${root}`);
    const files = await (0, indexer_1.loadCodeFiles)(root, 2000);
    console.log(`Arquivos carregados: ${files.length}`);
    const graph = (0, indexer_1.buildGraphFromFiles)(files);
    console.log(`Grafo: ${graph.nodes.size} nós, ${graph.edges.length} arestas`);
    const usePg = Boolean(process.env.PGVECTOR_URL && process.env.OPENAI_API_KEY);
    if (!usePg) {
        console.log('PGVECTOR_URL ou OPENAI_API_KEY não configurados — pulando ingestão vetorial.');
        return { root, files: files.length, nodes: graph.nodes.size, edges: graph.edges.length, vectorUpserted: 0 };
    }
    const indexer = (0, indexer_pgvector_1.createPgVectorIndexer)();
    const concurrency = Math.max(2, Math.min(os_1.default.cpus().length, 8));
    let upserted = 0;
    const failures = [];
    await runLimited(files, concurrency, async (f) => {
        try {
            await indexer.upsertFile(f);
            upserted += 1;
        }
        catch (err) {
            failures.push({ file: f.path, err: String(err) });
        }
    });
    console.log(`Upsert vetorial concluído: ${upserted} files (falhas: ${failures.length})`);
    return { root, files: files.length, nodes: graph.nodes.size, edges: graph.edges.length, vectorUpserted: upserted, failures };
}
async function main() {
    console.log('Iniciando indexação do monorepo...');
    const root = process.argv[2] ? path_1.default.resolve(process.argv[2]) : process.cwd();
    const roots = await findPackageRoots(root);
    console.log('Raízes detectadas para indexação:', roots);
    const reports = [];
    for (const r of roots) {
        const rep = await indexRoot(r);
        reports.push(rep);
    }
    const out = path_1.default.join(root, 'scripts', 'index_monorepo_report.json');
    fs_1.default.writeFileSync(out, JSON.stringify({ timestamp: new Date().toISOString(), reports }, null, 2));
    console.log(`Relatório salvo em ${out}`);
}
if (require.main === module) {
    main().catch((e) => { console.error('Erro no indexador', e); process.exit(1); });
}
