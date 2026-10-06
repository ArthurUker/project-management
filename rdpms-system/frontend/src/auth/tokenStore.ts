/** Single owner of token storage. Legacy two-key sessions require explicit login. */
export interface SessionSnapshot {
  actorId: string;
  loginGeneration: string;
  tokenRevision: number;
  accessToken: string;
  refreshToken: string;
  refreshBlocked?: boolean;
}
interface SessionState { format: 1; generation: string; session: SessionSnapshot | null }
export interface LoginTicket { generation: string }

const KEY = 'rdpms.session.v1';
const WRITE_LOCK = 'rdpms.session.write.v1';
const empty = (): SessionState => ({ format: 1, generation: crypto.randomUUID(), session: null });
let memory = empty();
let mode: 'shared' | 'memory' | undefined;
let listening = false;
const changes = new Set<(session: SessionSnapshot | null) => void>();
const expired = new Set<(generation: string) => void>();

/** Correlation only; signature and authorization are always checked by the server. */
export function accessActor(token: string): string | null {
  try {
    const part = token.split('.')[1];
    const body = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof body.userId === 'string' && body.userId ? body.userId : null;
  } catch { return null; }
}

function shared(): boolean {
  if (!mode) {
    try {
      mode = typeof navigator !== 'undefined' && navigator.locks?.request &&
        typeof localStorage !== 'undefined' ? 'shared' : 'memory';
      if (mode === 'shared') localStorage.getItem(KEY);
    } catch { mode = 'memory'; }
  }
  return mode === 'shared';
}
function valid(raw: unknown): raw is SessionState {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as SessionState;
  if (r.format !== 1 || typeof r.generation !== 'string') return false;
  const s = r.session;
  return s === null || Boolean(s && typeof s.actorId === 'string' && s.actorId &&
    s.loginGeneration === r.generation && Number.isSafeInteger(s.tokenRevision) && s.tokenRevision >= 0 &&
    typeof s.accessToken === 'string' && s.accessToken && typeof s.refreshToken === 'string' && s.refreshToken &&
    (s.refreshBlocked === undefined || typeof s.refreshBlocked === 'boolean'));
}
function state(): SessionState {
  if (!shared()) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { format: 1, generation: 'EMPTY', session: null };
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : { format: 1, generation: 'INVALID', session: null };
  } catch {
    // Never adopt potentially stale shared credentials after storage becomes unavailable.
    mode = 'memory'; memory = empty(); return memory;
  }
}
function notify() {
  const current = state().session;
  for (const fn of changes) fn(current ? { ...current } : null);
}
function put(next: SessionState) {
  if (shared()) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch {
      mode = 'memory'; memory = empty(); notify();
      throw new Error('SESSION_STORAGE_UNAVAILABLE');
    }
  } else memory = next;
  notify();
}
async function write<T>(fn: () => T): Promise<T> {
  if (!shared()) return fn();
  // Synchronous mutation/readback only; this short lock never holds a network await.
  return navigator.locks.request(WRITE_LOCK, fn);
}
function sameLogin(expected: SessionSnapshot): boolean {
  const current = state().session;
  return Boolean(current && current.actorId === expected.actorId && current.loginGeneration === expected.loginGeneration);
}
function owns(expected: SessionSnapshot): boolean {
  const current = state().session;
  return Boolean(current && sameLogin(expected) && current.tokenRevision === expected.tokenRevision &&
    current.accessToken === expected.accessToken && current.refreshToken === expected.refreshToken);
}
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', (event) => {
    if (event.storageArea === localStorage && (event.key === KEY || event.key === null)) notify();
  });
}
export const tokenStore = {
  datasetEpoch(): string | undefined {
    try { const token=state().session?.accessToken; if(!token)return undefined;
      const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return typeof claims.datasetEpoch==='string' && /^[0-9a-f-]{36}$/i.test(claims.datasetEpoch) ? claims.datasetEpoch : undefined;
    } catch { return undefined; }
  },
  snapshot(): SessionSnapshot | null { const s = state().session; return s ? Object.freeze({ ...s }) : null; },
  generation(): string { return state().generation; },
  sameLogin,
  owns,
  getAccessToken(): string | null { return state().session?.accessToken ?? null; },
  getRefreshToken(): string | null { return state().session?.refreshToken ?? null; },
  hasSession(): boolean { return Boolean(state().session); },
  canRefresh(): boolean { return shared() && !state().session?.refreshBlocked; },
  async beginLogin(): Promise<LoginTicket> {
    return write(() => { const next = empty(); put(next); return { generation: next.generation }; });
  },
  async finishLogin(ticket: LoginTicket, actorId: string, accessToken: string, refreshToken: string): Promise<SessionSnapshot | null> {
    return write(() => {
      if (state().generation !== ticket.generation) return null;
      if (!actorId || accessActor(accessToken) !== actorId || !refreshToken) throw new Error('INVALID_SESSION_RESPONSE');
      const session = { actorId, loginGeneration: ticket.generation, tokenRevision: 0, accessToken, refreshToken };
      put({ format: 1, generation: ticket.generation, session }); return { ...session };
    });
  },
  async rotate(expected: SessionSnapshot, accessToken: string, refreshToken: string): Promise<SessionSnapshot | null> {
    return write(() => {
      if (!owns(expected) || !shared()) return null;
      if (accessActor(accessToken) !== expected.actorId || !refreshToken) throw new Error('INVALID_SESSION_RESPONSE');
      const next = { ...expected, tokenRevision: expected.tokenRevision + 1, accessToken, refreshToken, refreshBlocked: false };
      put({ format: 1, generation: next.loginGeneration, session: next }); return { ...next };
    });
  },
  async blockRefreshIfOwned(expected: SessionSnapshot): Promise<void> {
    await write(() => { if (owns(expected)) put({ format: 1, generation: expected.loginGeneration,
      session: { ...expected, refreshBlocked: true } }); });
  },
  async clearGeneration(generation: string): Promise<boolean> {
    return write(() => { if (state().generation !== generation) return false; put(empty()); return true; });
  },
  async expireIfOwned(expected: SessionSnapshot): Promise<boolean> {
    return write(() => {
      if (!owns(expected)) return false;
      const next = empty(); put(next);
      for (const fn of expired) fn(next.generation);
      return true;
    });
  },
  async withRefreshLock<T>(expected: SessionSnapshot, fn: () => Promise<T>): Promise<T> {
    if (!shared()) throw new Error('SESSION_COORDINATION_UNAVAILABLE');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000);
    try { return await navigator.locks.request(`rdpms.refresh:${expected.loginGeneration}`, { signal: controller.signal }, fn); }
    finally { clearTimeout(timer); }
  },
  onSessionChanged(fn: (session: SessionSnapshot | null) => void): () => void {
    listen(); changes.add(fn); return () => { changes.delete(fn); };
  },
  onSessionExpired(fn: (generation: string) => void): () => void {
    expired.add(fn); return () => { expired.delete(fn); };
  },
};
