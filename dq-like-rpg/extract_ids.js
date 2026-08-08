const fs = require('fs');

// data.js を文字列として読み込む
const content = fs.readFileSync('./data.js', 'utf8');

// 正規表現でID を抽出する関数
function extractIds(content, pattern) {
  const matches = content.match(new RegExp(pattern, 'g')) || [];
  return matches.map(m => m.match(/["']([^"']+)["']/)?.[1]).filter(Boolean);
}

// 各セクション別に ID を抽出
const jobMatches = content.match(/(\w+):\s*\{[^}]*id:\s*["'](\w+)["'][^}]*isHero:/g) || [];
const jobIds = jobMatches.map(m => m.match(/["'](\w+)["']/)[1]);

const spellMatches = content.match(/(\w+):\s*\{\s*id:\s*["'](\w+)["'][^}]*mpCost/g) || [];
const spellIds = spellMatches.map(m => m.match(/id:\s*["'](\w+)["']/)[1]);

const itemMatches = content.match(/(\w+):\s*\{\s*id:\s*["']([^"']+)["'][^}]*type:\s*["']/g) || [];
const itemIds = itemMatches.map(m => m.match(/id:\s*["']([^"']+)["']/)[1]);

const monsterMatches = content.match(/(\w+):\s*\{[^}]*id:\s*["'](\w+)["'][^}]*name:/g) || [];
const monsterIds = monsterMatches.map(m => m.match(/id:\s*["'](\w+)["']/)[1]);

const mapMatches = content.match(/(\w+):\s*\{[^}]*id:\s*["']([^"']+)["'][^}]*name:/g) || [];
const mapIds = mapMatches.map(m => m.match(/id:\s*["']([^"']+)["']/)[1]);

console.log('=== Data.js ID 一覧 ===\n');
console.log('職業:', [...new Set(jobIds)].sort().join(', '));
console.log('呪文:', [...new Set(spellIds)].sort().join(', '));
console.log('アイテム:', [...new Set(itemIds)].sort().join(', '));
console.log('モンスター:', [...new Set(monsterIds)].sort().join(', '));
console.log('マップ:', [...new Set(mapIds)].sort().join(', '));
