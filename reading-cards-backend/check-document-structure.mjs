/**
 * 文档结构检查脚本
 * 用于检查文档数据的一致性和完整性
 * 
 * 使用方法：
 * node check-document-structure.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取数据文件
const documentsPath = join(__dirname, 'data', 'documents.json');
const cardsPath = join(__dirname, 'data', 'cards.json');

let documents = [];
let cards = [];

try {
  documents = JSON.parse(readFileSync(documentsPath, 'utf-8'));
  cards = JSON.parse(readFileSync(cardsPath, 'utf-8'));
} catch (error) {
  console.error('❌ 读取数据文件失败:', error.message);
  process.exit(1);
}

console.log('📋 文档结构检查报告\n');
console.log('='.repeat(60));

// 1. 检查文档基本信息
console.log('\n1️⃣ 文档基本信息');
console.log('-'.repeat(60));
console.log(`总文档数: ${documents.length}`);
documents.forEach((doc, index) => {
  console.log(`\n文档 ${index + 1}: "${doc.topic_title}"`);
  console.log(`  - ID: ${doc.doc_id}`);
  console.log(`  - 问题数: ${doc.doc_questions?.length || 0}`);
  console.log(`  - 假设数: ${doc.doc_hypotheses?.length || 0}`);
  console.log(`  - 故事单元数: ${doc.story_units?.length || 0}`);
  console.log(`  - 创建时间: ${doc.created_at}`);
  console.log(`  - 更新时间: ${doc.updated_at}`);
});

// 2. 检查 StoryUnit 结构
console.log('\n\n2️⃣ StoryUnit 结构检查');
console.log('-'.repeat(60));

const issues = [];

documents.forEach(doc => {
  if (!doc.story_units || doc.story_units.length === 0) {
    issues.push({
      type: 'warning',
      doc: doc.topic_title,
      message: '文档没有故事单元'
    });
    return;
  }

  doc.story_units.forEach(unit => {
    // 检查是否有 card_ids
    if (!unit.card_ids || unit.card_ids.length === 0) {
      issues.push({
        type: 'error',
        doc: doc.topic_title,
        unit: unit.unit_id,
        message: `单元 ${unit.unit_id} 没有关联的卡片`
      });
    }

    // 检查 card_ids 是否都存在
    if (unit.card_ids) {
      unit.card_ids.forEach(cardId => {
        const card = cards.find(c => c.id === cardId);
        if (!card) {
          issues.push({
            type: 'error',
            doc: doc.topic_title,
            unit: unit.unit_id,
            message: `单元 ${unit.unit_id} 引用了不存在的卡片: ${cardId}`
          });
        }
      });
    }

    // 检查 question_id 是否存在
    if (unit.question_id) {
      const question = doc.doc_questions?.find(q => q.id === unit.question_id);
      if (!question) {
        issues.push({
          type: 'warning',
          doc: doc.topic_title,
          unit: unit.unit_id,
          message: `单元 ${unit.unit_id} 引用了不存在的问题: ${unit.question_id}`
        });
      }
    }

    // 检查 hypothesis_id 是否存在
    if (unit.hypothesis_id) {
      const hypothesis = doc.doc_hypotheses?.find(h => h.id === unit.hypothesis_id);
      if (!hypothesis) {
        issues.push({
          type: 'warning',
          doc: doc.topic_title,
          unit: unit.unit_id,
          message: `单元 ${unit.hypothesis_id} 引用了不存在的假设: ${unit.hypothesis_id}`
        });
      }
    }
  });
});

// 3. 检查 Hypothesis 的 question_id
console.log('\n\n3️⃣ Hypothesis 关联检查');
console.log('-'.repeat(60));

documents.forEach(doc => {
  if (!doc.doc_hypotheses || doc.doc_hypotheses.length === 0) {
    return;
  }

  doc.doc_hypotheses.forEach(h => {
    if (!h.question_id) {
      issues.push({
        type: 'warning',
        doc: doc.topic_title,
        hypothesis: h.id,
        message: `假设 ${h.id} 没有关联的问题 (question_id 为 null)`
      });
    } else {
      const question = doc.doc_questions?.find(q => q.id === h.question_id);
      if (!question) {
        issues.push({
          type: 'error',
          doc: doc.topic_title,
          hypothesis: h.id,
          message: `假设 ${h.id} 引用了不存在的问题: ${h.question_id}`
        });
      }
    }
  });
});

// 4. 检查卡片引用重叠
console.log('\n\n4️⃣ 卡片引用重叠检查');
console.log('-'.repeat(60));

documents.forEach(doc => {
  const cardUsage = new Map();
  
  doc.story_units?.forEach(unit => {
    unit.card_ids?.forEach(cardId => {
      if (!cardUsage.has(cardId)) {
        cardUsage.set(cardId, []);
      }
      cardUsage.get(cardId).push(unit.unit_id);
    });
  });

  cardUsage.forEach((units, cardId) => {
    if (units.length > 1) {
      issues.push({
        type: 'info',
        doc: doc.topic_title,
        card: cardId,
        message: `卡片 ${cardId} 被 ${units.length} 个单元使用: ${units.join(', ')}`
      });
    }
  });
});

// 5. 输出问题汇总
console.log('\n\n5️⃣ 问题汇总');
console.log('='.repeat(60));

if (issues.length === 0) {
  console.log('✅ 没有发现问题！文档结构完整。');
} else {
  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');
  const infos = issues.filter(i => i.type === 'info');

  console.log(`\n❌ 错误: ${errors.length} 个`);
  errors.forEach(issue => {
    console.log(`  - [${issue.doc}] ${issue.message}`);
  });

  console.log(`\n⚠️  警告: ${warnings.length} 个`);
  warnings.forEach(issue => {
    console.log(`  - [${issue.doc}] ${issue.message}`);
  });

  console.log(`\nℹ️  信息: ${infos.length} 个`);
  infos.forEach(issue => {
    console.log(`  - [${issue.doc}] ${issue.message}`);
  });
}

// 6. 统计信息
console.log('\n\n6️⃣ 统计信息');
console.log('='.repeat(60));

const totalCards = cards.length;
const totalDocuments = documents.length;
const totalStoryUnits = documents.reduce((sum, doc) => sum + (doc.story_units?.length || 0), 0);
const totalQuestions = documents.reduce((sum, doc) => sum + (doc.doc_questions?.length || 0), 0);
const totalHypotheses = documents.reduce((sum, doc) => sum + (doc.doc_hypotheses?.length || 0), 0);

console.log(`总卡片数: ${totalCards}`);
console.log(`总文档数: ${totalDocuments}`);
console.log(`总故事单元数: ${totalStoryUnits}`);
console.log(`总问题数: ${totalQuestions}`);
console.log(`总假设数: ${totalHypotheses}`);

console.log('\n' + '='.repeat(60));
console.log('✅ 检查完成！');












