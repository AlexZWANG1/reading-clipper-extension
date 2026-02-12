// ========= 测试 Supabase 连接 =========

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '.env') });

// 从 .env 文件读取配置
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n=== Supabase 连接测试 ===\n');
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.substring(0, 30) + '...' : '❌ 未设置');
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.substring(0, 30) + '...' : '❌ 未设置');
console.log('\n');

// 创建 Service Role 客户端（用于管理操作）
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 测试 1: 检查表是否存在
console.log('📋 测试 1: 检查数据库表...');
try {
  const { data: tables, error } = await supabaseAdmin
    .from('topics')
    .select('count', { count: 'exact', head: true });
  
  if (error) {
    console.log('❌ 无法访问 topics 表:', error.message);
  } else {
    console.log('✅ topics 表可访问');
  }
} catch (err) {
  console.log('❌ 连接失败:', err.message);
}

// 测试 2: 检查 cards 表
console.log('\n📋 测试 2: 检查 cards 表...');
try {
  const { data, error } = await supabaseAdmin
    .from('cards')
    .select('count', { count: 'exact', head: true });
  
  if (error) {
    console.log('❌ 无法访问 cards 表:', error.message);
  } else {
    console.log('✅ cards 表可访问');
  }
} catch (err) {
  console.log('❌ 连接失败:', err.message);
}

// 测试 3: 检查 documents 表
console.log('\n📋 测试 3: 检查 documents 表...');
try {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('count', { count: 'exact', head: true });
  
  if (error) {
    console.log('❌ 无法访问 documents 表:', error.message);
  } else {
    console.log('✅ documents 表可访问');
  }
} catch (err) {
  console.log('❌ 连接失败:', err.message);
}

// 测试 4: 测试函数
console.log('\n📋 测试 4: 检查辅助函数...');
try {
  // 创建一个测试用户 ID（仅用于测试函数是否存在）
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const { data, error } = await supabaseAdmin.rpc('get_or_create_topic', {
    p_user_id: testUserId,
    p_title: '__test__',
  });
  
  if (error) {
    if (error.message.includes('violates foreign key constraint')) {
      console.log('✅ get_or_create_topic 函数存在（外键约束是预期的）');
    } else {
      console.log('⚠️ 函数调用错误:', error.message);
    }
  } else {
    console.log('✅ get_or_create_topic 函数可调用');
  }
} catch (err) {
  console.log('❌ 函数测试失败:', err.message);
}

console.log('\n=== 测试完成 ===\n');
console.log('如果所有测试都通过 ✅，说明 Supabase 配置正确！');
console.log('现在可以运行: npm run dev\n');







