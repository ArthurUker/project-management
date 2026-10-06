import React, { useContext, useEffect } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/node_modules/react/index.js';
import { createRoot } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/node_modules/react-dom/client.js';
import { BrowserRouter } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/node_modules/react-router-dom/dist/index.js';
import { AuthProvider } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/src/auth/AuthProvider';
import { AuthContext } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/src/auth/AuthContext';
import { tokenStore } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/src/auth/tokenStore';
import { http } from '/Users/renkang/VS Code/project-management/rdpms-system/frontend/src/api/http';

const pending: Record<string, Promise<unknown>> = {};
function Probe() {
  const ctx = useContext(AuthContext)!;
  useEffect(() => { window.dispatchEvent(new Event("rdpms-harness-ready")); }, []);
  (window as any).bridge = {
    login: ctx.login, logout: ctx.logout, profile: ctx.refreshUser,
    state: async () => {
      const s = tokenStore.snapshot();
      const bytes = new TextEncoder().encode(`${s?.accessToken ?? ''}:${s?.refreshToken ?? ''}`);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
      return { actorId: s?.actorId ?? null, generation: s?.loginGeneration ?? null, revision: s?.tokenRevision ?? null,
        refreshBlocked: Boolean(s?.refreshBlocked), canRefresh: tokenStore.canRefresh(), fingerprint: digest,
        shownActor: ctx.user?.id ?? null, status: ctx.status, path: location.pathname };
    },
    waitActor: (id: string | null) => new Promise<void>((resolve, reject) => {
      const check = () => document.querySelector('#actor')?.textContent === (id ?? 'anonymous');
      if (check()) { resolve(); return; }
      const observer = new MutationObserver(() => { if (check()) { clearTimeout(timer); observer.disconnect(); resolve(); } });
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('OWNED_UI_ACTOR_NOT_READY')); }, 6000);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }),
    expire: async () => {
      const owner = tokenStore.snapshot()!;
      const { data } = await http.get('/testing/expired-access');
      await tokenStore.rotate(owner, data.accessToken, owner.refreshToken);
    },
    memoryExpire: async () => {
      const owner = tokenStore.snapshot()!;
      const { data } = await http.get('/testing/expired-access');
      const ticket = await tokenStore.beginLogin();
      await tokenStore.finishLogin(ticket, owner.actorId, data.accessToken, owner.refreshToken);
    },
    // Controlled legacy/other caller bypasses refresh coordination but still uses real
    // HTTP refresh + conditional short write, to exercise the losing old-response path.
    compete: async () => {
      const origin = tokenStore.snapshot()!;
      const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: origin.refreshToken }) });
      if (!res.ok) throw new Error('OWNED_COMPETITOR_NOT_SUCCESSFUL');
      const body = await res.json(); await tokenStore.rotate(origin, body.accessToken, body.refreshToken);
    },
    start: (name: string, operation = 'probe') => {
      const request = operation === 'logout' ? ctx.logout() : operation === 'profile' ? ctx.refreshUser() :
        http.post('/auth/probe', { clientMutationId: name, content: 'synthetic-last-copy' });
      pending[name] = request.then(() => ({ result: 'OK' }), (e) => ({ result: 'ERROR', code: e.code, status: e.status }));
    },
    finish: (name: string) => pending[name],
    unsent: () => localStorage.getItem('synthetic.unsent'),
  };
  return <main><h1>Owned RDPMS auth contract validation</h1><p>Candidate AuthProvider, real JWT/HTTP and PostgreSQL. Synthetic accounts only.</p>
    <p id="actor">{ctx.user?.id ?? 'anonymous'}</p><p id="status">{ctx.status}</p></main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><Probe /></AuthProvider></BrowserRouter>);
