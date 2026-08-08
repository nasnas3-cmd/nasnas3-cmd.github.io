const fs = require('fs');

const dataContent = fs.readFileSync('./data.js', 'utf8');

// === 職業の呪文習得テーブル の個別検査 ===
console.log('=== 職業の呪文習得テーブル詳細検査 ===\n');

// 全呪文ID（正確に）
const spellIds = ['ignal', 'ignados', 'ignajion', 'crysta', 'crystados', 'volteka', 
  'healmia', 'healmiara', 'healmiaga', 'megiluna', 'rizarekua', 'buresuvaru', 
  'shellguard', 'sleeptia', 'paralyzn', 'warpurindo', 'reimeishou', 'shinenHoukou',
  'hiyokoSaishuHigeki', 'yamiNoSaimin'];

// 全職業のlearnableSpells をパース
const jobLines = dataContent.split('\n');
let currentJob = null;
const jobSpells = {};

for (let i = 0; i < jobLines.length; i++) {
  const line = jobLines[i];
  
  // 職業IDを検出
  if (/^\s+\w+:\s*\{/.test(line) && /id:/.test(jobLines[i+1])) {
    currentJob = line.match(/^\s+(\w+):/)[1];
    jobSpells[currentJob] = [];
  }
  
  // learnableSpells を検出
  if (currentJob && line.includes('learnableSpells:')) {
    // 次の ]まで読み込む
    let j = i + 1;
    while (j < jobLines.length && !jobLines[j].includes(']')) {
      const spellMatch = jobLines[j].match(/spellId:\s*"(\w+)"/);
      if (spellMatch) {
        jobSpells[currentJob].push(spellMatch[1]);
      }
      j++;
    }
  }
}

// 検査
const issues = [];
Object.entries(jobSpells).forEach(([jobId, spells]) => {
  spells.forEach(spellId => {
    if (!spellIds.includes(spellId)) {
      issues.push(`職業 "${jobId}" が存在しない呪文 "${spellId}" を習得しようとしています`);
    }
  });
  if (spells.length > 0) {
    console.log(`✓ ${jobId}: ${spells.join(', ')}`);
  }
});

// === ドロップテーブルの詳細検査 ===
console.log('\n=== ドロップテーブル詳細検査 ===\n');

// 全アイテムID（正確に）
const itemIds = ['yakumoSou', 'seiraiSou', 'hikariSuishou', 'seireiNoShizuku', 'hiSeiSuishou', 
  'mezameNoKona', 'shibiRikaiSou', 'kifuNoHane', 'yomigaeriNoTama', 'doukenTsurugi', 
  'haganeNoKen', 'reimeiKen', 'seisouKen', 'tetsuNoOno', 'kyojinNoOno', 'kariNoTsue', 
  'hoshiyomiNoTsue', 'iyashiNoTsue', 'tekkou', 'hakuraGiri', 'kawaNoYoroi', 'ryokufuNoKoromo',
  'tetsuNoYoroi', 'kouteiNoYoroi', 'kawaNoTate', 'ginNoTate', 'kaijuuNoUdewa', 'seisouNoOmamori',
  'fuuraNoHoushi', 'aoNoSeisouShou', 'akaNoSeisouShou', 'midoriNoSeisouShou', 'kinNoSeisouShou', 'fune',
  'kareidoRuinsKey', 'matsubiTou', 'chirashiNoOfuda', 'bunbetsuBinderSeiten', 'yachinTenbikiNoKusari'];

// 全モンスターのdropTable をパース
const monsterLines = dataContent.split('\n');
let currentMonster = null;
const monsterDrops = {};

for (let i = 0; i < monsterLines.length; i++) {
  const line = monsterLines[i];
  
  // モンスターIDを検出
  if (/^\s+\w+:\s*\{/.test(line) && /stats:/.test(dataContent.substring(dataContent.indexOf(line), dataContent.indexOf(line) + 500))) {
    const match = line.match(/^\s+(\w+):/);
    if (match) currentMonster = match[1];
  }
  
  // dropTable を検出
  if (currentMonster && line.includes('dropTable:')) {
    let j = i + 1;
    monsterDrops[currentMonster] = [];
    while (j < monsterLines.length && !monsterLines[j].includes(']')) {
      const itemMatch = monsterLines[j].match(/itemId:\s*"(\w+)"/);
      if (itemMatch) {
        monsterDrops[currentMonster].push(itemMatch[1]);
      }
      j++;
    }
  }
}

// 検査
Object.entries(monsterDrops).forEach(([monsterId, items]) => {
  items.forEach(itemId => {
    if (!itemIds.includes(itemId)) {
      issues.push(`モンスター "${monsterId}" のドロップテーブルに存在しないアイテム "${itemId}" があります`);
    }
  });
  if (items.length > 0) {
    console.log(`✓ ${monsterId}: ${items.join(', ')}`);
  }
});

// === エンカウントテーブルのモンスターID検査 ===
console.log('\n=== エンカウントテーブル検査 ===\n');

const monsterIds = ['haitoGarasu', 'nokobiTsuchigumo', 'kusaMoguri', 'hokoriDama', 'kageOokami', 
  'dokuKinoko', 'tsuruginPikkusu', 'sekibanZonbi', 'ganseiKoumori', 'isoNoKishi', 'goremuNasu',
  'zeniNusubitto', 'kinkaSoubu', 'haigiriOokami', 'kiribakemono', 'fugaNoKemono', 'fuurouNoBoukon',
  'ferubaito', 'suibotsuKurage', 'shinkaiNoBanpei', 'tasogareNoKishi', 'hakoNoYami', 'hateNoSenpei',
  'tasogareKishiDaichou', 'yamiNoKanshisha', 'zorugadia', 'naiyoushoumeiNoBakemono',
  'gomiSutebaNoKaibutsu', 'shareHouseOverseer', 'chickEmperor', 'metalHoshikuzu'];

const encMatches = dataContent.match(/monsterIds:\s*\[\s*"(\w+)"/g) || [];
const foundMonsters = new Set();
encMatches.forEach(str => {
  const id = str.match(/"(\w+)"/)[1];
  foundMonsters.add(id);
  if (!monsterIds.includes(id)) {
    issues.push(`エンカウントテーブルに存在しないモンスター "${id}" があります`);
  }
});

console.log(`✓ エンカウント参照モンスター: ${[...foundMonsters].sort().join(', ')}`);

// === ボス指定の検査 ===
console.log('\n=== ボス指定検査 ===\n');

const bossMatches = dataContent.match(/(boss|bossId|finalBoss):\s*"(\w+)"/g) || [];
const foundBosses = new Set();
bossMatches.forEach(str => {
  const id = str.match(/"(\w+)"/)[1];
  foundBosses.add(id);
  if (!monsterIds.includes(id)) {
    issues.push(`ボス指定 "${id}" が存在しないモンスターです`);
  }
});

console.log(`✓ ボス指定: ${[...foundBosses].sort().join(', ')}`);

// === チェストアイテム検査 ===
console.log('\n=== チェストアイテム検査 ===\n');

const chestMatches = dataContent.match(/chests:\s*\[\s*\{[^}]*itemId:\s*"([^"]+)"/g) || [];
const foundChestItems = new Set();
chestMatches.forEach(str => {
  const id = str.match(/itemId:\s*"([^"]+)"/)[1];
  foundChestItems.add(id);
  if (!itemIds.includes(id)) {
    issues.push(`チェストが存在しないアイテム "${id}" を参照しています`);
  }
});

if (foundChestItems.size > 0) {
  console.log(`✓ チェストアイテム: ${[...foundChestItems].sort().join(', ')}`);
}

// === マップワープ先検査（battle_boss除外） ===
console.log('\n=== マップワープ先検査 ===\n');

const mapIds = ['milesta', 'hazyPlain', 'farnheim', 'kareidoRuins_f1', 'kareidoRuins_f2', 'kareidoRuins_f3',
  'varenshtadt', 'varenPlain', 'haigiriForest', 'riennaVillage', 'fugadou_f1', 'fugadou_f2', 'fugadou_f3', 'fugadou_f4',
  'suibotsuShrine', 'citadel', 'tengaiRift_f1', 'tengaiRift_f2', 'tengaiRift_f3', 'tengaiRift_f4', 'tengaiRift_f5',
  'shareHouseArea', 'shareHouseArea_depths'];

const warpMatches = dataContent.match(/toMapId:\s*"([^"]+)"/g) || [];
const foundWarps = new Set();
warpMatches.forEach(str => {
  const id = str.match(/toMapId:\s*"([^"]+)"/)[1];
  foundWarps.add(id);
  // battle_boss_ で始まるのは設計として有効（battle.jsで動的に処理）
  if (!id.startsWith('battle_boss_') && !mapIds.includes(id)) {
    issues.push(`マップがワープ先 "${id}" を参照していますが、その定義がありません`);
  }
});

const validWarps = [...foundWarps].filter(w => !w.startsWith('battle_boss_')).sort();
console.log(`✓ 通常マップワープ先: ${validWarps.join(', ')}`);

const battleBossWarps = [...foundWarps].filter(w => w.startsWith('battle_boss_')).sort();
if (battleBossWarps.length > 0) {
  console.log(`✓ ボス戦ワープ先（設計上有効）: ${battleBossWarps.join(', ')}`);
}

// === 結果 ===
console.log('\n=== 整合性チェック結果 ===');
if (issues.length > 0) {
  console.log(`✗ 見つかった問題: ${issues.length}件\n`);
  const uniqueIssues = [...new Set(issues)];
  uniqueIssues.forEach((issue, idx) => console.log(`${idx+1}. ${issue}`));
  process.exit(1);
} else {
  console.log('✓ すべての整合性チェック完了: 問題なし');
  process.exit(0);
}
