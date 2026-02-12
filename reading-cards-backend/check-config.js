// 快速检查 Supabase 配置的脚本
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
dotenv.config({ path: join(__dirname, '.env') });

console.log('\n=== Supabase 配置检查 ===\n');

const config = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

let allGood = true;

// 检查每个配置项
Object.entries(config).forEach(([key, value]) => {
  if (value && value !== `your-${key.toLowerCase().replace(/_/g, '-')}`) {
    const preview = value.length > 50 ? value.substring(0, 50) + '...' : value;
    console.log(`✅ ${key}: ${preview}`);
  } else {
    console.log(`❌ ${key}: 未设置或使用默认值`);
    allGood = false;
  }
});

console.log('\n=== 其他配置 ===\n');
console.log(`PORT: ${process.env.PORT || '3000'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ 已设置' : '❌ 未设置'}`);

if (allGood) {
  console.log('\n✅ 所有 Supabase 配置都已设置！');
  console.log('现在可以运行: npm run dev\n');
} else {
  console.log('\n❌ 请检查 .env 文件，确保所有 Supabase 配置都已正确填写');
  console.log('参考 SETUP_SUPABASE.md 获取详细说明\n');
}







