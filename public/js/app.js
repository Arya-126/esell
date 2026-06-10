/* Shared client utilities: auth state, API wrapper, navbar, notifications, toasts. */

const Auth = {
  get token() { return localStorage.getItem('token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  set(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
  get isLoggedIn() { return !!this.token; },
};

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
  let payload;
  if (form) {
    payload = form; // FormData; let the browser set Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    if (res.status === 401) {
      // token expired/invalid -> bounce to login (but not on the auth pages themselves)
      if (!location.pathname.includes('login')) { Auth.clear(); }
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function toast(msg, isError = false) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function trustBadge(score) {
  if (score == null) return `<span class="trust muted">🌱 New seller</span>`;
  let color = '#e5484d';
  if (score >= 75) color = '#2ecc71';
  else if (score >= 50) color = '#f0a020';
  return `<span class="trust" style="color:${color}"><span class="dot" style="background:${color}"></span>${score} trust</span>`;
}

/* ---------------- Navbar ---------------- */
function renderNav(active) {
  const u = Auth.user;
  const links = [
    ['index.html', '🛍️ Browse'],
  ];
  if (Auth.isLoggedIn) {
    links.push(['sell.html', '➕ Sell']);
    links.push(['chat.html', '💬 Messages']);
    links.push(['dashboard.html', '📊 Dashboard']);
    if (u && u.role === 'admin') links.push(['admin.html', '🛡️ Admin']);
  }
  const linksHtml = links
    .map(([href, label]) => `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`)
    .join('');

  const right = Auth.isLoggedIn
    ? `<div class="bell" id="bellBtn">🔔<span class="badge" id="notiBadge" style="display:none">0</span></div>
       <div class="avatar-circle" id="avatarBtn" title="${esc(u?.name)}">${esc((u?.name || '?')[0].toUpperCase())}</div>`
    : `<a class="btn" href="login.html">Login / Sign up</a>`;

  const nav = document.createElement('div');
  nav.className = 'nav';
  nav.innerHTML = `
    <a class="brand" href="index.html">Re<span>Wear</span></a>
    <div class="links">${linksHtml}</div>
    <div class="spacer"></div>
    <div class="nav-right">${right}</div>
    <div class="dropdown" id="notiDrop"></div>`;
  document.body.prepend(nav);

  if (Auth.isLoggedIn) {
    document.getElementById('avatarBtn').onclick = () => { location.href = 'dashboard.html'; };
    setupNotifications();
    maybeShowVerifyBanner();
  }
}

// Banner prompting unverified users to confirm their email.
function maybeShowVerifyBanner() {
  const u = Auth.user;
  if (!u || u.verified || u.role === 'admin') return;
  const bar = document.createElement('div');
  bar.id = 'verifyBar';
  bar.style.cssText = 'background:#3a2a0a;border-bottom:1px solid #6b4e12;color:#f0c040;padding:10px 24px;display:flex;gap:12px;align-items:center;justify-content:center;font-size:14px;flex-wrap:wrap';
  bar.innerHTML = `✉️ Please verify your email to buy or sell.
    <button class="btn warn sm" id="verifyNowBtn">Verify now</button>`;
  const nav = document.querySelector('.nav');
  nav.after(bar);
  document.getElementById('verifyNowBtn').onclick = async () => {
    try {
      const { verifyUrl, alreadyVerified } = await api('/auth/resend', { method: 'POST' });
      if (alreadyVerified) { location.reload(); return; }
      // With no real SMTP configured the server returns the link directly for the demo.
      if (verifyUrl) { location.href = verifyUrl; }
      else toast('Verification email sent — check your inbox.');
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------------- Notifications ---------------- */
let _socket = null;
function getSocket() {
  if (_socket || !Auth.isLoggedIn || typeof io === 'undefined') return _socket;
  _socket = io({ auth: { token: Auth.token } });
  return _socket;
}

async function setupNotifications() {
  const bell = document.getElementById('bellBtn');
  const drop = document.getElementById('notiDrop');
  if (!bell) return;

  async function refresh() {
    try {
      const { notifications, unread } = await api('/notifications');
      const badge = document.getElementById('notiBadge');
      if (unread > 0) { badge.style.display = 'grid'; badge.textContent = unread; }
      else badge.style.display = 'none';
      drop.innerHTML = notifications.length
        ? notifications.map((n) => `
          <div class="noti ${n.read ? '' : 'unread'}" onclick="location.href='${n.link || '#'}'">
            ${esc(n.text)}<div class="t">${timeAgo(n.createdAt)}</div>
          </div>`).join('')
        : `<div class="noti muted">No notifications yet</div>`;
    } catch { /* ignore */ }
  }

  bell.onclick = async () => {
    drop.classList.toggle('open');
    if (drop.classList.contains('open')) { await api('/notifications/read', { method: 'POST' }).catch(() => {}); }
    await refresh();
    setTimeout(() => { document.getElementById('notiBadge').style.display = 'none'; }, 400);
  };
  document.addEventListener('click', (e) => {
    if (!drop.contains(e.target) && e.target !== bell) drop.classList.remove('open');
  });

  await refresh();
  // Live push from socket.
  const s = getSocket();
  if (s) {
    s.on('chat:notify', () => { toast('💬 New message'); refresh(); });
    s.on('offer:new', (d) => { toast(`🤝 New offer on ${d.product?.title || 'an item'}`); refresh(); });
    s.on('offer:update', () => { refresh(); });
    s.on('order:update', () => { toast('📦 Order update'); refresh(); });
  }
  setInterval(refresh, 20000);
}

// Download an authenticated file (e.g. PDF receipt) by fetching it as a blob.
async function downloadAuthed(path, filename) {
  try {
    const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${Auth.token}` } });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { toast(e.message, true); }
}

function requireLogin() {
  if (!Auth.isLoggedIn) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search); return false; }
  return true;
}
