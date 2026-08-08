const fs = require('fs');

// ファイル読み込み
const dataContent = fs.readFileSync('./data.js', 'utf8');
const battleContent = fs.readFileSync('./battle.js', 'utf8');
const engineContent = fs.readFileSync('./engine.js', 'utf8');
const mapContent = fs.readFileSync('./map.js', 'utf8');
const uiContent = fs.readFileSync('./ui.js', 'utf8');

// === 1. data.js から定義を抽出 ===
const jobs = [];
const spells = [];
const items = [];
const monsters = [];
const maps = [];

// JOBS セクション
const jobsMatches = dataContent.match(/(\w+):\s*\{\s*id:\s*"(\w+)"/g) || [];
jobsMatches.forEach(m => {
  const match = m.match(/id:\s*"(\w+)"/);
  if (match && !jobs.includes(match[1])) jobs.push(match[1]);
});

// SPELLS セクション
const spellMatches = dataContent.match(/(\w+):\s*\{\s*id:\s*"(\w+)",\s*name:\s*"[^"]*",\s*mpCost/g) || [];
spellMatches.forEach(m => {
  const match = m.match(/id:\s*"(\w+)"/);
  if (match && !spells.includes(match[1])) spells.push(match[1]);
});

// ITEMS セクション
const itemMatches = dataContent.match(/(\w+):\s*\{\s*id:\s*"([^"]+)",\s*name:\s*"[^"]*",\s*type:\s*"/g) || [];
itemMatches.forEach(m => {
  const match = m.match(/id:\s*"([^"]+)"/);
  if (match && !items.includes(match[1])) items.push(match[1]);
});

// MONSTERS セクション
const monsterMatches = dataContent.match(/(\w+):\s*\{\s*id:\s*"(\w+)",\s*name:\s*"[^"]*",\s*stats:/g) || [];
monsterMatches.forEach(m => {
  const match = m.match(/id:\s*"(\w+)"/);
  if (match && !monsters.includes(match[1])) monsters.push(match[1]);
});
// 動的追加(MONSTERS.xxx = { id: ... })も拾う
const monsterAssignMatches = dataContent.match(/MONSTERS\.(\w+)\s*=\s*\{[^}]*id:\s*"(\w+)"/g) || [];
monsterAssignMatches.forEach(m => {
  const match = m.match(/id:\s*"(\w+)"/);
  if (match && !monsters.includes(match[1])) monsters.push(match[1]);
});

// MAPS セクション
const mapMatches = dataContent.match(/(\w+):\s*\{\s*id:\s*"([^"]+)",\s*name:\s*"[^"]*",\s*type:\s*"(town|field|dungeon)"/g) || [];
mapMatches.forEach(m => {
  const match = m.match(/id:\s*"([^"]+)"/);
  if (match && !maps.includes(match[1])) maps.push(match[1]);
});

console.log('=== 定義されたID ===');
console.log('職業:', jobs.length, '-', jobs.sort().join(', '));
console.log('呪文:', spells.length, '-', spells.sort().join(', '));
console.log('アイテム:', items.length, '-', items.sort().join(', '));
console.log('モンスター:', monsters.length, '-', monsters.sort().join(', '));
console.log('マップ:', maps.length, '-', maps.sort().join(', '));

// === 2. 参照の整合性検査 ===
const issues = [];

// 2.1 呪文習得テーブルの検査
console.log('\n=== 1. 職業の呪文習得テーブル検査 ===');
const learnableMatches = dataContent.match(/learnableSpells:\s*\[\s*\{[^}]*spellId:\s*"(\w+)"/g) || [];
learnableMatches.forEach(str => {
  const spellId = str.match(/spellId:\s*"(\w+)"/)[1];
  if (!spells.includes(spellId)) {
    issues.push(`職業が存在しない呪文 "${spellId}" を習得しようとしています`);
  }
});

// 2.2 ドロップテーブルの検査
console.log('=== 2. モンスタードロップテーブル検査 ===');
const dropMatches = dataContent.match(/dropTable:\s*\[\s*\{[^}]*itemId:\s*"([^"]+)"/g) || [];
dropMatches.forEach(str => {
  const itemId = str.match(/itemId:\s*"([^"]+)"/)[1];
  if (!items.includes(itemId)) {
    issues.push(`ドロップテーブルに存在しないアイテム "${itemId}" があります`);
  }
});

// 2.3 マップのワープ先検査
console.log('=== 3. マップワープ先検査 ===');
const warpMatches = dataContent.match(/toMapId:\s*"([^"]+)"/g) || [];
warpMatches.forEach(str => {
  const mapId = str.match(/toMapId:\s*"([^"]+)"/)[1];
  // battle_boss_* は戦闘シーン遷移用の仮想マップID(MAPS定義外)
  if (mapId.indexOf('battle_boss_') === 0) return;
  if (!maps.includes(mapId)) {
    issues.push(`マップがワープ先 "${mapId}" を参照していますが、その定義がありません`);
  }
});

// 2.4.5 鍵扉のキーアイテム検査
console.log('=== 4b. 鍵扉キーアイテム検査 ===');
const lockedDoorMatches = dataContent.match(/lockedDoors:\s*\[[\s\S]*?keyItemId:\s*"([^"]+)"/g) || [];
lockedDoorMatches.forEach(str => {
  const itemId = str.match(/keyItemId:\s*"([^"]+)"/)[1];
  if (!items.includes(itemId)) {
    issues.push(`鍵扉が存在しないアイテム "${itemId}" を参照しています`);
  }
});

// 2.4 マップのチェスト・アイテム検査
console.log('=== 4. マップチェストアイテム検査 ===');
const chestMatches = dataContent.match(/chests:\s*\[\s*\{[^}]*itemId:\s*"([^"]+)"/g) || [];
chestMatches.forEach(str => {
  const itemId = str.match(/itemId:\s*"([^"]+)"/)[1];
  if (!items.includes(itemId)) {
    issues.push(`チェストが存在しないアイテム "${itemId}" を参照しています`);
  }
});

// 2.5 エンカウント時のモンスターID検査
console.log('=== 5. エンカウントテーブルのモンスターID検査 ===');
const encMonsterMatches = dataContent.match(/monsterIds:\s*\[\s*"(\w+)"/g) || [];
encMonsterMatches.forEach(str => {
  const monsterId = str.match(/monsterIds:\s*\[\s*"(\w+)"/)[1];
  if (!monsters.includes(monsterId)) {
    issues.push(`エンカウントテーブルに存在しないモンスター "${monsterId}" があります`);
  }
});

// 2.6 ボス指定の検査
console.log('=== 6. ボス指定検査 ===');
const bossMatches = dataContent.match(/(boss|finalBoss|bossId):\s*"(\w+)"/g) || [];
const bossIds = new Set();
bossMatches.forEach(str => {
  const match = str.match(/"(\w+)"/);
  if (match) bossIds.add(match[1]);
});
bossIds.forEach(bossId => {
  if (!monsters.includes(bossId)) {
    issues.push(`ボス指定 "${bossId}" が存在しないモンスターです`);
  }
});

// 2.7 マップのtiles座標が有効か（簡易チェック）
console.log('=== 7. マップのアイテム座標検査 ===');
const coordMatches = dataContent.match(/\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*itemId:\s*"([^"]+)"/g) || [];
coordMatches.forEach(str => {
  const coord = str.match(/x:\s*(\d+),\s*y:\s*(\d+)/);
  const itemMatch = str.match(/itemId:\s*"([^"]+)"/);
  if (coord && itemMatch) {
    const [, x, y] = coord;
    const itemId = itemMatch[1];
    // マップサイズは一般的に 10-14 程度
    if (x >= 14 || y >= 14) {
      issues.push(`座標 (${x}, ${y}) がマップ境界外の可能性があります`);
    }
  }
});

console.log('\n=== 結果 ===');
if (issues.length > 0) {
  console.log(`✗ 見つかった問題: ${issues.length}件\n`);
  const uniqueIssues = [...new Set(issues)];
  uniqueIssues.forEach((issue, idx) => console.log(`${idx+1}. ${issue}`));
  process.exit(1);
} else {
  console.log('✓ データ整合性チェック完了: 問題なし');
  process.exit(0);
}
