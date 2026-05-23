import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import authRoutes from '../core/auth/routes.js';
import chRoutes from '../modules/ch-solutions/routes.js';

const assetManifest = JSON.parse(manifestJSON);

// Map clean URLs to their .html files
const PAGE_MAP = {
  '/': '/index.html',
  '/login': '/login.html',
  '/admin/login': '/admin/login.html',
  '/admin/dashboard': '/admin/dashboard.html',
  // All direct_billing buildings → shared dashboard page
  '/resident/zh/dashboard': '/resident/ch-dashboard.html',
  '/resident/kv/dashboard': '/resident/ch-dashboard.html',
  '/resident/bv/dashboard': '/resident/gce-resident-dashboard.html',
  '/resident/ku/dashboard': '/resident/gce-resident-dashboard.html',
  // Legacy / fallback
  '/resident/ch/dashboard': '/resident/ch-dashboard.html',
  '/resident/gce/dashboard': '/resident/gce-dashboard.html',
};

// direct_billing buildings — route to ch module
const DIRECT_BILLING_IDS = ['zh', 'kv', 'bv', 'ku'];

function isDirectBillingPath(pathname) {
  return DIRECT_BILLING_IDS.some(id =>
    pathname.startsWith(`/api/admin/buildings/${id}/`) ||
    pathname === `/api/admin/buildings/${id}`
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    // Auth routes
    if (url.pathname.startsWith('/api/auth/')) {
      return (await authRoutes.handle(request, env, ctx)) ?? notFound();
    }

    // Resident bills (direct_billing buildings — zh/kv)
    if (url.pathname.startsWith('/api/resident/bills') ||
        url.pathname.startsWith('/api/resident/dashboard/ch') ||
        url.pathname.startsWith('/api/resident/dashboard/gce-resident')) {
      try {
        const res = await chRoutes.handle(request, env, ctx);
        if (res) return res;
      } catch (err) {
        console.error('[ch-module]', err);
        return moduleError('ch');
      }
    }

    // Admin routes for direct_billing buildings (zh, kv, bv, ku)
    if (isDirectBillingPath(url.pathname)) {
      try {
        const res = await chRoutes.handle(request, env, ctx);
        if (res) return res;
      } catch (err) {
        console.error('[ch-module]', err);
        return moduleError('ch');
      }
    }

    // General admin routes
    if (url.pathname.startsWith('/api/admin/')) {
      const { validateSession, getTokenFromRequest } = await import('../core/auth/session.js');
      const { queryOne, query } = await import('../shared/db/index.js');
      const { json, error } = await import('../shared/utils/index.js');

      const token = getTokenFromRequest(request);
      const session = await validateSession(env.DB, token);
      if (!session?.admin_id) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

      if (url.pathname === '/api/admin/buildings' && request.method === 'GET') {
        const { results } = await query(env.DB, 'SELECT * FROM buildings ORDER BY name');
        return json(results);
      }
      if (url.pathname === '/api/admin/me' && request.method === 'GET') {
        const admin = await queryOne(env.DB, 'SELECT id, email, role, building_id FROM admin_users WHERE id = ?', [session.admin_id]);
        return json(admin);
      }
    }

    // Static pages
    if (request.method === 'GET') {
      try {
        const mappedPath = PAGE_MAP[url.pathname];
        let assetRequest = request;
        if (mappedPath) {
          assetRequest = new Request(new URL(mappedPath, url.origin).toString(), request);
        }
        return await getAssetFromKV(
          { request: assetRequest, waitUntil: ctx.waitUntil.bind(ctx) },
          { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest }
        );
      } catch {
        return notFound();
      }
    }

    return notFound();
  },
};

function notFound() {
  return new Response('Not found', { status: 404 });
}

function moduleError(module) {
  return new Response(JSON.stringify({ error: `Service temporarily unavailable (${module})` }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
