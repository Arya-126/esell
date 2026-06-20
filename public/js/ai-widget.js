/*
 * Floating AI shopping assistant widget.
 *
 * Self-initialising: injected once by renderNav(). Hides itself unless the server
 * reports the AI service is enabled (/api/config → aiEnabled). Reuses the shared
 * app.js utilities (Auth, api, esc, money, Currency) and the existing chat-bubble
 * styles. Talks only to the same-origin /api/ai/chat proxy.
 */
(function () {
  if (window.__aiWidgetMounted) return;
  window.__aiWidgetMounted = true;

  // Stable per-tab session id so the assistant keeps conversation context.
  let sessionId = sessionStorage.getItem('aiSession');
  if (!sessionId) {
    sessionId = 'w-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('aiSession', sessionId);
  }

  const SUGGESTIONS = [
    'Find me a warm winter jacket under $50',
    'Where is my order?',
    'What is your return policy?',
  ];
  const PRODUCT_SUGGESTIONS = [
    'Is this a good deal?',
    'What condition is it in?',
    'How much CO₂ does this save?',
  ];

  // When the user is on a product page, questions are answered about THAT item.
  function currentProductId() {
    if (!location.pathname.includes('product.html')) return undefined;
    return new URLSearchParams(location.search).get('id') || undefined;
  }

  async function init() {
    let cfg = {};
    try { cfg = await api('/config'); } catch { return; }
    if (!cfg.aiEnabled) return; // feature dark
    build();
  }

  let panel, msgs, input, launcher, greeted = false;

  function build() {
    launcher = document.createElement('button');
    launcher.className = 'ai-launcher';
    launcher.id = 'aiLauncher';
    launcher.title = 'ReWear assistant';
    launcher.innerHTML = '💬';
    document.body.appendChild(launcher);

    panel = document.createElement('div');
    panel.className = 'ai-panel';
    panel.innerHTML = `
      <div class="ai-head">
        <div><strong>🛍️ ReWear Assistant</strong><div class="ai-sub">Shopping & order help</div></div>
        <button class="ai-x" id="aiClose" title="Close">✕</button>
      </div>
      <div class="ai-msgs" id="aiMsgs"></div>
      <div class="ai-chips" id="aiChips"></div>
      <form class="ai-composer" id="aiForm">
        <input id="aiInput" autocomplete="off" placeholder="Ask me anything about ReWear…" />
        <button class="btn sm" type="submit">Send</button>
      </form>`;
    document.body.appendChild(panel);

    msgs = panel.querySelector('#aiMsgs');
    input = panel.querySelector('#aiInput');
    const chips = currentProductId() ? PRODUCT_SUGGESTIONS : SUGGESTIONS;
    panel.querySelector('#aiChips').innerHTML = chips
      .map((s) => `<button class="ai-chip" type="button">${esc(s)}</button>`).join('');
    panel.querySelectorAll('.ai-chip').forEach((c) => {
      c.onclick = () => { input.value = c.textContent; submit(); };
    });

    launcher.onclick = toggle;
    panel.querySelector('#aiClose').onclick = toggle;
    panel.querySelector('#aiForm').onsubmit = (e) => { e.preventDefault(); submit(); };
  }

  function toggle() {
    const open = panel.classList.toggle('open');
    launcher.classList.toggle('hidden', open);
    if (open) {
      if (!greeted) {
        greeted = true;
        bubble(currentProductId()
          ? "Hi! Ask me anything about this item — its condition, whether it's a good "
            + "price, the CO₂ it saves — or search for something else."
          : "Hi! I'm your ReWear assistant. Tell me what you're hunting for — "
            + "like \"a desk lamp under $20\" — or ask about an order or our policies.",
          'them');
      }
      setTimeout(() => input.focus(), 50);
    }
  }

  function bubble(text, who) {
    const el = document.createElement('div');
    el.className = `bubble ${who}`;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function typing() {
    const el = document.createElement('div');
    el.className = 'bubble them ai-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  async function cards(products) {
    await Currency.ready;
    const wrap = document.createElement('div');
    wrap.className = 'ai-cards';
    wrap.innerHTML = products.map((p) => `
      <a class="ai-card" href="product.html?id=${encodeURIComponent(p.id)}">
        <div class="ai-card-img">${p.image ? `<img src="${esc(p.image)}" alt="">` : '🖼️'}</div>
        <div class="ai-card-body">
          <div class="ai-card-title">${esc(p.title || 'Item')}</div>
          <div class="ai-card-price">${money(p.price || 0)}</div>
          ${p.whyItFits ? `<div class="ai-card-why">${esc(p.whyItFits)}</div>` : ''}
        </div>
      </a>`).join('');
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  let busy = false;
  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    bubble(text, 'me');
    const t = typing();
    try {
      const data = await api('/ai/chat', { method: 'POST', body: { message: text, sessionId, productId: currentProductId() } });
      t.remove();
      bubble(data.reply || "Sorry, I didn't catch that.", 'them');
      if (data.products && data.products.length) await cards(data.products);
    } catch (e) {
      t.remove();
      bubble('The assistant is unavailable right now. Please try again in a moment.', 'them');
    } finally {
      busy = false;
      input.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
