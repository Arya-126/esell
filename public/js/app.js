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

/* ---------------- Multi-currency ----------------
 * Prices are stored in USD (base). The server detects the viewer's currency
 * from their location (geo headers / browser locale) and serves live rates;
 * the picker in the navbar overrides it (cookie + user preference).
 */
const Currency = {
  data: null,
  _promise: null,
  init() {
    if (this._promise) return this._promise;
    this._promise = (async () => {
      try {
        const cached = JSON.parse(sessionStorage.getItem('fx') || 'null');
        if (cached && Date.now() - cached.at < 5 * 60 * 1000) { this.data = cached.data; return this.data; }
      } catch { /* refetch */ }
      try {
        this.data = await api('/currency');
        sessionStorage.setItem('fx', JSON.stringify({ at: Date.now(), data: this.data }));
      } catch {
        this.data = { base: 'USD', selected: 'USD', rates: { USD: 1 }, currencies: [{ code: 'USD', symbol: '$', name: 'US Dollar' }] };
      }
      return this.data;
    })();
    return this._promise;
  },
  get ready() { return this.init(); },
  get code() { return this.data?.selected || 'USD'; },
  meta(code) { return (this.data?.currencies || []).find((c) => c.code === (code || this.code)) || { symbol: '$', code: 'USD' }; },
  convert(usd) {
    const r = this.data?.rates?.[this.code] || 1;
    const v = Number(usd) * r;
    return this.meta().zeroDecimal ? Math.round(v) : Math.round(v * 100) / 100;
  },
  format(usd) {
    const m = this.meta();
    const v = this.convert(usd);
    const n = m.zeroDecimal ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return m.symbol + n;
  },
  async set(code) {
    await api('/currency', { method: 'POST', body: { currency: code } });
    sessionStorage.removeItem('fx');
    location.reload();
  },
};

// Display a USD amount in the viewer's currency, e.g. money(45) -> "₹3,847.50".
function money(usd) { return Currency.format(usd); }
// Small "≈ $45.00 USD" hint, empty when already viewing USD.
function usdHint(usd) {
  if (Currency.code === 'USD') return '';
  return `≈ $${Number(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}
// Amount actually charged on an order (rate locked at checkout) — the server
// pre-formats it as `charged`; old orders fall back to USD.
function orderMoney(o) {
  const main = o.charged || `$${o.amount}`;
  return o.currency && o.currency !== 'USD' ? `${main} <span class="muted" style="font-size:11px">($${o.amount})</span>` : main;
}

/* ---------------- Cart badge ---------------- */
async function refreshCartBadge() {
  if (!Auth.isLoggedIn) return;
  try {
    const { count } = await api('/cart');
    const b = document.getElementById('cartBadge');
    if (!b) return;
    b.style.display = count > 0 ? 'grid' : 'none';
    b.textContent = count;
  } catch { /* ignore */ }
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

  const cart = Auth.isLoggedIn
    ? `<div class="bell" id="cartBtn" title="Cart">🛒<span class="badge" id="cartBadge" style="display:none">0</span></div>`
    : '';
  const right = Auth.isLoggedIn
    ? `${cart}<div class="bell" id="bellBtn">🔔<span class="badge" id="notiBadge" style="display:none">0</span></div>
       <div class="avatar-circle" id="avatarBtn" title="${esc(u?.name)}">${esc((u?.name || '?')[0].toUpperCase())}</div>`
    : `<a class="btn" href="login.html">Login / Sign up</a>`;

  const nav = document.createElement('div');
  nav.className = 'nav';
  nav.innerHTML = `
    <a class="brand" href="index.html">Re<span>Wear</span></a>
    <div class="links">${linksHtml}</div>
    <div class="spacer"></div>
    <div class="nav-right">
      <select id="currencySel" title="Currency" style="padding:6px 8px;font-size:13px;width:auto;margin:0"></select>
      ${right}
    </div>
    <div class="dropdown" id="notiDrop"></div>`;
  document.body.prepend(nav);

  // Populate the currency picker once rates arrive.
  Currency.ready.then((d) => {
    const sel = document.getElementById('currencySel');
    if (!sel || !d) return;
    sel.innerHTML = d.currencies.map((c) => `<option value="${c.code}" ${c.code === d.selected ? 'selected' : ''}>${c.symbol} ${c.code}</option>`).join('');
    sel.onchange = () => Currency.set(sel.value).catch((e) => toast(e.message, true));
  });

  if (Auth.isLoggedIn) {
    document.getElementById('avatarBtn').onclick = () => { location.href = 'dashboard.html'; };
    document.getElementById('cartBtn').onclick = () => { location.href = 'cart.html'; };
    refreshCartBadge();
    setupNotifications();
    maybeShowVerifyBanner();
  }

  // Load the floating AI assistant once (self-initialising; hides itself unless
  // the AI service is enabled server-side). Works for guests and logged-in users.
  if (!document.getElementById('aiWidgetScript')) {
    const sc = document.createElement('script');
    sc.id = 'aiWidgetScript';
    sc.src = 'js/ai-widget.js';
    document.body.appendChild(sc);
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
