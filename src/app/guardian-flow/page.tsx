/**
 * Guardian Flow - Main Page
 * 
 * Página principal do Guardian Flow
 * @route /guardian-flow
 */

'use client';

import React, { useState, useCallback, Suspense } from 'react';
import { GuardianFlowProvider, useGuardianFlow } from '@/guardian-flow';
import { GuardianFlowPanel } from '@/guardian-flow/components/GuardianFlowPanel';
import { COLORS, ACHIEVEMENTS } from '@/guardian-flow/constants';
import { generateDailyMissions } from '@/guardian-flow/gamification/MissionSystem';
import { Mission, Achievement } from '@/guardian-flow/types';

// =============================================================================
// MISSION CARD
// =============================================================================

interface MissionCardProps {
  mission: Mission;
  onComplete?: () => void;
}

function MissionCard({ mission, onComplete }: MissionCardProps) {
  const progress = Math.min(100, (mission.progress / mission.target) * 100);
  
  const difficultyColors = {
    easy: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    hard: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    legendary: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  
  const categoryEmojis = {
    cleanup: '🧹',
    security: '🔒',
    docs: '📝',
    tests: '🧪',
    refactor: '🔧',
  };
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{categoryEmojis[mission.category]}</span>
          <div>
            <h4 className="font-medium text-white">{mission.title}</h4>
            <p className="text-xs text-gray-500">{mission.description}</p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full border ${difficultyColors[mission.difficulty]}`}
        >
          {mission.difficulty}
        </span>
      </div>
      
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-400">
            {mission.progress}/{mission.target}
          </span>
          <span className="text-purple-400">+{mission.xpReward} XP</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      {mission.completed && (
        <button
          onClick={onComplete}
          className="mt-3 w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          ✓ Coletar Recompensa
        </button>
      )}
    </div>
  );
}

// =============================================================================
// ACHIEVEMENT BADGE
// =============================================================================

interface AchievementBadgeProps {
  achievement: Achievement & { unlocked: boolean };
}

function AchievementBadge({ achievement }: AchievementBadgeProps) {
  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border transition-all
        ${achievement.unlocked
          ? 'bg-purple-500/10 border-purple-500/30'
          : 'bg-gray-800/30 border-gray-700 opacity-50'
        }
      `}
      title={achievement.description}
    >
      <span className="text-2xl">{achievement.emoji}</span>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-white truncate">{achievement.title}</h4>
        <p className="text-xs text-gray-500 truncate">{achievement.description}</p>
      </div>
      {achievement.unlocked ? (
        <span className="text-green-400 text-sm">✓</span>
      ) : (
        <span className="text-gray-500 text-xs">
          {achievement.progress || 0}/{achievement.target}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

function DashboardStats() {
  const { profile, state } = useGuardianFlow();
  
  if (!profile) return null;
  
  const stats = [
    {
      label: 'Ações Executadas',
      value: profile.totalActionsExecuted,
      icon: '⚡',
      color: 'text-blue-400',
    },
    {
      label: 'Rollbacks',
      value: profile.totalRollbacks,
      icon: '↩️',
      color: 'text-yellow-400',
    },
    {
      label: 'Taxa de Sucesso',
      value: profile.totalActionsExecuted > 0
        ? `${Math.round(((profile.totalActionsExecuted - profile.totalRollbacks) / profile.totalActionsExecuted) * 100)}%`
        : '100%',
      icon: '📊',
      color: 'text-green-400',
    },
    {
      label: 'Streak',
      value: `${profile.streakDays} dias`,
      icon: '🔥',
      color: 'text-orange-400',
    },
  ];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{stat.icon}</span>
            <span className="text-sm text-gray-500">{stat.label}</span>
          </div>
          <div className={`text-2xl font-bold ${stat.color}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN CONTENT
// =============================================================================

function GuardianFlowContent() {
  const { profile, addXP, completeMission } = useGuardianFlow();
  const [activeTab, setActiveTab] = useState<'flow' | 'missions' | 'achievements'>('flow');
  
  // Gerar missões mock
  const [missions, setMissions] = useState<Mission[]>(() => {
    if (profile) {
      return generateDailyMissions(profile, 3);
    }
    return [];
  });
  
  // Mock achievements
  const achievements = Object.values(ACHIEVEMENTS).map((a) => ({
    ...a,
    unlocked: profile?.achievements.includes(a.id) || false,
    progress: 0,
    target: a.target,
  }));
  
  const handleCollectMission = useCallback((missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    if (mission) {
      addXP(mission.xpReward);
      setMissions(prev => prev.filter(m => m.id !== missionId));
    }
  }, [missions, addXP]);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🛡️</span>
              <div>
                <h1 className="text-xl font-bold">Guardian Flow</h1>
                <p className="text-xs text-gray-500">Vibe Coding para Legacy</p>
              </div>
            </div>
            
            {profile && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium">{profile.levelTitle}</div>
                  <div className="text-xs text-gray-500">
                    Level {profile.level} • {profile.xp} XP
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                  🛡️
                </div>
              </div>
            )}
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            {[
              { id: 'flow', label: '🎯 Flow', description: 'Executar ações' },
              { id: 'missions', label: '📋 Missões', description: 'Desafios diários' },
              { id: 'achievements', label: '🏆 Conquistas', description: 'Suas conquistas' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Stats */}
        <DashboardStats />
        
        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'flow' && (
            <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden h-[600px]">
              <GuardianFlowPanel />
            </div>
          )}
          
          {activeTab === 'missions' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">🎯 Missões Diárias</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {missions.length > 0 ? (
                  missions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      onComplete={() => handleCollectMission(mission.id)}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <span className="text-4xl">🎉</span>
                    <p className="mt-2 text-gray-400">
                      Você completou todas as missões de hoje!
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Volte amanhã para novos desafios
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'achievements' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">🏆 Conquistas</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {achievements.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          Guardian Flow v1.0.0 • Powered by LegacyGuard.ai
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// PAGE
// =============================================================================

export default function GuardianFlowPage() {
  return (
    <GuardianFlowProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-white text-center">
            <span className="text-4xl animate-pulse">🛡️</span>
            <p className="mt-2">Carregando Guardian Flow...</p>
          </div>
        </div>
      }>
        <GuardianFlowContent />
      </Suspense>
    </GuardianFlowProvider>
  );
}
