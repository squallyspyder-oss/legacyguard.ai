"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImpact = analyzeImpact;
const indexer_1 = require("./indexer");
/**
 * Heurística de impacto: encontra arquivos mais relacionados à query e lista dependentes diretos (import).
 */
async function analyzeImpact(root, query, limit = 5) {
    const files = await (0, indexer_1.loadCodeFiles)(root, 500);
    const graph = (0, indexer_1.buildGraphFromFiles)(files);
    const hits = (0, indexer_1.searchGraph)(query, graph, limit);
    // Dependentes (arquivos que importam o hit)
    const dependents = [];
    graph.edges.forEach((e) => {
        hits.forEach((hit) => {
            if (e.to === hit.path && !dependents.includes(e.from)) {
                dependents.push(e.from);
            }
        });
    });
    const hotspots = hits.map((h) => ({
        path: h.path,
        symbols: h.symbols.slice(0, 5),
        reason: 'Similaridade lexical com a query',
    }));
    return {
        hotspots,
        dependents: dependents.slice(0, 20),
        summary: `Arquivos mais afetados: ${hotspots.map((h) => h.path).join(', ')}`,
    };
}
