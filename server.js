const express = require('express');
const cors = require('cors');
const { IgApiClient } = require('instagram-private-api');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const ig = new IgApiClient();
let botRunning = false;
let loggedIn = false;
let pollInterval = null;
let processedMessages = new Set();
let userMessageCount = {};
let userLastSeen = {};
let admins = new Set(['admin']);
let logs = [];
let features = {
  welcome: true, leave: true, salam: true, seen: true,
  leaderboard: true, commands: true, appreciation: true,
};
let messages = {};

const addLog = (type, message) => {
  const entry = { timestamp: new Date().toISOString().slice(11, 19), type, message };
  logs.push(entry);
  if (logs.length > 500) logs = logs.slice(-500);
  console.log(`[${type}] ${message}`);
};

// --- ROUTES ---
app.get('/', (_, res) => res.json({ message: 'IG Bot Running' }));

app.get('/status', (_, res) => res.json({ running: botRunning, loggedIn }));

app.post('/login', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'SESSION_ID required' });
    
    ig.state.generateDevice(sessionId);
    // Use session cookie approach
    await ig.account.login(process.env.IG_USERNAME || sessionId, process.env.IG_PASSWORD || sessionId);
    loggedIn = true;
    addLog('success', 'Logged in to Instagram');
    res.json({ success: true });
  } catch (err) {
    addLog('error', `Login failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/start', (req, res) => {
  if (!loggedIn) return res.status(400).json({ error: 'Not logged in' });
  if (botRunning) return res.status(400).json({ error: 'Already running' });
  
  botRunning = true;
  startPolling();
  addLog('success', 'Bot started');
  res.json({ success: true });
});

app.post('/stop', (req, res) => {
  botRunning = false;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
  addLog('info', 'Bot stopped');
  res.json({ success: true });
});

app.get('/logs', (_, res) => res.json(logs));
app.get('/leaderboard', (_, res) => {
  const sorted = Object.entries(userMessageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([username, messages], i) => ({ username, messages, rank: i + 1 }));
  res.json(sorted);
});

app.get('/features', (_, res) => res.json(features));
app.post('/features', (req, res) => {
  const { feature, enabled } = req.body;
  if (feature in features) features[feature] = enabled;
  addLog('info', `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`);
  res.json(features);
});

app.get('/messages', (_, res) => res.json(messages));
app.post('/messages', (req, res) => {
  const { key, value } = req.body;
  messages[key] = value;
  addLog('info', `Message template "${key}" updated`);
  res.json({ success: true });
});

app.get('/admins', (_, res) => res.json([...admins]));
app.post('/admins', (req, res) => {
  admins.add(req.body.username);
  res.json([...admins]);
});
app.delete('/admins/:username', (req, res) => {
  admins.delete(req.params.username);
  res.json([...admins]);
});

// --- BOT ENGINE ---
const WELCOME_MSG = `🌙✨ 𓆩 𝐀𝐬𝐬𝐚𝐥𝐚𝐦𝐮 𝐖𝐚𝐥𝐚𝐢𝐤𝐮𝐦 𓆪 🌌🪄

𝐌𝐞𝐦𝐛𝐞𝐫𝐬 : @USERNAME

🌸 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐓𝐨 𝐎𝐮𝐫 𝐀𝐝𝐝𝐚/𝐅𝐮𝐧/𝐌𝐞𝐦𝐨𝐫𝐢𝐞𝐬 𝐅𝐚𝐦𝐢𝐥𝐲 🌸

👑 𝐌𝐮𝐠-𝐞𝐫 𝐏𝐨𝐥𝐚𝐩𝐚𝐢𝐧 ☕️✨️ – 𝐃𝐫𝐞𝐚𝐦𝐬 & 𝐕𝐢𝐛𝐞𝐬 👑

🌷 𝐈𝐧𝐭𝐫𝐨𝐝𝐮𝐜𝐞 𝐘𝐨𝐮𝐫𝐬𝐞𝐥𝐟 🌷
💫 𝐒𝐩𝐫𝐞𝐚𝐝 𝐋𝐨𝐯𝐞, 𝐌𝐚𝐠𝐢𝐜 & 𝐏𝐨𝐬𝐢𝐭𝐢𝐯𝐢𝐭𝐲 💫
✨ 𝐒𝐡𝐢𝐧𝐞 𝐁𝐫𝐢𝐠𝐡𝐭, 𝐒𝐭𝐚𝐲 𝐀𝐜𝐭𝐢𝐯𝐞, 𝐒𝐭𝐚𝐲 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 ✨

🌌 𝐋𝐞𝐭'𝐬 𝐂𝐫𝐞𝐚𝐭𝐞 𝐌𝐨𝐨𝐧𝐥𝐢𝐭 𝐌𝐞𝐦𝐨𝐫𝐢𝐞𝐬 𝐓𝐨𝐠𝐞𝐭𝐡𝐞𝐫 🌙💗🫶`;

const RULES_MSG = `𝐌𝐮𝐠-𝐞𝐫 𝐏𝐨𝐥𝐚𝐩𝐚𝐢𝐧 ☕️💫

1:)-GC te ese sobar sathe porichito hote hobe(intro khuje niben proyojone..nije o diben)
2:)-Sobar sathe mile mishe thakben..jhamela hole age admin k report diben✅
3:)-Video make er somoy kono extra text diben na❌
4:)- GC te reels allow na❌
5:)- gali diben na❌
6:)-18+ kotha bolben na❌
7:)-Kew msg dile sby response korte hobe✅
8:)-spam kora allow nah❌
9:)-New member add hole sobai welcome janaben✅
10:)-follow back chawa jabe nah❌

Sob sheshe GC er sob rules mene cholben💖🌼Thank You..🎀🫶`;

async function startPolling() {
  addLog('info', 'Polling started - checking messages every 4s');
  
  pollInterval = setInterval(async () => {
    if (!botRunning) return;
    
    try {
      const inbox = ig.feed.directInbox();
      const threads = await inbox.items();
      
      for (const thread of threads) {
        if (!thread.is_group) continue;
        
        const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
        const items = await threadFeed.items();
        
        for (const item of items) {
          if (processedMessages.has(item.item_id)) continue;
          processedMessages.add(item.item_id);
          
          const username = item.user_id?.toString() || 'unknown';
          userLastSeen[username] = Date.now();
          userMessageCount[username] = (userMessageCount[username] || 0) + 1;
          
          // Welcome new member
          if (features.welcome && item.item_type === 'action_log' && item.action_log?.description?.includes('added')) {
            const msg = (messages.welcome || WELCOME_MSG).replace('@USERNAME', `@${username}`).replace('@username', `@${username}`);
            await ig.directThread.broadcastText({ thread_id: thread.thread_id, text: msg });
            addLog('success', `Welcomed new member: ${username}`);
          }
          
          // Leave detection
          if (features.leave && item.item_type === 'action_log' && item.action_log?.description?.includes('left')) {
            const leaveMsg = messages.leave || `😢 @${username} has left the group. We'll miss you! 💔`;
            await ig.directThread.broadcastText({ thread_id: thread.thread_id, text: leaveMsg.replace('@username', `@${username}`) });
            addLog('info', `Member left: ${username}`);
          }
          
          if (item.item_type !== 'text' || !item.text) continue;
          const text = item.text.toLowerCase().trim();
          
          // Salam reply
          if (features.salam && text.includes('salam')) {
            const reply = messages.salam || 'ওয়ালাইকুম আসসালাম ❤️';
            await ig.directThread.broadcastText({ thread_id: thread.thread_id, text: reply });
            addLog('info', `Replied salam to ${username}`);
          }
          
          // Rules command
          if (features.commands && text === '/rules') {
            await ig.directThread.broadcastText({ thread_id: thread.thread_id, text: RULES_MSG });
            addLog('info', `Sent rules to ${username}`);
          }
          
          // Kick command
          if (features.commands && text.startsWith('/kick ') && admins.has(username)) {
            const target = text.replace('/kick @', '').replace('/kick ', '').trim();
            addLog('warn', `Admin ${username} kicked ${target}`);
            // Note: actual kick requires thread admin privileges
          }
          
          // Appreciation
          if (features.appreciation && userMessageCount[username] % 5 === 0) {
            const apprMsg = messages.appreciation || `🎉 বাহ! @${username} তুমি দারুণ একটিভ আছো! চালিয়ে যাও! 💪✨`;
            await ig.directThread.broadcastText({ thread_id: thread.thread_id, text: apprMsg.replace('@username', `@${username}`) });
            addLog('success', `Appreciated ${username} (${userMessageCount[username]} msgs)`);
          }
        }
      }
    } catch (err) {
      addLog('error', `Poll error: ${err.message}`);
    }
  }, 4000);
  
  // Leaderboard announcement every 2 hours
  if (features.leaderboard) {
    setInterval(async () => {
      if (!botRunning) return;
      const sorted = Object.entries(userMessageCount).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return;
      const [topUser, count] = sorted[0];
      addLog('info', `Leaderboard: Top user is @${topUser} with ${count} messages`);
    }, 2 * 60 * 60 * 1000);
  }
  
  // Seen/inactive detection every 2 minutes
  if (features.seen) {
    setInterval(() => {
      const now = Date.now();
      Object.entries(userLastSeen).forEach(([user, lastSeen]) => {
        if (now - lastSeen > 2 * 60 * 1000) {
          addLog('warn', `@${user} inactive for 2+ minutes`);
        }
      });
    }, 2 * 60 * 1000);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`IG Bot server running on port ${PORT}`);
  addLog('info', `Server started on port ${PORT}`);
});
