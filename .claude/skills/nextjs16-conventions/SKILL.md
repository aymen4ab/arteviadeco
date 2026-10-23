---
name: nextjs16-conventions
description: Next.js 16 rules that differ from older Next.js (async params/cookies/headers, proxy instead of middleware, revalidateTag signature, removed APIs). Use before writing or changing anything under src/app, src/middleware.ts, next.config.ts, or any code that uses next/* imports.
user-invocable: false
---

# Next.js 16 conventions for this repo

This project runs Next.js 16.2 with React 19.2. APIs changed from what you
may remember. The source of truth is the docs bundled with the installed
version, in `node_modules/next/dist/docs/` (run `npm ci` first if it is
missing):

- `01-app/02-guides/upgrading/version-16.md` — every breaking change
- `01-app/03-api-reference/` — current API reference (file conventions,
  functions, config)

Read the relevant page before using an API you are not sure about. Heed
deprecation notices.

## Rules that bite most often

**Async request APIs (sync access removed).** `cookies()`, `headers()`,
`draftMode()` must be awaited. `params` in `page`, `layout`, `route`,
`default` and metadata image files, and `searchParams` in `page`, are
Promises:

```ts
// src/app/api/flows/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
}
```

`npx next typegen` generates the global `PageProps<'/route'>`,
`LayoutProps` and `RouteContext` helpers if you prefer those types.

**`middleware` is deprecated in favour of `proxy`.** `proxy.ts` exports
`proxy()` and always runs on the Node.js runtime. This repo still uses
`src/middleware.ts` (Supabase session refresh). Leave it as is unless asked
to migrate; if you do migrate, rename the file and the exported function,
and rename any `*Middleware*` config flags (`skipMiddlewareUrlNormalize` →
`skipProxyUrlNormalize`).

**Caching.** `revalidateTag(tag, profile)` needs a cacheLife profile as its
second argument (e.g. `'max'`). For read-your-writes in Server Actions use
`updateTag(tag)`; to refresh the client router from a Server Action use
`refresh()` from `next/cache`.

**Removed.** `serverRuntimeConfig` / `publicRuntimeConfig` (use env vars),
the `next lint` command (this repo runs `eslint` directly with flat config),
AMP, `experimental.dynamicIO`.

**Other breaking changes.** Turbopack is the default bundler for dev and
build. Every parallel-route slot needs a `default.tsx`. `next/image`
defaults changed (`qualities`, `imageSizes`, `minimumCacheTTL`, local IP
blocking) and `images.domains` is deprecated in favour of
`images.remotePatterns`.

## Repo patterns

- Supabase clients come from `src/lib/supabase/` (`@supabase/ssr`). Server
  code must await `cookies()` when building the client.
- API routes resolve the caller's account via `src/lib/auth/account.ts` and
  check roles with `src/lib/auth/roles.ts`; every query is scoped by
  `account_id`.
- The WhatsApp webhook reads the raw body with `request.text()` before
  verifying the signature; never switch it to `request.json()`.
- UI uses shadcn components (`components.json`) on Tailwind 4 and
  `@base-ui/react`.

After changes run `npm run lint && npm run typecheck && npm test`; CI also
runs `npm run build`.
