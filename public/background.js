// Reading Clipper extension background service worker

const BACKEND_URL = "http://localhost:3000";

const STORAGE_KEYS = {
  MODE: "readingMode",
  TOPIC: "readingTopicTitle",
  SESSION: "userSession",
  USER: "userData",
};

function getCurrentReadingMode() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.MODE, STORAGE_KEYS.TOPIC], (result) => {
      resolve({
        mode: result[STORAGE_KEYS.MODE] || "free",
        topicTitle: result[STORAGE_KEYS.TOPIC] || null,
      });
    });
  });
}

function getSession() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.SESSION, STORAGE_KEYS.USER], (result) => {
      resolve({
        session: result[STORAGE_KEYS.SESSION] || null,
        user: result[STORAGE_KEYS.USER] || null,
      });
    });
  });
}

function saveSession(session, user) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        [STORAGE_KEYS.SESSION]: session,
        [STORAGE_KEYS.USER]: user,
      },
      resolve
    );
  });
}

function clearSession() {
  return new Promise((resolve) => {
    chrome.storage.sync.remove([STORAGE_KEYS.SESSION, STORAGE_KEYS.USER], resolve);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "reading-clipper-quick-card",
    title: "保存为阅读卡片",
    contexts: ["selection"],
  });
});

function showToastInTab(tabId, message, type = "info", duration = 2500) {
  if (!tabId || typeof tabId !== "number") {
    return;
  }

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (msg, toastType, ms) => {
        const id = "rc-toast-inline";
        const old = document.getElementById(id);
        if (old) old.remove();

        const el = document.createElement("div");
        el.id = id;
        el.textContent = msg;
        el.style.position = "fixed";
        el.style.top = "16px";
        el.style.right = "16px";
        el.style.zIndex = "2147483647";
        el.style.padding = "10px 14px";
        el.style.borderRadius = "10px";
        el.style.color = "#fff";
        el.style.fontSize = "13px";
        el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
        el.style.background =
          toastType === "success"
            ? "rgba(22,163,74,0.95)"
            : toastType === "error"
              ? "rgba(220,38,38,0.95)"
              : "rgba(37,99,235,0.95)";

        document.body.appendChild(el);
        setTimeout(() => el.remove(), ms);
      },
      args: [message, type, duration],
    })
    .catch(() => {});
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message,
  });
}

async function captureCard({ snippet, pageTitle, pageUrl, tabId }) {
  if (!snippet || !snippet.trim()) {
    showToastInTab(tabId, "请先选中文本", "info");
    return;
  }

  showToastInTab(tabId, "正在保存卡片...", "info", 1200);

  const { mode, topicTitle } = await getCurrentReadingMode();
  const { session } = await getSession();

  if (!session?.access_token) {
    showNotification("请先登录", "当前版本仅支持登录后保存到云端");
    return;
  }

  const payload = {
    snippet,
    sourceName: pageTitle || "",
    sourceUrl: pageUrl || "",
    topic_title: mode === "focus" && topicTitle ? topicTitle : null,
  };

  try {
    const resp = await fetch(`${BACKEND_URL}/api/v2/cards/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");

      if (resp.status === 401) {
        await clearSession();
        showNotification("登录已失效", "请重新登录后再保存卡片");
        return;
      }

      console.error("capture failed", resp.status, text);
      showNotification("保存失败", "请检查后端服务状态");
      return;
    }

    const data = await resp.json().catch(() => null);
    if (!data?.ok) {
      showNotification("保存失败", "后端返回异常");
      return;
    }

    showToastInTab(tabId, "卡片保存成功，已同步到云端", "success", 2200);
  } catch (error) {
    console.error("capture error", error);
    showNotification("网络错误", "无法连接后端服务");
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "reading-clipper-quick-card") return;

  const selectedText = info.selectionText || "";
  const pageUrl = info.pageUrl || tab?.url || "";
  const pageTitle = tab?.title || "";
  const tabId = typeof tab?.id === "number" ? tab.id : null;

  await captureCard({
    snippet: selectedText,
    pageTitle,
    pageUrl,
    tabId,
  });
});

async function handleLogin(email, password) {
  const resp = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.message || "登录失败");
  }

  await saveSession(data.session, data.user);
  return { ok: true, user: data.user };
}

async function fetchTopics() {
  const { session } = await getSession();
  if (!session?.access_token) return [];

  try {
    const resp = await fetch(`${BACKEND_URL}/api/v2/topics?titles_only=true`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.message || "获取主题失败");
    }
    return data.topics || [];
  } catch (error) {
    console.error("fetch topics error", error);
    return [];
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOGIN") {
    handleLogin(message.email, message.password)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "LOGOUT") {
    clearSession()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_AUTH_STATUS") {
    getSession()
      .then(({ session, user }) => {
        sendResponse({
          ok: true,
          isLoggedIn: !!session?.access_token,
          user,
        });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_TOPICS") {
    fetchTopics()
      .then((topics) => sendResponse({ ok: true, topics }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

setInterval(async () => {
  const { session, user } = await getSession();
  if (!session?.access_token || !session?.refresh_token || !session?.expires_at) {
    return;
  }

  const expiresAt = session.expires_at * 1000;
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;

  if (expiresAt - now >= tenMinutes) {
    return;
  }

  try {
    const resp = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      await saveSession(data.session, user);
    } else {
      await clearSession();
    }
  } catch (error) {
    console.error("token refresh error", error);
  }
}, 60 * 60 * 1000);
