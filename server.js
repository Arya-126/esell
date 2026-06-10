const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const db = require('./db');
const { optionalAuth, SECRET } = require('./middleware/auth');
const { notify } = require('./lib/helpers');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const { router: chatRoutes } = require('./routes/chat');
const offersRoutes = require('./routes/offers');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');

const payments = require('./lib/payments');

const app = express();
app.set('trust proxy', 1); // correct client IPs / secure cookies behind a proxy (Render, Heroku, etc.)
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(optionalAuth);

// Static assets + uploaded images.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// REST API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/offers', offersRoutes(io));
app.use('/api/orders', ordersRoutes(io));
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Public client config — tells the frontend which payment UI to render.
app.get('/api/config', (_req, res) => {
  res.json({ stripeEnabled: payments.enabled, stripePublishableKey: payments.publishableKey || null });
});

// Multer / generic error handler.
app.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ error: err.message || 'Request failed' });
  res.status(500).json({ error: 'Server error' });
});

/* ----------------------------- Socket.io ----------------------------- */
// Authenticate every socket via the JWT passed in the handshake.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(); // allow anonymous (read-only) sockets
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.users.byId(payload.id);
    if (user && !user.banned) socket.user = user;
  } catch {
    /* anonymous */
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.user) socket.join(`user:${socket.user.id}`); // personal room for notifications

  // Join a conversation room (only participants allowed).
  socket.on('chat:join', (conversationId) => {
    const convo = db.conversations.byId(conversationId);
    if (!convo || !socket.user) return;
    if (![convo.buyerId, convo.sellerId].includes(socket.user.id)) return;
    socket.join(`chat:${conversationId}`);
  });

  // Send a message in a conversation -> persist + broadcast live.
  socket.on('chat:send', (payload, ack) => {
    try {
      if (!socket.user) return ack && ack({ error: 'Login required' });
      const { conversationId, text } = payload || {};
      const convo = db.conversations.byId(conversationId);
      if (!convo) return ack && ack({ error: 'Conversation not found' });
      if (![convo.buyerId, convo.sellerId].includes(socket.user.id)) {
        return ack && ack({ error: 'Not your conversation' });
      }
      const clean = String(text || '').trim().slice(0, 2000);
      if (!clean) return ack && ack({ error: 'Empty message' });

      const message = db.messages.insert({
        conversationId,
        senderId: socket.user.id,
        text: clean,
        read: false,
      });
      io.to(`chat:${conversationId}`).emit('chat:message', message);

      // Notify the recipient (in their personal room) for inbox badges.
      const recipient = convo.buyerId === socket.user.id ? convo.sellerId : convo.buyerId;
      io.to(`user:${recipient}`).emit('chat:notify', { conversationId, from: socket.user.name });
      notify(recipient, 'message', `New message from ${socket.user.name}`, '/chat.html');
      ack && ack({ ok: true, message });
    } catch (e) {
      ack && ack({ error: 'Failed to send' });
    }
  });

  // Lightweight typing indicator.
  socket.on('chat:typing', (conversationId) => {
    if (!socket.user) return;
    socket.to(`chat:${conversationId}`).emit('chat:typing', { name: socket.user.name });
  });
});

// SPA-style fallback for clean URLs that map to html files is unnecessary;
// pages are served directly from /public.

// Refuse to boot in production with the insecure default token secret.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('\n  ✖ JWT_SECRET must be set in production. Refusing to start.\n');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🛍️  ReWear marketplace running at http://localhost:${PORT}`);
  console.log(`     payments: ${payments.enabled ? 'Stripe (live keys detected)' : 'demo stub'}\n`);
  if (db.users.count() === 0) {
    console.log('  → No users yet. The FIRST account you register becomes the ADMIN.');
    console.log('  → Or run `npm run seed` to load demo data (admin@rewear.dev / password123).\n');
  }
});

module.exports = { app, server, io };
