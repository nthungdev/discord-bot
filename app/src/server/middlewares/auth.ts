import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  hasCapability,
  hasGuildAccess,
  type PermissionCapability,
  type UserRole,
  type UserSession,
} from "../../shared";

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

const JWT_SECRET =
  process.env.SESSION_SECRET ||
  process.env.BOT_VAULT_ENCRYPTION_KEY ||
  "discord-bot-session-secret-change-in-production";

/**
 * Creates a signed session token for authenticated user sessions.
 */
export function signSessionToken(
  session: Omit<UserSession, "expiresAt">,
  expiresInSeconds = 7 * 24 * 60 * 60,
): string {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const fullSession: UserSession = { ...session, expiresAt };
  const payload = Buffer.from(JSON.stringify(fullSession)).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verifies a signed session token.
 */
export function verifySessionToken(token: string): UserSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const session: UserSession = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (session.expiresAt && session.expiresAt < Date.now()) {
      return null; // Expired
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Multi-tier auth middleware supporting Bearer token and Discord OAuth2 JWT session.
 */
export default function auth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // 1. Check Bearer Token header
  const authHeader = req.headers?.authorization?.toString() || "";

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();

    // Check static super admin bearer token
    if (process.env.BEARER_TOKEN && token === process.env.BEARER_TOKEN) {
      req.user = {
        user: {
          id: "system-admin",
          username: "System Admin",
          discriminator: "0000",
        },
        role: "SUPER_ADMIN",
        guilds: [],
        expiresAt: Infinity,
      };
      next();
      return;
    }

    // Check signed session token in Bearer header
    const verifiedSession = verifySessionToken(token);
    if (verifiedSession) {
      req.user = verifiedSession;
      next();
      return;
    }
  }

  // 2. Check session cookie
  const cookieHeader = req.headers?.cookie || "";
  const match = cookieHeader.match(/session_token=([^;]+)/);
  if (match) {
    const sessionToken = match[1];
    const verifiedSession = verifySessionToken(sessionToken);
    if (verifiedSession) {
      req.user = verifiedSession;
      next();
      return;
    }
  }

  // If running in development without auth configured, allow guest viewer
  if (process.env.NODE_ENV === "development" && !process.env.BEARER_TOKEN) {
    req.user = {
      user: {
        id: "dev-user",
        username: "Dev Operator",
        discriminator: "0000",
      },
      role: "SUPER_ADMIN",
      guilds: [],
      expiresAt: Infinity,
    };
    next();
    return;
  }

  res.status(401);
  res.send({ ok: false, message: "unauthorized" });
}

/**
 * Capability guard middleware
 */
export function requireCapability(capability: PermissionCapability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req.user && hasCapability(req.user, capability))) {
      res.status(403);
      res.send({
        ok: false,
        message: `Forbidden: Missing required capability '${capability}'`,
      });
      return;
    }
    next();
  };
}

/**
 * Role guard middleware
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req.user && allowedRoles.includes(req.user.role))) {
      res.status(403);
      res.send({
        ok: false,
        message: "Forbidden: Insufficient privileges",
      });
      return;
    }
    next();
  };
}

/**
 * Guild access guard middleware
 */
export function requireGuildPermission(guildIdParam = "guildId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const guildId = req.params[guildIdParam];
    if (!(guildId && req.user && hasGuildAccess(req.user, guildId))) {
      res.status(403);
      res.send({
        ok: false,
        message: "Forbidden: You do not have access to this guild",
      });
      return;
    }
    next();
  };
}
