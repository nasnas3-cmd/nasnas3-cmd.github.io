const fs = require('fs');

const dataContent = fs.readFileSync('./data.js', 'utf8');

const allIssues = [];

// === 1. マップのタイル座標検査 ===
console.log('=== 1. マップタイル座標検査 ===\n');

// MAP定義から width/height を抽出
const mapSizes = {
  milesta: {width: 10, height: 10},
  hazyPlain: {width: 16, height: 16},
  farnheim: {width: 12, height: 12},
  kareidoRuins_f1: {width: 10, height: 10},
  kareidoRuins_f2: {width: 10, height: 10},
  kareidoRuins_f3: {width: 10, height: 10},
  varenshtadt: {width: 14, height: 14},
  varenPlain: {width: 14, height: 14},
  haigiriForest: {width: 16, height: 16},
  riennaVillage: {width: 10, height: 10},
  fugadou_f1: {width: 12, height: 12},
  fugadou_f2: {width: 12, height: 12},
  fugadou_f3: {width: 12, height: 12},
  fugadou_f4: {width: 12, height: 12},
  suibotsuShrine: {width: 10, height: 10},
  citadel: {width: 10, height: 10},
  tengaiRift_f1: {width: 12, height: 12},
  tengaiRift_f2: {width: 12, height: 12},
  tengaiRift_f3: {width: 12, height: 12},
  tengaiRift_f4: {width: 12, height: 12},
  tengaiRift_f5: {width: 12, height: 12}
};

// チェストの座標を検査
const chestCoordMatches = dataContent.match(/chests:\s*\[\s*\{[^}]*x:\s*(\d+),\s*y:\s*(\d+)[^}]*\}/g) || [];
chestCoordMatches.forEach((chestStr, idx) => {
  const match = chestStr.match(/x:\s*(\d+),\s*y:\s*(\d+)/);
  if (match) {
    const [, x, y] = match.map(Number);
    // 現在のマップを特定するのは難しいため、一般的な検査のみ
    if (x < 0 || y < 0) {
      allIssues.push(`チェスト座標が負数です: (${x}, ${y})`);
    }
    if (x > 20 || y > 20) {
      allIssues.push(`チェスト座標がマップサイズ外の可能性: (${x}, ${y})`);
    }
  }
});

console.log(`✓ チェスト座標: ${chestCoordMatches.length}個検査完了`);

// ワープ座標を検査
const warpCoordMatches = dataContent.match(/fromX:\s*(\d+),\s*fromY:\s*(\d+).*?toX:\s*(\d+),\s*toY:\s*(\d+)/g) || [];
warpCoordMatches.forEach((warpStr, idx) => {
  const match = warpStr.match(/fromX:\s*(\d+),\s*fromY:\s*(\d+).*?toX:\s*(\d+),\s*toY:\s*(\d+)/);
  if (match) {
    const [, fromX, fromY, toX, toY] = match.map(Number);
    if (fromX < 0 || fromY < 0 || toX < 0 || toY < 0) {
      allIssues.push(`ワープ座標が負数です: from(${fromX}, ${fromY}) -> to(${toX}, ${toY})`);
    }
    if (fromX > 20 || fromY > 20 || toX > 20 || toY > 20) {
      allIssues.push(`ワープ座標がマップサイズ外の可能性: from(${fromX}, ${fromY}) -> to(${toX}, ${toY})`);
    }
  }
});

console.log(`✓ ワープ座標: ${warpCoordMatches.length}個検査完了\n`);

// === 2. 職業の装備可能タイプの妥当性検査 ===
console.log('=== 2. 職業の装備可能タイプ検査 ===\n');

const validEquipTypes = ['sword', 'axe', 'rod', 'staff', 'claw', 'lightArmor', 'heavyArmor', 'shield', 'accessory'];

const equipMatches = dataContent.match(/equipableTypes:\s*\[\s*"([^"]+)"[^\]]*\]/g) || [];
equipMatches.forEach(str => {
  const typeMatches = str.match(/"([^"]+)"/g) || [];
  typeMatches.forEach(typeStr => {
    const type = typeStr.replace(/"/g, '');
    if (!validEquipTypes.includes(type)) {
      allIssues.push(`無効な装備タイプ "${type}" が職業に指定されています`);
    }
  });
});

console.log(`✓ 装備可能タイプ: ${equipMatches.length}個の職業を検査完了`);

// === 3. アイテムの武器/防具タイプの妥当性検査 ===
console.log('=== 3. アイテムの武器/防具タイプ検査 ===\n');

const validWeaponTypes = ['sword', 'axe', 'rod', 'staff', 'claw'];
const validArmorTypes = ['lightArmor', 'heavyArmor'];

const weaponMatches = dataContent.match(/weaponType:\s*"([^"]+)"/g) || [];
weaponMatches.forEach(str => {
  const type = str.match(/"([^"]+)"/)[1];
  if (!validWeaponTypes.includes(type)) {
    allIssues.push(`無効な武器タイプ "${type}" が定義されています`);
  }
});

const armorMatches = dataContent.match(/armorType:\s*"([^"]+)"/g) || [];
armorMatches.forEach(str => {
  const type = str.match(/"([^"]+)"/)[1];
  if (!validArmorTypes.includes(type)) {
    allIssues.push(`無効な防具タイプ "${type}" が定義されています`);
  }
});

console.log(`✓ 武器タイプ: ${weaponMatches.length}個検査完了`);
console.log(`✓ 防具タイプ: ${armorMatches.length}個検査完了\n`);

// === 4. 呪文のeffectType妥当性検査 ===
console.log('=== 4. 呪文のeffectType検査 ===\n');

const validEffectTypes = ['damage', 'heal', 'healAll', 'revive', 'buff', 'debuff', 'status', 'warp', 'damageAll', 'heroSpecial'];

const effectMatches = dataContent.match(/effectType:\s*"([^"]+)"/g) || [];
const foundEffects = new Set();
effectMatches.forEach(str => {
  const type = str.match(/"([^"]+)"/)[1];
  foundEffects.add(type);
  if (!validEffectTypes.includes(type)) {
    allIssues.push(`無効な呪文effectType "${type}" が定義されています`);
  }
});

console.log(`✓ 使用されているeffectType: ${[...foundEffects].sort().join(', ')}\n`);

// === 5. ステータス異常IDの妥当性検査 ===
console.log('=== 5. ステータス異常ID検査 ===\n');

const validStatusIds = ['sleep', 'paralyze', 'poison', 'confusion', 'curse'];
const statusMatches = dataContent.match(/statusId:\s*"([^"]+)"/g) || [];
const foundStatus = new Set();
statusMatches.forEach(str => {
  const id = str.match(/"([^"]+)"/)[1];
  foundStatus.add(id);
  if (!validStatusIds.includes(id)) {
    allIssues.push(`ステータス異常ID "${id}" が無効です`);
  }
});

console.log(`✓ 使用されているステータスID: ${[...foundStatus].sort().join(', ')}\n`);

// === 6. タイルタイプの妥当性検査 ===
console.log('=== 6. タイルタイプ検査 ===\n');

const validTileTypes = ['field', 'dungeon', 'warp', 'chest', 'stairsDown', 'stairsUp', 'townFloor', 'facility', 'townWall', 'bossFloor'];
const tileTypeMatches = dataContent.match(/type:\s*"([^"]+)"/g) || [];
const foundTileTypes = new Set();
tileTypeMatches.forEach(str => {
  const type = str.match(/"([^"]+)"/)[1];
  if (validTileTypes.includes(type)) {
    foundTileTypes.add(type);
  }
});

console.log(`✓ 使用されているタイルタイプ: ${[...foundTileTypes].sort().join(', ')}\n`);

// === 7. 隠し職業の存在確認 ===
console.log('=== 7. 隠し職業検査 ===\n');

const hiddenJobMatches = dataContent.match(/hidden:\s*true/g) || [];
const hiddenJobChangeMatches = dataContent.match(/hiddenJobChange:/g) || [];

console.log(`✓ hidden フラグ: ${hiddenJobMatches.length}個`);
console.log(`✓ hiddenJobChange: ${hiddenJobChangeMatches.length}個\n`);

// === 最終結果 ===
console.log('=== 最終結果 ===\n');

if (allIssues.length > 0) {
  console.log(`✗ 見つかった問題: ${allIssues.length}件\n`);
  const uniqueIssues = [...new Set(allIssues)];
  uniqueIssues.forEach((issue, idx) => console.log(`${idx+1}. ${issue}`));
  process.exit(1);
} else {
  console.log('✓ すべての詳細チェック完了: 問題なし');
  process.exit(0);
}
