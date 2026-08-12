import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SERVER_AUTH_OPTIONS = {
  autoRefreshToken: false,
  persistSession: false,
} as const;

/** ws constructor is compatible at runtime; types differ from browser WebSocketLike. */
const NODE_WEBSOCKET_TRANSPORT = WebSocket as unknown as NonNullable<
  SupabaseClientOptions<'public'>['realtime']
>['transport'];

/** Supabase client configured for server-side use (REST + auth; Realtime transport wired for Node). */
export function createServerSupabaseClient(
  url: string,
  key: string,
  options: SupabaseClientOptions<'public'> = {},
): SupabaseClient {
  return createClient(url, key, {
    ...options,
    auth: { ...SERVER_AUTH_OPTIONS, ...options.auth },
    realtime: {
      transport: NODE_WEBSOCKET_TRANSPORT,
      ...options.realtime,
    },
  });
}
