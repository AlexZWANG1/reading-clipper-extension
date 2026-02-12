// ========= Reading Clipper 浏览器扩展 - 后台脚本 =========

// ========= 1. 后端配置 =========

// 后端地址（支持开发和生产环境）
const BACKEND_URL = "http://localhost:3000"; // 开发环境
// const BACKEND_URL = "https://your-production-api.com"; // 生产环境

// ========= 2. 存储键名 =========
const STORAGE_KEYS = {
  MODE: "readingMode",
  TOPIC: "readingTopicTitle",
  SESSION: "userSession", // 用户登录会话
  USER: "userData", // 用户信息
};

// ========= 3. 存储工具函数 =========

// 获取当前阅读模式设置
function getCurrentReadingMode() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.MODE, STORAGE_KEYS.TOPIC], (result) => {
      const mode = result[STORAGE_KEYS.MODE] || "free";
      const topicTitle = result[STORAGE_KEYS.TOPIC] || null;
      resolve({ mode, topicTitle });
    });
  });
}

// 获取登录会话
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

// 保存登录会话
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

// 清除登录会话
function clearSession() {
  return new Promise((resolve) => {
    chrome.storage.sync.remove([STORAGE_KEYS.SESSION, STORAGE_KEYS.USER], resolve);
  });
}

// ========= 4. 安装时创建右键菜单 =========

chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单 - 保存为阅读卡片
  chrome.contextMenus.create({
    id: "reading-clipper-quick-card",
    title: "保存为阅读卡片",
    contexts: ["selection"],
  });

  console.log("✅ Reading Clipper 扩展已安装");
});

// ========= 5. 工具函数：在当前标签页里弹出提示 =========

// Toast 样式和脚本（注入页面）
const TOAST_STYLES = `
  .rc-toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: none;
  }
  .rc-toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
    font-size: 14px;
    font-weight: 500;
    animation: rc-toast-in 0.3s ease-out;
    backdrop-filter: blur(8px);
    max-width: 360px;
  }
  .rc-toast.success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
  }
  .rc-toast.error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
  }
  .rc-toast.info {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
  }
  .rc-toast-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
  .rc-toast-hide {
    animation: rc-toast-out 0.2s ease-in forwards;
  }
  @keyframes rc-toast-in {
    from { opacity: 0; transform: translateX(100px) scale(0.9); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes rc-toast-out {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to { opacity: 0; transform: translateX(100px) scale(0.9); }
  }
`;

/**
 * 在标签页内显示 Toast 提示（非阻塞）
 * @param {number} tabId - 标签页 ID
 * @param {string} message - 提示消息
 * @param {'success' | 'error' | 'info'} type - 提示类型
 * @param {number} duration - 显示时长（毫秒）
 */
function showToastInTab(tabId, message, type = "success", duration = 2500) {
  if (!tabId || typeof tabId !== "number" || tabId < 0) {
    console.log(`Toast [${type}]:`, message);
    return;
  }

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (styles, msg, toastType, icon, dur) => {
        // 注入样式（如果尚未注入）
        if (!document.getElementById("rc-toast-styles")) {
          const styleEl = document.createElement("style");
          styleEl.id = "rc-toast-styles";
          styleEl.textContent = styles;
          document.head.appendChild(styleEl);
        }

        // 创建或获取容器
        let container = document.getElementById("rc-toast-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "rc-toast-container";
          container.className = "rc-toast-container";
          document.body.appendChild(container);
        }

        // 创建 Toast 元素
        const toast = document.createElement("div");
        toast.className = `rc-toast ${toastType}`;
        toast.innerHTML = `
          <span class="rc-toast-icon">${icon}</span>
          <span>${msg}</span>
        `;
        container.appendChild(toast);

        // 自动消失
        setTimeout(() => {
          toast.classList.add("rc-toast-hide");
          setTimeout(() => toast.remove(), 200);
        }, dur);
      },
      args: [TOAST_STYLES, message, type, icons[type], duration],
    })
    .catch((err) => {
      console.error("无法在标签页显示 Toast:", err);
      console.log(`Toast [${type}]:`, message);
    });
}

/**
 * 在标签页内显示 Alert（阻塞式，用于需要用户确认的场景）
 * @deprecated 优先使用 showToastInTab
 */
function showAlertInTab(tabId, message) {
  if (!tabId || typeof tabId !== "number" || tabId < 0) {
    console.log("提示信息（无法在标签页显示）:", message);
    return;
  }

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (msg) => {
        alert(msg);
      },
      args: [message],
    })
    .catch((err) => {
      console.error("无法在标签页显示提示:", err);
      console.log("提示信息:", message);
    });
}

/**
 * 显示 Chrome 系统通知（用于错误提示，更显眼）
 */
function showNotification(title, message, type = "info") {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: title,
    message: message,
  });
}

// ========= 6. API 请求函数 =========

// 发送捕获卡片请求
async function captureCard({ snippet, pageTitle, pageUrl, tabId }) {
  if (!snippet || !snippet.trim()) {
    showToastInTab(tabId, "请选择一段文本再保存", "info");
    return;
  }

  // 先显示处理中的提示
  showToastInTab(tabId, "正在保存卡片...", "info", 1500);

  // 读取当前模式设置
  const { mode, topicTitle } = await getCurrentReadingMode();

  // 读取登录会话
  const { session, user } = await getSession();

  // 构建请求 payload
  const payload = {
    snippet: snippet,
    sourceName: pageTitle || "",
    sourceUrl: pageUrl || "",
    topic_title: mode === "focus" && topicTitle ? topicTitle : null,
  };

  // 根据是否登录选择 API 端点
  const isLoggedIn = !!session?.access_token;
  const apiEndpoint = isLoggedIn ? "/api/v2/cards/capture" : "/api/cards/capture";

  // 构建请求头
  const headers = {
    "Content-Type": "application/json",
  };

  if (isLoggedIn) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  try {
    const resp = await fetch(`${BACKEND_URL}${apiEndpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("发送到后端失败：", resp.status, text);

      // 如果是认证错误，提示用户重新登录
      if (resp.status === 401) {
        await clearSession();
        showNotification("登录已过期", "卡片将保存到本地。请重新登录以同步到云端。", "error");
        // 尝试使用本地存储
        return await captureCardLocal({ snippet, pageTitle, pageUrl, tabId, topicTitle });
      }

      // 失败时使用系统通知（更显眼）
      showNotification("保存失败", "请检查后端服务是否已启动", "error");
      return;
    }

    const data = await resp.json().catch(() => null);
    if (!data || !data.ok) {
      console.warn("后端返回 ok=false：", data);
      showNotification("保存异常", "后端返回异常，卡片可能未成功保存", "error");
      return;
    }

    console.log("✅ 成功保存为知识卡片，卡片 ID:", data.card?.id);

    // 成功时使用页面内 Toast（不打断用户）
    const storageInfo = isLoggedIn ? "已同步到云端" : "已保存到本地";
    showToastInTab(tabId, `卡片保存成功 · ${storageInfo}`, "success", 2500);
  } catch (err) {
    console.error("发送到后端出错：", err);
    // 网络错误使用系统通知
    showNotification("网络错误", "保存失败，请检查后端服务是否运行", "error");
  }
}

// 本地存储卡片（未登录时的备选方案）
async function captureCardLocal({ snippet, pageTitle, pageUrl, tabId, topicTitle }) {
  const payload = {
    snippet: snippet,
    sourceName: pageTitle || "",
    sourceUrl: pageUrl || "",
    topic_title: topicTitle || null,
  };

  try {
    const resp = await fetch(`${BACKEND_URL}/api/cards/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.ok) {
      console.log("✅ 成功保存到本地存储，卡片 ID:", data.card?.id);
      // 成功用 Toast
      showToastInTab(tabId, "卡片保存成功 · 已保存到本地", "success", 2500);
    }
  } catch (err) {
    console.error("本地存储失败：", err);
    // 失败用系统通知
    showNotification("保存失败", "请检查后端服务是否正常运行", "error");
  }
}

// ========= 7. 右键菜单点击主逻辑 =========

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "reading-clipper-quick-card") return;

  const selectedText = info.selectionText || "";
  const pageUrl = info.pageUrl || (tab && tab.url) || "";
  const pageTitle = (tab && tab.title) || "";
  const tabId = tab && typeof tab.id === "number" && tab.id >= 0 ? tab.id : null;

  if (!selectedText.trim()) {
    showToastInTab(tabId, "请先选择一段文本", "info");
    return;
  }

  await captureCard({
    snippet: selectedText,
    pageTitle,
    pageUrl,
    tabId,
  });
});

// ========= 8. 消息处理（来自 popup 或其他脚本）=========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 登录
  if (message.type === "LOGIN") {
    handleLogin(message.email, message.password)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true; // 异步响应
  }

  // 登出
  if (message.type === "LOGOUT") {
    clearSession()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  // 获取当前用户状态
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

  // 获取 Topics 列表
  if (message.type === "GET_TOPICS") {
    fetchTopics()
      .then((topics) => sendResponse({ ok: true, topics }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

// ========= 9. 登录处理 =========

async function handleLogin(email, password) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      throw new Error(data.message || "登录失败");
    }

    // 保存会话
    await saveSession(data.session, data.user);

    return {
      ok: true,
      user: data.user,
    };
  } catch (error) {
    console.error("登录错误:", error);
    throw error;
  }
}

// ========= 10. 获取 Topics =========

async function fetchTopics() {
  const { session } = await getSession();

  // 根据是否登录选择 API 端点
  const isLoggedIn = !!session?.access_token;
  const apiEndpoint = isLoggedIn ? "/api/v2/topics?titles_only=true" : "/api/topics";

  const headers = {};
  if (isLoggedIn) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  try {
    const resp = await fetch(`${BACKEND_URL}${apiEndpoint}`, { headers });
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      throw new Error(data.message || "获取 Topics 失败");
    }

    return data.topics;
  } catch (error) {
    console.error("获取 Topics 错误:", error);
    return [];
  }
}

// ========= 11. 定期检查 Token 有效性 =========

// 每小时检查一次 token 是否即将过期
setInterval(async () => {
  const { session } = await getSession();
  if (!session?.access_token) return;

  // 检查 token 是否即将过期（提前 10 分钟刷新）
  const expiresAt = session.expires_at * 1000; // 转换为毫秒
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;

  if (expiresAt - now < tenMinutes) {
    console.log("Token 即将过期，尝试刷新...");
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });

      const data = await resp.json();

      if (resp.ok && data.ok) {
        const { user } = await getSession();
        await saveSession(data.session, user);
        console.log("✅ Token 已刷新");
      } else {
        console.warn("❌ Token 刷新失败，需要重新登录");
        await clearSession();
      }
    } catch (error) {
      console.error("Token 刷新错误:", error);
    }
  }
}, 60 * 60 * 1000); // 每小时检查一次
