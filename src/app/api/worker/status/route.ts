/**
 * API Route: /api/worker/status
 * 
 * Endpoint para consultar status do worker em tempo real.
 * Permite que o LegacyAssist "veja" o que o Worker está fazendo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';

// Simulated worker status (will be replaced with Redis integration)
interface WorkerTask {
  id: string;
  type: 'orchestrate' | 'twin-builder' | 'advisor' | 'reviewer' | 'executor';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

// In-memory store (replace with Redis in production)
const taskStore = new Map<string, WorkerTask>();

export async function GET(req: NextRequest) {
  // RBAC
  const auth = await requirePermission('chat');
  if (!auth.authorized) {
    return auth.response;
  }

  const taskId = req.nextUrl.searchParams.get('taskId');
  const userId = auth.user?.email || auth.user?.id || 'anonymous';

  try {
    if (taskId) {
      // Get specific task
      const task = taskStore.get(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    // Get all tasks for user (would filter by userId in production)
    const tasks = Array.from(taskStore.values());
    const activeTasks = tasks.filter(t => ['queued', 'running'].includes(t.status));
    const recentTasks = tasks
      .filter(t => ['completed', 'failed'].includes(t.status))
      .slice(-10);

    return NextResponse.json({
      active: activeTasks,
      recent: recentTasks,
      stats: {
        total: tasks.length,
        running: activeTasks.filter(t => t.status === 'running').length,
        queued: activeTasks.filter(t => t.status === 'queued').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
      },
    });
  } catch (err: any) {
    console.error('[worker/status] error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Update task status (called by worker)
export async function POST(req: NextRequest) {
  const auth = await requirePermission('orchestrate');
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { taskId, status, progress, result, error } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    const existing = taskStore.get(taskId);
    const task: WorkerTask = {
      id: taskId,
      type: existing?.type || body.type || 'orchestrate',
      status: status || existing?.status || 'queued',
      progress,
      startedAt: existing?.startedAt || (status === 'running' ? new Date().toISOString() : undefined),
      completedAt: ['completed', 'failed'].includes(status) ? new Date().toISOString() : undefined,
      result,
      error,
    };

    taskStore.set(taskId, task);

    return NextResponse.json({ task });
  } catch (err: any) {
    console.error('[worker/status] POST error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Register new task
export async function PUT(req: NextRequest) {
  const auth = await requirePermission('chat');
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { type, metadata } = body;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task: WorkerTask = {
      id: taskId,
      type: type || 'orchestrate',
      status: 'queued',
      startedAt: new Date().toISOString(),
    };

    taskStore.set(taskId, task);

    return NextResponse.json({ taskId, task });
  } catch (err: any) {
    console.error('[worker/status] PUT error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
