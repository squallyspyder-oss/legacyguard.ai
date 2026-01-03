/**
 * Pub/Sub para eventos de orquestração via Redis
 * 
 * Permite comunicação cross-worker para notificações em tempo real.
 * Worker publica eventos → API subscreve → SSE para cliente.
 * 
 * MANIFESTO: Sistema não deve mentir sobre estado.
 * Pub/Sub é transiente - estado persistente está em Redis keys.
 */

import Redis from 'ioredis';
import { getRedisUrl } from './config';

// Prefixo para canais de orquestração
const ORCH_CHANNEL_PREFIX = 'legacyguard:orch:events:';

// Tipos de eventos
export type OrchestrationEventType = 
  | 'plan-created'
  | 'twin-built'
  | 'task-started'
  | 'task-completed'
  | 'task-failed'
  | 'wave-completed'
  | 'approval-required'
  | 'approval-granted'
  | 'execution-resumed'
  | 'completed'
  | 'failed'
  | 'state-updated';

export type OrchestrationEvent = {
  type: OrchestrationEventType;
  taskId: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

// Conexão dedicada para publish (não bloqueia)
let publisherClient: Redis | null = null;

// Conexão dedicada para subscribe (bloqueia em listen mode)
let subscriberClient: Redis | null = null;

function getPublisher(): Redis | null {
  if (publisherClient) return publisherClient;
  
  const url = getRedisUrl();
  if (!url) {
    console.warn('[PUBSUB] Redis não configurado - publish desabilitado');
    return null;
  }
  
  publisherClient = new Redis(url);
  publisherClient.on('error', (err) => console.error('[PUBSUB] Publisher error:', err));
  return publisherClient;
}

function getSubscriber(): Redis | null {
  if (subscriberClient) return subscriberClient;
  
  const url = getRedisUrl();
  if (!url) {
    console.warn('[PUBSUB] Redis não configurado - subscribe desabilitado');
    return null;
  }
  
  // Conexão separada para subscribe (Redis exige conexão dedicada)
  subscriberClient = new Redis(url);
  subscriberClient.on('error', (err) => console.error('[PUBSUB] Subscriber error:', err));
  return subscriberClient;
}

/**
 * Publica evento de orquestração no canal específico da task
 */
export async function publishOrchestrationEvent(
  taskId: string,
  type: OrchestrationEventType,
  data?: Record<string, unknown>
): Promise<boolean> {
  const publisher = getPublisher();
  if (!publisher) return false;
  
  const event: OrchestrationEvent = {
    type,
    taskId,
    timestamp: new Date().toISOString(),
    data,
  };
  
  const channel = `${ORCH_CHANNEL_PREFIX}${taskId}`;
  
  try {
    await publisher.publish(channel, JSON.stringify(event));
    console.log(`[PUBSUB] Evento ${type} publicado para ${taskId}`);
    return true;
  } catch (err) {
    console.error('[PUBSUB] Erro ao publicar evento:', err);
    return false;
  }
}

/**
 * Subscreve a eventos de uma task específica
 * Retorna função de cleanup para cancelar subscription
 */
export function subscribeToOrchestration(
  taskId: string,
  onEvent: (event: OrchestrationEvent) => void,
  onError?: (error: Error) => void
): { unsubscribe: () => Promise<void> } {
  const subscriber = getSubscriber();
  
  if (!subscriber) {
    onError?.(new Error('Redis não disponível para subscription'));
    return { unsubscribe: async () => {} };
  }
  
  const channel = `${ORCH_CHANNEL_PREFIX}${taskId}`;
  
  const messageHandler = (ch: string, message: string) => {
    if (ch !== channel) return;
    
    try {
      const event = JSON.parse(message) as OrchestrationEvent;
      onEvent(event);
    } catch (err) {
      console.error('[PUBSUB] Erro ao parsear evento:', err);
      onError?.(err instanceof Error ? err : new Error('Parse error'));
    }
  };
  
  subscriber.subscribe(channel).catch((err) => {
    console.error('[PUBSUB] Erro ao subscrever:', err);
    onError?.(err);
  });
  
  subscriber.on('message', messageHandler);
  
  return {
    unsubscribe: async () => {
      subscriber.off('message', messageHandler);
      await subscriber.unsubscribe(channel);
    },
  };
}

/**
 * Subscreve a TODOS os eventos de orquestração (para admin/debug)
 */
export function subscribeToAllOrchestrations(
  onEvent: (event: OrchestrationEvent) => void,
  onError?: (error: Error) => void
): { unsubscribe: () => Promise<void> } {
  const subscriber = getSubscriber();
  
  if (!subscriber) {
    onError?.(new Error('Redis não disponível para subscription'));
    return { unsubscribe: async () => {} };
  }
  
  const pattern = `${ORCH_CHANNEL_PREFIX}*`;
  
  const messageHandler = (_pattern: string, _channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as OrchestrationEvent;
      onEvent(event);
    } catch (err) {
      console.error('[PUBSUB] Erro ao parsear evento:', err);
    }
  };
  
  subscriber.psubscribe(pattern).catch((err) => {
    console.error('[PUBSUB] Erro ao subscrever pattern:', err);
    onError?.(err);
  });
  
  subscriber.on('pmessage', messageHandler);
  
  return {
    unsubscribe: async () => {
      subscriber.off('pmessage', messageHandler);
      await subscriber.punsubscribe(pattern);
    },
  };
}

/**
 * Cleanup - desconectar clientes
 */
export async function disconnectPubSub(): Promise<void> {
  if (publisherClient) {
    publisherClient.disconnect();
    publisherClient = null;
  }
  if (subscriberClient) {
    subscriberClient.disconnect();
    subscriberClient = null;
  }
}
