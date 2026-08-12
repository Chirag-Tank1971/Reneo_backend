import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import type { AuthUser } from '../types/index.js';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

async function loadAuthUser(userId: string, email: string): Promise<AuthUser> {
  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.from('profiles').select('role, email').eq('id', userId).single();
  if (error || !data) {
    throw forbidden('User profile not found');
  }

  return {
    id: userId,
    role: data.role as AuthUser['role'],
    email: data.email ?? email,
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw unauthorized();
    }

    const env = getEnv();
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw unauthorized('Invalid or expired token');
    }

    const user = await loadAuthUser(data.user.id, data.user.email ?? '');
    req.user = user;
    req.userId = user.id;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Array<'SELLER' | 'CUSTOMER'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
}
