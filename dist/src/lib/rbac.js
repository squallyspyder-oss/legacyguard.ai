"use strict";
// Role-Based Access Control (RBAC) for LegacyGuard
// Integrates with NextAuth session
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserRole = getUserRole;
exports.hasPermission = hasPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.hasAnyPermission = hasAnyPermission;
exports.getPermissions = getPermissions;
exports.requirePermission = requirePermission;
exports.withPermission = withPermission;
exports.withAuth = withAuth;
const next_auth_1 = require("next-auth");
const server_1 = require("next/server");
// Role → Permissions mapping
const ROLE_PERMISSIONS = {
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
function getUserRole(session) {
    if (!(session === null || session === void 0 ? void 0 : session.user))
        return 'guest';
    const role = session.user.role;
    if (role && role in ROLE_PERMISSIONS)
        return role;
    // Default authenticated users to developer
    return 'developer';
}
// Check if role has permission
function hasPermission(role, permission) {
    var _a, _b;
    return (_b = (_a = ROLE_PERMISSIONS[role]) === null || _a === void 0 ? void 0 : _a.includes(permission)) !== null && _b !== void 0 ? _b : false;
}
// Check multiple permissions (AND)
function hasAllPermissions(role, permissions) {
    return permissions.every((p) => hasPermission(role, p));
}
// Check multiple permissions (OR)
function hasAnyPermission(role, permissions) {
    return permissions.some((p) => hasPermission(role, p));
}
// Get all permissions for a role
function getPermissions(role) {
    var _a;
    return (_a = ROLE_PERMISSIONS[role]) !== null && _a !== void 0 ? _a : [];
}
// Middleware helper for route protection
async function requirePermission(permission) {
    var _a, _b, _c, _d, _e, _f;
    try {
        const session = await (0, next_auth_1.getServerSession)();
        const role = getUserRole(session);
        if (!hasPermission(role, permission)) {
            return {
                authorized: false,
                response: server_1.NextResponse.json({
                    error: 'Forbidden',
                    message: `Permission denied: requires '${permission}'`,
                    requiredPermission: permission,
                    currentRole: role,
                }, { status: 403 }),
            };
        }
        return {
            authorized: true,
            role,
            user: {
                email: (_b = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : null,
                name: (_d = (_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : null,
                id: (_f = (_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id) !== null && _f !== void 0 ? _f : null,
            },
        };
    }
    catch {
        return {
            authorized: false,
            response: server_1.NextResponse.json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 }),
        };
    }
}
// Decorator-style wrapper for route handlers
function withPermission(permission) {
    return function (handler) {
        return (async (request, ...args) => {
            const check = await requirePermission(permission);
            if (!check.authorized) {
                return check.response;
            }
            return handler(request, ...args);
        });
    };
}
// Combined rate limit + RBAC wrapper
function withAuth(options) {
    return function (handler) {
        return (async (request, ...args) => {
            const check = await requirePermission(options.permission);
            if (!check.authorized) {
                return check.response;
            }
            return handler(request, ...args);
        });
    };
}
