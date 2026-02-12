// ========= 常量定义 =========

const CARDS_BACKEND_URL = "http://localhost:3000";

const STORAGE_KEYS = {
  MODE: "readingMode",
  TOPIC: "readingTopicTitle"
};

// ========= 存储封装函数 =========

function getCurrentReadingMode() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.MODE, STORAGE_KEYS.TOPIC], (result) => {
      const mode = result[STORAGE_KEYS.MODE] || "free";
      const topicTitle = result[STORAGE_KEYS.TOPIC] || null;
      resolve({ mode, topicTitle });
    });
  });
}

function saveCurrentReadingMode({ mode, topicTitle }) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({
      [STORAGE_KEYS.MODE]: mode,
      [STORAGE_KEYS.TOPIC]: topicTitle || null
    }, () => resolve());
  });
}

// ========= 加载 Topic 列表 =========

async function loadTopics() {
  const topicSelect = document.getElementById("topicSelect");
  
  try {
    const resp = await fetch(`${CARDS_BACKEND_URL}/api/topics`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    
    const data = await resp.json();
    if (data.ok && Array.isArray(data.topics)) {
      // 清空现有选项（保留第一项）
      while (topicSelect.children.length > 1) {
        topicSelect.removeChild(topicSelect.lastChild);
      }
      
      // 添加 topic 选项
      data.topics.forEach(topic => {
        const option = document.createElement("option");
        option.value = topic;
        option.textContent = topic;
        topicSelect.appendChild(option);
      });
    } else {
      console.error("后端返回格式异常：", data);
    }
  } catch (err) {
    console.error("加载 Topic 列表失败：", err);
    // 出错时保留默认选项即可
  }
}

// ========= 页面初始化 =========

document.addEventListener("DOMContentLoaded", async () => {
  // 获取页面元素
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const topicSelect = document.getElementById("topicSelect");
  const newTopicInput = document.getElementById("newTopicInput");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const focusSection = document.getElementById("focusSection");
  
  // 加载 Topic 列表
  await loadTopics();
  
  // 读取当前模式并设置 UI
  const { mode, topicTitle } = await getCurrentReadingMode();
  
  // 设置单选状态
  modeRadios.forEach(radio => {
    if (radio.value === mode) {
      radio.checked = true;
    }
  });
  
  // 根据模式显示/隐藏 focusSection
  if (mode === "focus") {
    focusSection.style.display = "block";
    
    // 如果有保存的 topicTitle，尝试在下拉框中选中
    if (topicTitle) {
      const option = Array.from(topicSelect.options).find(opt => opt.value === topicTitle);
      if (option) {
        topicSelect.value = topicTitle;
      } else {
        // 如果下拉框中没有，就填入输入框
        newTopicInput.value = topicTitle;
      }
    }
  } else {
    focusSection.style.display = "none";
  }
  
  // ========= 监听模式单选变化 =========
  
  modeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "free") {
        focusSection.style.display = "none";
      } else if (e.target.value === "focus") {
        focusSection.style.display = "block";
      }
    });
  });
  
  // ========= 监听保存按钮点击 =========
  
  saveBtn.addEventListener("click", async () => {
    const selectedMode = document.querySelector('input[name="mode"]:checked').value;
    
    let mode = selectedMode;
    let topicTitle = null;
    
    if (mode === "focus") {
      // 优先使用下拉框选中的值
      const selectedTopic = topicSelect.value.trim();
      const inputTopic = newTopicInput.value.trim();
      
      if (selectedTopic) {
        topicTitle = selectedTopic;
      } else if (inputTopic) {
        topicTitle = inputTopic;
      } else {
        alert("请选择一个已有 Topic，或者输入一个新的 Topic 名称。");
        return;
      }
    }
    
    await saveCurrentReadingMode({ mode, topicTitle });
    alert("模式已保存");
  });
  
  // ========= 监听清空按钮点击 =========
  
  resetBtn.addEventListener("click", async () => {
    await saveCurrentReadingMode({ mode: "free", topicTitle: null });
    
    // 更新 UI
    document.querySelector('input[name="mode"][value="free"]').checked = true;
    focusSection.style.display = "none";
    topicSelect.value = "";
    newTopicInput.value = "";
    
    alert("已清空模式设置");
  });
});

















