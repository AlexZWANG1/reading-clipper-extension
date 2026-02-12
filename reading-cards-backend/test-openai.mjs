// test-openai.mjs
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// 从 .env 文件读取 API Key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

async function main() {
  for (let i = 1; i <= 5; i++) {
    console.log(`== 第 ${i} 次调用 ==`);
    try {
      const res = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: "只回答：ok",
      });

      const text = res.output[0]?.content[0]?.text;
      console.log("返回：", text);
    } catch (err) {
      console.error("第", i, "次出错：", err);
    }
  }
}

main();
