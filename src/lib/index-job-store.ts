/**
 * Index Job Store - Armazena status de jobs de indexação
 * Permite retorno instantâneo e polling de status
 */

import { getRedis } from './queue';

export type IndexJobStatus = 'queued' | 'cloning' | 'indexing' | 'completed' | 'failed';

export interface IndexJob {
  id: string;
  status: IndexJobStatus;
  owner?: string;
  repo?: string;
  gitUrl?: string;
  branch?: string;
  clonePath?: string;
  fileCount?: number;
  ragChunks?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

const JOB_PREFIX = 'indexjob:';
const JOB_TTL = 3600; // 1 hora

export async function createIndexJob(data: Omit<IndexJob, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<IndexJob> {
  const redis = getRedis();
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  
  const job: IndexJob = {
    id,
    status: 'queued',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  
  if (redis) {
    await redis.set(`${JOB_PREFIX}${id}`, JSON.stringify(job), 'EX', JOB_TTL);
  }
  
  return job;
}

export async function updateIndexJob(id: string, updates: Partial<IndexJob>): Promise<IndexJob | null> {
  const redis = getRedis();
  
  if (!redis) return null;
  
  const existing = await redis.get(`${JOB_PREFIX}${id}`);
  if (!existing) return null;
  
  const job: IndexJob = {
    ...JSON.parse(existing as string),
    ...updates,
    updatedAt: Date.now(),
  };
  
  if (updates.status === 'completed' || updates.status === 'failed') {
    job.completedAt = Date.now();
  }
  
  await redis.set(`${JOB_PREFIX}${id}`, JSON.stringify(job), 'EX', JOB_TTL);
  
  return job;
}

export async function getIndexJob(id: string): Promise<IndexJob | null> {
  const redis = getRedis();
  
  if (!redis) return null;
  
  const data = await redis.get(`${JOB_PREFIX}${id}`);
  if (!data) return null;
  
  return JSON.parse(data as string);
}

// In-memory fallback quando Redis não disponível
const memoryJobs = new Map<string, IndexJob>();

export function createIndexJobSync(data: Omit<IndexJob, 'id' | 'status' | 'createdAt' | 'updatedAt'>): IndexJob {
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  
  const job: IndexJob = {
    id,
    status: 'queued',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  
  memoryJobs.set(id, job);
  
  // Limpar jobs antigos (mais de 1 hora)
  for (const [key, j] of memoryJobs) {
    if (now - j.createdAt > JOB_TTL * 1000) {
      memoryJobs.delete(key);
    }
  }
  
  return job;
}

export function updateIndexJobSync(id: string, updates: Partial<IndexJob>): IndexJob | null {
  const existing = memoryJobs.get(id);
  if (!existing) return null;
  
  const job: IndexJob = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  
  if (updates.status === 'completed' || updates.status === 'failed') {
    job.completedAt = Date.now();
  }
  
  memoryJobs.set(id, job);
  return job;
}

export function getIndexJobSync(id: string): IndexJob | null {
  return memoryJobs.get(id) || null;
}
