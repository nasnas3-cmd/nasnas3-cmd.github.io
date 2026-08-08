// data.js
// ひよこ勇者よよよーの大冒険 - 全ゲームデータ定義
// 依存なし。window.RPG.data に読み取り専用データを公開する。
// このファイルは data.js の責務のみを扱う。他モジュールは編集しない。

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  // ---------------------------------------------------------------------
  // 1. 経験値テーブル (Lv1〜Lv30, 累計必要経験値)
  // ---------------------------------------------------------------------
  const EXP_TABLE = [
    // 序盤(Lv2〜10)は僅かに引き上げ: Lv2が1戦で上がる易しさを解消(2〜3戦想定)
    0, 12, 30, 60, 125, 215, 305, 415, 535, 715,
    860, 1090, 1370, 1700, 2060, 2480, 3000, 3600, 4350, 5200,
    6200, 7400, 8900, 10600, 12800, 15300, 18100, 21200, 24700, 28600
  ];

  // ---------------------------------------------------------------------
  // 2. 職業データ (JOBS) + 成長率 (JOB_GROWTH)
  // ---------------------------------------------------------------------
  // baseStats: Lv1時点の基礎ステータス
  // growth: レベルアップ毎に加算される成長率(平均値。実際の加算は engine.js 側で乱数補正してよい)
  const JOBS = {
    akatsukiKenshi: {
      id: "akatsukiKenshi",
      name: "契約監査人",
      description: "契約書と家賃明細の食い違いを見抜く、交渉の専門家。物理・呪文をバランス良くこなす。",
      isHero: true,
      baseStats: { hp: 28, mp: 12, chikara: 9, mamori: 8, subayasa: 8, kashikosa: 7, un: 7 },
      growth: { hp: 6.5, mp: 3.0, chikara: 2.2, mamori: 1.8, subayasa: 1.8, kashikosa: 1.6, un: 1.4 },
      learnableSpells: [
        { spellId: "ignal", level: 3 },
        { spellId: "healmia", level: 4 },
        { spellId: "buresuvaru", level: 7 },
        { spellId: "warpurindo", level: 9 },
        { spellId: "ignados", level: 12 },
        { spellId: "healmiara", level: 14 },
        { spellId: "reimeishou", level: 20 }
      ],
      equipableTypes: ["sword", "lightArmor", "heavyArmor", "shield", "accessory"]
    },
    goukenhei: {
      id: "goukenhei",
      name: "設備修繕員",
      description: "壊れた水道や家具を力ずくで直す物理アタッカー。呪文はほぼ覚えない。",
      isHero: false,
      baseStats: { hp: 34, mp: 2, chikara: 12, mamori: 10, subayasa: 6, kashikosa: 3, un: 6 },
      growth: { hp: 8.0, mp: 0.3, chikara: 2.8, mamori: 2.2, subayasa: 1.3, kashikosa: 0.5, un: 1.2 },
      learnableSpells: [
        { spellId: "buresuvaru", level: 15 }
      ],
      equipableTypes: ["sword", "axe", "heavyArmor", "shield", "accessory"]
    },
    hoshiyomi: {
      id: "hoshiyomi",
      name: "掲示物解析士",
      description: "複雑な契約文と暗証番号を読み解く。MPが高く攻撃呪文が豊富。",
      isHero: false,
      baseStats: { hp: 20, mp: 18, chikara: 5, mamori: 5, subayasa: 7, kashikosa: 11, un: 6 },
      growth: { hp: 4.0, mp: 4.5, chikara: 1.1, mamori: 1.2, subayasa: 1.5, kashikosa: 2.6, un: 1.3 },
      learnableSpells: [
        { spellId: "ignal", level: 1 },
        { spellId: "crysta", level: 3 },
        { spellId: "sleeptia", level: 5 },
        { spellId: "ignados", level: 7 },
        { spellId: "paralyzn", level: 8 },
        { spellId: "volteka", level: 10 },
        { spellId: "crystados", level: 12 },
        { spellId: "warpurindo", level: 13 },
        { spellId: "ignajion", level: 17 }
      ],
      equipableTypes: ["rod", "lightArmor", "accessory"]
    },
    iyashiNoMiko: {
      id: "iyashiNoMiko",
      name: "生活相談員",
      description: "住人の健康相談と避難所運営を担う。回復・補助呪文が豊富。",
      isHero: false,
      baseStats: { hp: 24, mp: 16, chikara: 6, mamori: 7, subayasa: 6, kashikosa: 9, un: 8 },
      growth: { hp: 5.0, mp: 4.0, chikara: 1.3, mamori: 1.6, subayasa: 1.3, kashikosa: 2.2, un: 1.6 },
      learnableSpells: [
        { spellId: "healmia", level: 1 },
        { spellId: "shellguard", level: 3 },
        { spellId: "buresuvaru", level: 5 },
        { spellId: "healmiara", level: 7 },
        { spellId: "sleeptia", level: 9 },
        { spellId: "megiluna", level: 11 },
        { spellId: "healmiaga", level: 14 },
        { spellId: "rizarekua", level: 16 }
      ],
      equipableTypes: ["staff", "lightArmor", "shield", "accessory"]
    },
    kentouka: {
      id: "kentouka",
      name: "夜間巡回員",
      description: "深夜の騒音と不審者に立ち向かう。素手武器不要で会心率が高い。",
      isHero: false,
      baseStats: { hp: 30, mp: 4, chikara: 10, mamori: 7, subayasa: 12, kashikosa: 4, un: 10 },
      growth: { hp: 6.8, mp: 0.6, chikara: 2.3, mamori: 1.5, subayasa: 2.6, kashikosa: 0.6, un: 2.0 },
      learnableSpells: [],
      equipableTypes: ["claw", "lightArmor", "accessory"]
    },
    gyoushounin: {
      id: "gyoushounin",
      name: "備品調達員",
      description: "生活用品の仕入れと家賃明細の確認を担当。所持数と戦闘後の収入が増える。",
      isHero: false,
      baseStats: { hp: 24, mp: 6, chikara: 7, mamori: 6, subayasa: 8, kashikosa: 7, un: 12 },
      growth: { hp: 5.2, mp: 1.0, chikara: 1.6, mamori: 1.4, subayasa: 1.6, kashikosa: 1.3, un: 2.4 },
      learnableSpells: [
        { spellId: "warpurindo", level: 11 }
      ],
      equipableTypes: ["sword", "lightArmor", "accessory"],
      specialSkill: "mekiki", // 目利き:売却額アップ
      inventoryBonus: 4,
      goldBonusRate: 1.3
    },
    tabigarasu: {
      id: "tabigarasu",
      name: "短期入居者",
      description: "引っ越し経験だけは豊富。特定条件で「風来の管理人」へ転職できる。",
      isHero: false,
      baseStats: { hp: 18, mp: 3, chikara: 4, mamori: 3, subayasa: 9, kashikosa: 3, un: 14 },
      growth: { hp: 3.0, mp: 0.4, chikara: 0.8, mamori: 0.7, subayasa: 1.4, kashikosa: 0.5, un: 2.8 },
      learnableSpells: [],
      equipableTypes: ["sword", "lightArmor", "accessory"],
      hiddenJobChange: {
        targetJobId: "fuuraiNoYuusha",
        condition: "flags.metCriteriaForFuurai === true"
      }
    },
    fuuraiNoYuusha: {
      id: "fuuraiNoYuusha",
      name: "風来の管理人",
      description: "短期入居者が転職する隠し上位職。どんな物件の問題にも対応できる。",
      isHero: false,
      hidden: true,
      baseStats: { hp: 32, mp: 10, chikara: 11, mamori: 9, subayasa: 13, kashikosa: 8, un: 16 },
      growth: { hp: 7.0, mp: 2.0, chikara: 2.4, mamori: 2.0, subayasa: 2.4, kashikosa: 1.6, un: 2.6 },
      learnableSpells: [
        { spellId: "ignal", level: 5 },
        { spellId: "healmia", level: 5 },
        { spellId: "warpurindo", level: 5 }
      ],
      equipableTypes: ["sword", "lightArmor", "heavyArmor", "shield", "accessory"]
    },
    // --- ひよこ勇者よよよー(旅立ちのパーティ唯一のメンバー。中盤「シェアハウスの闇」編で正体が明らかになる) ---
    yoyoyo: {
      id: "yoyoyo",
      name: "副管理人よよよー",
      description: "星霜荘の副管理人。小さな体と大きな責任感で、住人の日々の困りごとに走り回る。",
      isHero: false,
      baseStats: { hp: 26, mp: 8, chikara: 8, mamori: 6, subayasa: 11, kashikosa: 5, un: 16 },
      growth: { hp: 5.6, mp: 1.2, chikara: 1.7, mamori: 1.4, subayasa: 2.0, kashikosa: 1.0, un: 2.6 },
      learnableSpells: [
        { spellId: "ignal", level: 2 },
        { spellId: "healmia", level: 4 },
        { spellId: "sleeptia", level: 6 }
      ],
      equipableTypes: ["claw", "lightArmor", "accessory"]
    }
  };

  // JOB_GROWTH: JOBS.growth のエイリアス集約(設計書要求の独立キー)
  const JOB_GROWTH = {};
  Object.keys(JOBS).forEach((jobId) => {
    JOB_GROWTH[jobId] = JOBS[jobId].growth;
  });

  // ---------------------------------------------------------------------
  // 3. 呪文データ (SPELLS)
  // ---------------------------------------------------------------------
  // effectType: "damage" | "heal" | "healAll" | "revive" | "buff" | "debuff" | "status" | "warp" | "damageAll"
  const SPELLS = {
    ignal: { id: "ignal", name: "イグナル", mpCost: 2, target: "enemySingle", power: 8, element: "fire", effectType: "damage" },
    ignados: { id: "ignados", name: "イグナドス", mpCost: 5, target: "enemySingle", power: 20, element: "fire", effectType: "damage" },
    ignajion: { id: "ignajion", name: "イグナジオン", mpCost: 10, target: "enemyAll", power: 22, element: "fire", effectType: "damageAll" },
    crysta: { id: "crysta", name: "クリスタ", mpCost: 3, target: "enemySingle", power: 10, element: "ice", effectType: "damage" },
    crystados: { id: "crystados", name: "クリスタドス", mpCost: 8, target: "enemyAll", power: 14, element: "ice", effectType: "damageAll" },
    volteka: { id: "volteka", name: "ヴォルテカ", mpCost: 9, target: "enemyAll", power: 16, element: "thunder", effectType: "damageAll" },
    healmia: { id: "healmia", name: "ヒールミア", mpCost: 2, target: "allySingle", power: 25, element: null, effectType: "heal" },
    healmiara: { id: "healmiara", name: "ヒールミアラ", mpCost: 5, target: "allySingle", power: 60, element: null, effectType: "heal" },
    healmiaga: { id: "healmiaga", name: "ヒールミアガ", mpCost: 10, target: "allySingle", power: 999, element: null, effectType: "heal" },
    megiluna: { id: "megiluna", name: "メギルーナ", mpCost: 8, target: "allyAll", power: 35, element: null, effectType: "healAll" },
    rizarekua: { id: "rizarekua", name: "リザレクア", mpCost: 12, target: "allySingle", power: 0.5, element: null, effectType: "revive" },
    buresuvaru: { id: "buresuvaru", name: "ブレスヴァル", mpCost: 3, target: "allySingle", power: 6, element: null, effectType: "buff", buffKey: "chikara", duration: 3 },
    shellguard: { id: "shellguard", name: "シェルガード", mpCost: 3, target: "allySingle", power: 6, element: null, effectType: "buff", buffKey: "mamori", duration: 3 },
    sleeptia: { id: "sleeptia", name: "スリプティア", mpCost: 3, target: "enemySingle", power: 0, element: null, effectType: "status", statusEffect: "sleep" },
    paralyzn: { id: "paralyzn", name: "パラライズン", mpCost: 4, target: "enemySingle", power: 0, element: null, effectType: "status", statusEffect: "paralyze" },
    warpurindo: { id: "warpurindo", name: "ワープリンド", mpCost: 4, target: "self", power: 0, element: null, effectType: "warp" },
    reimeishou: { id: "reimeishou", name: "黎明衝", mpCost: 14, target: "enemySingle", power: 45, element: "light", effectType: "heroSpecial" },
    // ラスボス(ゾルガディア)第2形態専用呪文。MONSTERS.zorugadia.phase2.specialSpell と同一定義を
    // 正式にSPELLSへ登録し、battle.jsのgetSpell()経由で参照できるようにする。
    shinenHoukou: { id: "shinenHoukou", name: "全戸退去通告", mpCost: 20, target: "allyAll", power: 30, element: "dark", effectType: "damageAll" },
    // 旧裏ボス(ひよこ大王)第2形態専用呪文。現行本編では使用しない。
    hiyokoSaishuHigeki: { id: "hiyokoSaishuHigeki", name: "ひよこ最終悲劇", mpCost: 24, target: "allyAll", power: 34, element: "dark", effectType: "damageAll" }
  };

  // ---------------------------------------------------------------------
  // 4. アイテム/装備データ (ITEMS)
  // ---------------------------------------------------------------------
  // type: "weapon" | "armor" | "shield" | "accessory" | "consumable" | "keyItem"
  const ITEMS = {
    // --- 消耗品 ---
    yakumoSou: { id: "yakumoSou", name: "やくもぐさ", type: "consumable", price: 10, sellPrice: 5, effect: { type: "heal", amount: 30 }, description: "HPを30回復する薬草。" },
    seiraiSou: { id: "seiraiSou", name: "せいらいの実", type: "consumable", price: 24, sellPrice: 12, effect: { type: "heal", amount: 80 }, description: "HPを80回復する木の実。" },
    hikariSuishou: { id: "hikariSuishou", name: "光の水晶", type: "consumable", price: 60, sellPrice: 30, effect: { type: "heal", amount: 999 }, description: "HPを全回復する。" },
    seireiNoShizuku: { id: "seireiNoShizuku", name: "精霊のしずく", type: "consumable", price: 18, sellPrice: 9, effect: { type: "mpHeal", amount: 15 }, description: "MPを15回復する。" },
    hiSeiSuishou: { id: "hiSeiSuishou", name: "碧星の水晶", type: "consumable", price: 90, sellPrice: 45, effect: { type: "mpHeal", amount: 999 }, description: "MPを全回復する。" },
    mezameNoKona: { id: "mezameNoKona", name: "めざめの粉", type: "consumable", price: 12, sellPrice: 6, effect: { type: "cureStatus", statusEffect: "sleep" }, description: "眠り状態を解除する。" },
    shibiRikaiSou: { id: "shibiRikaiSou", name: "しびれとり草", type: "consumable", price: 12, sellPrice: 6, effect: { type: "cureStatus", statusEffect: "paralyze" }, description: "麻痺状態を解除する。" },
    kifuNoHane: { id: "kifuNoHane", name: "帰風の羽", type: "consumable", price: 15, sellPrice: 7, effect: { type: "warp" }, description: "町へ帰還する。" },
    yomigaeriNoTama: { id: "yomigaeriNoTama", name: "よみがえりの珠", type: "consumable", price: 150, sellPrice: 75, effect: { type: "revive", ratio: 0.5 }, description: "戦闘不能の仲間を復活させる。" },

    // --- 武器: sword ---
    doukenTsurugi: { id: "doukenTsurugi", name: "銅剣", type: "weapon", weaponType: "sword", price: 80, sellPrice: 40, statBonus: { chikara: 4 } },
    haganeNoKen: { id: "haganeNoKen", name: "鋼の剣", type: "weapon", weaponType: "sword", price: 240, sellPrice: 120, statBonus: { chikara: 10 } },
    ginrouNoKen: { id: "ginrouNoKen", name: "銀狼の剣", type: "weapon", weaponType: "sword", price: 620, sellPrice: 310, statBonus: { chikara: 15 } },
    reimeiKen: { id: "reimeiKen", name: "管理棟のマスターキー", type: "weapon", weaponType: "sword", price: 0, sellPrice: 0, statBonus: { chikara: 14, kashikosa: 4 }, unique: true, description: "前任管理人から預かった、設備扉と古い契約庫を開ける鍵。" },
    seisouKen: { id: "seisouKen", name: "星霜の剣", type: "weapon", weaponType: "sword", price: 1400, sellPrice: 700, statBonus: { chikara: 22, kashikosa: 6 } },

    // --- 武器: axe ---
    tetsuNoOno: { id: "tetsuNoOno", name: "鉄の斧", type: "weapon", weaponType: "axe", price: 150, sellPrice: 75, statBonus: { chikara: 12 } },
    kyojinNoOno: { id: "kyojinNoOno", name: "巨刃の斧", type: "weapon", weaponType: "axe", price: 500, sellPrice: 250, statBonus: { chikara: 20 } },

    // --- 武器: rod / staff ---
    kariNoTsue: { id: "kariNoTsue", name: "仮の杖", type: "weapon", weaponType: "rod", price: 60, sellPrice: 30, statBonus: { kashikosa: 5 } },
    hoshiyomiNoTsue: { id: "hoshiyomiNoTsue", name: "星読みの杖", type: "weapon", weaponType: "rod", price: 320, sellPrice: 160, statBonus: { kashikosa: 12, mp: 5 } },
    kiriharaiNoTsue: { id: "kiriharaiNoTsue", name: "霧払いの杖", type: "weapon", weaponType: "rod", price: 560, sellPrice: 280, statBonus: { kashikosa: 15, mp: 8 } },
    iyashiNoTsue: { id: "iyashiNoTsue", name: "癒しの杖", type: "weapon", weaponType: "staff", price: 280, sellPrice: 140, statBonus: { kashikosa: 9, mamori: 3 } },

    // --- 武器: claw ---
    tekkou: { id: "tekkou", name: "鉄拳甲", type: "weapon", weaponType: "claw", price: 140, sellPrice: 70, statBonus: { chikara: 8, subayasa: 3 } },
    hakuraGiri: { id: "hakuraGiri", name: "白狼の爪", type: "weapon", weaponType: "claw", price: 420, sellPrice: 210, statBonus: { chikara: 14, subayasa: 6 } },

    // --- 防具: lightArmor ---
    kawaNoYoroi: { id: "kawaNoYoroi", name: "革の鎧", type: "armor", armorType: "lightArmor", price: 70, sellPrice: 35, statBonus: { mamori: 5 } },
    ryokufuNoKoromo: { id: "ryokufuNoKoromo", name: "緑風の衣", type: "armor", armorType: "lightArmor", price: 200, sellPrice: 100, statBonus: { mamori: 8, subayasa: 3 } },

    // --- 防具: heavyArmor ---
    tetsuNoYoroi: { id: "tetsuNoYoroi", name: "鉄の鎧", type: "armor", armorType: "heavyArmor", price: 200, sellPrice: 100, statBonus: { mamori: 12 } },
    kouteiNoYoroi: { id: "kouteiNoYoroi", name: "黒鉄の鎧", type: "armor", armorType: "heavyArmor", price: 900, sellPrice: 450, statBonus: { mamori: 20 } },
    seisouNoHougi: { id: "seisouNoHougi", name: "星霜の法衣", type: "armor", armorType: "lightArmor", price: 800, sellPrice: 400, statBonus: { mamori: 14, kashikosa: 5 } },

    // --- 盾: shield ---
    kawaNoTate: { id: "kawaNoTate", name: "革の盾", type: "shield", price: 50, sellPrice: 25, statBonus: { mamori: 3 } },
    ginNoTate: { id: "ginNoTate", name: "銀の盾", type: "shield", price: 300, sellPrice: 150, statBonus: { mamori: 9 } },

    // --- 装飾品: accessory ---
    kaijuuNoUdewa: { id: "kaijuuNoUdewa", name: "怪獣の腕輪", type: "accessory", price: 180, sellPrice: 90, statBonus: { chikara: 3, un: 2 } },
    seisouNoOmamori: { id: "seisouNoOmamori", name: "星霜のお守り", type: "accessory", price: 250, sellPrice: 125, statBonus: { mamori: 3, kashikosa: 3 } },
    fuuraNoHoushi: { id: "fuuraNoHoushi", name: "風羅の帽子", type: "accessory", price: 140, sellPrice: 70, statBonus: { subayasa: 5 } },

    // --- 重要アイテム: keyItem ---
    aoNoSeisouShou: { id: "aoNoSeisouShou", name: "蒼の設備核", type: "keyItem", price: 0, sellPrice: 0, description: "涸れ井戸の給水設備を動かす蒼い設備核。" },
    akaNoSeisouShou: { id: "akaNoSeisouShou", name: "紅の設備核", type: "keyItem", price: 0, sellPrice: 0, description: "封牙洞の防災設備を動かす紅い設備核。" },
    midoriNoSeisouShou: { id: "midoriNoSeisouShou", name: "緑の設備核", type: "keyItem", price: 0, sellPrice: 0, description: "共有庭と食料庫を動かす緑の設備核。" },
    kinNoSeisouShou: { id: "kinNoSeisouShou", name: "金の設備核", type: "keyItem", price: 0, sellPrice: 0, description: "照明と契約の判定を動かす最後の設備核。" },
    fune: { id: "fune", name: "小舟の鍵", type: "keyItem", price: 0, sellPrice: 0, description: "海を渡れるようになる小舟の鍵。" },
    kareidoRuinsKey: { id: "kareidoRuinsKey", name: "古びた鍵", type: "keyItem", price: 0, sellPrice: 0, description: "涸れ井戸の遺跡で見つかった錆びた鍵。どこかの扉を開けられそうだ。" },
    matsubiTou: { id: "matsubiTou", name: "松明", type: "keyItem", price: 0, sellPrice: 0, description: "暗闇の中でも周囲を照らしてくれる松明。" },

    // --- シェアハウス管理アイテム ---
    chirashiNoOfuda: { id: "chirashiNoOfuda", name: "増殖する注意書き札", type: "accessory", price: 0, sellPrice: 3, statBonus: { mamori: 4, subayasa: -6 }, description: "「ゴミ出しは月曜の夜8時……ただし満月を除く」という条文が無限に再帰する札。装備すると注意深くなるが、動きが鈍る。" },
    saigaiOmamoriSet: { id: "saigaiOmamoriSet", name: "災害時のお守りセット", type: "consumable", price: 40, sellPrice: 20, effect: { type: "heal", amount: 70 }, description: "台風の目の中でも揺らがない張り紙のお守り。開けると中身が崩れ去るが、それでもHPを70回復する。" },
    bunbetsuBinderSeiten: { id: "bunbetsuBinderSeiten", name: "分別バインダー・聖典", type: "weapon", weaponType: "rod", price: 260, sellPrice: 130, statBonus: { kashikosa: 10, un: -2 }, description: "燃えるか燃えないかを見分ける分厚い聖典。読み終える頃には、ゴミの日が変わっている。" },
    yachinTenbikiNoKusari: { id: "yachinTenbikiNoKusari", name: "家賃自動天引きの鎖", type: "accessory", price: 90, sellPrice: 45, statBonus: { mamori: 6, un: -3 }, description: "口座残高がゼロになるまで決して緩まない冷たい金属の首輪。" }
  };

  // ---------------------------------------------------------------------
  // 4.5 町別ショップ品揃え (SHOP_INVENTORY)
  // ---------------------------------------------------------------------
  // townId -> { weaponShop: [itemId...], itemShop: [itemId...] }
  // inn料金・教会料金など町固有設定もここにまとめる。
  const SHOP_INVENTORY = {
    milesta: {
      itemShop: ["yakumoSou", "seireiNoShizuku", "mezameNoKona", "kifuNoHane"]
    },
    farnheim: {
      weaponShop: ["doukenTsurugi", "tetsuNoOno", "kariNoTsue", "tekkou", "kawaNoYoroi", "kawaNoTate"],
      itemShop: ["yakumoSou", "seiraiSou", "seireiNoShizuku", "mezameNoKona", "shibiRikaiSou", "kifuNoHane"]
    },
    varenshtadt: {
      weaponShop: ["haganeNoKen", "tetsuNoOno", "hoshiyomiNoTsue", "iyashiNoTsue", "tekkou", "tetsuNoYoroi", "ginNoTate", "kaijuuNoUdewa"],
      itemShop: ["yakumoSou", "seiraiSou", "seireiNoShizuku", "hiSeiSuishou", "mezameNoKona", "shibiRikaiSou", "kifuNoHane", "yomigaeriNoTama"]
    },
    riennaVillage: {
      weaponShop: ["hakuraGiri", "ryokufuNoKoromo", "ginNoTate", "ginrouNoKen", "kiriharaiNoTsue"],
      itemShop: ["yakumoSou", "seiraiSou", "seireiNoShizuku", "mezameNoKona", "shibiRikaiSou", "kifuNoHane"]
    },
    citadel: {
      weaponShop: ["haganeNoKen", "seisouKen", "kyojinNoOno", "hakuraGiri", "kouteiNoYoroi", "seisouNoHougi", "ginNoTate", "seisouNoOmamori", "fuuraNoHoushi"],
      itemShop: ["seiraiSou", "hikariSuishou", "seireiNoShizuku", "hiSeiSuishou", "mezameNoKona", "shibiRikaiSou", "kifuNoHane", "yomigaeriNoTama"]
    },
    shareHouseArea: {
      itemShop: ["saigaiOmamoriSet", "yakumoSou", "seiraiSou", "kifuNoHane"]
    }
  };

  // 町別の宿屋料金(未定義の町は既定値をui.js側で使用)
  const INN_PRICES = {
    milesta: 8,
    farnheim: 15,
    varenshtadt: 25,
    riennaVillage: 20,
    citadel: 40,
    shareHouseArea: 30
  };

  // ---------------------------------------------------------------------
  // 5. モンスターデータ (MONSTERS)
  // ---------------------------------------------------------------------
  // spriteShape: Canvas描画用の簡易図形指定 "circle" | "square" | "triangle" | "diamond" 等 + color
  const MONSTERS = {
    // --- フィールド雑魚 ---
    haitoGarasu: {
      id: "haitoGarasu", name: "灰吐カラス", stats: { hp: 8, mp: 0, chikara: 5, mamori: 2, subayasa: 8, kashikosa: 1, un: 3, resist: { thunder: -1 } },
      exp: 3, gold: 4, dropTable: [], spriteShape: { shape: "triangle", color: "#4a4a4a", size: 20 }, isBoss: false
    },
    nokobiTsuchigumo: {
      id: "nokobiTsuchigumo", name: "のこび土蜘蛛", stats: { hp: 12, mp: 0, chikara: 6, mamori: 3, subayasa: 5, kashikosa: 1, un: 2 },
      exp: 4, gold: 5, dropTable: [], spriteShape: { shape: "diamond", color: "#5c4033", size: 22 }, isBoss: false
    },
    kusaMoguri: {
      id: "kusaMoguri", name: "くさもぐり", stats: { hp: 10, mp: 0, chikara: 4, mamori: 2, subayasa: 4, kashikosa: 1, un: 4 },
      exp: 2, gold: 3, dropTable: [], spriteShape: { shape: "circle", color: "#3e6b2e", size: 18 }, isBoss: false
    },
    hokoriDama: {
      id: "hokoriDama", name: "ほこり玉", stats: { hp: 14, mp: 4, chikara: 5, mamori: 4, subayasa: 3, kashikosa: 5, un: 3 },
      exp: 5, gold: 6, dropTable: [{ itemId: "seireiNoShizuku", rate: 0.1 }], spriteShape: { shape: "circle", color: "#a8a08a", size: 20 }, isBoss: false
    },
    // --- 森 ---
    kageOokami: {
      id: "kageOokami", name: "影狼", stats: { hp: 22, mp: 0, chikara: 10, mamori: 5, subayasa: 12, kashikosa: 2, un: 5, resist: { fire: -1 } },
      exp: 9, gold: 10, dropTable: [{ itemId: "yakumoSou", rate: 0.15 }], spriteShape: { shape: "triangle", color: "#2a2a3a", size: 26 }, isBoss: false
    },
    dokuKinoko: {
      id: "dokuKinoko", name: "毒きのこ", stats: { hp: 16, mp: 6, chikara: 6, mamori: 4, subayasa: 3, kashikosa: 6, un: 4 },
      exp: 7, gold: 8, dropTable: [], spriteShape: { shape: "circle", color: "#8a2be2", size: 22 }, isBoss: false
    },
    tsuruginPikkusu: {
      id: "tsuruginPikkusu", name: "剣尾ピクサス", stats: { hp: 20, mp: 0, chikara: 11, mamori: 6, subayasa: 9, kashikosa: 2, un: 5 },
      exp: 10, gold: 11, dropTable: [], spriteShape: { shape: "diamond", color: "#556b2f", size: 24 }, isBoss: false
    },
    // --- 涸れ井戸の遺跡 ---
    sekibanZonbi: {
      id: "sekibanZonbi", name: "石棺ゾンビ", stats: { hp: 26, mp: 0, chikara: 12, mamori: 8, subayasa: 4, kashikosa: 2, un: 3, resist: { fire: -1, ice: 0.5 } },
      exp: 12, gold: 14, dropTable: [{ itemId: "seiraiSou", rate: 0.12 }], spriteShape: { shape: "square", color: "#7a7a6a", size: 26 }, isBoss: false
    },
    ganseiKoumori: {
      id: "ganseiKoumori", name: "岩棲コウモリ", stats: { hp: 18, mp: 2, chikara: 9, mamori: 5, subayasa: 14, kashikosa: 3, un: 5, resist: { thunder: -1 } },
      exp: 10, gold: 10, dropTable: [], spriteShape: { shape: "triangle", color: "#3a3a4a", size: 22 }, isBoss: false
    },
    isoNoKishi: {
      id: "isoNoKishi", name: "遺祖の騎士", stats: { hp: 34, mp: 0, chikara: 15, mamori: 12, subayasa: 6, kashikosa: 2, un: 4, resist: { fire: -1, ice: 0.5 } },
      exp: 18, gold: 22, dropTable: [{ itemId: "tetsuNoYoroi", rate: 0.05 }], spriteShape: { shape: "square", color: "#4a4a5a", size: 28 }, isBoss: false
    },
    goremuNasu: {
      id: "goremuNasu", name: "石守り人ゴレムナス", stats: { hp: 180, mp: 10, chikara: 22, mamori: 16, subayasa: 4, kashikosa: 4, un: 6, resist: { fire: -1, ice: 0.5 } },
      exp: 120, gold: 250, dropTable: [{ itemId: "aoNoSeisouShou", rate: 1.0 }], spriteShape: { shape: "square", color: "#5a5a4a", size: 60 },
      isBoss: true, description: "涸れ井戸の遺跡の最深部を守る石の巨人。"
    },
    // --- バレンシュタット周辺(平原・道) ---
    zeniNusubitto: {
      id: "zeniNusubitto", name: "銭盗人", stats: { hp: 20, mp: 0, chikara: 9, mamori: 5, subayasa: 13, kashikosa: 3, un: 8 },
      exp: 9, gold: 20, dropTable: [], spriteShape: { shape: "circle", color: "#c9a227", size: 22 }, isBoss: false
    },
    kinkaSoubu: {
      id: "kinkaSoubu", name: "金貨相撲", stats: { hp: 40, mp: 0, chikara: 14, mamori: 14, subayasa: 3, kashikosa: 2, un: 6 },
      exp: 22, gold: 40, dropTable: [], spriteShape: { shape: "circle", color: "#d4af37", size: 32 }, isBoss: false
    },
    // --- 灰霧の森・封牙洞 ---
    haigiriOokami: {
      id: "haigiriOokami", name: "灰牙狼", stats: { hp: 32, mp: 0, chikara: 16, mamori: 9, subayasa: 14, kashikosa: 3, un: 6, resist: { fire: -1 } },
      exp: 20, gold: 20, dropTable: [{ itemId: "shibiRikaiSou", rate: 0.1 }], spriteShape: { shape: "triangle", color: "#6a6a7a", size: 26 }, isBoss: false
    },
    kiribakemono: {
      id: "kiribakemono", name: "霧化け物", stats: { hp: 28, mp: 12, chikara: 12, mamori: 7, subayasa: 8, kashikosa: 10, un: 5, resist: { fire: 0.5, ice: -1 } },
      exp: 19, gold: 18, dropTable: [], spriteShape: { shape: "circle", color: "#8a8a9a", size: 28 }, isBoss: false
    },
    fugaNoKemono: {
      id: "fugaNoKemono", name: "封牙の獣", stats: { hp: 38, mp: 0, chikara: 32, mamori: 11, subayasa: 10, kashikosa: 3, un: 6, resist: { fire: -1 } },
      exp: 25, gold: 24, dropTable: [{ itemId: "mezameNoKona", rate: 0.1 }], spriteShape: { shape: "diamond", color: "#4a3a2a", size: 30 }, isBoss: false
    },
    fuurouNoBoukon: {
      id: "fuurouNoBoukon", name: "風狼の亡魂", stats: { hp: 30, mp: 20, chikara: 10, mamori: 8, subayasa: 12, kashikosa: 14, un: 7, resist: { fire: 0.5, ice: -1 } },
      exp: 26, gold: 26, dropTable: [], spriteShape: { shape: "triangle", color: "#9a9aae", size: 26 }, isBoss: false
    },
    ferubaito: {
      id: "ferubaito", name: "牙獣王フェルバイト", stats: { hp: 320, mp: 30, chikara: 42, mamori: 18, subayasa: 16, kashikosa: 8, un: 8, resist: { fire: -1 } },
      exp: 260, gold: 450, dropTable: [{ itemId: "akaNoSeisouShou", rate: 1.0 }], spriteShape: { shape: "diamond", color: "#3a2a1a", size: 64 },
      isBoss: true, description: "封牙洞最奥に潜む獣の王。"
    },
    // --- 蒼波の水没神殿 ---
    suibotsuKurage: {
      id: "suibotsuKurage", name: "水没クラゲ", stats: { hp: 30, mp: 8, chikara: 12, mamori: 8, subayasa: 6, kashikosa: 6, un: 6, resist: { fire: 0.5, ice: 0.5, thunder: -1 } },
      exp: 24, gold: 28, dropTable: [], spriteShape: { shape: "circle", color: "#2864a8", size: 26 }, isBoss: false
    },
    shinkaiNoBanpei: {
      id: "shinkaiNoBanpei", name: "深海の番兵", stats: { hp: 48, mp: 0, chikara: 20, mamori: 15, subayasa: 6, kashikosa: 3, un: 6, resist: { fire: 0.5, ice: 0.5, thunder: -1 } },
      exp: 32, gold: 34, dropTable: [{ itemId: "ginNoTate", rate: 0.04 }], spriteShape: { shape: "square", color: "#1c4870", size: 30 }, isBoss: false
    },
    // --- 終盤フィールド・天蓋の破れ目 ---
    tasogareNoKishi: {
      id: "tasogareNoKishi", name: "黄昏の騎士", stats: { hp: 60, mp: 10, chikara: 46, mamori: 18, subayasa: 12, kashikosa: 8, un: 8, resist: { dark: 0.5 } },
      exp: 55, gold: 50, dropTable: [], spriteShape: { shape: "square", color: "#5a3a6a", size: 30 }, isBoss: false
    },
    hakoNoYami: {
      id: "hakoNoYami", name: "箱の闇", stats: { hp: 55, mp: 20, chikara: 40, mamori: 14, subayasa: 10, kashikosa: 16, un: 7, resist: { dark: 0.5 } },
      exp: 58, gold: 48, dropTable: [], spriteShape: { shape: "diamond", color: "#2a1a3a", size: 32 }, isBoss: false
    },
    hateNoSenpei: {
      id: "hateNoSenpei", name: "果ての尖兵", stats: { hp: 70, mp: 15, chikara: 48, mamori: 20, subayasa: 14, kashikosa: 10, un: 9, resist: { dark: 0.5 } },
      exp: 68, gold: 60, dropTable: [], spriteShape: { shape: "triangle", color: "#4a2a5a", size: 34 }, isBoss: false
    },
    // --- 各階中ボス(天蓋の破れ目) ---
    tasogareKishiDaichou: {
      id: "tasogareKishiDaichou", name: "黄昏騎士隊長", stats: { hp: 340, mp: 20, chikara: 58, mamori: 22, subayasa: 14, kashikosa: 10, un: 10, resist: { dark: 0.5 } },
      exp: 240, gold: 300, dropTable: [], spriteShape: { shape: "square", color: "#6a2a7a", size: 50 }, isBoss: true, description: "天蓋の破れ目1階を守る中ボス。"
    },
    yamiNoKanshisha: {
      id: "yamiNoKanshisha", name: "闇の監視者", stats: { hp: 380, mp: 40, chikara: 54, mamori: 20, subayasa: 12, kashikosa: 26, un: 10, resist: { dark: 0.5 } },
      exp: 280, gold: 300, dropTable: [], spriteShape: { shape: "circle", color: "#1a0a2a", size: 52 }, isBoss: true, description: "天蓋の破れ目2階を守る中ボス。"
    },
    // --- ラスボス: 終了条件を失った管理契約の核 ---
    zorugadia: {
      id: "zorugadia", name: "終わらぬ契約の管理王ゾルガディア", stats: { hp: 1050, mp: 80, chikara: 68, mamori: 26, subayasa: 18, kashikosa: 26, un: 12, resist: { fire: 0.5, ice: 0.5, thunder: 0.5 } },
      exp: 0, gold: 0, dropTable: [], spriteShape: { shape: "diamond", color: "#1a0a2a", size: 90 },
      isBoss: true, isFinalBoss: true,
      phase2: {
        hpThreshold: 0.5,
        statBonus: { chikara: 8, kashikosa: 8 },
        specialSpell: { id: "shinenHoukou", name: "深淵咆哮", mpCost: 20, target: "allyAll", power: 30, element: "dark", effectType: "damageAll" }
      },
      description: "家賃、契約、退去、朝夕の判定を永遠に繰り返す、終了条件を失った管理契約の核。"
    },
    // --- シェアハウスの本編 ---
    naiyoushoumeiNoBakemono: {
      id: "naiyoushoumeiNoBakemono", name: "内容証明郵便の化け物",
      stats: { hp: 42, mp: 8, chikara: 20, mamori: 10, subayasa: 7, kashikosa: 9, un: 5 },
      exp: 34, gold: 30, dropTable: [{ itemId: "yachinTenbikiNoKusari", rate: 0.08 }],
      spriteShape: { shape: "square", color: "#8a7a5a", size: 28 }, isBoss: false,
      description: "受け取っても無視しても問題になる通知書。攻撃するたびに『法的通知』を残す。"
    },
    gomiSutebaNoKaibutsu: {
      id: "gomiSutebaNoKaibutsu", name: "ゴミステーションの化け物",
      stats: { hp: 48, mp: 0, chikara: 22, mamori: 9, subayasa: 6, kashikosa: 3, un: 4 },
      exp: 36, gold: 26, dropTable: [], spriteShape: { shape: "diamond", color: "#5c6b3a", size: 30 }, isBoss: false,
      description: "収集日の朝、分別されていない袋を投げつけて住人を困らせる怪物。"
    },
    shareHouseOverseer: {
      id: "shareHouseOverseer", name: "管理人AIアルゴリズム・ドミトリー",
      stats: { hp: 300, mp: 30, chikara: 42, mamori: 20, subayasa: 10, kashikosa: 24, un: 8, resist: { thunder: 0.5 } },
      exp: 260, gold: 280, dropTable: [{ itemId: "bunbetsuBinderSeiten", rate: 0.2 }],
      spriteShape: { shape: "square", color: "#333344", size: 46 },
      isBoss: true,
      description: "住人の声より効率を優先し、生活リズムを強制最適化しようとする管理システム。"
    },
    // --- 旧裏ボス候補。現行本編ではよよよーを変身させない ---
    chickEmperor: {
      id: "chickEmperor", name: "ひよこ大王・管理権限暴走形態",
      stats: { hp: 1300, mp: 90, chikara: 74, mamori: 30, subayasa: 22, kashikosa: 24, un: 20, resist: { fire: 0.5, ice: 0.5, thunder: 0.5, dark: 0.3 } },
      exp: 0, gold: 0, dropTable: [], spriteShape: { shape: "circle", color: "#ffd94a", size: 96 },
      isBoss: true, isFinalBoss: true,
      phase2: {
        hpThreshold: 0.5,
        statBonus: { chikara: 10, subayasa: 6 },
        specialSpell: { id: "hiyokoSaishuHigeki", name: "ひよこ最終悲劇", mpCost: 24, target: "allyAll", power: 34, element: "dark", effectType: "damageAll" }
      },
      description: "エンディング後の裏管理室で暴走した、よよよー型の管理権限。"
    }
  };

  // ---------------------------------------------------------------------
  // 6. エンカウントテーブル (ENCOUNT_TABLES)
  // ---------------------------------------------------------------------
  // areaId → 出現グループ抽選テーブル。各エントリは出現モンスターID配列(グループ)と重み。
  const ENCOUNT_TABLES = {
    hazyPlain: {
      // 序章〜第一章 霧の平原
      groups: [
        { monsterIds: ["haitoGarasu"], weight: 20 },
        { monsterIds: ["haitoGarasu", "haitoGarasu"], weight: 15 },
        { monsterIds: ["kusaMoguri", "kusaMoguri"], weight: 15 },
        { monsterIds: ["nokobiTsuchigumo"], weight: 15 },
        { monsterIds: ["hokoriDama"], weight: 10 },
        { monsterIds: ["nokobiTsuchigumo", "kusaMoguri"], weight: 10 }
      ]
    },
    kareidoRuins: {
      // 涸れ井戸の遺跡
      groups: [
        { monsterIds: ["sekibanZonbi"], weight: 20 },
        { monsterIds: ["ganseiKoumori", "ganseiKoumori"], weight: 18 },
        { monsterIds: ["sekibanZonbi", "ganseiKoumori"], weight: 16 },
        { monsterIds: ["isoNoKishi"], weight: 8 }
      ],
      boss: "goremuNasu"
    },
    varenPlain: {
      // 第二章 バレンシュタット周辺
      groups: [
        { monsterIds: ["zeniNusubitto"], weight: 20 },
        { monsterIds: ["kageOokami"], weight: 15 },
        { monsterIds: ["tsuruginPikkusu"], weight: 15 },
        { monsterIds: ["kinkaSoubu"], weight: 8 },
        { monsterIds: ["zeniNusubitto", "zeniNusubitto"], weight: 10 }
      ]
    },
    haigiriForest: {
      // 灰霧の森フィールド
      groups: [
        { monsterIds: ["haigiriOokami"], weight: 18 },
        { monsterIds: ["kiribakemono"], weight: 16 },
        { monsterIds: ["dokuKinoko"], weight: 14 },
        { monsterIds: ["haigiriOokami", "kiribakemono"], weight: 12 }
      ]
    },
    fugadou: {
      // 封牙洞
      groups: [
        { monsterIds: ["fugaNoKemono"], weight: 18 },
        { monsterIds: ["fuurouNoBoukon"], weight: 16 },
        { monsterIds: ["fugaNoKemono", "fuurouNoBoukon"], weight: 14 },
        { monsterIds: ["haigiriOokami", "fugaNoKemono"], weight: 10 }
      ],
      boss: "ferubaito"
    },
    suibotsuShrine: {
      // 蒼波の水没神殿(サブダンジョン)
      groups: [
        { monsterIds: ["suibotsuKurage"], weight: 18 },
        { monsterIds: ["shinkaiNoBanpei"], weight: 12 },
        { monsterIds: ["suibotsuKurage", "suibotsuKurage"], weight: 14 }
      ]
    },
    tengaiRift: {
      // 天蓋の破れ目(最終ダンジョン)
      groups: [
        { monsterIds: ["tasogareNoKishi"], weight: 16 },
        { monsterIds: ["hakoNoYami"], weight: 14 },
        { monsterIds: ["hateNoSenpei"], weight: 12 },
        { monsterIds: ["tasogareNoKishi", "hakoNoYami"], weight: 10 }
      ],
      floorBosses: ["tasogareKishiDaichou", "yamiNoKanshisha"],
      finalBoss: "zorugadia"
    },
    shareHouseArea: {
      // シェアハウスの闇(中盤サブシナリオ)
      groups: [
        { monsterIds: ["naiyoushoumeiNoBakemono"], weight: 18 },
        { monsterIds: ["gomiSutebaNoKaibutsu"], weight: 16 },
        { monsterIds: ["naiyoushoumeiNoBakemono", "gomiSutebaNoKaibutsu"], weight: 10 }
      ],
      boss: "shareHouseOverseer"
    }
  };

  // ---------------------------------------------------------------------
  // 7. タイル種別 (TILE_TYPES)
  // ---------------------------------------------------------------------
  const TILE_TYPES = {
    0: { id: 0, name: "草原", color: "#4a9c3f", walkable: true, encounterRate: 0.06, type: "field" },
    1: { id: 1, name: "森", color: "#1f5c2e", walkable: true, encounterRate: 0.12, type: "field" },
    2: { id: 2, name: "山", color: "#7a6a58", walkable: false, encounterRate: 0, type: "field" },
    3: { id: 3, name: "海・水", color: "#2864a8", walkable: false, encounterRate: 0, type: "field", requiresBoat: true },
    4: { id: 4, name: "道", color: "#c9b585", walkable: true, encounterRate: 0, type: "field" },
    5: { id: 5, name: "町入口", color: "#e0c060", walkable: true, encounterRate: 0, type: "warp" },
    6: { id: 6, name: "ダンジョン入口", color: "#555555", walkable: true, encounterRate: 0, type: "warp" },
    7: { id: 7, name: "灰霧地帯", color: "#8a8a9a", walkable: true, encounterRate: 0.18, type: "field" },
    8: { id: 8, name: "壁", color: "#333333", walkable: false, encounterRate: 0, type: "dungeon" },
    9: { id: 9, name: "宝箱", color: "#d4af37", walkable: false, encounterRate: 0, type: "chest" },
    10: { id: 10, name: "階段(下)", color: "#222244", walkable: true, encounterRate: 0, type: "stairsDown" },
    11: { id: 11, name: "階段(上)", color: "#444466", walkable: true, encounterRate: 0, type: "stairsUp" },
    12: { id: 12, name: "町内床", color: "#b8a078", walkable: true, encounterRate: 0, type: "townFloor" },
    13: { id: 13, name: "宿屋", color: "#c07040", walkable: true, encounterRate: 0, type: "facility", facility: "inn" },
    14: { id: 14, name: "武器屋", color: "#909090", walkable: true, encounterRate: 0, type: "facility", facility: "weaponShop" },
    15: { id: 15, name: "道具屋", color: "#70a070", walkable: true, encounterRate: 0, type: "facility", facility: "itemShop" },
    16: { id: 16, name: "教会", color: "#e0e0f0", walkable: true, encounterRate: 0, type: "facility", facility: "church" },
    17: { id: 17, name: "町の外周壁", color: "#5a4a3a", walkable: false, encounterRate: 0, type: "townWall" },
    18: { id: 18, name: "町出口", color: "#e0c060", walkable: true, encounterRate: 0, type: "warp" },
    19: { id: 19, name: "ボス部屋床", color: "#331122", walkable: true, encounterRate: 0, type: "bossFloor" },
    // ダンジョン内部の床。以前は町内床(12番、encounterRate:0)を流用していたため、
    // ダンジョン内を歩いてもランダムエンカウントが一切発生しない不具合になっていた。
    // フィールドの灰霧地帯(18%)より高めのダンジョン床として20%を設定する。
    20: { id: 20, name: "ダンジョン床", color: "#4a4438", walkable: true, encounterRate: 0.14, type: "dungeonFloor" },
    // --- パッケージA追加タイル ---
    21: { id: 21, name: "落とし穴", color: "#4a4438", walkable: true, encounterRate: 0.14, type: "pitfall" },
    22: { id: 22, name: "隠し通路", color: "#3a3a3a", walkable: true, encounterRate: 0, type: "dungeonFloor" },
    23: { id: 23, name: "祈り床", color: "#e8e0ff", walkable: true, encounterRate: 0, type: "prayer" },
    // --- ギミック拡張タイル ---
    24: { id: 24, name: "鍵扉", color: "#8a5030", walkable: false, encounterRate: 0, type: "lockedDoor" },
    25: { id: 25, name: "スイッチ", color: "#6a6a70", walkable: true, encounterRate: 0, type: "switchPlate" },
    26: { id: 26, name: "閉ざされた壁", color: "#2a2a38", walkable: false, encounterRate: 0, type: "closedGate" },
    27: { id: 27, name: "暗闇", color: "#2a2418", walkable: true, encounterRate: 0.14, type: "darknessFloor" }
  };

  // ---------------------------------------------------------------------
  // 8. マップデータ (MAPS)
  // ---------------------------------------------------------------------
  // helper: 矩形を1つのタイルIDで埋めた2次元配列を作る
  function makeGrid(width, height, fill) {
    const rows = [];
    for (let y = 0; y < height; y++) {
      rows.push(new Array(width).fill(fill));
    }
    return rows;
  }
  function setTile(grid, x, y, tileId) {
    grid[y][x] = tileId;
  }
  function setRect(grid, x0, y0, x1, y1, tileId) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        grid[y][x] = tileId;
      }
    }
  }
  // helper: 文字列の行配列(1行1文字=1タイル)を2次元グリッドに変換する。
  // 文字 -> タイルIDの対応は charMap で指定。手書きレイアウトを直感的に書くための補助。
  // 既定の対応(charMapで上書き可能): '#'=壁(8) '.'=ダンジョン床(20) '9'=宝箱 'U'=上り階段
  // 'D'=下り階段 'B'=ボス部屋床(19) 'T'=ボストリガー(6) 'P'=落とし穴(21) 'H'=隠し通路(22) 'R'=祈り床(23)
  // 'L'=鍵扉(24) 'S'=スイッチ(25) 'G'=閉ざされた壁(26) 'X'=暗闇床(27) 'W'=海・水(3、通行不可)
  function gridFromRows(rows, charMap) {
    const defaultMap = {
      "#": 8, ".": 20, "9": 9, "U": 11, "D": 10,
      "B": 19, "T": 6, "P": 21, "H": 22, "R": 23, "W": 3,
      "L": 24, "S": 25, "G": 26, "X": 27
    };
    const map = Object.assign({}, defaultMap, charMap || {});
    return rows.map((row) => row.split("").map((ch) => (ch in map ? map[ch] : 20)));
  }

  // --- フィールド1: 霧の平原(序章〜第一章) ---
  const fieldHazyPlainTiles = makeGrid(16, 16, 0);
  setRect(fieldHazyPlainTiles, 0, 0, 15, 1, 2);   // 北の山脈
  setRect(fieldHazyPlainTiles, 0, 14, 15, 15, 2); // 南の山脈
  setRect(fieldHazyPlainTiles, 3, 3, 6, 6, 1);    // 森
  setRect(fieldHazyPlainTiles, 9, 8, 12, 11, 1);  // 森
  setRect(fieldHazyPlainTiles, 10, 3, 13, 5, 2);  // 北東の山越え不可地帯
  setRect(fieldHazyPlainTiles, 2, 10, 4, 12, 1);  // 南西の森の迂回路
  setRect(fieldHazyPlainTiles, 11, 10, 13, 12, 2); // 南東の山道
  // 道
  for (let x = 1; x < 15; x++) setTile(fieldHazyPlainTiles, x, 7, 4);
  // 町入口(ミレスタ村)
  setTile(fieldHazyPlainTiles, 1, 7, 5);
  // 町入口(ファルンハイム)
  setTile(fieldHazyPlainTiles, 14, 7, 5);
  // ダンジョン入口(涸れ井戸の遺跡)
  setTile(fieldHazyPlainTiles, 7, 3, 6);
  // 第二章への道(バレンシュタット周辺の平原へ続く抜け道の目印。草原に埋もれて発見困難だったため、
  // 目立つ道タイルで明示する)
  setTile(fieldHazyPlainTiles, 8, 12, 6);

  // --- フィールド2: 灰霧原野(第三章以降・第二フィールド) ---
  const fieldHaigiriTiles = makeGrid(16, 16, 0);
  setRect(fieldHaigiriTiles, 0, 0, 15, 1, 2);
  setRect(fieldHaigiriTiles, 0, 14, 15, 15, 2);
  setRect(fieldHaigiriTiles, 2, 2, 13, 13, 7); // 灰霧地帯が中央広範囲
  setRect(fieldHaigiriTiles, 4, 5, 9, 9, 1);   // 灰霧の森
  for (let x = 1; x < 15; x++) setTile(fieldHaigiriTiles, x, 7, 4);
  setTile(fieldHaigiriTiles, 1, 7, 5);  // バレンシュタットへの戻り口
  setTile(fieldHaigiriTiles, 14, 7, 5); // 静霧の里リエンナ
  setTile(fieldHaigiriTiles, 6, 6, 6);  // 封牙洞入口
  setRect(fieldHaigiriTiles, 10, 10, 12, 12, 3); // 海(蒼波の水没神殿方面、船必要)
  setTile(fieldHaigiriTiles, 11, 11, 6); // 水没神殿入口(便宜上ダンジョン入口タイル)
  // 神殿入口(11,11)が周囲を海タイル(walkable:false)に囲まれ物理的に到達不能だったため、
  // 南側に陸路(道タイル)を敷設し、灰霧地帯側から歩いて到達できるようにする。
  setTile(fieldHaigiriTiles, 11, 12, 4); // 入口南の道
  setTile(fieldHaigiriTiles, 11, 13, 4); // 更に南の道(灰霧地帯へ接続)
  setTile(fieldHaigiriTiles, 3, 3, 6); // シェアハウスの闇「壁の耳と紙の雨の集落」入口

  // --- 町1: ミレスタ村 ---
  const townMilestaTiles = makeGrid(10, 10, 12);
  setRect(townMilestaTiles, 0, 0, 9, 0, 17);
  setRect(townMilestaTiles, 0, 9, 9, 9, 17);
  setRect(townMilestaTiles, 0, 0, 0, 9, 17);
  setRect(townMilestaTiles, 9, 0, 9, 9, 17);
  setTile(townMilestaTiles, 2, 3, 13); // 宿屋
  setTile(townMilestaTiles, 7, 3, 16); // 教会
  setTile(townMilestaTiles, 4, 6, 15); // 道具屋(村なので小さな雑貨のみ)
  setTile(townMilestaTiles, 5, 9, 18); // 町出口

  // --- 町2: ファルンハイム ---
  const townFarnheimTiles = makeGrid(12, 12, 12);
  setRect(townFarnheimTiles, 0, 0, 11, 0, 17);
  setRect(townFarnheimTiles, 0, 11, 11, 11, 17);
  setRect(townFarnheimTiles, 0, 0, 0, 11, 17);
  setRect(townFarnheimTiles, 11, 0, 11, 11, 17);
  setTile(townFarnheimTiles, 2, 3, 13); // 宿屋
  setTile(townFarnheimTiles, 9, 3, 14); // 武器屋
  setTile(townFarnheimTiles, 2, 8, 15); // 道具屋
  setTile(townFarnheimTiles, 9, 8, 16); // 教会
  setTile(townFarnheimTiles, 6, 11, 18); // 町出口

  // --- ダンジョン1: 涸れ井戸の遺跡(地下3階層、14x14に拡張し個別手書きレイアウト) ---
  // B1: 十字通路+四隅小部屋(南西部屋の奥が行き止まり宝箱)
  const kareidoRuinsFloors = [
    gridFromRows([
      "##############",
      "#....#..#...D#",
      "#....#..#.9..#",
      "#............#",
      "#....#..#....#",
      "######..######",
      "#............#",
      "#............#",
      "######..######",
      "#9...#..#....#",
      "#............#",
      "#....#..#....#",
      "#U...#..#....#",
      "##############"
    ]),
    // B2: 渦巻き回廊(外周ループ→内周ループ→中心部屋の宝箱・階段)
    gridFromRows([
      "##############",
      "#............#",
      "#.##########.#",
      "#.#........#.#",
      "#.#.######.#.#",
      "#.#.#....#.#.#",
      "#...#.9......#",
      "#.#.#.LD.#.#.#",
      "#.#.#....#.#.#",
      "#.#.######.#.#",
      "#.#........#.#",
      "#U##########.#",
      "#............#",
      "##############"
    ]),
    // B3: 一本道の分岐に宝物庫(鎧2つ)、その先に試練の一本道→祈り床→ボス
    gridFromRows([
      "##############",
      "##############",
      "####BBTBB#####",
      "####BBRBB#####",
      "##.9.#.#######",
      "##9..#.#######",
      "##.....#######",
      "######.#######",
      "######.#######",
      "######.#######",
      "#......#######",
      "#.############",
      "#U############",
      "##############"
    ])
  ];

  // --- ダンジョン2: 封牙洞(地下4階層、16x16に拡張) ---
  const fugadouFloors = [
    // F1: ループ回廊(外周を1周でき入口付近に戻ってこられる)+中央部屋+行き止まり宝箱
    gridFromRows([
      "################",
      "#............D.#",
      "#..............#",
      "#..##########..#",
      "#..########9...#",
      "#..########....#",
      "#..###....###..#",
      "#.........###..#",
      "#..###....###..#",
      "#..###....###..#",
      "#..##########..#",
      "#..##########..#",
      "#..##########..#",
      "#U.............#",
      "#..............#",
      "################"
    ]),
    // F2: 隠し通路(壁に見えるが通行可、H)の先に隠し部屋(白狼の爪)
    gridFromRows([
      "################",
      "#...#........D.#",
      "#...#..........#",
      "#..............#",
      "#...#....#.....#",
      "#...#....#.....#",
      "#...#....#.....#",
      "#...#..........#",
      "#...#....#.....#",
      "#...#....#.....#",
      "#...#....#.....#",
      "#........#.....#",
      "#.9.H..S..GG...#",
      "#U.......#.....#",
      "#........#.....#",
      "################"
    ]),
    // F3: 落とし穴フロア(正解ルート以外はP=落とし穴。安全な迂回路のみ床)
    gridFromRows([
      "################",
      "#PPPPPPPPPPPPDP#",
      "#PPPPPPPPPPPP.P#",
      "#PPPPP........P#",
      "#PPPPP.PPPPPPPP#",
      "#PPPPP.PPPPPPPP#",
      "#PPPPP.PPPPPPPP#",
      "#PPPPP.PPPPPPPP#",
      "#......PPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#UPPPPPPPPPPPPP#",
      "#PPPPPPPPPPPPPP#",
      "################"
    ]),
    // F4: 一本道+宝物庫(鉄の斧)+祈り床→ボス
    gridFromRows([
      "################",
      "################",
      "#####BBBTBBB####",
      "#####BBBRBBB####",
      "########.#######",
      "########.#######",
      "###.99##.#######",
      "###...##.#######",
      "###......#######",
      "########.#######",
      "########.#######",
      "########.#######",
      "#........#######",
      "#.##############",
      "#U##############",
      "################"
    ])
  ];

  // --- サブダンジョン: 蒼波の水没神殿(12x12) ---
  // 中央を水路(W、通行不可)が縦断し、対岸に見える宝箱(緑の聖装)へは
  // 南の桟橋を回り込んで東側の縦通路経由でしか到達できない。
  const suibotsuShrineTiles = gridFromRows([
    "############",
    "#9...WW.9..#",
    "#....WW....#",
    "#....WW....#",
    "#....WW....#",
    "#....WW....#",
    "#....WW....#",
    "#....WW....#",
    "#....WW.9..#",
    "#U.........#",
    "#....WW....#",
    "############"
  ]);

  // --- 最終ダンジョン: 天蓋の破れ目(地下5階層、16x16に拡張) ---
  // F1: 迷路 / F2: 中ボス(隊長)+宝物庫 / F3: 落とし穴+隠し通路の複合 /
  // F4: 中ボス(監視者)+宝物庫 / F5: 祈り床→長い一本道→ラスボス
  const tengaiRiftFloors = [
    gridFromRows([
      "################",
      "#............D.#",
      "#.##########...#",
      "#.9..9..X......#",
      "#.X........X...#",
      "#.X.########X..#",
      "#.X........X...#",
      "#.X........X...#",
      "#.X.########X..#",
      "#.X........X...#",
      "#.X........X...#",
      "#.X.########X..#",
      "#.X........X...#",
      "#U.............#",
      "#..............#",
      "################"
    ]),
    gridFromRows([
      "################",
      "#############D##",
      "####BBBTBBB##.##",
      "####BBBBBB....##",
      "##.9.##.#####.##",
      "##...##.#####.##",
      "##......#####.##",
      "#######.#####.##",
      "#######.#####.##",
      "#######.#.....##",
      "#.......########",
      "#.##############",
      "#.##############",
      "#U##############",
      "################",
      "################"
    ]),
    gridFromRows([
      "################",
      "#PPPPPPPPPPPPDP#",
      "#PPPP.9..PPPP.P#",
      "#PPPP.........P#",
      "#PPPP#PPP.PPPPP#",
      "#PPPPHPPP.PPPPP#",
      "#....####.PPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#.PPPPPPPPPPPPP#",
      "#UPPPPPPPPPPPPP#",
      "#PPPPPPPPPPPPPP#",
      "################"
    ]),
    gridFromRows([
      "################",
      "#############D##",
      "#####BBBBTBB#.##",
      "#####BBBB.....##",
      "###.9.###.###.##",
      "###...###.###.##",
      "###.......###.##",
      "#########.###.##",
      "#########.###.##",
      "#########.....##",
      "#.........######",
      "#.##############",
      "#.##############",
      "#U##############",
      "################",
      "################"
    ]),
    gridFromRows([
      "################",
      "################",
      "###BBBBBT#######",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "###.############",
      "#...############",
      "#U##############",
      "################"
    ])
  ];

  // --- 町3: シェアハウスの闇「壁の耳と紙の雨の集落」 ---
  const townShareHouseTiles = makeGrid(12, 12, 12);
  setRect(townShareHouseTiles, 0, 0, 11, 0, 17);
  setRect(townShareHouseTiles, 0, 11, 11, 11, 17);
  setRect(townShareHouseTiles, 0, 0, 0, 11, 17);
  setRect(townShareHouseTiles, 11, 0, 11, 11, 17);
  setTile(townShareHouseTiles, 2, 3, 13);  // 宿屋
  setTile(townShareHouseTiles, 9, 3, 15);  // 道具屋
  setTile(townShareHouseTiles, 2, 6, 9);   // 増殖する注意書き札
  setTile(townShareHouseTiles, 9, 7, 9);   // 家賃自動天引きの鎖
  setTile(townShareHouseTiles, 5, 8, 6);   // 管理棟(オートロックの迷宮)入口
  setTile(townShareHouseTiles, 5, 11, 18); // 町出口

  // --- ダンジョン3: シェアハウスの闇「オートロックの迷宮」(管理棟最深部) ---
  const shareHouseDepthsTiles = makeGrid(12, 12, 20);
  setRect(shareHouseDepthsTiles, 0, 0, 11, 0, 8);
  setRect(shareHouseDepthsTiles, 0, 11, 11, 11, 8);
  setRect(shareHouseDepthsTiles, 0, 0, 0, 11, 8);
  setRect(shareHouseDepthsTiles, 11, 0, 11, 11, 8);
  setTile(shareHouseDepthsTiles, 3, 5, 9);  // 宝箱(分別バインダー・聖典)
  setTile(shareHouseDepthsTiles, 5, 3, 23); // 祈り床
  setTile(shareHouseDepthsTiles, 5, 2, 6);  // 中ボス出現トリガー(shareHouseOverseer)

  const MAPS = {
    milesta: {
      id: "milesta",
      name: "ミレスタ村",
      type: "town",
      width: 10,
      height: 10,
      tiles: townMilestaTiles,
      areaId: null,
      warps: [
        { fromX: 5, fromY: 9, toMapId: "hazyPlain", toX: 1, toY: 7 }
      ],
      npcs: [
        { id: "murachou", name: "村長", x: 5, y: 4, dialogues: [
          "おお、副管理人のひよこよよよーか。今日も管理連絡が山積みじゃ。",
          "まずはファルンハイムで清掃用品を仕入れ、涸れ井戸の設備を点検するのじゃ。"
        ] },
        { id: "murabito1", name: "村人", x: 3, y: 6, dialogues: [
          "この村も夕方になると、掲示物が一枚ずつ増えるんだ……誰か止めてくれ。"
        ] },
        { id: "murabito3", name: "旅慣れた村人", x: 4, y: 3, dialogues: [
          "霧の平原の南に、回収日の違うゴミ置き場があるらしい。",
          "道の途中で紙を拾ったら、捨てずに管理棟へ持っていくんじゃぞ。"
        ] },
        { id: "murabito2", name: "村の子供", x: 6, y: 7, dialogues: [
          "おにいちゃん(おねえちゃん)、どこかへ行っちゃうの…?また帰ってきてね!"
        ] }
      ]
    },
    hazyPlain: {
      id: "hazyPlain",
      name: "霧の平原",
      type: "field",
      width: 16,
      height: 16,
      tiles: fieldHazyPlainTiles,
      areaId: "hazyPlain",
      warps: [
        { fromX: 1, fromY: 7, toMapId: "milesta", toX: 5, toY: 8 },
        { fromX: 14, fromY: 7, toMapId: "farnheim", toX: 6, toY: 10 },
        { fromX: 7, fromY: 3, toMapId: "kareidoRuins_f1", toX: 1, toY: 12 },
        { fromX: 8, fromY: 12, toMapId: "varenPlain", toX: 11, toY: 7 }
      ],
      npcs: []
    },
    farnheim: {
      id: "farnheim",
      name: "ファルンハイム",
      type: "town",
      width: 12,
      height: 12,
      tiles: townFarnheimTiles,
      areaId: null,
      warps: [
        { fromX: 6, fromY: 11, toMapId: "hazyPlain", toX: 14, toY: 8 }
      ],
      npcs: [
        { id: "kajiya", name: "鍛冶屋の主人", x: 9, y: 2, dialogues: [
          "うちの武具は交易都市バレンシュタットにも負けねえぜ。"
        ] },
        { id: "ryojin", name: "旅人", x: 4, y: 5, dialogues: [
          "涸れ井戸の遺跡には気をつけな。ゴーレムの気配がする。",
          "霧の平原の南側、森の合間に続く道を進めば、バレンシュタットの方まで抜けられるぞ。"
        ] },
        {
          id: "sakabaMaster",
          name: "旅の酒場の女将",
          x: 5,
          y: 8,
          guildHall: true,
          dialogues: [
            "ここは「星霜酒場」。腕に覚えのある旅人を仲間にできるよ。",
            "職業を選んで、旅の仲間を作っていきな。"
          ]
        }
      ]
    },
    kareidoRuins_f1: {
      id: "kareidoRuins_f1",
      name: "涸れ井戸の遺跡 1階",
      type: "dungeon",
      width: 14,
      height: 14,
      tiles: kareidoRuinsFloors[0],
      areaId: "kareidoRuins",
      warps: [
        { fromX: 1, fromY: 12, toMapId: "hazyPlain", toX: 7, toY: 4 },
        { fromX: 12, fromY: 1, toMapId: "kareidoRuins_f2", toX: 1, toY: 11 }
      ],
      npcs: [
        {
          id: "goukenheiNPC",
          name: "剛拳兵の男",
          x: 2,
          y: 7,
          recruit: { jobId: "goukenhei", level: 1 },
          dialogues: [
            "おう、遺跡の奥にゴーレムがいるって噂を聞いてな。",
            "一人じゃ心もとねえ。よかったら俺も連れてってくれ！"
          ],
          afterRecruitDialogues: [
            "がんばろうな！"
          ]
        }
      ],
      chests: [{ x: 1, y: 9, itemId: "yakumoSou", count: 2 }, { x: 10, y: 2, itemId: "kareidoRuinsKey", count: 1 }]
    },
    kareidoRuins_f2: {
      id: "kareidoRuins_f2",
      name: "涸れ井戸の遺跡 2階",
      type: "dungeon",
      width: 14,
      height: 14,
      tiles: kareidoRuinsFloors[1],
      areaId: "kareidoRuins",
      warps: [
        { fromX: 1, fromY: 11, toMapId: "kareidoRuins_f1", toX: 12, toY: 2 },
        {
          fromX: 7,
          fromY: 7,
          toMapId: "kareidoRuins_f3",
          toX: 1,
          toY: 12,
          requiresOpenedDoor: { x: 6, y: 7 },
          message: "中央の扉を　古びた鍵で　開けると　先へ進める！"
        }
      ],
      lockedDoors: [
        { x: 6, y: 7, keyItemId: "kareidoRuinsKey", message: "古びた鍵で　中央の扉を　開けた！" }
      ],
      npcs: [],
      chests: [{ x: 6, y: 6, itemId: "doukenTsurugi", count: 1 }]
    },
    kareidoRuins_f3: {
      id: "kareidoRuins_f3",
      name: "涸れ井戸の遺跡 最深部",
      type: "dungeon",
      width: 14,
      height: 14,
      tiles: kareidoRuinsFloors[2],
      areaId: "kareidoRuins",
      warps: [
        { fromX: 1, fromY: 12, toMapId: "kareidoRuins_f2", toX: 7, toY: 6 },
        { fromX: 6, fromY: 2, toMapId: "battle_boss_goremuNasu", toX: 0, toY: 0, requiresBossAlive: "goremuNasu" },
        // ボス(goremuNasu)撃破後は同じマスから直接ダンジョン入口(hazyPlain)へ
        // 脱出できるようにし、最深部からの長い往復を省略する。
        { fromX: 6, fromY: 2, toMapId: "hazyPlain", toX: 7, toY: 4, requiresDefeatedBoss: "goremuNasu" }
      ],
      npcs: [],
      chests: [
        { x: 3, y: 4, itemId: "kawaNoYoroi", count: 1 },
        { x: 2, y: 5, itemId: "yakumoSou", count: 1 }
      ],
      bossId: "goremuNasu"
    },
    varenshtadt: {
      id: "varenshtadt",
      name: "バレンシュタット",
      type: "town",
      width: 14,
      height: 14,
      tiles: (function () {
        const g = makeGrid(14, 14, 12);
        setRect(g, 0, 0, 13, 0, 17);
        setRect(g, 0, 13, 13, 13, 17);
        setRect(g, 0, 0, 0, 13, 17);
        setRect(g, 13, 0, 13, 13, 17);
        setTile(g, 2, 3, 13);
        setTile(g, 11, 3, 14);
        setTile(g, 2, 10, 15);
        setTile(g, 11, 10, 16);
        setTile(g, 7, 13, 18);
        setTile(g, 7, 0, 18); // 北出口(灰霧の森・原野方面)
        return g;
      })(),
      areaId: null,
      warps: [
        { fromX: 7, fromY: 13, toMapId: "varenPlain", toX: 1, toY: 7 },
        { fromX: 7, fromY: 0, toMapId: "haigiriForest", toX: 1, toY: 8 }
      ],
      npcs: [
        { id: "gildMaster", name: "商人ギルド長", x: 6, y: 6, dialogues: [
          "この街の裏で家賃の数字が動いておる…二重徴収の記録を探しておくれ。"
        ] },
        { id: "spellShopkeeper", name: "呪文書店の店主", x: 9, y: 6, dialogues: [
          "新しい呪文の書が入荷しておるぞ。仲間の職業に合ったものを探すといい。"
        ] },
        {
          id: "gyoushouninNPC",
          name: "行商人",
          x: 4,
          y: 8,
          recruit: { jobId: "gyoushounin", level: 1 },
          dialogues: [
            "旦那、いい目をしてるね。あっしも見聞を広めたいと思っていたところでさあ。",
            "よかったら、一緒に旅をさせてもらえやせんか？"
          ],
          afterRecruitDialogues: [
            "がんばろうな！"
          ]
        }
      ]
    },
    varenPlain: {
      id: "varenPlain",
      name: "バレンシュタット周辺の平原",
      type: "field",
      width: 14,
      height: 14,
      tiles: (function () {
        const g = makeGrid(14, 14, 0);
        setRect(g, 0, 0, 13, 1, 2);
        setRect(g, 0, 12, 13, 13, 2);
        for (let x = 1; x < 13; x++) setTile(g, x, 7, 4);
        for (let y = 4; y <= 7; y++) setTile(g, 6, y, 4);
        for (let y = 7; y <= 10; y++) setTile(g, 9, y, 4);
        setRect(g, 3, 3, 5, 5, 1);
        setRect(g, 8, 9, 10, 11, 1);
        setRect(g, 10, 3, 11, 5, 2);
        setTile(g, 1, 7, 5);
        setTile(g, 12, 7, 5);
        return g;
      })(),
      areaId: "varenPlain",
      warps: [
        { fromX: 1, fromY: 7, toMapId: "varenshtadt", toX: 7, toY: 12 },
        { fromX: 12, fromY: 7, toMapId: "hazyPlain", toX: 8, toY: 12 }
      ],
      npcs: []
    },
    haigiriForest: {
      id: "haigiriForest",
      name: "灰霧の森・原野",
      type: "field",
      width: 16,
      height: 16,
      tiles: fieldHaigiriTiles,
      areaId: "haigiriForest",
      warps: [
        { fromX: 1, fromY: 7, toMapId: "varenshtadt", toX: 7, toY: 1 },
        { fromX: 14, fromY: 7, toMapId: "riennaVillage", toX: 5, toY: 9 },
        { fromX: 6, fromY: 6, toMapId: "fugadou_f1", toX: 1, toY: 10 },
        { fromX: 11, fromY: 11, toMapId: "suibotsuShrine", toX: 1, toY: 8 },
        { fromX: 7, fromY: 13, toMapId: "citadel", toX: 5, toY: 8 },
        { fromX: 3, fromY: 3, toMapId: "shareHouseArea", toX: 5, toY: 9, requiresChapter: 3, message: "封牙洞の設備記録が揃うまで、星霜荘へ戻れない。" }
      ],
      npcs: []
    },
    riennaVillage: {
      id: "riennaVillage",
      name: "静霧の里リエンナ",
      type: "town",
      width: 10,
      height: 10,
      tiles: (function () {
        const g = makeGrid(10, 10, 12);
        setRect(g, 0, 0, 9, 0, 17);
        setRect(g, 0, 9, 9, 9, 17);
        setRect(g, 0, 0, 0, 9, 17);
        setRect(g, 9, 0, 9, 9, 17);
        setTile(g, 2, 3, 13);
        setTile(g, 7, 3, 16);
        setTile(g, 4, 6, 15);
        setTile(g, 7, 6, 14);
        setTile(g, 5, 9, 18);
        return g;
      })(),
      areaId: null,
      warps: [
        { fromX: 5, fromY: 9, toMapId: "haigiriForest", toX: 14, toY: 8 }
      ],
      npcs: [
         { id: "mikoChou", name: "巫女長", x: 7, y: 4, dialogues: [
          "黄昏の原因は、終わらない生活の困りごとです。住人の声を一つずつ聞きましょう。"
        ] },
        {
          id: "iyashiNoMikoNPC",
           name: "生活相談員",
          x: 3,
          y: 6,
          recruit: { jobId: "iyashiNoMiko", level: 1 },
          dialogues: [
             "副管理人さん、その傷……見過ごせません。",
             "わたくしも、住人の健康相談と避難所運営をお手伝いさせてください。"
          ],
          afterRecruitDialogues: [
            "がんばろうな！"
          ]
        }
      ]
    },
    fugadou_f1: {
      id: "fugadou_f1", name: "封牙洞 1階", type: "dungeon", width: 16, height: 16,
      tiles: fugadouFloors[0], areaId: "fugadou",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "haigiriForest", toX: 6, toY: 7 },
        { fromX: 13, fromY: 1, toMapId: "fugadou_f2", toX: 1, toY: 13 }
      ],
      npcs: [], chests: [{ x: 11, y: 4, itemId: "seiraiSou", count: 2 }]
    },
    fugadou_f2: {
      id: "fugadou_f2", name: "封牙洞 2階", type: "dungeon", width: 16, height: 16,
      tiles: fugadouFloors[1], areaId: "fugadou",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "fugadou_f1", toX: 13, toY: 2 },
        { fromX: 13, fromY: 1, toMapId: "fugadou_f3", toX: 1, toY: 13 }
      ],
      switches: [
        {
          id: "fugadou_f2_hiddenGate",
          x: 7, y: 12,
          message: "床のスイッチが　押された！　壁が　動きだした…",
          opens: [{ x: 10, y: 12 }, { x: 11, y: 12 }]
        }
      ],
      npcs: [], chests: [{ x: 2, y: 12, itemId: "hakuraGiri", count: 1 }]
    },
    fugadou_f3: {
      id: "fugadou_f3", name: "封牙洞 3階", type: "dungeon", width: 16, height: 16,
      tiles: fugadouFloors[2], areaId: "fugadou",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "fugadou_f2", toX: 13, toY: 2 },
        { fromX: 13, fromY: 1, toMapId: "fugadou_f4", toX: 1, toY: 14 }
      ],
      pitfalls: [
        // 正解ルート以外の広範囲(P)を踏むと安全ルート終盤(階段手前)へ落下する。
        // 罠だが結果的に近道になる設計。
        { x: 8, y: 4, toX: 6, toY: 3 },
        { x: 8, y: 5, toX: 6, toY: 3 },
        { x: 10, y: 8, toX: 7, toY: 8 }
      ],
      npcs: [], chests: []
    },
    fugadou_f4: {
      id: "fugadou_f4", name: "封牙洞 最奥", type: "dungeon", width: 16, height: 16,
      tiles: fugadouFloors[3], areaId: "fugadou",
      warps: [
        { fromX: 1, fromY: 14, toMapId: "fugadou_f3", toX: 13, toY: 2 },
        { fromX: 8, fromY: 2, toMapId: "battle_boss_ferubaito", toX: 0, toY: 0, requiresBossAlive: "ferubaito" },
        // ボス(ferubaito)撃破後は同じマスから直接ダンジョン入口(haigiriForest)へ
        // 脱出できるようにし、4階層分の長い往復を省略する。
        { fromX: 8, fromY: 2, toMapId: "haigiriForest", toX: 6, toY: 7, requiresDefeatedBoss: "ferubaito" }
      ],
      npcs: [], chests: [{ x: 4, y: 6, itemId: "tetsuNoOno", count: 1 }, { x: 5, y: 6, itemId: "shibiRikaiSou", count: 2 }],
      bossId: "ferubaito"
    },
    suibotsuShrine: {
      id: "suibotsuShrine", name: "蒼波の水没神殿", type: "dungeon", width: 12, height: 12,
      tiles: suibotsuShrineTiles, areaId: "suibotsuShrine",
      warps: [
        { fromX: 1, fromY: 9, toMapId: "haigiriForest", toX: 11, toY: 12 }
      ],
      npcs: [], chests: [
        { x: 1, y: 1, itemId: "fune", count: 1 },
        { x: 8, y: 1, itemId: "midoriNoSeisouShou", count: 1 },
        { x: 8, y: 8, itemId: "ginNoTate", count: 1 }
      ]
    },
    citadel: {
      id: "citadel",
      name: "最終前線基地アルテヴィア城塞",
      type: "town",
      width: 10,
      height: 10,
      tiles: (function () {
        const g = makeGrid(10, 10, 12);
        setRect(g, 0, 0, 9, 0, 17);
        setRect(g, 0, 9, 9, 9, 17);
        setRect(g, 0, 0, 0, 9, 17);
        setRect(g, 9, 0, 9, 9, 17);
        setTile(g, 2, 3, 13);
        setTile(g, 7, 3, 14);
        setTile(g, 2, 6, 15);
        setTile(g, 7, 6, 16);
        setTile(g, 5, 9, 18);
        return g;
      })(),
      areaId: null,
      warps: [
        { fromX: 5, fromY: 9, toMapId: "tengaiRift_f1", toX: 1, toY: 10, requiresChapter: 5, message: "星霜荘の管理案件を終えるまで、最終前線へは進めない。" },
        { fromX: 5, fromY: 8, toMapId: "haigiriForest", toX: 7, toY: 13 }
      ],
      npcs: [
        { id: "shireikan", name: "前線基地の司令官", x: 5, y: 4, dialogues: [
          "天蓋の破れ目の最深部に、終わらない契約の核がある。設備記録を持って決戦に挑むのだ。"
        ] }
      ]
    },
    tengaiRift_f1: {
      id: "tengaiRift_f1", name: "天蓋の破れ目 1階", type: "dungeon", width: 16, height: 16,
      tiles: tengaiRiftFloors[0], areaId: "tengaiRift",
      darkness: { radius: 2.5, litItemId: "matsubiTou", litMessage: "松明の　明かりが　暗闇を　照らした！" },
      warps: [
        { fromX: 1, fromY: 13, toMapId: "citadel", toX: 5, toY: 8 },
        { fromX: 13, fromY: 1, toMapId: "tengaiRift_f2", toX: 1, toY: 13 }
      ],
      npcs: [], chests: [
        { x: 2, y: 3, itemId: "seiraiSou", count: 2 },
        { x: 5, y: 3, itemId: "matsubiTou", count: 1 }
      ]
    },
    tengaiRift_f2: {
      id: "tengaiRift_f2", name: "天蓋の破れ目 2階", type: "dungeon", width: 16, height: 16,
      tiles: tengaiRiftFloors[1], areaId: "tengaiRift",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "tengaiRift_f1", toX: 13, toY: 2 },
        { fromX: 7, fromY: 2, toMapId: "battle_boss_tasogareKishiDaichou", toX: 0, toY: 0, requiresBossAlive: "tasogareKishiDaichou" },
        // ボス(tasogareKishiDaichou)撃破後は同じマスから直接ダンジョン入口(citadel)へ
        // 脱出できるようにし、長い往復を省略する。
        { fromX: 7, fromY: 2, toMapId: "citadel", toX: 5, toY: 8, requiresDefeatedBoss: "tasogareKishiDaichou" },
        { fromX: 13, fromY: 1, toMapId: "tengaiRift_f3", toX: 1, toY: 13 }
      ],
      npcs: [], chests: [{ x: 3, y: 4, itemId: "seiraiSou", count: 2 }],
      bossId: "tasogareKishiDaichou"
    },
    tengaiRift_f3: {
      id: "tengaiRift_f3", name: "天蓋の破れ目 3階", type: "dungeon", width: 16, height: 16,
      tiles: tengaiRiftFloors[2], areaId: "tengaiRift",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "tengaiRift_f2", toX: 13, toY: 2 },
        { fromX: 13, fromY: 1, toMapId: "tengaiRift_f4", toX: 1, toY: 13 }
      ],
      pitfalls: [
        // 広範囲の落とし穴(P)を踏むと安全ルート終盤の分岐点へ落下する近道トラップ。
        { x: 9, y: 8, toX: 9, toY: 6 },
        { x: 9, y: 9, toX: 9, toY: 6 },
        { x: 13, y: 8, toX: 9, toY: 3 }
      ],
      chests: [{ x: 6, y: 2, itemId: "kinNoSeisouShou", count: 1 }],
      npcs: []
    },
    tengaiRift_f4: {
      id: "tengaiRift_f4", name: "天蓋の破れ目 4階", type: "dungeon", width: 16, height: 16,
      tiles: tengaiRiftFloors[3], areaId: "tengaiRift",
      warps: [
        { fromX: 1, fromY: 13, toMapId: "tengaiRift_f3", toX: 13, toY: 2 },
        { fromX: 9, fromY: 2, toMapId: "battle_boss_yamiNoKanshisha", toX: 0, toY: 0, requiresBossAlive: "yamiNoKanshisha" },
        // ボス(yamiNoKanshisha)撃破後は同じマスから直接ダンジョン入口(citadel)へ
        // 脱出できるようにし、長い往復を省略する。
        { fromX: 9, fromY: 2, toMapId: "citadel", toX: 5, toY: 8, requiresDefeatedBoss: "yamiNoKanshisha" },
        { fromX: 13, fromY: 1, toMapId: "tengaiRift_f5", toX: 1, toY: 14 }
      ],
      npcs: [], chests: [{ x: 4, y: 4, itemId: "yomigaeriNoTama", count: 1 }],
      bossId: "yamiNoKanshisha"
    },
    tengaiRift_f5: {
      id: "tengaiRift_f5", name: "天蓋の破れ目 最深部", type: "dungeon", width: 16, height: 16,
      tiles: tengaiRiftFloors[4], areaId: "tengaiRift",
      warps: [
        { fromX: 1, fromY: 14, toMapId: "tengaiRift_f4", toX: 13, toY: 2 },
        { fromX: 8, fromY: 2, toMapId: "battle_boss_zorugadia", toX: 0, toY: 0 }
      ],
      npcs: [], bossId: "zorugadia"
    },
    // --- シェアハウスの闇(中盤サブシナリオ) ---
    shareHouseArea: {
      id: "shareHouseArea",
      name: "壁の耳と紙の雨の集落",
      type: "town",
      width: 12,
      height: 12,
      tiles: townShareHouseTiles,
      areaId: "shareHouseArea",
      warps: [
        { fromX: 5, fromY: 11, toMapId: "haigiriForest", toX: 3, toY: 4 },
        { fromX: 5, fromY: 8, toMapId: "shareHouseArea_depths", toX: 5, toY: 10, requiresChapter: 4, message: "まずは集落の住人から、管理棟の話を聞いておこう。" }
      ],
      npcs: [
        { id: "kanriminAlgorithm", name: "管理人「アルゴリズム・ドミトリー」", x: 5, y: 4, dialogues: [
          "副管理人よよよー、今日の案件は三十七件です。まず紙を数えましょう。",
          "住人同士の生身の会話は非効率……と言いたいところですが、苦情の本音はログに残りません。"
        ] },
        { id: "roujinInk", name: "高齢の住人「インク・ジェネレーション」", x: 3, y: 6, managementCase: "largeNotice", dialogues: [
          "ふふふ、文字が小さくて見えぬぞい。この通知書、まるで蟻の行列のようだ。",
          "よよよーや、もっと大きく書いておくれ。読めれば、ちゃんと返事もできるからの。"
        ], afterCaseDialogues: [
          "おお、これなら読めるぞい。返事を書いて、みんなに知らせておこう。"
        ], highTrustDialogues: [
          "よよよーや、もうお前さんは立派な管理人じゃ。通知より先に、顔を見れば分かるようになったぞい。"
        ] },
        { id: "maboroshiNyuukyosha", name: "幻の入居者", x: 8, y: 6, managementCase: "ghostMoveOut", dialogues: [
          "……ボクは『住所』のためだけにここにいるんだ。契約が終わればすぐ消えてしまう。",
          "退去届の書き方が分からなくて、ずっと廊下にいるんだ。手伝ってくれる？"
        ], afterCaseDialogues: [
          "退去届は受理された。ありがとう。これで、ちゃんと朝へ行けるよ。"
        ], highTrustDialogues: [
          "住所がなくても、ここで過ごした時間は消えないよ。次の住人にも、よろしく伝えてね。"
        ] }
      ],
      chests: [
        { x: 2, y: 6, itemId: "chirashiNoOfuda", count: 1 },
        { x: 9, y: 7, itemId: "yachinTenbikiNoKusari", count: 1 }
      ]
    },
    shareHouseArea_depths: {
      id: "shareHouseArea_depths",
      name: "オートロックの迷宮(管理棟最深部)",
      type: "dungeon",
      width: 12,
      height: 12,
      tiles: shareHouseDepthsTiles,
      areaId: "shareHouseArea",
      warps: [
        { fromX: 5, fromY: 10, toMapId: "shareHouseArea", toX: 5, toY: 7 },
        { fromX: 5, fromY: 2, toMapId: "battle_boss_shareHouseOverseer", toX: 0, toY: 0, requiresBossAlive: "shareHouseOverseer" },
        // ボス(shareHouseOverseer)撃破後は同じマスから直接シェアハウスの集落へ
        // 脱出できるようにし、往復の手間を省く。
        { fromX: 5, fromY: 2, toMapId: "shareHouseArea", toX: 5, toY: 7, requiresDefeatedBoss: "shareHouseOverseer" }
      ],
      npcs: [],
      chests: [{ x: 3, y: 5, itemId: "bunbetsuBinderSeiten", count: 1 }],
      bossId: "shareHouseOverseer"
    }
  };

  // ---------------------------------------------------------------------
  // 9. シナリオテキスト・NPC台詞集(章別、ui.js/engine.jsから参照)
  // ---------------------------------------------------------------------
  const SCENARIO_TEXT = {
    prologue: [
      "大陸アルテヴィアの朝が、少しずつ遅くなっていた。",
      "太陽が沈んだまま戻らない現象は、いつしか『終わらぬ黄昏』と呼ばれた。",
      "原因は、星霜荘の管理契約と設備核が、終わらない処理を続けていることらしい。",
      "ミレスタの研修所で、副管理人よよよーに最初の業務連絡が届く。"
    ],
    chapter1: [
      "前任管理人「まずは水道だ。涸れ井戸の設備遺跡を点検しておくれ。」",
      "設備修繕員を仲間に加え、蒼の設備核と、止まらない給水処理の原因を探る。"
    ],
    chapter2: [
      "バレンシュタットでは、住人の家賃が二重に引き落とされていた。",
      "備品調達員と契約監査人を仲間に加え、自動送金の仕組みを調べる。"
    ],
    chapter3: [
      "灰霧の森では、粗大ゴミと害獣が避難経路をふさいでいた。",
      "封牙洞の防災設備を復旧し、静霧の里の生活相談員と協力する。"
    ],
    chapter4: [
      "巫女長「黄昏の原因は、誰か一人の悪意ではありません。終わらない生活の困りごとです。」",
      "よよよーは、星霜荘の本拠地へ戻り、副管理人として住人の日々に向き合う。"
    ],
    finalChapter: [
      "自動管理システムの中枢へ向かうため、アルテヴィア城塞を管理会社との交渉拠点にする。",
      "天蓋の破れ目の最深部には、終了条件を失った管理契約の核が待ち受けている。"
    ],
    // --- シェアハウスの本編 ---
    chapterShareHouse: [
      "『壁の耳と紙の雨の集落』は、よよよーが副管理人を務める星霜荘の本拠地だ。",
      "どこからともなく降る『ルール』と『警告』の紙片が、住人たちの一日を少しずつ曇らせている。",
      "管理棟の奥には、住人のために作られたはずの自動管理システムが眠っている。"
    ],
    chapterMidBossDefeated: [
      "AI管理人アルゴリズム・ドミトリーは停止し、集落に静けさが戻った。",
      "よよよーは管理ログを読み上げる。そこには、住人の声を無視して効率だけを追い続けた記録があった。",
      "『自動化は、誰かの代わりに考えるためではなく、誰かの話を聞く時間を作るために使う』。",
      "副管理人よよよーは、壊れた仕組みを直すだけでなく、住人と一緒に新しいルールを作ることを決める。"
    ],
    chapterChickEmperor: [
      "自動管理システムのさらに奥に、すべての契約を終わらせられない管理契約の核がある。",
      "よよよーたちは、住人の朝を取り戻すため、最後の設備点検へ向かう。"
    ],
    ending: [
      "終わらぬ契約の管理王ゾルガディアは停止し、4つの設備核が本来の役割を取り戻した。",
      "星霜荘には朝日が差し込み、住人たちは久しぶりに紙ではなく顔を見て挨拶を交わした。",
      "困りごとがなくなったわけではない。それでも、話し合って解決できる朝が戻ってきた。",
      "――こうして、ひよこ勇者よよよーの大冒険は、次の管理連絡を待つことになった。"
    ]
  };

  // ---------------------------------------------------------------------
  // 第1ループ: 星霜荘の管理案件
  // ---------------------------------------------------------------------
  // NPC会話、ボス報酬、フィールドメニューの案件一覧が同じデータを参照する。
  const MANAGEMENT_CASES = {
    waterInspection: {
      id: "waterInspection",
      title: "給水設備の再点検",
      description: "涸れ井戸の設備を止めている保守ゴーレムを調べる。",
      unlockChapter: 1,
      completedBy: "goremuNasu",
      rewardText: "80Gと蒼の設備核",
      reward: { gold: 80 },
    },
    disasterResponse: {
      id: "disasterResponse",
      title: "避難経路の再確認",
      description: "封牙洞の防災設備を復旧し、住人が逃げられる道を確保する。",
      unlockChapter: 2,
      completedBy: "ferubaito",
      rewardText: "災害時のお守りセット",
      reward: { items: [{ itemId: "saigaiOmamoriSet", count: 1 }] },
    },
    largeNotice: {
      id: "largeNotice",
      title: "大きな文字の通知書",
      description: "インク・ジェネレーションが読める大きさの通知書を用意する。",
      unlockChapter: 4,
      npcId: "roujinInk",
      trustGain: 2,
      rewardText: "増殖する注意書き札",
      reward: { items: [{ itemId: "chirashiNoOfuda", count: 1 }] },
    },
    ghostMoveOut: {
      id: "ghostMoveOut",
      title: "幻の入居者の退去手続き",
      description: "住所だけを求めて残っている入居者の退去届を受理する。",
      unlockChapter: 4,
      npcId: "maboroshiNyuukyosha",
      trustGain: 2,
      rewardText: "40G",
      reward: { gold: 40 },
    },
  };

  // シェアハウス台帳との接続。専用データモジュールの正本を、
  // 既存データと同じ読み取り専用APIとして公開する。
  const SHARE_HOUSE_CONTENT = (window.RPG.shareHouseContentCatalog || []).map(function (entry) {
    return Object.assign({}, entry);
  });
  const SHARE_HOUSE_CONTENT_BY_CATEGORY = SHARE_HOUSE_CONTENT.reduce(function (groups, entry) {
    groups[entry.category] = groups[entry.category] || [];
    groups[entry.category].push(entry.id);
    return groups;
  }, {});
  MANAGEMENT_CASES.waterInspection.contentIds = ["shareHouseContent_theme_01", "shareHouseContent_event_01"];
  MANAGEMENT_CASES.disasterResponse.contentIds = ["shareHouseContent_theme_06", "shareHouseContent_bossGimmick_06"];
  MANAGEMENT_CASES.largeNotice.contentIds = ["shareHouseContent_theme_08", "shareHouseContent_notice_09"];
  MANAGEMENT_CASES.ghostMoveOut.contentIds = ["shareHouseContent_theme_03", "shareHouseContent_event_13"];

  // ---------------------------------------------------------------------
  // 8. パッケージC追加分(新要素: 敵AI行動パターン/中ボス2フェーズ拡張/
  //    レアモンスター)。既存の MONSTERS / ENCOUNT_TABLES の値は一切変更せず、
  //    このセクションのみを独立して追記する(A/B担当の同時編集と衝突しないため)。
  // ---------------------------------------------------------------------

  // C-1: 敵AI行動パターン(aiType)。既存モンスター定義オブジェクトへの
  // 追記は既存キーの値変更を伴わないプロパティ追加のみに留める。
  // aggressive: HP30%以下で全力攻撃(防御無視)
  // defensive : HP50%以下でぼうぎょ率上昇
  // caster    : MPがあれば呪文優先
  // support   : 味方(他モンスター)の低HP時に回復
  // flee      : 常に逃走を試みる(メタルほしくず専用)
  // 未指定(デフォルト)は現行動作(ランダム攻撃)のまま。
  const MONSTER_AI_TYPES = {
    kiribakemono: "caster",
    fuurouNoBoukon: "support",
    hakoNoYami: "caster",
    yamiNoKanshisha: "caster",
    tasogareKishiDaichou: "aggressive",
    goremuNasu: "defensive",
    ferubaito: "aggressive",
    metalHoshikuzu: "flee"
  };
  Object.keys(MONSTER_AI_TYPES).forEach(function (monsterId) {
    if (MONSTERS[monsterId]) {
      MONSTERS[monsterId].aiType = MONSTER_AI_TYPES[monsterId];
    }
  });

  // C-2: 中ボス2フェーズ化(隊長/監視者)。zorugadia.phase2 と同じ機構
  // (hpThreshold + statBonus + 専用セリフ)を battle.js 側の
  // applyBossPhase2IfNeeded() がそのまま流用できる形式で追記する。
  if (MONSTERS.tasogareKishiDaichou && !MONSTERS.tasogareKishiDaichou.phase2) {
    MONSTERS.tasogareKishiDaichou.phase2 = {
      hpThreshold: 0.5,
      statBonus: { chikara: 6 },
      quote: "黄昏騎士隊長「まだだ……まだ　終わらぬ！」"
    };
  }
  if (MONSTERS.yamiNoKanshisha && !MONSTERS.yamiNoKanshisha.phase2) {
    MONSTERS.yamiNoKanshisha.phase2 = {
      hpThreshold: 0.5,
      statBonus: { kashikosa: 4 },
      specialSpell: { id: "yamiNoSaimin", name: "闇縛りの呪", mpCost: 12, target: "enemySingle", effectType: "status", statusEffect: "sleep" },
      quote: "闇の監視者「深淵より　来たれ……」"
    };
  }
  // 監視者2フェーズ目専用呪文をSPELLSにも正式登録する(battle.jsのgetSpell()経由参照用)。
  if (!SPELLS.yamiNoSaimin) {
    SPELLS.yamiNoSaimin = { id: "yamiNoSaimin", name: "闇縛りの呪", mpCost: 12, target: "enemySingle", power: 0, element: null, effectType: "status", statusEffect: "sleep" };
  }

  // C-3: レアモンスター「メタルほしくず」。既存モンスター定義は変更せず、
  // 新規キーとして追加するのみ。
  if (!MONSTERS.metalHoshikuzu) {
    MONSTERS.metalHoshikuzu = {
      id: "metalHoshikuzu", name: "メタルほしくず",
      stats: { hp: 6, mp: 0, chikara: 4, mamori: 255, subayasa: 40, kashikosa: 4, un: 20 },
      exp: 800, gold: 30, dropTable: [],
      spriteShape: { shape: "diamond", color: "#c9d6e0", size: 16 },
      isBoss: false,
      aiType: "flee",
      resist: { fire: 0.5, ice: 0.5, thunder: 0.5, dark: 0 },
      description: "非常に高い回避率と、まもり255の硬い体を持つ幻のモンスター。すぐに逃げ出す。"
    };
  }

  // haigiriForest(灰霧の森) / tengaiRift(天蓋の破れ目) のエンカウントグループに
  // weight 2 で追加する。既存グループ配列を書き換えず、末尾へ追記のみ行う。
  if (ENCOUNT_TABLES.haigiriForest && Array.isArray(ENCOUNT_TABLES.haigiriForest.groups) &&
      !ENCOUNT_TABLES.haigiriForest.groups.some(function (g) { return g.monsterIds.indexOf("metalHoshikuzu") !== -1; })) {
    ENCOUNT_TABLES.haigiriForest.groups.push({ monsterIds: ["metalHoshikuzu"], weight: 2 });
  }
  if (ENCOUNT_TABLES.tengaiRift && Array.isArray(ENCOUNT_TABLES.tengaiRift.groups) &&
      !ENCOUNT_TABLES.tengaiRift.groups.some(function (g) { return g.monsterIds.indexOf("metalHoshikuzu") !== -1; })) {
    ENCOUNT_TABLES.tengaiRift.groups.push({ monsterIds: ["metalHoshikuzu"], weight: 2 });
  }


  // ---------------------------------------------------------------------
  // 公開
  // ---------------------------------------------------------------------
  window.RPG.data = {
    EXP_TABLE,
    JOBS,
    JOB_GROWTH,
    SPELLS,
    ITEMS,
    MONSTERS,
    ENCOUNT_TABLES,
    TILE_TYPES,
    MAPS,
    SCENARIO_TEXT,
    MANAGEMENT_CASES,
    SHARE_HOUSE_CONTENT,
    SHARE_HOUSE_CONTENT_BY_CATEGORY,
    SHOP_INVENTORY,
    INN_PRICES
  };
})();
