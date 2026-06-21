import type { IncomingMessage, ServerResponse } from 'node:http';

import { resolveServiceUrl } from './config';
import { getCached, setCached, isCacheable } from './cache';

const CANNOT_PROCESS = 'Cannot process request';


const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
]);


const STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

interface ParsedRequest {
  service: string;
  restPath: string;
  search: string;
}

/** Split the incoming URL into `{service}` (first segment) and the rest of the path. */
export function parseRequest(rawUrl: string): ParsedRequest {
  const url = new URL(rawUrl || '/', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  return {
    service: (segments[0] ?? '').toLowerCase(),
    restPath: segments.slice(1).join('/'),
    search: url.search,
  };
}

/** Build the recipient URL, normalizing slashes (base may end with `/`, rest has none). */
function buildTargetUrl(base: string, restPath: string, search: string): string {
  const cleanBase = base.replace(/\/+$/, '');
  const path = restPath ? `/${restPath}` : '';
  return `${cleanBase}${path}${search}`;
}

/** Copy request headers, dropping the ones we must not forward. */
function buildForwardHeaders(incoming: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (STRIP_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

/** Read the full request body into a Buffer (only for methods that carry one). */
async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  // No body (e.g. cart's DELETE) -> undefined, so fetch sends no content-length.
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function sendCannotProcess(res: ServerResponse): void {
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end(CANNOT_PROCESS);
}

/**
 * Core BFF handler: resolve the recipient from the env URL map, forward the
 * request verbatim (method + headers + body), and relay the response.
 */
export async function handleProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const { service, restPath, search } = parseRequest(req.url ?? '/');

  const base = resolveServiceUrl(service);
  if (!base) {
    sendCannotProcess(res);
    return;
  }

  const target = buildTargetUrl(base, restPath, search);
  const cacheable = isCacheable(method, service, restPath);

  if (cacheable) {
    const hit = getCached(target);
    if (hit) {
      relayCached(res, hit);
      return;
    }
  }

  const body = await readBody(req);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: buildForwardHeaders(req.headers),
      body,
    });
  } catch {
    // DNS / connection refused / TLS — recipient unreachable.
    sendCannotProcess(res);
    return;
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  const headers = collectResponseHeaders(upstream.headers);

  if (cacheable && upstream.status === 200) {
    // Store a clone so the MISS marker below doesn't pollute the cached entry.
    setCached(target, { status: upstream.status, headers: { ...headers }, body: payload });
    headers['X-BFF-Cache'] = 'MISS';
  }

  // Task 10.1.5 — return the same status code and body the recipient returned.
  res.writeHead(upstream.status, headers);
  res.end(payload);
}

/** Convert fetch Headers into a plain object, dropping headers we must not relay. */
function collectResponseHeaders(source: Headers): Record<string, string> {
  const headers: Record<string, string> = {};
  source.forEach((value, name) => {
    if (STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) return;
    headers[name] = value;
  });
  return headers;
}

function relayCached(
  res: ServerResponse,
  entry: { status: number; headers: Record<string, string>; body: Buffer },
): void {
  res.writeHead(entry.status, { ...entry.headers, 'X-BFF-Cache': 'HIT' });
  res.end(entry.body);
}
