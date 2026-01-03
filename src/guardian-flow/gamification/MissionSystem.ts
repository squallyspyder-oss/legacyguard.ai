/**
 * Guardian Flow - Mission System
 * 
 * Sistema de gamificação com missões diárias
 * @module guardian-flow/gamification/MissionSystem
 */

import {
  Mission,
  MissionCategory,
  MissionDifficulty,
  Achievement,
  GuardianProfile,
} from '../types';
import {
  XP_REWARDS,
  ACHIEVEMENTS,
} from '../constants';

// =============================================================================
// MISSION TEMPLATES
// =============================================================================

interface MissionTemplate {
  titleTemplate: string;
  descriptionTemplate: string;
  category: MissionCategory;
  difficulty: MissionDifficulty;
  baseTarget: number;
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  // Cleanup
  {
    titleTemplate: 'Caça ao Code Smell',
    descriptionTemplate: 'Elimine {target} code smells do projeto',
    category: 'cleanup',
    difficulty: 'easy',
    baseTarget: 3,
  },
  {
    titleTemplate: 'Limpeza de Imports',
    descriptionTemplate: 'Remova {target} imports não utilizados',
    category: 'cleanup',
    difficulty: 'easy',
    baseTarget: 5,
  },
  {
    titleTemplate: 'Formatação Consistente',
    descriptionTemplate: 'Formate {target} arquivos usando Prettier',
    category: 'cleanup',
    difficulty: 'medium',
    baseTarget: 10,
  },
  
  // Security
  {
    titleTemplate: 'Caçador de Vulnerabilidades',
    descriptionTemplate: 'Corrija {target} vulnerabilidades de segurança',
    category: 'security',
    difficulty: 'hard',
    baseTarget: 2,
  },
  {
    titleTemplate: 'Segredos Expostos',
    descriptionTemplate: 'Remova {target} secrets hardcoded',
    category: 'security',
    difficulty: 'medium',
    baseTarget: 1,
  },
  {
    titleTemplate: 'Escudo de Dependências',
    descriptionTemplate: 'Atualize {target} dependências com CVEs',
    category: 'security',
    difficulty: 'medium',
    baseTarget: 3,
  },
  
  // Docs
  {
    titleTemplate: 'Documentador',
    descriptionTemplate: 'Adicione JSDoc a {target} funções',
    category: 'docs',
    difficulty: 'easy',
    baseTarget: 5,
  },
  {
    titleTemplate: 'README Heroico',
    descriptionTemplate: 'Atualize {target} README(s) com informações úteis',
    category: 'docs',
    difficulty: 'medium',
    baseTarget: 1,
  },
  {
    titleTemplate: 'Regras Ocultas',
    descriptionTemplate: 'Documente {target} regras de negócio não documentadas',
    category: 'docs',
    difficulty: 'legendary',
    baseTarget: 1,
  },
  
  // Tests
  {
    titleTemplate: 'Cobertura de Testes',
    descriptionTemplate: 'Aumente a cobertura em {target}%',
    category: 'tests',
    difficulty: 'medium',
    baseTarget: 5,
  },
  {
    titleTemplate: 'Testes de Edge Case',
    descriptionTemplate: 'Adicione {target} testes de edge case',
    category: 'tests',
    difficulty: 'hard',
    baseTarget: 3,
  },
  {
    titleTemplate: 'Snapshot Maintenance',
    descriptionTemplate: 'Revise e atualize {target} snapshots',
    category: 'tests',
    difficulty: 'easy',
    baseTarget: 5,
  },
  
  // Refactor
  {
    titleTemplate: 'Simplificador de Complexidade',
    descriptionTemplate: 'Reduza a complexidade ciclomática de {target} funções',
    category: 'refactor',
    difficulty: 'hard',
    baseTarget: 2,
  },
  {
    titleTemplate: 'DRY Champion',
    descriptionTemplate: 'Elimine {target} duplicações de código',
    category: 'refactor',
    difficulty: 'medium',
    baseTarget: 3,
  },
  {
    titleTemplate: 'Modernizador de Legado',
    descriptionTemplate: 'Converta {target} callbacks para async/await',
    category: 'refactor',
    difficulty: 'legendary',
    baseTarget: 5,
  },
];

// =============================================================================
// MISSION GENERATOR
// =============================================================================

function generateId(): string {
  return `mission_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Gera missões diárias baseadas no perfil do usuário
 */
export function generateDailyMissions(
  profile: GuardianProfile,
  count: number = 3
): Mission[] {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(23, 59, 59, 999);
  
  // Selecionar templates baseado no nível
  let availableTemplates = [...MISSION_TEMPLATES];
  
  // Limitar dificuldades por nível
  if (profile.level < 2) {
    availableTemplates = availableTemplates.filter(
      t => t.difficulty === 'easy' || t.difficulty === 'medium'
    );
  } else if (profile.level < 4) {
    availableTemplates = availableTemplates.filter(
      t => t.difficulty !== 'legendary'
    );
  }
  
  // Shuffle e selecionar
  const selected = shuffleArray(availableTemplates).slice(0, count);
  
  return selected.map((template): Mission => {
    // Ajustar target baseado no nível
    const levelMultiplier = 1 + (profile.level - 1) * 0.3;
    const target = Math.round(template.baseTarget * levelMultiplier);
    
    return {
      id: generateId(),
      title: template.titleTemplate,
      description: template.descriptionTemplate.replace('{target}', target.toString()),
      category: template.category,
      difficulty: template.difficulty,
      xpReward: XP_REWARDS[template.difficulty],
      target,
      progress: 0,
      completed: false,
      expiresAt,
      createdAt: now,
    };
  });
}

/**
 * Atualiza progresso de uma missão
 */
export function updateMissionProgress(
  mission: Mission,
  increment: number = 1
): Mission {
  const newProgress = Math.min(mission.progress + increment, mission.target);
  const completed = newProgress >= mission.target;
  
  return {
    ...mission,
    progress: newProgress,
    completed,
  };
}

/**
 * Verifica se missões expiraram
 */
export function checkExpiredMissions(missions: Mission[]): {
  active: Mission[];
  expired: Mission[];
} {
  const now = new Date();
  
  const active: Mission[] = [];
  const expired: Mission[] = [];
  
  for (const mission of missions) {
    if (new Date(mission.expiresAt) < now && !mission.completed) {
      expired.push(mission);
    } else {
      active.push(mission);
    }
  }
  
  return { active, expired };
}

// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

/**
 * Verifica e retorna conquistas desbloqueadas
 */
export function checkAchievements(
  profile: GuardianProfile,
  stats: {
    codeSmellsFixed?: number;
    simulationsCompleted?: number;
    vulnerabilityFreeDays?: number;
    rulesDocumented?: number;
    streakDays?: number;
    deterministicRuns?: number;
    lowBlastRadiusOps?: number;
  }
): Achievement[] {
  const unlockedAchievements: Achievement[] = [];
  const alreadyUnlocked = new Set(profile.achievements);
  
  // Guardian Initiate
  if (!alreadyUnlocked.has(ACHIEVEMENTS.GUARDIAN_INITIATE.id) && profile.totalActionsExecuted >= 1) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.GUARDIAN_INITIATE,
      unlockedAt: new Date(),
    });
  }
  
  // Debt Slayer
  if (!alreadyUnlocked.has(ACHIEVEMENTS.DEBT_SLAYER.id) && (stats.codeSmellsFixed || 0) >= 100) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.DEBT_SLAYER,
      unlockedAt: new Date(),
      progress: stats.codeSmellsFixed,
    });
  }
  
  // Twin Master
  if (!alreadyUnlocked.has(ACHIEVEMENTS.TWIN_MASTER.id) && (stats.simulationsCompleted || 0) >= 10) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.TWIN_MASTER,
      unlockedAt: new Date(),
      progress: stats.simulationsCompleted,
    });
  }
  
  // Fortress Builder
  if (!alreadyUnlocked.has(ACHIEVEMENTS.FORTRESS_BUILDER.id) && (stats.vulnerabilityFreeDays || 0) >= 30) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.FORTRESS_BUILDER,
      unlockedAt: new Date(),
      progress: stats.vulnerabilityFreeDays,
    });
  }
  
  // Legacy Whisperer
  if (!alreadyUnlocked.has(ACHIEVEMENTS.LEGACY_WHISPERER.id) && (stats.rulesDocumented || 0) >= 50) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.LEGACY_WHISPERER,
      unlockedAt: new Date(),
      progress: stats.rulesDocumented,
    });
  }
  
  // Perfect Streak
  if (!alreadyUnlocked.has(ACHIEVEMENTS.PERFECT_STREAK.id) && (stats.streakDays || 0) >= 7) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.PERFECT_STREAK,
      unlockedAt: new Date(),
      progress: stats.streakDays,
    });
  }
  
  // Sandbox Sage
  if (!alreadyUnlocked.has(ACHIEVEMENTS.SANDBOX_SAGE.id) && (stats.deterministicRuns || 0) >= 100) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.SANDBOX_SAGE,
      unlockedAt: new Date(),
      progress: stats.deterministicRuns,
    });
  }
  
  // Zero Blast
  if (!alreadyUnlocked.has(ACHIEVEMENTS.ZERO_BLAST.id) && (stats.lowBlastRadiusOps || 0) >= 50) {
    unlockedAchievements.push({
      ...ACHIEVEMENTS.ZERO_BLAST,
      unlockedAt: new Date(),
      progress: stats.lowBlastRadiusOps,
    });
  }
  
  return unlockedAchievements;
}

/**
 * Retorna progresso de todas as conquistas
 */
export function getAchievementProgress(
  profile: GuardianProfile,
  stats: Record<string, number>
): Array<Achievement & { progress: number; target: number; unlocked: boolean }> {
  const alreadyUnlocked = new Set(profile.achievements);
  
  return Object.values(ACHIEVEMENTS).map((achievement) => ({
    ...achievement,
    progress: stats[achievement.id] || 0,
    target: achievement.target,
    unlocked: alreadyUnlocked.has(achievement.id),
    unlockedAt: alreadyUnlocked.has(achievement.id) ? new Date() : undefined,
  }));
}

// =============================================================================
// XP CALCULATOR
// =============================================================================

/**
 * Calcula XP total a ser concedido
 */
export function calculateXPReward(
  baseAction: keyof typeof import('../constants').XP_ACTIONS,
  multipliers: {
    streak?: number;
    difficulty?: MissionDifficulty;
    noRollback?: boolean;
    firstOfDay?: boolean;
  } = {}
): number {
  // Import XP_ACTIONS directly (ESM compatible)
  const XP_ACTIONS = {
    fix_bug: 50,
    add_test: 30,
    improve_docs: 20,
    refactor: 40,
    security_fix: 80,
    complete_mission: 100,
  };
  
  let xp = XP_ACTIONS[baseAction as keyof typeof XP_ACTIONS] || 0;
  
  // Multiplicador de streak
  if (multipliers.streak && multipliers.streak >= 3) {
    xp = Math.round(xp * (1 + multipliers.streak * 0.1));
  }
  
  // Bonus de dificuldade
  if (multipliers.difficulty) {
    const difficultyBonus: Record<MissionDifficulty, number> = {
      easy: 1,
      medium: 1.2,
      hard: 1.5,
      legendary: 2,
    };
    xp = Math.round(xp * difficultyBonus[multipliers.difficulty]);
  }
  
  // Bonus de sem rollback
  if (multipliers.noRollback) {
    xp = Math.round(xp * 1.25);
  }
  
  // Bonus de primeiro do dia
  if (multipliers.firstOfDay) {
    xp += 25; // Bonus fixo para primeiro flow do dia
  }
  
  return xp;
}

// =============================================================================
// LEADERBOARD
// =============================================================================

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  xp: number;
  level: number;
  levelTitle: string;
  actionsThisWeek: number;
  rank: number;
}

/**
 * Calcula ranking baseado em XP
 */
export function calculateLeaderboard(
  profiles: GuardianProfile[]
): LeaderboardEntry[] {
  return profiles
    .sort((a, b) => b.xp - a.xp)
    .map((profile, index) => ({
      userId: profile.userId,
      displayName: profile.userId, // Pode ser substituído por nome real
      xp: profile.xp,
      level: profile.level,
      levelTitle: profile.levelTitle,
      actionsThisWeek: 0, // TODO: Calcular de logs
      rank: index + 1,
    }));
}
