// Role-Based Access Control (RBAC) for LegacyGuard
// Integrates with NextAuth session

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

export type Role = 'admin' | 'developer' | 'viewer' | 'guest';

export type Permission =
  | 'orchestrate' // Start orchestration
  | 'approve' // Approve executor/dangerous actions
  | 'execute' // Run executor agent
  | 'chat' // Use chat
  | 'index' // Index repositories
  | 'audit:read' // Read audit logs
  | 'audit:export' // Export audit data
  | 'config:read' // Read config
  | 'config:write' // Modify config
  | 'playbooks:read' // Read playbooks
  | 'playbooks:write' // Create/edit playbooks
  | 'incidents:read' // Read incidents
  | 'incidents:write' // Create/ingest incidents
  | 'sessions:read' // Read sessions
  | 'sessions:write'; // Manage sessions

// Role → Permissions mapping
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'orchestrate',
    'approve',
    'execute',
    'chat',
    'index',
    'audit:read',
    'audit:export',
    'config:read',
    'config:write',
    'playbooks:read',
    'playbooks:write',
    'incidents:read',
    'incidents:write',
    'sessions:read',
    'sessions:write',
  ],
  developer: [
    'orchestrate',
    'chat',
    'index',
    'audit:read',
    'config:read',
    'playbooks:read',
    'playbooks:write',
    'incidents:read',
    'incidents:write',
    'sessions:read',
    'sessions:write',
  ],
  viewer: [
    'chat',
    'audit:read',
    'config:read',
    'playbooks:read',
    'incidents:read',
    'sessions:read',
  ],
  guest: ['chat'],
};

// Get role from session (extend NextAuth types as needed)
export function getUserRole(
  session: {
    user?: {
      role?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null
): Role {
  if (!session?.user) return 'guest';
  const role = session.user.role as Role | undefined;
  if (role && role in ROLE_PERMISSIONS) return role;
  // Default authenticated users to developer
  return 'developer';
}

// Check if role has permission
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check multiple permissions (AND)
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

// Check multiple permissions (OR)
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

// Get all permissions for a role
export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// Middleware helper for route protection
export async function requirePermission(
  permission: Permission
): Promise<{ authorized: true; role: Role } | { authorized: false; response: NextResponse }> {
  try {
    const session = await getServerSession();
    const role = getUserRole(session);

    if (!hasPermission(role, permission)) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            error: 'Forbidden',
            message: `Permission denied: requires '${permission}'`,
            requiredPermission: permission,
            currentRole: role,
          },
          { status: 403 }
        ),
      };
    }

    return { authorized: true, role };
  } catch {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      ),
    };
  }
}

// Decorator-style wrapper for route handlers
export function withPermission(permission: Permission) {
  return function <T extends (...args: [Request, ...unknown[]]) => Promise<NextResponse>>(
    handler: T
  ): T {
    return (async (request: Request, ...args: unknown[]) => {
      const check = await requirePermission(permission);
      if (!check.authorized) {
        return check.response;
      }
      return handler(request, ...args);
    }) as T;
  };
}

// Combined rate limit + RBAC wrapper
export function withAuth(options: { permission: Permission }) {
  return function <T extends (...args: [Request, ...unknown[]]) => Promise<NextResponse>>(
    handler: T
  ): T {
    return (async (request: Request, ...args: unknown[]) => {
      const check = await requirePermission(options.permission);
      if (!check.authorized) {
        return check.response;
      }
      return handler(request, ...args);
    }) as T;
  };
}

// Extend NextAuth session type (add to types/next-auth.d.ts)
declare module 'next-auth' {
  interface User {
    role?: Role;
  }
  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: Role;
    };
  }
}
