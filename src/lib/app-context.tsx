/**
 * App Context - Estado global da aplicação
 * 
 * Gerencia:
 * - Repositório ativo (selecionado/importado)
 * - Conversas persistidas
 * - Configurações do usuário
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

// ============================================================================
// Types
// ============================================================================

export interface ActiveRepo {
  id: string;
  name: string;
  fullName?: string;
  path?: string;
  url?: string;
  branch?: string;
  owner?: string;
  indexedAt?: string;
  status: 'indexing' | 'ready' | 'failed';
  // Contexto carregado do repo
  context?: RepoContext;
}

export interface RepoContext {
  summary: string;
  structure: string[];
  mainFiles: string[];
  stats: {
    files: number;
    dirs: number;
    languages: Record<string, number>;
    totalSize: number;
  };
  ragStatus: {
    indexed: boolean;
    chunks: number;
  };
  loadedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  repoContext?: string;
  patches?: Array<{ file: string; original: string; fixed: string }>;
  tests?: Array<{ file: string; content: string }>;
  approvalRequired?: string;
  suggestOrchestrateText?: string;
}

export interface Conversation {
  id: string;
  title: string;
  repoId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultAgent: string;
  sandboxEnabled: boolean;
  sandboxMode: 'fail' | 'warn';
  safeMode: boolean;
  reviewGate: boolean;
  streamResponses: boolean;
  compactMode: boolean;
}

interface AppContextValue {
  // Repo ativo
  activeRepo: ActiveRepo | null;
  setActiveRepo: (repo: ActiveRepo | null) => void;
  selectRepo: (repoId: string) => Promise<void>; // Seleciona e carrega contexto
  importedRepos: ActiveRepo[];
  addImportedRepo: (repo: ActiveRepo) => void;
  removeImportedRepo: (repoId: string) => void;
  isLoadingRepo: boolean;
  
  // Conversas
  conversations: Conversation[];
  activeConversation: Conversation | null;
  createConversation: (repoId?: string) => Conversation;
  selectConversation: (id: string) => void;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  getConversationHistory: (maxMessages?: number) => ChatMessage[];
  
  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  
  // Estado
  isLoading: boolean;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  defaultAgent: 'orchestrate',
  sandboxEnabled: true,
  sandboxMode: 'fail',
  safeMode: true,
  reviewGate: true,
  streamResponses: true,
  compactMode: false,
};

// ============================================================================
// Context
// ============================================================================

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.email || 'anonymous';
  
  // Estado
  const [activeRepo, setActiveRepoState] = useState<ActiveRepo | null>(null);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [importedRepos, setImportedRepos] = useState<ActiveRepo[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  
  const storageKey = `legacyguard:${userId}`;
  
  // Carregar dados do localStorage ao iniciar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.activeRepo) setActiveRepoState(data.activeRepo);
        if (data.importedRepos) setImportedRepos(data.importedRepos);
        if (data.conversations) setConversations(data.conversations);
        if (data.activeConversationId) setActiveConversationId(data.activeConversationId);
        if (data.settings) setSettings({ ...defaultSettings, ...data.settings });
      }
    } catch (e) {
      console.warn('[AppContext] Erro ao carregar dados:', e);
    }
    setIsLoading(false);
  }, [storageKey]);
  
  // Salvar dados no localStorage quando mudar
  useEffect(() => {
    if (isLoading) return;
    
    try {
      const data = {
        activeRepo,
        importedRepos,
        conversations: conversations.slice(0, 50), // Limitar a 50 conversas
        activeConversationId,
        settings,
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('[AppContext] Erro ao salvar dados:', e);
    }
  }, [activeRepo, importedRepos, conversations, activeConversationId, settings, storageKey, isLoading]);
  
  // Repo ativo
  const setActiveRepo = useCallback((repo: ActiveRepo | null) => {
    setActiveRepoState(repo);
  }, []);
  
  // Selecionar repo e carregar contexto
  const selectRepo = useCallback(async (repoId: string) => {
    const repo = importedRepos.find(r => r.id === repoId);
    if (!repo) return;
    
    setIsLoadingRepo(true);
    setActiveRepoState(repo);
    
    try {
      // Carregar contexto do repo via API
      const res = await fetch(`/api/repo/context?repoId=${encodeURIComponent(repo.path || repo.id)}`);
      if (res.ok) {
        const contextData = await res.json();
        const repoWithContext: ActiveRepo = {
          ...repo,
          status: contextData.ragStatus?.indexed ? 'ready' : 'indexing',
          context: {
            summary: contextData.summary,
            structure: contextData.structure,
            mainFiles: contextData.mainFiles,
            stats: contextData.stats,
            ragStatus: contextData.ragStatus,
            loadedAt: Date.now(),
          },
        };
        setActiveRepoState(repoWithContext);
        
        // Atualizar na lista de repos
        setImportedRepos(prev => prev.map(r => r.id === repoId ? repoWithContext : r));
        
        console.log('[AppContext] Repo carregado com contexto:', repoWithContext.name, contextData.summary);
      }
    } catch (e) {
      console.warn('[AppContext] Erro ao carregar contexto do repo:', e);
    } finally {
      setIsLoadingRepo(false);
    }
  }, [importedRepos]);
  
  // Remover repo
  const removeImportedRepo = useCallback((repoId: string) => {
    setImportedRepos(prev => prev.filter(r => r.id !== repoId));
    if (activeRepo?.id === repoId) {
      setActiveRepoState(null);
    }
  }, [activeRepo]);
  
  const addImportedRepo = useCallback((repo: ActiveRepo) => {
    setImportedRepos(prev => {
      // Evitar duplicatas
      const exists = prev.find(r => r.id === repo.id || r.name === repo.name);
      if (exists) return prev;
      return [repo, ...prev].slice(0, 20); // Limitar a 20 repos
    });
    // Ativar automaticamente o repo importado
    setActiveRepoState(repo);
  }, []);
  
  // Conversas
  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  
  const createConversation = useCallback((repoId?: string) => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const repo = repoId ? importedRepos.find(r => r.id === repoId) : activeRepo;
    const now = Date.now();
    
    const conversation: Conversation = {
      id,
      title: repo ? `Chat: ${repo.name}` : 'Nova conversa',
      repoId: repo?.id,
      messages: [{
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: repo 
          ? `👋 Olá! Estou analisando o repositório **${repo.name}**. Como posso ajudar?`
          : '👋 Olá! Sou o LegacyGuard. Importe um repositório para começar ou faça perguntas gerais.',
        timestamp: now,
        repoContext: repo?.id,
      }],
      createdAt: now,
      updatedAt: now,
    };
    
    setConversations(prev => [conversation, ...prev]);
    setActiveConversationId(id);
    return conversation;
  }, [activeRepo, importedRepos]);
  
  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    // Se a conversa tem um repo associado, ativar ele
    const conv = conversations.find(c => c.id === id);
    if (conv?.repoId) {
      const repo = importedRepos.find(r => r.id === conv.repoId);
      if (repo) setActiveRepoState(repo);
    }
  }, [conversations, importedRepos]);
  
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      timestamp: Date.now(),
      repoContext: activeRepo?.id,
    };
    
    setConversations(prev => {
      const convId = activeConversationId;
      if (!convId) return prev;
      
      return prev.map(c => {
        if (c.id !== convId) return c;
        
        // Atualizar título baseado na primeira mensagem do usuário
        let title = c.title;
        if (c.messages.length <= 1 && message.role === 'user') {
          title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
        }
        
        return {
          ...c,
          title,
          messages: [...c.messages, newMessage],
          updatedAt: Date.now(),
        };
      });
    });
  }, [activeConversationId, activeRepo]);
  
  const getConversationHistory = useCallback((maxMessages = 10) => {
    if (!activeConversation) return [];
    return activeConversation.messages.slice(-maxMessages);
  }, [activeConversation]);
  
  // Settings
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);
  
  const value: AppContextValue = {
    activeRepo,
    setActiveRepo,
    selectRepo,
    importedRepos,
    addImportedRepo,
    removeImportedRepo,
    isLoadingRepo,
    conversations,
    activeConversation,
    createConversation,
    selectConversation,
    addMessage,
    getConversationHistory,
    settings,
    updateSettings,
    isLoading,
  };
  
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp deve ser usado dentro de AppProvider');
  }
  return context;
}

// Hook para usar o repo ativo
export function useActiveRepo() {
  const { activeRepo, setActiveRepo, selectRepo, importedRepos, addImportedRepo, removeImportedRepo, isLoadingRepo } = useApp();
  return { activeRepo, setActiveRepo, selectRepo, importedRepos, addImportedRepo, removeImportedRepo, isLoadingRepo };
}

// Hook para usar conversas
export function useConversation() {
  const { 
    conversations, 
    activeConversation, 
    createConversation, 
    selectConversation,
    addMessage,
    getConversationHistory,
  } = useApp();
  return { 
    conversations, 
    activeConversation, 
    createConversation, 
    selectConversation,
    addMessage,
    getConversationHistory,
  };
}

// Hook para settings
export function useSettings() {
  const { settings, updateSettings } = useApp();
  return { settings, updateSettings };
}
