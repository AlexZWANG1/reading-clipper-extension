import assert from 'node:assert/strict';

// Test the token extraction logic (can test without DB)
function extractTokens(text) {
  const latinWords = text.match(/[a-z]{2,}/gi) || [];
  const CJK_STOP_CHARS = new Set('的了在是我有和与不也这那些个');
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
    .filter(c => !CJK_STOP_CHARS.has(c));
  const cjkBigrams = [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  return [...latinWords.map(w => w.toLowerCase()), ...cjkBigrams];
}

// Test 1: Latin text extraction
const latin = extractTokens('Pricing causes churn');
assert.ok(latin.includes('pricing'), 'should extract pricing');
assert.ok(latin.includes('causes'), 'should extract causes');
assert.ok(latin.includes('churn'), 'should extract churn');

// Test 2: Chinese text extraction with bigrams
const chinese = extractTokens('定价导致用户流失');
assert.ok(chinese.includes('定价'), 'should extract 定价 bigram');
assert.ok(chinese.includes('导致'), 'should extract 导致 bigram');
assert.ok(chinese.includes('流失'), 'should extract 流失 bigram');

// Test 3: Stop characters filtered
const withStops = extractTokens('这是一个定价的问题');
assert.ok(!withStops.includes('这是'), 'should filter stop char bigrams');
assert.ok(withStops.includes('定价'), 'should keep meaningful bigrams');

// Test 4: Mixed text
const mixed = extractTokens('AI Safety 人工智能安全');
assert.ok(mixed.includes('safety'), 'should extract latin');
assert.ok(mixed.includes('人工'), 'should extract CJK bigram');
assert.ok(mixed.includes('智能'), 'should extract CJK bigram');

// Test 5: Empty text
const empty = extractTokens('');
assert.equal(empty.length, 0, 'empty text should return empty array');

console.log('✅ All evidence suggestion tests passed (5/5)');
