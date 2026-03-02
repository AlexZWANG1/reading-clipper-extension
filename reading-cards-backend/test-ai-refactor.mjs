// ========= AI API 重构验证脚本 =========
// 测试代理模式和直连模式下的 AI 调用

import { createAIClientConfig, callChatAPI } from "./src/services/aiClient.mjs";
import { getRuntimeSummary } from "./src/services/aiRuntime.mjs";

console.log("========= AI API 重构验证 =========\n");

// 显示当前运行时配置
const summary = getRuntimeSummary();
console.log("运行时配置:");
console.log(`  模式: ${summary.mode}`);
console.log(`  代理端点: ${summary.proxyEndpoint}`);
console.log(`  代理 Key: ${summary.hasProxyKey ? "已设置" : "未设置"}`);
console.log(`  OpenAI Key: ${summary.hasOpenAIKey ? "已设置" : "未设置"}`);
console.log(`  Anthropic Key: ${summary.hasAnthropicKey ? "已设置" : "未设置"}`);
console.log("");

async function testChatAPI() {
  try {
    console.log("========= 测试 Chat API =========");

    // 创建 AI 客户端配置
    const config = await createAIClientConfig();
    console.log(`✅ 配置创建成功`);
    console.log(`  提供商: ${config.provider}`);
    console.log(`  模型: ${config.model}`);
    console.log(`  Chat 端点: ${config.chatEndpoint}`);
    console.log(`  运行模式: ${config.runtimeMode}`);
    console.log("");

    // 测试简单的 Chat API 调用
    console.log("发送测试消息...");
    const response = await callChatAPI(
      config,
      [{ role: "user", content: "Say 'Hello from Reading Clipper!'" }],
      { max_tokens: 50, temperature: 0 }
    );

    const content = response.choices?.[0]?.message?.content || "";
    console.log(`✅ Chat API 调用成功`);
    console.log(`  响应: ${content.substring(0, 100)}...`);
    console.log("");

    return true;
  } catch (error) {
    console.error(`❌ Chat API 测试失败:`, error.message);
    console.error(error.stack);
    return false;
  }
}

async function runTests() {
  console.log("开始测试...\n");

  const chatSuccess = await testChatAPI();

  console.log("\n========= 测试结果 =========");
  console.log(`Chat API: ${chatSuccess ? "✅ 通过" : "❌ 失败"}`);

  if (chatSuccess) {
    console.log("\n✅ 所有测试通过！");
    console.log("\n下一步:");
    console.log("1. 测试卡片生成功能（Agent1）");
    console.log("2. 测试文档结构生成（Agent2）");
    console.log("3. 测试语义搜索（SearchAgent）");
    console.log("4. 测试假设评估（HypothesisEvaluator）");
  } else {
    console.log("\n❌ 测试失败，请检查配置");
    console.log("\n故障排查:");
    console.log("1. 检查 .env 文件是否正确配置");
    console.log("2. 如果使用代理模式，确保 CLI Proxy 服务正在运行");
    console.log("3. 如果使用直连模式，确保 API Key 正确");
    console.log("4. 查看上方错误信息获取详细原因");
  }

  process.exit(chatSuccess ? 0 : 1);
}

runTests();
