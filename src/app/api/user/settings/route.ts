import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.legacyguard');
const USERS_DIR = path.join(DATA_DIR, 'users');

export type UserSettings = {
  // Profile
  displayName: string;
  email: string;
  avatarUrl?: string;
  timezone: string;
  language: string;
  
  // Preferences
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showTimestamps: boolean;
  soundEnabled: boolean;
  
  // Notifications
  emailNotifications: boolean;
  desktopNotifications: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  dailyDigest: boolean;
  
  // Agent Preferences
  defaultAgent: string;
  autoSuggestAgents: boolean;
  showAgentThinking: boolean;
  streamResponses: boolean;
  
  // Privacy
  shareAnalytics: boolean;
  saveHistory: boolean;
  historyRetentionDays: number;
  
  // Shortcuts
  shortcuts: {
    newChat: string;
    toggleSidebar: string;
    openSettings: string;
    focusInput: string;
  };
  
  // Advanced
  developerMode: boolean;
  verboseLogs: boolean;
  experimentalFeatures: boolean;
};

const defaultUserSettings: UserSettings = {
  displayName: '',
  email: '',
  avatarUrl: undefined,
  timezone: 'America/Sao_Paulo',
  language: 'pt-BR',
  
  theme: 'dark',
  compactMode: false,
  showTimestamps: true,
  soundEnabled: false,
  
  emailNotifications: true,
  desktopNotifications: true,
  notifyOnComplete: true,
  notifyOnError: true,
  dailyDigest: false,
  
  defaultAgent: 'orchestrate',
  autoSuggestAgents: true,
  showAgentThinking: true,
  streamResponses: true,
  
  shareAnalytics: false,
  saveHistory: true,
  historyRetentionDays: 30,
  
  shortcuts: {
    newChat: 'Ctrl+N',
    toggleSidebar: 'Ctrl+B',
    openSettings: 'Ctrl+,',
    focusInput: '/',
  },
  
  developerMode: false,
  verboseLogs: false,
  experimentalFeatures: false,
};

function ensureUserDir(userId: string) {
  const userDir = path.join(USERS_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

function getUserSettingsPath(userId: string): string {
  return path.join(USERS_DIR, userId, 'settings.json');
}

function sanitizeUserId(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}

function readUserSettings(userId: string): UserSettings {
  try {
    const settingsPath = getUserSettingsPath(userId);
    if (!fs.existsSync(settingsPath)) {
      return { ...defaultUserSettings };
    }
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const saved = JSON.parse(raw) as Partial<UserSettings>;
    return { ...defaultUserSettings, ...saved };
  } catch {
    return { ...defaultUserSettings };
  }
}

function writeUserSettings(userId: string, settings: UserSettings) {
  ensureUserDir(userId);
  const settingsPath = getUserSettingsPath(userId);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const email = session?.user?.email;
    
    if (!email) {
      // Return defaults for anonymous users
      return NextResponse.json({ 
        settings: defaultUserSettings,
        authenticated: false 
      });
    }
    
    const userId = sanitizeUserId(email);
    const settings = readUserSettings(userId);
    
    // Update with session info
    settings.email = email;
    settings.displayName = settings.displayName || session?.user?.name || email.split('@')[0];
    settings.avatarUrl = settings.avatarUrl || session?.user?.image || undefined;
    
    return NextResponse.json({ 
      settings,
      authenticated: true 
    });
  } catch (error) {
    console.error('[user-settings] Error loading settings:', error);
    return NextResponse.json({ 
      settings: defaultUserSettings,
      authenticated: false,
      error: 'Failed to load settings'
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const email = session?.user?.email;
    
    if (!email) {
      return NextResponse.json({ 
        error: 'Authentication required to save settings' 
      }, { status: 401 });
    }
    
    const body = await req.json().catch(() => ({}));
    const updates = body?.settings as Partial<UserSettings>;
    
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ 
        error: 'Invalid settings object' 
      }, { status: 400 });
    }
    
    const userId = sanitizeUserId(email);
    const currentSettings = readUserSettings(userId);
    
    // Merge updates (prevent overwriting email)
    const newSettings: UserSettings = {
      ...currentSettings,
      ...updates,
      email, // Always use session email
    };
    
    writeUserSettings(userId, newSettings);
    
    return NextResponse.json({ 
      saved: true,
      settings: newSettings 
    });
  } catch (error) {
    console.error('[user-settings] Error saving settings:', error);
    return NextResponse.json({ 
      error: 'Failed to save settings' 
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession();
    const email = session?.user?.email;
    
    if (!email) {
      return NextResponse.json({ 
        error: 'Authentication required' 
      }, { status: 401 });
    }
    
    const userId = sanitizeUserId(email);
    const settingsPath = getUserSettingsPath(userId);
    
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    
    return NextResponse.json({ 
      deleted: true,
      settings: defaultUserSettings 
    });
  } catch (error) {
    console.error('[user-settings] Error deleting settings:', error);
    return NextResponse.json({ 
      error: 'Failed to delete settings' 
    }, { status: 500 });
  }
}
