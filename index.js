/* eslint-disable */
/* global process, Buffer */
const express = require("express");
const cors = require("cors");
const { IgApiClient } = require("instagram-private-api");

const app = express();
app.use(cors());
app.use(express.json());

const ig = new IgApiClient();
let botRunning = false;
let loggedInUser = null;
let pollInterval = null;
const seenMessages = new Set();
const groupMessageCounts = {};

app.get("/", (req, res) => {
  res.json({ status: "IG Bot Running", version: "1.0.0" });
});

app.get("/status", (req, res) => {
  res.json({ running: botRunning, user: loggedInUser });
});

app.post("/login", async (req, res) => {
  const { username, password, session_id } = req.body;
  try {
    ig.state.generateDevice(username || "ig_bot_user");

    if (session_id) {
      try {
        await ig.state.deserializeCookieJar(
          JSON.parse(Buffer.from(session_id, "base64").toString("utf8"))
        );
      } catch (e) {
        await ig.state.deserializeCookieJar(session_id);
      }
      const account = await ig.account.currentUser();
      loggedInUser = {
        pk: account.pk,
        username: account.username,
        full_name: account.full_name,
        profile_pic_url: account.profile_pic_url,
        follower_count: account.follower_count,
        following_count: account.following_count,
        media_count: account.media_count,
      };
      return res.json({ success: true, user: loggedInUser });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "username and password required" });
    }

    const auth = await ig.account.login(username, password);
    loggedInUser = {
      pk: auth.pk,
      username: auth.username,
      full_name: auth.full_name,
      profile_pic_url: auth.profile_pic_url,
      follower_count: auth.follower_count,
      following_count: auth.following_count,
      media_count: auth.media_count,
    };
    res.json({ success: true, user: loggedInUser });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(401).json({ success: false, error: err.message });
  }
});

app.get("/account", async (req, res) => {
  if (!loggedInUser) return res.status(401).json({ error: "Not logged in" });
  res.json({ user: loggedInUser });
});

app.get("/groups", async (req, res) => {
  if (!loggedInUser) return res.status(401).json({ error: "Not logged in" });
  try {
    const inbox = ig.feed.directInbox();
    const page = await inbox.items();
    const groups = page
      .filter((thread) => thread.is_group)
      .map((thread) => ({
        thread_id: thread.thread_id,
        thread_title: thread.thread_title,
        muted: thread.muted,
        last_activity_at: thread.last_activity_at,
        users: thread.users.map((u) => ({
          pk: u.pk,
          username: u.username,
          full_name: u.full_name,
          profile_pic_url: u.profile_pic_url,
        })),
        last_message: thread.items?.[0]
          ? {
              text: thread.items[0].text || "[media/action]",
              timestamp: thread.items[0].timestamp,
              user_id: thread.items[0].user_id,
            }
          : null,
        message_counts: groupMessageCounts[thread.thread_id] || {},
      }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/groups/:threadId/messages", async (req, res) => {
  if (!loggedInUser) return res.status(401).json({ error: "Not logged in" });
  try {
    const thread = ig.feed.directThread({ thread_id: req.params.threadId });
    const items = await thread.items();
    const messages = items.map((item) => ({
      item_id: item.item_id,
      user_id: item.user_id,
      timestamp: item.timestamp,
      type: item.item_type,
      text: item.text || null,
    }));
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/start", (req, res) => {
  if (!loggedInUser) return res.status(401).json({ error: "Not logged in" });
  if (botRunning) return res.json({ success: true, message: "Already running" });
  botRunning = true;
  startPolling();
  res.json({ success: true, message: "Bot started" });
});

app.post("/stop", (req, res) => {
  botRunning = false;
  if (pollInterval) clearInterval(pollInterval);
  res.json({ success: true, message: "Bot stopped" });
});

async function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!botRunning || !loggedInUser) return;
    try {
      const inbox = ig.feed.directInbox();
      const page = await inbox.items();
      const groups = page.filter((t) => t.is_group);
      for (const thread of groups) {
        const items = thread.items || [];
        for (const item of items) {
          if (seenMessages.has(item.item_id)) continue;
          seenMessages.add(item.item_id);
          const senderId = item.user_id?.toString();
          const senderUser = thread.users?.find((u) => u.pk?.toString() === senderId);
          const senderUsername = senderUser?.username || senderId;
          if (!groupMessageCounts[thread.thread_id]) groupMessageCounts[thread.thread_id] = {};
          if (senderUsername) {
            groupMessageCounts[thread.thread_id][senderUsername] =
              (groupMessageCounts[thread.thread_id][senderUsername] || 0) + 1;
          }
          const text = item.text?.toLowerCase() || "";
          if (text.includes("salam") || text.includes("assalam")) {
            await sendMessage(thread.thread_id, "ওয়ালাইকুম আসসালাম ❤️");
          }
          if (text === "/rules") {
            await sendMessage(thread.thread_id,
`𝐌𝐮𝐠-𝐞𝐫 𝐏𝐨𝐥𝐚𝐩𝐚𝐢𝐧 ☕️💫

1:)-GC te ese sobar sathe porichito hote hobe
2:)-Sobar sathe mile mishe thakben
3:)-Video make er somoy extra text diben na
4:)-Reels limit
5:)-Gali no
6:)-18+ no
7:)-সবাই reply দিবেন
8:)-Spam no
9:)-Welcome must
10:)-Follow back no`);
          }
          const userCount = groupMessageCounts[thread.thread_id]?.[senderUsername] || 0;
          if (userCount > 0 && userCount % 5 === 0) {
            await sendMessage(thread.thread_id,
              `🌟 Wow @${senderUsername}! ${userCount} messages! Keep it up! 🔥`);
          }
        }
      }
    } catch (err) {
      console.error("Polling error:", err.message);
    }
  }, 4000);
}

async function sendMessage(threadId, text) {
  try {
    await ig.entity.directThread(threadId).broadcastText(text);
    console.log(`✅ Sent to ${threadId}: ${text.slice(0, 50)}`);
  } catch (err) {
    console.error("Send error:", err.message);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 IG Bot Server running on port ${PORT}`);
});
