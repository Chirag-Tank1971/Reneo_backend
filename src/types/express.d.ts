import type { AuthUser } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userId?: string;
      accessToken?: string;
    }
  }
}

export {};
