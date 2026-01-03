"use client";

type SettingsSidebarProps = {
  deepSearch: boolean;
  onToggleDeep: (value: boolean) => void;
  sandboxEnabled: boolean;
  onToggleSandbox: (value: boolean) => void;
  sandboxMode: "fail" | "warn";
  onChangeSandboxMode: (value: "fail" | "warn") => void;
  safeMode: boolean;
  onToggleSafeMode: (value: boolean) => void;
  reviewGate: boolean;
  onToggleReviewGate: (value: boolean) => void;
  workerEnabled: boolean;
  onToggleWorker: (value: boolean) => void;
  maskingEnabled: boolean;
  onToggleMasking: (value: boolean) => void;
  ragReady: boolean;
  onToggleRagReady: (value: boolean) => void;
  apiEnabled: boolean;
  onToggleApi: (value: boolean) => void;
  billingCap: number;
  onChangeBillingCap: (value: number) => void;
  tokenCap: number;
  onChangeTokenCap: (value: number) => void;
  temperatureCap: number;
  onChangeTemperatureCap: (value: number) => void;
  sessions: SessionItem[];
  onResumeSession: (session: SessionItem) => void;
  sessionsLoading?: boolean;
};

type SessionItem = {
  title: string;
  tag: string;
  recency: string;
  risk: "baixo" | "medio" | "alto";
  id: string;
};

export default function SettingsSidebar({
  deepSearch,
  onToggleDeep,
  sandboxEnabled,
  onToggleSandbox,
  sandboxMode,
  onChangeSandboxMode,
  safeMode,
  onToggleSafeMode,
  reviewGate,
  onToggleReviewGate,
  workerEnabled,
  onToggleWorker,
  maskingEnabled,
  onToggleMasking,
  ragReady,
  onToggleRagReady,
  apiEnabled,
  onToggleApi,
  billingCap,
  onChangeBillingCap,
  tokenCap,
  onChangeTokenCap,
  temperatureCap,
  onChangeTemperatureCap,
  sessions,
  onResumeSession,
  sessionsLoading,
}: SettingsSidebarProps) {

  const riskBadge = (risk: SessionItem["risk"]) => {
    if (risk === "alto") return "text-rose-200 bg-rose-500/20 border-rose-400/40";
    if (risk === "medio") return "text-amber-200 bg-amber-500/15 border-amber-400/30";
    return "text-emerald-200 bg-emerald-500/15 border-emerald-400/30";
  };

  return (
    <aside className="glass rounded-2xl p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Configurações Gerais</p>
          <p className="text-xs text-slate-400">Governança, histórico e mitigação</p>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">Ativo</span>
      </div>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Sessões & Contexto</p>
          <button className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-200">Exportar</button>
        </div>
        <div className="space-y-2">
          {sessions.length === 0 && !sessionsLoading && (
            <p className="text-[11px] text-slate-400">Nenhuma sessão ainda. Interaja para criar histórico.</p>
          )}
          {sessionsLoading && (
            <p className="text-[11px] text-slate-300">Carregando sessões...</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div>
                <p className="text-sm text-slate-50 font-semibold">{s.title}</p>
                <p className="text-[11px] text-slate-400">{s.tag} • {s.recency}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${riskBadge(s.risk)}`}>{s.risk === "alto" ? "Alto" : s.risk === "medio" ? "Médio" : "Baixo"}</span>
                <button
                  onClick={() => onResumeSession(s)}
                  className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-100 border border-emerald-400/30"
                >
                  Retomar
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">Conversas retomadas reidexarão o contexto para o RAG. Segredos permanecem mascarados.</p>
      </section>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Operação Segura</p>
          <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-100 border border-amber-400/30">Requerido</span>
        </div>
        <ToggleRow label="Sandbox" helper="Executar em ambiente isolado" checked={sandboxEnabled} onChange={onToggleSandbox} />
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Modo sandbox</span>
          <div className="flex gap-2">
            <button
              onClick={() => onChangeSandboxMode("fail")}
              className={`px-3 py-1 rounded-lg border text-[11px] ${sandboxMode === "fail" ? "bg-rose-500/20 border-rose-400/40 text-rose-100" : "bg-white/5 border-white/10 text-slate-200"}`}
            >
              Fail (bloqueia)
            </button>
            <button
              onClick={() => onChangeSandboxMode("warn")}
              className={`px-3 py-1 rounded-lg border text-[11px] ${sandboxMode === "warn" ? "bg-amber-500/20 border-amber-400/40 text-amber-100" : "bg-white/5 border-white/10 text-slate-200"}`}
            >
              Warn
            </button>
          </div>
        </div>
        <ToggleRow label="Worker/Redis" helper="Habilita orquestração em fila" checked={workerEnabled} onChange={onToggleWorker} />
        <ToggleRow label="Safe mode" helper="Bloqueia execuções destrutivas" checked={safeMode} onChange={onToggleSafeMode} />
        <ToggleRow label="Reviewer obrigatório" helper="Valida patches antes do executor" checked={reviewGate} onChange={onToggleReviewGate} />
        <ToggleRow label="Mascaramento de segredos" helper="ON recomendado em produção" checked={maskingEnabled} onChange={onToggleMasking} />
      </section>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Modelos & Custo</p>
          <span className="text-[11px] px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-100 border border-cyan-400/30">Controle</span>
        </div>
        <ToggleRow label="Pesquisa profunda" helper="Ativa modelo mais robusto" checked={deepSearch} onChange={onToggleDeep} />
        <SliderRow label="Temperature cap" value={temperatureCap} onChange={onChangeTemperatureCap} min={0} max={1} step={0.05} display={`${(temperatureCap * 100).toFixed(0)}%`} />
        <SliderRow label="Limite tokens por resposta" value={tokenCap} onChange={onChangeTokenCap} min={2000} max={24000} step={1000} display={`${tokenCap} tokens`} />
        <SliderRow label="Teto de custo diário" value={billingCap} onChange={onChangeBillingCap} min={5} max={100} step={5} display={`USD ${billingCap}`} />
        <p className="text-[11px] text-slate-400">Respostas de alto risco devem vir com citações e diffs antes de execução.</p>
      </section>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Mitigação de Risco</p>
          <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-400/30">Recomendado</span>
        </div>
        <Bullet text="Exigir citações de origem para sugestões de código" />
        <Bullet text="Circuit-breaker: limite de passos e tempo por orquestração" />
        <Bullet text="Dry-run/sandbox antes de qualquer escrita ou deploy" />
        <Bullet text="Bloquear mudanças em pastas críticas sem aprovação" />
        <Bullet text="Alertar confiança baixa e pedir confirmação" />
      </section>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Dados & Índice</p>
          <span className={`text-[11px] px-2 py-1 rounded-full border ${ragReady ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/30" : "bg-amber-500/15 text-amber-100 border-amber-400/30"}`}>
            {ragReady ? "Indexado" : "Pendente"}
          </span>
        </div>
        <p className="text-[11px] text-slate-300">RAG precisa estar indexado para respostas com contexto de repositório. Evita alucinações.</p>
        <div className="flex gap-2">
          <button className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200" onClick={() => onToggleRagReady(true)}>Reindexar</button>
          <button
            onClick={() => onToggleRagReady(!ragReady)}
            className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-100 border border-emerald-400/40 text-sm"
          >
            Marcar pronto
          </button>
        </div>
        <p className="text-[11px] text-slate-400">Fontes externas (Confluence, Jira, GitHub PRs) ficam off até habilitar.</p>
      </section>

      <section className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Login, API & Auditoria</p>
          <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-200">Futuro</span>
        </div>
        <ToggleRow label="SSO/MFA" helper="Requerido para produção" checked={false} onChange={() => {}} disabled />
        <ToggleRow label="API pública" helper="Chaves rotacionáveis" checked={apiEnabled} onChange={onToggleApi} />
        <ToggleRow label="Webhooks" helper="Eventos de orquestração" checked={false} onChange={() => {}} disabled />
        <p className="text-[11px] text-slate-400">Auditoria: logs com segredos mascarados e retenção configurável.</p>
      </section>
    </aside>
  );
}

function ToggleRow({ label, helper, checked, onChange, disabled }: { label: string; helper?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${disabled ? "border-white/5 bg-white/5 opacity-60" : "border-white/10 bg-black/10"}`}>
      <div>
        <p className="text-sm text-slate-100 font-semibold">{label}</p>
        {helper && <p className="text-[11px] text-slate-400">{helper}</p>}
      </div>
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 accent-emerald-500"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-[11px] text-slate-200">{checked ? "On" : "Off"}</span>
      </label>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, display }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; display: string; }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span className="font-semibold">{label}</span>
        <span className="text-[11px] text-slate-300">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return <p className="text-[11px] text-slate-300">• {text}</p>;
}
