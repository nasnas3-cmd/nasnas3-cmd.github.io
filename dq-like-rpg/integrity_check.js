const fs = require('fs');

// 定義されたデータセットの正確な抽出
const dataContent = fs.readFileSync('./data.js', 'utf8');

// 各セクションを手動で抽出（安全な方法）
const jobsSection = dataContent.match(/const JOBS = \{[\s\S]*?\};/)[0];
const spellsSection = dataContent.match(/const SPELLS = \{[\s\S]*?\};/)[0];
const itemsSection = dataContent.match(/const ITEMS = \{[\s\S]*?\};/)[0];
const monstersSection = dataContent.match(/const MONSTERS = \{[\s\S]*?\};/)[0];
const mapsSection = dataContent.match(/const MAPS = \{[\s\S]*?\};/)[0];
const encounterSection = dataContent.match(/const ENCOUNT_TABLES = \{[\s\S]*?\};/)[0];

function extractObjectKeys(section) {
  const matches = section.match(/^\s+(\w+):\s*\{/gm) || [];
  return matches.map(m => m.match(/^\s+(\w+)/)[1]);
}

const jobIds = extractObjectKeys(jobsSection);
const spellIds = extractObjectKeys(spellsSection);
const itemIds = extractObjectKeys(itemsSection);
const monsterIds = extractObjectKeys(monstersSection);
const mapIds = extractObjectKeys(mapsSection);
const encounterIds = extractObjectKeys(encounterSection);

console.log('=== Data.js で定義されたID ===');
console.log('職業:', jobIds.sort().join(', '));
console.log('呪文:', spellIds.sort().join(', '));
console.log('アイテム:', itemIds.sort().join(', '));
console.log('モンスター:', monsterIds.sort().join(', '));
console.log('マップ:', mapIds.sort().join(', '));
console.log('エンカウント:', encounterIds.sort().join(', '));

// 保存して他のファイルで使用
fs.writeFileSync('./scraatchpad/ids.json', JSON.stringify({
  jobs: jobIds,
  spells: spellIds,
  items: itemIds,
  monsters: monsterIds,
  maps: mapIds,
  encounters: encounterIds
}));
