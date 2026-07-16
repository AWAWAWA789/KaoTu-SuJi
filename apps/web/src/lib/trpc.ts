/**
 * tRPC 客户端
 */
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from '../../../server/src/trpc/routers/index.js';

export const trpc = createTRPCReact<AppRouter>();

export function getTrpcClient() {
  return {
    links: [
      loggerLink({
        enabled: (opts) =>
          (import.meta.env.DEV && typeof window !== 'undefined') ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: '/api/trpc',
        fetch: (url, options) =>
          fetch(url, { ...options, credentials: 'include' }),
      }),
    ],
  };
}
