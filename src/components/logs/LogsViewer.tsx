"use client";

import { useState, useCallback } from 'react';
import { Search, AlertTriangle, Info, ChevronDown, Shield } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service?: string;
  attributes?: Record<string, unknown>;
}

interface LogQueryResult {
  sourceId: string;
  sourceName: string;
  provider: string;
  count: number;
  error?: string;
  logs: LogEntry[];
}

interface LogsViewerProps {
  onQueryForLLM?: (summary: string) => void;
}

export default function LogsViewer({ onQueryForLLM }: LogsViewerProps) {
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState('1h');
  const [results, setResults] = useState<LogQueryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [piiSanitized, setPiiSanitized] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [llmSummary, setLlmSummary] = useState<string | null>(null);

  const timeRangeOptions = [
    { value: '15m', label: '15 minutos' },
    { value: '1h', label: '1 hora' },
    { value: '6h', label: '6 horas' },
    { value: '24h', label: '24 horas' },
    { value: '7d', label: '7 dias' },
  ];

  const getTimeRangeMs = (range: string): number => {
    const map: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    return map[range] || 60 * 60 * 1000;
  };

  const handleSearch = useCallback(async (forLLM = false) => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setLlmSummary(null);
    
    try {
      const now = new Date();
      const from = new Date(now.getTime() - getTimeRangeMs(timeRange));
      
      const res = await fetch('/api/logs/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          timeRange: {
            from: from.toISOString(),
            to: now.toISOString(),
          },
          limit: 100,
          forLLM,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro na busca');
      }
      
      const data = await res.json();
      
      if (forLLM) {
        setLlmSummary(data.summary);
        setTotalLogs(data.totalLogs || 0);
        setPiiSanitized(data.piiWarning ? parseInt(data.piiWarning.match(/\d+/)?.[0] || '0') : 0);
        
        if (onQueryForLLM && data.summary) {
          onQueryForLLM(data.summary);
        }
      } else {
        setResults(data.results || []);
        setTotalLogs(data.totalLogs || 0);
        setPiiSanitized(data.piiSanitized || 0);
        
        // Expandir todas as fontes com resultados
        const sourcesWithResults = new Set<string>(
          (data.results || [])
            .filter((r: LogQueryResult) => r.count > 0)
            .map((r: LogQueryResult) => r.sourceId as string)
        );
        setExpandedSources(sourcesWithResults);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [query, timeRange, onQueryForLLM]);

  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const levelColor = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes('error') || l.includes('fatal') || l.includes('critical')) {
      return 'text-rose-400 bg-rose-500/20';
    }
    if (l.includes('warn')) {
      return 'text-amber-400 bg-amber-500/20';
    }
    if (l.includes('info')) {
      return 'text-cyan-400 bg-cyan-500/20';
    }
    if (l.includes('debug') || l.includes('trace')) {
      return 'text-slate-400 bg-slate-500/20';
    }
    return 'text-slate-300 bg-white/10';
  };

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Buscar logs (ex: error, timeout, exception...)"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black/30 border border-white/10 text-slate-100 placeholder-slate-500 text-sm focus:border-cyan-500/50 outline-none"
          />
        </div>
        
        {/* Time range */}
        <div className="relative">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="appearance-none px-4 py-2.5 pr-8 rounded-lg bg-black/30 border border-white/10 text-slate-200 text-sm cursor-pointer focus:border-cyan-500/50 outline-none"
          >
            {timeRangeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        
        {/* Search buttons */}
        <button
          onClick={() => handleSearch(false)}
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          Buscar
        </button>
        
        <button
          onClick={() => handleSearch(true)}
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-200 hover:bg-purple-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          title="Buscar e resumir para uso com IA"
        >
          <Shield className="w-4 h-4" />
          Para IA
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats bar */}
      {(totalLogs > 0 || piiSanitized > 0) && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-400">
            <strong className="text-slate-200">{totalLogs}</strong> logs encontrados
          </span>
          {piiSanitized > 0 && (
            <span className="flex items-center gap-1 text-amber-300">
              <Shield className="w-3 h-3" />
              {piiSanitized} dados sensíveis sanitizados
            </span>
          )}
        </div>
      )}

      {/* LLM Summary */}
      {llmSummary && (
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2">
          <div className="flex items-center gap-2 text-purple-200 text-sm font-medium">
            <Shield className="w-4 h-4" />
            Resumo Sanitizado para IA
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-black/30 p-3 rounded-lg max-h-64 overflow-auto">
            {llmSummary}
          </pre>
          <p className="text-xs text-purple-300">
            Este resumo foi sanitizado para remover dados sensíveis e pode ser enviado com segurança para análise por IA.
          </p>
        </div>
      )}

      {/* Results */}
      {!llmSummary && results.length > 0 && (
        <div className="space-y-3">
          {results.map(result => (
            <div
              key={result.sourceId}
              className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
            >
              {/* Source header */}
              <button
                onClick={() => toggleSource(result.sourceId)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-200">{result.sourceName}</span>
                  <span className="text-xs text-slate-400">{result.provider}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                    result.error
                      ? 'bg-rose-500/20 text-rose-300'
                      : result.count > 0
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/10 text-slate-400'
                  }`}>
                    {result.error ? 'Erro' : `${result.count} logs`}
                  </span>
                </div>
                {expandedSources.has(result.sourceId) ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 rotate-180" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {/* Logs list */}
              {expandedSources.has(result.sourceId) && (
                <div className="border-t border-white/10">
                  {result.error ? (
                    <div className="p-3 text-sm text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {result.error}
                    </div>
                  ) : result.logs.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400 text-center">
                      Nenhum log encontrado
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-auto">
                      {result.logs.map((log, idx) => (
                        <div
                          key={idx}
                          className="flex gap-3 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5"
                        >
                          <div className="flex-shrink-0 w-28 text-[11px] text-slate-500 font-mono">
                            {formatTimestamp(log.timestamp)}
                          </div>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase ${levelColor(log.level)}`}>
                            {log.level}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 font-mono break-all">
                              {log.message}
                            </p>
                            {log.service && (
                              <span className="text-[11px] text-slate-500">
                                {log.service}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !llmSummary && results.length === 0 && !error && (
        <div className="text-center py-8 space-y-3">
          <Search className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm text-slate-400">
            Digite uma busca e clique em "Buscar" para consultar os logs
          </p>
          <p className="text-xs text-slate-500">
            Use "Para IA" para obter um resumo sanitizado que pode ser enviado com segurança para análise
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 space-y-3">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Buscando logs...</p>
        </div>
      )}
    </div>
  );
}
