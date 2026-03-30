const express = require('express');
const cors = require('cors');
const { IgApiClient } = require('instagram-private-api');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const ig = new IgApiClient();

const state = {
  loggedIn: false,
  running: false,
  me: null,
  features: {
    welcome: true,
    leave: true,
    salam: true,
    seen: false,
    leaderboard: true,
    commands: true,
    appreciation: true,
  },
  messages: {
    welcome: `🌙✨ 𓆩 𝐀𝐬𝐬𝐚𝐥𝐚𝐦𝐮 𝐖𝐚𝐥𝐚𝐢𝐤𝐮𝐦 𓆪 🌌🪄\n\n𝐌𝐞𝐦𝐛𝐞𝐫𝐬 : @username\n\n🌸 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐓𝐨 𝐎𝐮𝐫 𝐀𝐝𝐝𝐚/𝐅𝐮𝐧/𝐌𝐞𝐦𝐨𝐫𝐢𝐞𝐬 𝐅𝐚𝐦𝐢𝐥𝐲 🌸`,
    leave: `😢 @username has left the group. We'll miss you! 💔`,
    salam: 'ওয়ালাইকুম আসসালাম ❤️',
    appreciation: '🎉 বাহ! @username তুমি দারুণ একটিভ আছো! চালিয়ে যাও! 💪✨',
  },
  admins: [],
  leaderboard: [],
  recentMessages: [],
  logs: [],
  poller: null,
};

const addLog = (type, message) => {
  state.logs.push({
    timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    type,
    message,
  });

  if (state.logs.length > 300) {
    state.logs = state.logs.slice(-300);
  }

  console.log(`[${type.toUpperCase()}] ${message}`);
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== 'string') return '';
  const trimmed = sessionId.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
};

const buildSessionState = (sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const now = new Date().toISOString();

  return {
    constants: {},
    cookies: [
      {
        key: 'sessionid',
        value: normalizedSessionId,
        domain: '.instagram.com',
        path: '/',
        hostOnly: false,
        creation: now,
        lastAccessed: now,
        sameSite: 'none',
        secure: true,
        httpOnly: true,
      },
      {
        key: 'ds_user_id',
        value: '0',
        domain: '.instagram.com',
        path: '/',
        hostOnly: false,
        creation: now,
        lastAccessed: now,
        sameSite: 'lax',
        secure: true,
        httpOnly: false,
      },
      {
        key: 'csrftoken',
        value: `csrftoken_${Date.now()}`,
        domain: '.instagram.com',
        path: '/',
        hostOnly: false,
        creation: now,
        lastAccessed: now,
        sameSite: 'lax',
        secure: true,
        httpOnly: false,
      },
      {
        key: 'mid',
        value: `mid_${Date.now()}`,
        domain: '.instagram.com',
        path: '/',
        hostOnly: false,
        creation: now,
        lastAccessed: now,
        sameSite: 'lax',
        secure: true,
        httpOnly: false,
      },
    ],
    cookieJar: {
      version: 'tough-cookie@4.1.3',
      storeType: 'MemoryCookieStore',
      rejectPublicSuffixes: true,
      enableLooseMode: false,
      allowSpecialUseDomain: true,
      prefixSecurity: 'silent',
      cookies: [
        {
          key: 'sessionid',
          value: normalizedSessionId,
          domain: 'instagram.com',
          path: '/',
          hostOnly: false,
          pathIsDefault: true,
          creation: now,
          lastAccessed: now,
          sameSite: 'none',
          secure: true,
          httpOnly: true,
        },
      ],
    },
    deviceString: 'android-31/12; 420dpi; 1080x1920; samsung; SM-G998B; p3s; exynos2100; en_US; 431111111',
    deviceId: `android-${Math.random().toString(16).slice(2, 18)}`,
    uuid: cryptoRandomUuid(),
    phoneId: cryptoRandomUuid(),
    adid: cryptoRandomUuid(),
    build: '246989794',
  };
};

const cryptoRandomUuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const ensureSeed = () => {
  ig.state.generateDevice(process.env.IG_USERNAME || 'ig-session-login');
};

const verifyInstagramSession = async () => {
  try {
    const currentUser = await ig.account.currentUser();
    state.me = currentUser;
    state.loggedIn = true;
    addLog('success', `Instagram session active for @${currentUser.username}`);
    return currentUser;
  } catch (error) {
    state.loggedIn = false;
    state.me = null;
    throw error;
  }
};

const fetchInboxPreview = async () => {
  if (!state.loggedIn) return;

  try {
    const inboxFeed = ig.feed.directInbox();
    const inbox = await inboxFeed.items();
    const threads = safeArray(inbox).slice(0, 8);

    state.recentMessages = threads.flatMap((thread) => {
      const items = safeArray(thread.items).slice(0, 2);
      return items.map((item) => ({
        username:
          thread?.users?.[0]?.username ||
          item?.user_id?.toString() ||
          'unknown',
        text:
          item?.text ||
          item?.clip?.clip?.caption?.text ||
          item?.media?.caption?.text ||
          '[media]',
        timestamp: item?.timestamp
          ? new Date(Number(String(item.timestamp).slice(0, 13))).toISOString()
          : new Date().toISOString(),
      }));
    }).slice(0, 8);

    state.leaderboard = state.recentMessages.reduce((acc, msg) => {
      const existing = acc.find((entry) => entry.username === msg.username);
      if (existing) {
        existing.messages += 1;
      } else {
        acc.push({ username: msg.username, messages: 1, rank: 0 });
      }
      return acc;
    }, []).sort((a, b) => b.messages - a.messages).map((entry, index) => ({ ...entry, rank: index + 1 })).slice(0, 10);
  } catch (error) {
    addLog('warn', `Inbox sync skipped: ${error.message}`);
  }
};

const startPolling = async () => {
  if (state.poller) clearInterval(state.poller);

  await fetchInboxPreview();

  state.poller = setInterval(async () => {
    if (!state.running || !state.loggedIn) return;
    await fetchInboxPreview();
  }, 15000);
};

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'Instagram bot backend running' });
});

app.get('/status', (_req, res) => {
  res.json({
    running: state.running,
    loggedIn: state.loggedIn,
    username: state.me?.username || null,
  });
});

app.post('/login', async (req, res) => {
  const sessionId = req.body?.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: 'SESSION_ID is required' });
  }

  try {
    ensureSeed();
    await ig.simulate.preLoginFlow().catch(() => {});
    const serialized = buildSessionState(sessionId);
    await ig.state.deserialize(serialized);
    const me = await verifyInstagramSession();
    await fetchInboxPreview();

    return res.json({
      success: true,
      loggedIn: true,
      username: me.username,
      fullName: me.full_name || '',
    });
  } catch (error) {
    addLog('error', `Login failed: ${error.message}`);
    return res.status(400).json({
      error: error?.response?.body?.message || error.message || 'Instagram session login failed',
    });
  }
});

app.post('/start', async (_req, res) => {
  if (!state.loggedIn) {
    return res.status(400).json({ error: 'Login to Instagram first' });
  }

  state.running = true;
  await startPolling();
  addLog('success', 'Bot started');
  res.json({ success: true, running: true });
});

app.post('/stop', (_req, res) => {
  state.running = false;
  if (state.poller) {
    clearInterval(state.poller);
    state.poller = null;
  }
  addLog('warn', 'Bot stopped');
  res.json({ success: true, running: false });
});

app.get('/logs', (_req, res) => {
  res.json(state.logs.slice(-150));
});

app.get('/leaderboard', (_req, res) => {
  res.json(state.leaderboard);
});

app.get('/features', (_req, res) => {
  res.json(state.features);
});

app.post('/features', (req, res) => {
  const { feature, enabled } = req.body || {};
  if (!feature || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'feature and enabled are required' });
  }

  state.features[feature] = enabled;
  addLog('info', `Feature updated: ${feature} => ${enabled}`);
  res.json(state.features);
});

app.get('/messages', (_req, res) => {
  res.json(state.messages);
});

app.post('/messages', (req, res) => {
  const { key, value } = req.body || {};
  if (!key || typeof value !== 'string') {
    return res.status(400).json({ error: 'key and value are required' });
  }

  state.messages[key] = value;
  addLog('info', `Message template updated: ${key}`);
  res.json(state.messages);
});

app.get('/admins', (_req, res) => {
  res.json(state.admins);
});

app.post('/admins', (req, res) => {
  const username = String(req.body?.username || '').trim().replace(/^@/, '');
  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  if (!state.admins.includes(username)) {
    state.admins.push(username);
    addLog('info', `Admin added: @${username}`);
  }

  res.json(state.admins);
});

app.delete('/admins/:username', (req, res) => {
  const username = String(req.params?.username || '').trim().replace(/^@/, '');
  state.admins = state.admins.filter((item) => item !== username);
  addLog('info', `Admin removed: @${username}`);
  res.json(state.admins);
});

app.get('/recent-messages', (_req, res) => {
  res.json(state.recentMessages);
});

app.use((error, _req, res, _next) => {
  addLog('error', `Unhandled server error: ${error.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  addLog('info', `Server listening on port ${port}`);
});
