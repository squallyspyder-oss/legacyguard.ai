"use client";

import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, X, RefreshCw, AlertTriangle, Check, Eye, ExternalLink } from 'lucide-react';

interface LogSource {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  status?: string;
  configFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    default?: string;
    hint?: string;
  }>;
}

interface LogsConfigPanelProps {
  onClose?: () => void;
}

export default function LogsConfigPanel({ onClose }: LogsConfigPanelProps) {
  const [sources, setSources] = useState<LogSource[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado do formulário de criação
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Buscar fontes e providers
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [sourcesRes, providersRes] = await Promise.all([
        fetch('/api/logs/sources'),
        fetch('/api/logs/query'),
      ]);
      
      if (!sourcesRes.ok) throw new Error('Erro ao carregar fontes');
      if (!providersRes.ok) throw new Error('Erro ao carregar providers');
      
      const sourcesData = await sourcesRes.json();
      const providersData = await providersRes.json();
      
      setSources(sourcesData.sources || []);
      setProviders(providersData.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Selecionar provider
  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setConfigValues({});
    
    // Preencher defaults
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      const defaults: Record<string, string> = {};
      provider.configFields.forEach(field => {
        if (field.default) defaults[field.name] = field.default;
      });
      setConfigValues(defaults);
    }
  };

  // Criar nova fonte
  const handleCreate = async () => {
    if (!newSourceName.trim() || !selectedProvider) return;
    
    const provider = providers.find(p => p.id === selectedProvider);
    if (!provider) return;
    
    // Validar campos obrigatórios
    const missingFields = provider.configFields
      .filter(f => f.required && !configValues[f.name])
      .map(f => f.label);
    
    if (missingFields.length > 0) {
      setError(`Campos obrigatórios: ${missingFields.join(', ')}`);
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const res = await fetch('/api/logs/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSourceName.trim(),
          provider: selectedProvider,
          config: configValues,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao criar fonte');
      }
      
      // Limpar formulário e recarregar
      setShowAddForm(false);
      setNewSourceName('');
      setSelectedProvider('');
      setConfigValues({});
      await fetchData();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  // Deletar fonte
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover esta fonte de logs?')) return;
    
    try {
      const res = await fetch(`/api/logs/sources?id=${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Erro ao remover');
      
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  // Toggle habilitado
  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/logs/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      
      if (!res.ok) throw new Error('Erro ao atualizar');
      
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  const providerIcon = (providerId: string) => {
    switch (providerId) {
      case 'datadog': return '🐕';
      case 'cloudwatch': return '☁️';
      case 'elasticsearch': return '🔍';
      case 'splunk': return '📊';
      default: return '📋';
    }
  };

  const getProvider = () => providers.find(p => p.id === selectedProvider);

  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          <div>
            <p className="text-sm font-semibold text-slate-100">Fontes de Logs</p>
            <p className="text-xs text-slate-400">Conecte logs externos para análise</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lista de fontes */}
      <section className="space-y-2">
        {loading && sources.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Carregando...</p>
        )}
        
        {!loading && sources.length === 0 && !showAddForm && (
          <div className="text-center py-6 space-y-3">
            <Database className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-400">Nenhuma fonte de logs configurada</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 text-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar Fonte
            </button>
          </div>
        )}

        {sources.map(source => (
          <div
            key={source.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              source.enabled
                ? 'bg-white/5 border-white/10'
                : 'bg-white/3 border-white/5 opacity-60'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{providerIcon(source.provider)}</span>
              <div>
                <p className="text-sm font-medium text-slate-100">{source.name}</p>
                <p className="text-xs text-slate-400">
                  {source.provider} • {source.last_used_at 
                    ? `Último uso: ${new Date(source.last_used_at).toLocaleString('pt-BR')}`
                    : 'Nunca usado'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggleEnabled(source.id, !source.enabled)}
                className={`px-3 py-1 rounded-lg border text-xs ${
                  source.enabled
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                {source.enabled ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={() => handleDelete(source.id)}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-500/20"
                title="Remover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Botão adicionar */}
      {sources.length > 0 && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-white/20 text-slate-400 hover:border-white/30 hover:text-slate-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar Nova Fonte
        </button>
      )}

      {/* Formulário de criação */}
      {showAddForm && (
        <section className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Nova Fonte de Logs</p>
            <button
              onClick={() => {
                setShowAddForm(false);
                setSelectedProvider('');
                setConfigValues({});
                setNewSourceName('');
              }}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome</label>
            <input
              type="text"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="Ex: Produção Datadog"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-slate-100 placeholder-slate-500 text-sm focus:border-cyan-500/50 outline-none"
            />
          </div>

          {/* Seleção de provider */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map(provider => (
                <button
                  key={provider.id}
                  onClick={() => handleSelectProvider(provider.id)}
                  disabled={provider.status === 'coming_soon'}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    selectedProvider === provider.id
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-100'
                      : provider.status === 'coming_soon'
                      ? 'bg-white/3 border-white/5 text-slate-500 cursor-not-allowed'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-lg">{providerIcon(provider.id)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{provider.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{provider.description}</p>
                  </div>
                  {provider.status === 'coming_soon' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Em breve
                    </span>
                  )}
                  {selectedProvider === provider.id && (
                    <Check className="w-4 h-4 text-cyan-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Campos de configuração */}
          {selectedProvider && getProvider() && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Configuração do {getProvider()?.name}</p>
              
              {getProvider()?.configFields.map(field => (
                <div key={field.name}>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                    {field.label}
                    {field.required && <span className="text-rose-400">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={field.type === 'password' && !showSecrets[field.name] ? 'password' : 'text'}
                      value={configValues[field.name] || ''}
                      onChange={(e) => setConfigValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.hint || `Digite ${field.label.toLowerCase()}`}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-slate-100 placeholder-slate-500 text-sm focus:border-cyan-500/50 outline-none pr-10"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showSecrets[field.name] ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  {field.hint && (
                    <p className="text-[11px] text-slate-500 mt-1">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Aviso de segurança */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Credenciais criptografadas</p>
              <p className="text-amber-300/80">Suas credenciais são criptografadas antes do armazenamento e nunca expostas em logs.</p>
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setSelectedProvider('');
                setConfigValues({});
                setNewSourceName('');
              }}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !newSourceName.trim() || !selectedProvider}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Criar Fonte
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400">
        <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5 text-cyan-400" />
        <div>
          <p>Os logs consultados são <strong className="text-slate-300">sanitizados automaticamente</strong> para remover PII (dados pessoais) antes de serem enviados para análise por IA.</p>
        </div>
      </div>
    </div>
  );
}
