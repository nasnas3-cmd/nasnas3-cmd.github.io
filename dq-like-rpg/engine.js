// engine.js
// コアループ・グローバル状態管理・シーン遷移・セーブロード・共通ユーティリティ
// 依存: data.js (window.RPG.data)
// 提供: window.RPG.state, window.RPG.engine, window.RPG.save

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  const SAVE_KEY = "seisou_frontier_save_v2";
  const SAVE_VERSION = 2;
  const MAX_PARTY_SIZE = 4; // パーティ最大人数(DQ準拠)

  // ------------------------------------------------------------------
  // 可変状態 (RPG.state)
  // ------------------------------------------------------------------
  RPG.state = {
    scene: "title", // "title" | "field" | "town" | "dungeon" | "battle" | "menu"
    playTime: 0, // 秒
    party: [], // { name, job, level, exp, hp, maxHp, mp, maxMp, stats:{...}, equipment:{...}, spells:[...] }
    gold: 0,
    inventory: [], // { itemId, count }
    // タイトル画面で入力されたメイン主人公の名前。開始時点ではパーティに加わらず、
    // ストーリー中盤の仲間加入イベントで recruitMainHero() が呼ばれた際に使用する。
    heroName: "",
    flags: {
      chapter: 1,
      defeatedBosses: [],
      recruitedNpcs: [],
      // メイン主人公(タイトル入力名キャラ)が仲間に加わったか
      mainHeroRecruited: false,
      // シェアハウスの闇(中ボス shareHouseOverseer)を倒したか
      midBossDefeated: false,
      // よよよーがひよこ大王(chickEmperor)に変身し、パーティから離脱したか
      yoyoyoTransformed: false,
      // 転職の祠解放(最初のボス撃破)
      classChangeUnlocked: false,
      // 風来の勇者転職条件(全滅3回)
      metCriteriaForFuurai: false,
      defeatCount: 0,
      // シェアハウスの管理案件と本編進行
      shareHouseIntroSeen: false,
      managementCasesSolved: [],
      managementCasesActive: [],
      managementCasesReady: [],
      residentTrust: {},
      communityTrust: 0,
      shareHouseContentUnlocked: false,
      shareHouseContentDiscovered: [],
      gameCleared: false,
      postgameUnlocked: false,
      postgameStarted: false,
      postgameCleared: false,
      // 鍵扉/スイッチ等のマップギミック永続状態
      gimmicks: {},
    },
    position: { mapId: null, x: 0, y: 0 },
    starFragments: [],
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      z: false, // 決定
      x: false, // キャンセル
    },
  };

  // シーンハンドラレジストリ。各モジュール(map.js, battle.js, ui.js など)は
  // RPG.engine.registerScene("field", { enter, exit, update, render }) の形で登録する。
  const sceneHandlers = {};
  let currentSceneName = null;
  let currentSceneParams = null;
  let rafId = null;
  let lastTimestamp = 0;
  let canvas = null;
  let ctx = null;

  // ------------------------------------------------------------------
  // ユーティリティ
  // ------------------------------------------------------------------
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function deepClone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ------------------------------------------------------------------
  // パーティ / レベルアップ計算
  // ------------------------------------------------------------------

  // 指定レベルに到達するための累計必要経験値を取得
  function expForLevel(level) {
    const table = (RPG.data && RPG.data.EXP_TABLE) || [];
    if (level <= 1) return 0;
    const idx = level - 1; // EXP_TABLEはLv1からの累計必要経験値
    if (idx < 0) return 0;
    if (idx >= table.length) return Infinity;
    return table[idx] || 0;
  }

  function maxLevel() {
    const table = (RPG.data && RPG.data.EXP_TABLE) || [];
    return table.length;
  }

  // 職業成長率とレベルから基礎ステータスを再計算(転職時にも利用)
  function recalcStats(member) {
    const jobs = (RPG.data && RPG.data.JOBS) || {};
    const job = jobs[member.job];
    if (!job) return;
    const base = job.baseStats || {};
    const growth = job.growth || {};
    const level = member.level || 1;

    const stats = {};
    const statKeys = ["hp", "mp", "chikara", "mamori", "subayasa", "kashikosa", "un"];
    statKeys.forEach((key) => {
      const b = base[key] || 0;
      const g = growth[key] || 0;
      stats[key] = Math.floor(b + g * (level - 1));
    });

    member.stats = member.stats || {};
    Object.assign(member.stats, stats);

    const prevMaxHp = member.maxHp || 0;
    const prevMaxMp = member.maxMp || 0;
    const hpDiff = stats.hp - prevMaxHp;
    const mpDiff = stats.mp - prevMaxMp;

    member.maxHp = stats.hp;
    member.maxMp = stats.mp;

    // 新規作成時(prevMaxHpが0)はフルHP/MP、レベルアップ時は差分だけ回復させる
    if (prevMaxHp === 0) {
      member.hp = member.maxHp;
    } else if (hpDiff > 0) {
      member.hp = clamp((member.hp || 0) + hpDiff, 0, member.maxHp);
    } else {
      member.hp = clamp(member.hp || 0, 0, member.maxHp);
    }

    if (prevMaxMp === 0) {
      member.mp = member.maxMp;
    } else if (mpDiff > 0) {
      member.mp = clamp((member.mp || 0) + mpDiff, 0, member.maxMp);
    } else {
      member.mp = clamp(member.mp || 0, 0, member.maxMp);
    }
  }

  // 新規パーティメンバー作成
  let memberIdSeq = 0;

  // パーティメンバーの一意なID発行。name(表示名)は同職業を複数雇うと重複しうるため、
  // コマンド解決(戦闘の対象指定・commandQueueのキー等)は必ずこのidを使うこと。
  function generateMemberId() {
    memberIdSeq += 1;
    return "member_" + Date.now().toString(36) + "_" + memberIdSeq;
  }

  function createPartyMember(name, jobId, level) {
    const jobs = (RPG.data && RPG.data.JOBS) || {};
    const job = jobs[jobId];
    const member = {
      id: generateMemberId(),
      name: name,
      job: jobId,
      level: level || 1,
      exp: 0,
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      stats: {},
      equipment: { weapon: null, armor: null, accessory: null },
      spells: [],
    };
    recalcStats(member);
    // 初期習得呪文チェック
    checkLearnSpells(member);
    return member;
  }

  // レベルに応じた習得呪文をチェックし、新規呪文があれば member.spells に追加して返す
  function checkLearnSpells(member) {
    const jobs = (RPG.data && RPG.data.JOBS) || {};
    const job = jobs[member.job];
    if (!job || !job.learnableSpells) return [];
    const newlyLearned = [];
    job.learnableSpells.forEach((entry) => {
      // entry: { spellId, level } を想定
      const reqLevel = entry.level || entry.lv || 1;
      const spellId = entry.spellId || entry.id;
      if (member.level >= reqLevel && member.spells.indexOf(spellId) === -1) {
        member.spells.push(spellId);
        newlyLearned.push(spellId);
      }
    });
    return newlyLearned;
  }

  // 経験値付与とレベルアップ処理
  function gainExp(partyMember, exp) {
    if (!partyMember || exp <= 0) return { leveledUp: false, newLevels: 0, newSpells: [] };
    partyMember.exp += exp;

    let leveledUp = false;
    let newLevels = 0;
    let newSpells = [];
    const cap = maxLevel();

    // C-7: レベルアップ演出用に、レベルアップ直前のステータスを記録しておく。
    const statsBefore = Object.assign({}, partyMember.stats || {});
    const maxHpBefore = partyMember.maxHp || 0;
    const maxMpBefore = partyMember.maxMp || 0;

    while (partyMember.level < cap) {
      const needed = expForLevel(partyMember.level + 1);
      if (partyMember.exp >= needed) {
        partyMember.level += 1;
        leveledUp = true;
        newLevels += 1;
        recalcStats(partyMember);
        const learned = checkLearnSpells(partyMember);
        newSpells = newSpells.concat(learned);
      } else {
        break;
      }
    }

    if (leveledUp) {
      if (window.RPG.Audio) window.RPG.Audio.playSe("levelup");
      // C-7: レベルアップ演出(黄フラッシュ+上昇ステータス表示)をui.js側に依頼する。
      if (window.RPG.ui && typeof window.RPG.ui.showLevelUp === "function") {
        const statsAfter = partyMember.stats || {};
        const statDiff = {
          maxHp: (partyMember.maxHp || 0) - maxHpBefore,
          maxMp: (partyMember.maxMp || 0) - maxMpBefore,
          chikara: (statsAfter.chikara || 0) - (statsBefore.chikara || 0),
          mamori: (statsAfter.mamori || 0) - (statsBefore.mamori || 0),
          subayasa: (statsAfter.subayasa || 0) - (statsBefore.subayasa || 0),
          kashikosa: (statsAfter.kashikosa || 0) - (statsBefore.kashikosa || 0),
          un: (statsAfter.un || 0) - (statsBefore.un || 0),
        };
        window.RPG.ui.showLevelUp(partyMember, newLevels, statDiff);
      }
    }

    return { leveledUp, newLevels, newSpells };
  }

  function gainGold(amount) {
    RPG.state.gold = Math.max(0, (RPG.state.gold || 0) + (amount || 0));
    return RPG.state.gold;
  }

  function spendGold(amount) {
    amount = amount || 0;
    if (RPG.state.gold < amount) return false;
    RPG.state.gold -= amount;
    return true;
  }

  // ------------------------------------------------------------------
  // シーン管理
  // ------------------------------------------------------------------

  // 他モジュールがシーンハンドラを登録するためのAPI
  function registerScene(name, handler) {
    sceneHandlers[name] = handler || {};
  }

  // C-8: マップ切替時フェード演出対象のシーン(field/town/dungeon間のみ)。
  // battle等への遷移は既存の演出(ボス登場フラッシュ等)と衝突しないよう対象外。
  const FADE_SCENES = { field: true, town: true, dungeon: true };

  function changeScene(sceneName, params) {
    const prevSceneName = currentSceneName;
    const shouldFade = FADE_SCENES[prevSceneName] && FADE_SCENES[sceneName];

    const doChange = function () {
      // 戦闘終了後に元のマップシーンへ戻れるよう、マップ系シーンから戦闘へ
      // 遷移する時点で元シーン名を記録する。battle.js側のenter時点では
      // currentSceneが既に"battle"になっており記録できないため、ここで行う。
      if (sceneName === "battle" && RPG.state &&
          (prevSceneName === "field" || prevSceneName === "town" || prevSceneName === "dungeon")) {
        RPG.state.previousScene = prevSceneName;
      }

      const prevHandler = prevSceneName && sceneHandlers[prevSceneName];
      if (prevHandler && typeof prevHandler.exit === "function") {
        try {
          prevHandler.exit();
        } catch (e) {
          console.error("[RPG.engine] scene exit error:", e);
        }
      }

      currentSceneName = sceneName;
      currentSceneParams = params || {};
      RPG.state.scene = sceneName;

      // 全滅時に町へ強制送還するための復帰先座標を記録しておく。
      // (mapId等が無いと RPG.map.enterField() が未定義のマップIDでエラーになる)
      if (sceneName === "town" && params && params.mapId) {
        RPG.state.lastTownPosition = { mapId: params.mapId, x: params.x, y: params.y };
      }

      const nextHandler = sceneHandlers[sceneName];
      if (nextHandler && typeof nextHandler.enter === "function") {
        try {
          nextHandler.enter(currentSceneParams);
        } catch (e) {
          console.error("[RPG.engine] scene enter error:", e);
        }
      }

      if (shouldFade) fadeSceneTransition(false);
    };

    if (shouldFade) {
      fadeSceneTransition(true, doChange);
    } else {
      doChange();
    }
  }

  // C-8のフェード用オーバーレイ。index.html/styles.cssを変更せず、
  // engine.js側でDOM/スタイルを都度生成する(ui.jsのkey-guide overlayと同方式)。
  let fadeOverlayEl = null;
  function ensureFadeOverlay() {
    if (fadeOverlayEl) return fadeOverlayEl;
    const el = document.createElement("div");
    el.id = "rpg-scene-fade";
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.background = "#000";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "9997";
    el.style.transition = "opacity 0.3s ease";
    document.body.appendChild(el);
    fadeOverlayEl = el;
    return el;
  }

  // fadeOut=true: 黒くフェードアウトしてからonMid()を呼ぶ。
  // fadeOut=false: (画面切替後に呼び)黒からフェードインして通常表示に戻す。
  function fadeSceneTransition(fadeOut, onMid) {
    const el = ensureFadeOverlay();
    if (fadeOut) {
      el.style.opacity = "1";
      window.setTimeout(function () {
        if (typeof onMid === "function") onMid();
      }, 300);
    } else {
      // 描画が1フレーム進んでから薄くする(遷移直後の黒画面を確実に見せるため)
      window.requestAnimationFrame(function () {
        el.style.opacity = "0";
      });
    }
  }

  function getCurrentScene() {
    return currentSceneName;
  }

  // ------------------------------------------------------------------
  // メインループ
  // ------------------------------------------------------------------
  function tick(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    RPG.state.playTime += dt;

    const handler = sceneHandlers[currentSceneName];
    if (handler) {
      if (typeof handler.update === "function") {
        try {
          handler.update(dt);
        } catch (e) {
          console.error("[RPG.engine] scene update error:", e);
        }
      }
      if (typeof handler.render === "function") {
        try {
          handler.render(ctx);
        } catch (e) {
          console.error("[RPG.engine] scene render error:", e);
        }
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId != null) return;
    lastTimestamp = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ------------------------------------------------------------------
  // 入力処理 (矢印キー + Z/X)
  // ------------------------------------------------------------------
  // Enter は Z(決定)、Escape/Backspace は X(キャンセル)の別名として
  // すべての画面(タイトル/キャラ作成/メニュー/戦闘/会話送り/ショップ等)で
  // 共通に扱う。ここで正規化しておけば各シーン側は z/x だけを見ればよい。
  const KEY_MAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    KeyZ: "z",
    KeyX: "x",
    Enter: "z",
    NumpadEnter: "z",
    Escape: "x",
    Backspace: "x",
    z: "z",
    Z: "z",
    x: "x",
    X: "x",
  };

  function resolveInputKey(e) {
    return KEY_MAP[e.code] || KEY_MAP[e.key];
  }

  // input/textarea等にフォーカスがある間はゲーム入力として扱わない
  // (名前入力欄でのz/x/矢印キーがゲーム操作に奪われるのを防ぐ)。
  function isTypingIntoField(e) {
    const target = e.target;
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  function onKeyDown(e) {
    if (isTypingIntoField(e)) return;
    const key = resolveInputKey(e);
    if (!key) return;
    if (!RPG.state.input[key]) {
      RPG.state.input[key] = true;
      RPG.state.input._justPressed = RPG.state.input._justPressed || {};
      RPG.state.input._justPressed[key] = true;
    }
    e.preventDefault();
  }

  function onKeyUp(e) {
    if (isTypingIntoField(e)) return;
    const key = resolveInputKey(e);
    if (!key) return;
    RPG.state.input[key] = false;
    e.preventDefault();
  }

  // 「押した瞬間」の判定。呼び出し側が一度読んだらリセットする用途。
  function consumeJustPressed(key) {
    const jp = RPG.state.input._justPressed;
    if (jp && jp[key]) {
      jp[key] = false;
      return true;
    }
    return false;
  }

  function bindInput() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // ------------------------------------------------------------------
  // グローバルショートカット (M=メニュー / T=タイトルに戻る / B=BGM ON/OFF)
  // ------------------------------------------------------------------
  // フィールド(field/town/dungeon)でのみ有効。戦闘中・会話送り中・メニュー操作中・
  // タイトル確認ダイアログ表示中は誤爆を防ぐため無視する。
  const FIELD_SCENES = { field: true, town: true, dungeon: true };
  let titleConfirmOpen = false; // 「タイトルにもどりますか?」ダイアログ表示中フラグ

  function isShortcutBlocked() {
    // フィールド系シーン以外(戦闘/タイトル/エンディング等)では無効。
    if (!FIELD_SCENES[RPG.state.scene]) return true;
    // 会話送り中(メッセージウィンドウ表示中)は無効。
    const ui = RPG.ui;
    if (ui && typeof ui.isMessageBusy === "function" && ui.isMessageBusy()) return true;
    // メニュー操作中(ステータス/どうぐ/隊列変更等の選択中)は無効。
    if (ui && typeof ui.isMenuOpen === "function" && ui.isMenuOpen()) return true;
    // タイトル確認ダイアログ表示中の二重発火防止。
    if (titleConfirmOpen) return true;
    return false;
  }

  function openMenuShortcut() {
    if (isShortcutBlocked()) return;
    const ui = RPG.ui;
    if (ui && typeof ui.openFieldMenu === "function") {
      ui.openFieldMenu();
    }
  }

  // 「タイトルにもどりますか? はい/いいえ」の確認ダイアログ。
  // 未セーブ進行が消える操作のため、必ず確認を挟む。
  function confirmReturnToTitle() {
    if (isShortcutBlocked()) return;
    const ui = RPG.ui;
    if (!ui || typeof ui.openMenu !== "function") return;

    titleConfirmOpen = true;
    ui.openMenu("command", {
      items: [
        { label: "はい", value: "yes" },
        { label: "いいえ", value: "no" },
      ],
       title: "タイトルへ戻りますか？",
      onSelect: function (item) {
        ui.closeMenu();
        titleConfirmOpen = false;
        if (item.value === "yes") {
          changeScene("title", {});
        }
      },
      onCancel: function () {
        ui.closeMenu();
        titleConfirmOpen = false;
      },
    });
  }

  function toggleBgmShortcut() {
    if (isShortcutBlocked()) return;
    if (window.RPG.Audio && typeof window.RPG.Audio.toggleMute === "function") {
      window.RPG.Audio.toggleMute();
    }
  }

  function onGlobalShortcutKeyDown(e) {
    if (isTypingIntoField(e)) return;
    const code = e.code;
    const key = e.key;

    if (code === "KeyM" || key === "m" || key === "M") {
      openMenuShortcut();
    } else if (code === "KeyT" || key === "t" || key === "T") {
      confirmReturnToTitle();
    } else if (code === "KeyB" || key === "b" || key === "B") {
      toggleBgmShortcut();
    }
  }

  function bindGlobalShortcuts() {
    window.addEventListener("keydown", onGlobalShortcutKeyDown);
  }

  // ------------------------------------------------------------------
  // 画面隅の操作ガイド表示(控えめなオーバーレイ)
  // ------------------------------------------------------------------
  function createKeyGuideOverlay() {
    if (document.getElementById("rpg-key-guide")) return;
    const el = document.createElement("div");
    el.id = "rpg-key-guide";
    el.textContent = "移動:矢印  決定:Z/Enter  戻る:X/Esc  メニュー:M  BGM:B  タイトル:T";
    el.style.position = "absolute";
    el.style.right = "6px";
    el.style.bottom = "4px";
    el.style.padding = "2px 6px";
    el.style.fontSize = "12px";
    el.style.lineHeight = "1.4";
    el.style.color = "rgba(220,220,220,0.8)";
    el.style.background = "rgba(0,0,0,0.35)";
    el.style.borderRadius = "4px";
    el.style.fontFamily = "inherit";
    el.style.pointerEvents = "none";
    el.style.zIndex = "9999";
    el.style.userSelect = "none";
    // マップ画面の黒い余白内に配置し、タイトルや戦闘画面では表示しない。
    const mapScreen = document.getElementById("screen-map");
    (mapScreen || document.getElementById("game-root") || document.body).appendChild(el);
  }

  // ------------------------------------------------------------------
  // 初期化 / 新規ゲーム開始
  // ------------------------------------------------------------------
  function init() {
    // フィールド/町/ダンジョン用キャンバス(メインループの描画対象)
    canvas = document.getElementById("canvas-map") || document.querySelector("canvas");
    if (canvas) {
      ctx = canvas.getContext("2d");
    }

    bindInput();
    bindGlobalShortcuts();
    createKeyGuideOverlay();
    setupRecruitEvents();

    // シーンハンドラが未登録でも安全に動くようデフォルトのtitleハンドラを用意
    if (!sceneHandlers.title) {
      registerScene("title", {
        enter: function () {
          console.log("[RPG.engine] title scene (no ui.js handler registered yet)");
        },
      });
    }

    changeScene("title", {});
    startLoop();
  }

  function startNewGame(heroName) {
    const data = RPG.data || {};
    RPG.state.playTime = 0;
    RPG.state.gold = 0;
    RPG.state.inventory = [];
    RPG.state.flags = {
      chapter: 1,
      defeatedBosses: [],
      recruitedNpcs: [],
      mainHeroRecruited: false,
      midBossDefeated: false,
      yoyoyoTransformed: false,
      classChangeUnlocked: false,
      metCriteriaForFuurai: false,
      defeatCount: 0,
      shareHouseIntroSeen: false,
      managementCasesSolved: [],
      managementCasesActive: [],
      managementCasesReady: [],
      residentTrust: {},
      communityTrust: 0,
      shareHouseContentUnlocked: false,
      shareHouseContentDiscovered: [],
      gameCleared: false,
      postgameUnlocked: false,
      postgameStarted: false,
      postgameCleared: false,
      gimmicks: {},
    };
    RPG.state.starFragments = [];

    // タイトル画面で入力された名前は、中盤のNPCイベントで recruitMainHero() が
    // 呼ばれるまでパーティには加わらない(旅立ちの時点ではひよこ勇者よよよー単独)。
    RPG.state.heroName = heroName || "副管理人";

    // 旅の始まりは「ひよこ勇者よよよー」1人のみ。
    const yoyoyo = createPartyMember("よよよー", "yoyoyo", 1);
    RPG.state.party = [yoyoyo];

    // 初期位置(序章:ミレスタ村)
    const startMapId = "milesta";
    let startX = 5;
    let startY = 5;
    if (data.MAPS && data.MAPS[startMapId]) {
      const map = data.MAPS[startMapId];
      if (map.startX != null) startX = map.startX;
      if (map.startY != null) startY = map.startY;
    }
    RPG.state.position = { mapId: startMapId, x: startX, y: startY };

    changeScene("town", { mapId: startMapId, x: startX, y: startY });

    // 新しい物語の導入は、町シーンへ入った後にメッセージキューへ積む。
    const intro = data.SCENARIO_TEXT && data.SCENARIO_TEXT.prologue;
    if (RPG.ui && typeof RPG.ui.showMessage === "function" && Array.isArray(intro)) {
      intro.forEach(function (line) { RPG.ui.showMessage(line); });
    }
  }

  function getParty() {
    return RPG.state.party;
  }

  // ------------------------------------------------------------------
  // 仲間加入
  // ------------------------------------------------------------------

  // 現在のパーティ人数が上限未満か。加入イベントの順番によらず、
  // 空き枠があれば仲間を増やせるようにする。
  function canRecruit() {
    return (RPG.state.party || []).length < MAX_PARTY_SIZE;
  }

  // 指定NPCが加入済みかどうか。defeatedBosses と同じ「フラグ配列にIDを積む」パターンで
  // flags.recruitedNpcs に記録し、map.js の talkToNpc が再訪問時の台詞切替に使う。
  function isNpcRecruited(recruitId) {
    const recruited = (RPG.state.flags && RPG.state.flags.recruitedNpcs) || [];
    return !!recruitId && recruited.indexOf(recruitId) !== -1;
  }

  // イベントNPC(行商人/癒しの巫女等)や酒場的施設からの仲間加入共通処理。
  // 同一recruitIdの重複加入を防ぐため、加入済みIDは flags.recruitedNpcs に記録する(セーブ対象)。
  // 戻り値: { success, member, reason }
  function recruitMember(recruitId, name, jobId, level) {
    RPG.state.flags = RPG.state.flags || {};
    const recruited = RPG.state.flags.recruitedNpcs = RPG.state.flags.recruitedNpcs || [];

    if (recruitId && recruited.indexOf(recruitId) !== -1) {
      return { success: false, reason: "already_recruited" };
    }
    if (!canRecruit()) {
      return { success: false, reason: "party_full" };
    }

    const member = createPartyMember(name, jobId, level || 1);
    RPG.state.party.push(member);
    if (recruitId) {
      recruited.push(recruitId);
    }
    return { success: true, member: member };
  }

  function maxPartySize() {
    return MAX_PARTY_SIZE;
  }

  // ------------------------------------------------------------------
  // メインシナリオ: メイン主人公の仲間加入 / よよよーの変身離脱
  // ------------------------------------------------------------------

  // 中盤のNPCイベント(実際のNPC配置・会話文はui.js/map.js担当)から呼ばれる。
  // タイトル画面入力名のメイン主人公(暁の剣士)をパーティに加える。
  // 戻り値: { success, member, reason }
  function recruitMainHero() {
    RPG.state.flags = RPG.state.flags || {};
    if (RPG.state.flags.mainHeroRecruited) {
      return { success: false, reason: "already_recruited" };
    }
    // ここは canRecruit() ではなく MAX_PARTY_SIZE を直接見る。canRecruit() は
    // メイン主人公未加入の間、通常NPC加入用に1枠予約する分だけ厳しい判定に
    // なっており、その予約枠こそがまさにこのメイン主人公加入のためのものだから。
    if ((RPG.state.party || []).length >= MAX_PARTY_SIZE) {
      return { success: false, reason: "party_full" };
    }

    const heroJobId = "akatsukiKenshi";
    const heroName = RPG.state.heroName || "勇者";
    const hero = createPartyMember(heroName, heroJobId, 1);
    RPG.state.party.push(hero);
    RPG.state.flags.mainHeroRecruited = true;

    return { success: true, member: hero };
  }

  // 中ボス shareHouseOverseer 撃破直後、battle.js から呼ばれる。
  // よよよーをパーティから除去し、ひよこ大王(chickEmperor)への変身が
  // 完了したことを示す yoyoyoTransformed フラグを立てる。
  // 実際の変身カットシーン(セリフ表示)はui.js側が担当する。
  // 戻り値: { success, member, reason }
  function transformYoyoyo() {
    RPG.state.flags = RPG.state.flags || {};
    if (RPG.state.flags.yoyoyoTransformed) {
      return { success: false, reason: "already_transformed" };
    }

    const party = RPG.state.party || [];
    const index = party.findIndex((m) => m && m.job === "yoyoyo");
    let removed = null;
    if (index !== -1) {
      removed = party.splice(index, 1)[0];
    }

    RPG.state.flags.yoyoyoTransformed = true;

    return { success: true, member: removed };
  }

  // data.js の MAPS 上のNPC定義に、会話イベント用の onTalk コールバックを実行時に付与する。
  // NPC定義自体(data.js)は関数を持たない純粋データのままにしたいので、
  // ここで "recruit"(仲間加入NPC) / "guildHall"(酒場での職業選択加入) の
  // マーカーを見て初期化時に一度だけ処理を差し込む。
  function setupRecruitEvents() {
    const maps = (RPG.data && RPG.data.MAPS) || {};
    Object.keys(maps).forEach((mapId) => {
      const mapDef = maps[mapId];
      if (!mapDef || !Array.isArray(mapDef.npcs)) return;
      mapDef.npcs.forEach((npc) => {
        if (npc.recruit && !npc.onTalk) {
          npc.onTalk = function () {
            handleRecruitTalk(npc);
          };
        } else if (npc.guildHall && !npc.onTalk) {
          npc.onTalk = function () {
            handleGuildHallTalk(npc);
          };
        }
      });
    });
  }

  // シナリオイベントNPC(行商人/癒しの巫女など)との会話終了後に呼ばれる加入処理
  function handleRecruitTalk(npc) {
    const ui = RPG.ui;
    const recruit = npc.recruit || {};
    const result = recruitMember(npc.id, npc.name, recruit.jobId, recruit.level);

    if (result.success) {
      const msg = npc.name + "が　なかまに　なった！";
      if (ui && typeof ui.showMessage === "function") {
        ui.showMessage(msg);
      } else {
        console.log("[RPG.engine] " + msg);
      }
    } else if (result.reason === "party_full") {
      const msg = "なかまが　これ以上　増やせない！(最大" + MAX_PARTY_SIZE + "人)";
      if (ui && typeof ui.showMessage === "function") {
        ui.showMessage(msg);
      } else {
        console.log("[RPG.engine] " + msg);
      }
    }
    // すでに加入済み(reason === "already_recruited")の場合は何も表示しない
    // (会話の台詞自体が再訪問時の雑談として成立するようにする)。
  }

  // 酒場的施設(職業選択で仲間を作れるルイーダ相当のNPC)との会話終了後に呼ばれる
  function handleGuildHallTalk(npc) {
    const ui = RPG.ui;
    if (ui && typeof ui.openGuildHall === "function") {
      ui.openGuildHall(npc);
    } else {
      console.log("[RPG.engine] guild hall UI (ui.js) 未実装のため何もしません: " + npc.id);
    }
  }

  function getFlags() {
    return RPG.state.flags;
  }

  function isManagementCaseSolved(caseId) {
    const solved = (RPG.state.flags && RPG.state.flags.managementCasesSolved) || [];
    return solved.indexOf(caseId) !== -1;
  }

  function isManagementCaseActive(caseId) {
    const active = (RPG.state.flags && RPG.state.flags.managementCasesActive) || [];
    return active.indexOf(caseId) !== -1;
  }

  function isManagementCaseReady(caseId) {
    const ready = (RPG.state.flags && RPG.state.flags.managementCasesReady) || [];
    return ready.indexOf(caseId) !== -1;
  }

  function acceptManagementCase(caseId) {
    const cases = (RPG.data && RPG.data.MANAGEMENT_CASES) || {};
    const caseDef = cases[caseId];
    const chapter = (RPG.state.flags && RPG.state.flags.chapter) || 1;
    if (!caseDef || chapter < (caseDef.unlockChapter || 1) ||
        isManagementCaseSolved(caseId) || isManagementCaseActive(caseId)) return false;
    RPG.state.flags.managementCasesActive = RPG.state.flags.managementCasesActive || [];
    RPG.state.flags.managementCasesActive.push(caseId);
    discoverManagementCaseContent(caseDef);
    return true;
  }

  function markManagementCaseReady(caseId) {
    if (!isManagementCaseActive(caseId) || isManagementCaseSolved(caseId)) return false;
    RPG.state.flags.managementCasesReady = RPG.state.flags.managementCasesReady || [];
    if (RPG.state.flags.managementCasesReady.indexOf(caseId) === -1) {
      RPG.state.flags.managementCasesReady.push(caseId);
    }
    return true;
  }

  function completeManagementCase(caseId) {
    const cases = (RPG.data && RPG.data.MANAGEMENT_CASES) || {};
    const caseDef = cases[caseId];
    if (!caseDef || isManagementCaseSolved(caseId) || !isManagementCaseActive(caseId)) return null;

    discoverManagementCaseContent(caseDef);

    RPG.state.flags.managementCasesSolved = RPG.state.flags.managementCasesSolved || [];
    RPG.state.flags.managementCasesSolved.push(caseId);
    RPG.state.flags.managementCasesActive = (RPG.state.flags.managementCasesActive || [])
      .filter(function (id) { return id !== caseId; });
    RPG.state.flags.managementCasesReady = (RPG.state.flags.managementCasesReady || [])
      .filter(function (id) { return id !== caseId; });
    if (caseDef.npcId) {
      RPG.state.flags.residentTrust = RPG.state.flags.residentTrust || {};
      RPG.state.flags.residentTrust[caseDef.npcId] =
        (RPG.state.flags.residentTrust[caseDef.npcId] || 0) + (caseDef.trustGain || 1);
    }
    RPG.state.flags.communityTrust = (RPG.state.flags.communityTrust || 0) + (caseDef.trustGain || 1);
    const reward = caseDef.reward || {};
    if (reward.gold) gainGold(reward.gold);
    (reward.items || []).forEach(function (rewardItem) {
      const inventory = RPG.state.inventory = RPG.state.inventory || [];
      const entry = inventory.find(function (item) { return item.itemId === rewardItem.itemId; });
      if (entry) entry.count += rewardItem.count || 1;
      else inventory.push({ itemId: rewardItem.itemId, count: rewardItem.count || 1 });
    });
    return caseDef;
  }

  function getManagementCases() {
    return (RPG.data && RPG.data.MANAGEMENT_CASES) || {};
  }

  function getResidentTrust() {
    return Object.assign({}, (RPG.state.flags && RPG.state.flags.residentTrust) || {}, {
      community: (RPG.state.flags && RPG.state.flags.communityTrust) || 0,
    });
  }

  function getShareHouseContentCatalog() {
    return (RPG.data && Array.isArray(RPG.data.SHARE_HOUSE_CONTENT))
      ? RPG.data.SHARE_HOUSE_CONTENT
      : [];
  }

  function discoverShareHouseContent(contentId) {
    const catalog = getShareHouseContentCatalog();
    if (!catalog.some(function (entry) { return entry.id === contentId; })) return false;
    RPG.state.flags.shareHouseContentDiscovered = RPG.state.flags.shareHouseContentDiscovered || [];
    if (RPG.state.flags.shareHouseContentDiscovered.indexOf(contentId) !== -1) return false;
    RPG.state.flags.shareHouseContentDiscovered.push(contentId);
    return true;
  }

  function unlockShareHouseContent() {
    RPG.state.flags.shareHouseContentUnlocked = true;
    getShareHouseContentCatalog().forEach(function (entry) {
      discoverShareHouseContent(entry.id);
    });
    return RPG.state.flags.shareHouseContentDiscovered.length;
  }

  function getShareHouseContent() {
    const flags = RPG.state.flags || {};
    const discovered = flags.shareHouseContentDiscovered || [];
    return getShareHouseContentCatalog().map(function (entry) {
      const isDiscovered = flags.shareHouseContentUnlocked || discovered.indexOf(entry.id) !== -1;
      return Object.assign({}, entry, {
        discovered: isDiscovered,
        locked: !isDiscovered,
      });
    });
  }

  function discoverManagementCaseContent(caseDef) {
    (caseDef && caseDef.contentIds || []).forEach(discoverShareHouseContent);
  }

  // ------------------------------------------------------------------
  // セーブ / ロード (localStorage)
  // ------------------------------------------------------------------
  function serializeState() {
    return {
      version: SAVE_VERSION,
      playTime: Math.floor(RPG.state.playTime || 0),
      heroName: RPG.state.heroName || "",
      party: deepClone(RPG.state.party),
      gold: RPG.state.gold,
      inventory: deepClone(RPG.state.inventory),
      flags: deepClone(RPG.state.flags),
      position: deepClone(RPG.state.position),
      starFragments: deepClone(RPG.state.starFragments),
      // ロード後の復帰先シーン(field/town/dungeon)を保存しないと、
      // 常にfieldとして復帰させる呼び出し側実装と合わさり画面不整合が起きる。
      scene: RPG.state.scene,
    };
  }

  function saveGame() {
    try {
      const payload = serializeState();
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error("[RPG.save] save failed:", e);
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== SAVE_VERSION) {
        return null;
      }
      RPG.state.playTime = payload.playTime || 0;
      RPG.state.heroName = payload.heroName || "";
      RPG.state.party = Array.isArray(payload.party) ? payload.party : [];
      // セーブ後にJOBSデータの成長率等が変更されている場合に備え、
      // ロード時に必ずstats/呪文習得を最新ロジックで再計算する。
      // 不正/欠損メンバー(nameやjobが無い等)は除外し、battle.js側でのundefined参照を防ぐ。
      RPG.state.party = RPG.state.party.filter((m) => m && typeof m === "object" && m.job);
      RPG.state.party.forEach((member) => {
        member.equipment = member.equipment || { weapon: null, armor: null, accessory: null };
        member.spells = Array.isArray(member.spells) ? member.spells : [];
        member.level = member.level || 1;
        member.exp = member.exp || 0;
        recalcStats(member);
        checkLearnSpells(member);
      });
      RPG.state.gold = payload.gold || 0;
      RPG.state.inventory = payload.inventory || [];
      RPG.state.flags = payload.flags || { chapter: 1, defeatedBosses: [], recruitedNpcs: [] };
      RPG.state.flags.recruitedNpcs = RPG.state.flags.recruitedNpcs || [];
      RPG.state.flags.defeatedBosses = RPG.state.flags.defeatedBosses || [];
      // 旧セーブ互換: メインシナリオ用フラグが無ければ初期値で補う
      if (typeof RPG.state.flags.mainHeroRecruited !== "boolean") {
        RPG.state.flags.mainHeroRecruited = false;
      }
      if (typeof RPG.state.flags.midBossDefeated !== "boolean") {
        RPG.state.flags.midBossDefeated = false;
      }
      if (typeof RPG.state.flags.yoyoyoTransformed !== "boolean") {
        RPG.state.flags.yoyoyoTransformed = false;
      }
      if (typeof RPG.state.flags.classChangeUnlocked !== "boolean") {
        RPG.state.flags.classChangeUnlocked = !!(RPG.state.flags.defeatedBosses && RPG.state.flags.defeatedBosses.length > 0);
      }
      if (typeof RPG.state.flags.metCriteriaForFuurai !== "boolean") {
        RPG.state.flags.metCriteriaForFuurai = false;
      }
      if (typeof RPG.state.flags.defeatCount !== "number") {
        RPG.state.flags.defeatCount = 0;
      }
      RPG.state.flags.shareHouseIntroSeen = !!RPG.state.flags.shareHouseIntroSeen;
    RPG.state.flags.managementCasesSolved = Array.isArray(RPG.state.flags.managementCasesSolved)
        ? RPG.state.flags.managementCasesSolved : [];
      RPG.state.flags.managementCasesActive = Array.isArray(RPG.state.flags.managementCasesActive)
        ? RPG.state.flags.managementCasesActive : [];
      RPG.state.flags.managementCasesReady = Array.isArray(RPG.state.flags.managementCasesReady)
        ? RPG.state.flags.managementCasesReady : [];
      RPG.state.flags.residentTrust = RPG.state.flags.residentTrust && typeof RPG.state.flags.residentTrust === "object"
        ? RPG.state.flags.residentTrust : {};
      RPG.state.flags.communityTrust = Number(RPG.state.flags.communityTrust) || 0;
      RPG.state.flags.shareHouseContentUnlocked = !!RPG.state.flags.shareHouseContentUnlocked;
      RPG.state.flags.shareHouseContentDiscovered = Array.isArray(RPG.state.flags.shareHouseContentDiscovered)
        ? RPG.state.flags.shareHouseContentDiscovered : [];
      RPG.state.flags.gameCleared = !!RPG.state.flags.gameCleared;
      RPG.state.flags.postgameUnlocked = !!RPG.state.flags.postgameUnlocked;
      RPG.state.flags.postgameStarted = !!RPG.state.flags.postgameStarted;
      RPG.state.flags.postgameCleared = !!RPG.state.flags.postgameCleared;
      if (!RPG.state.flags.gimmicks || typeof RPG.state.flags.gimmicks !== "object") {
        RPG.state.flags.gimmicks = {};
      }
      RPG.state.position = payload.position || { mapId: null, x: 0, y: 0 };
      RPG.state.starFragments = payload.starFragments || [];
      // セーブ時のシーン(town/dungeon)を復元する。未保存の旧セーブや不正値の場合は
      // fieldにフォールバックする(battle/menu等の一時シーンには復帰させない)。
      const restorableScenes = { field: true, town: true, dungeon: true };
      RPG.state.scene = restorableScenes[payload.scene] ? payload.scene : "field";
      return RPG.state;
    } catch (e) {
      console.error("[RPG.save] load failed:", e);
      return null;
    }
  }

  function hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      // 単に localStorage にキーがあるかだけでなく、loadGame() と同じ条件
      // (version一致)で検証する。ここが単純な存在チェックのままだと、
      // 古い形式のセーブが残っている場合に「つづきから」ボタンは有効になる
      // のに、実際にクリックすると loadGame() が version 不一致で null を
      // 返し、何も起きない(選択できない/機能しない)という不具合になる。
      const payload = JSON.parse(raw);
      return !!payload && payload.version === SAVE_VERSION;
    } catch (e) {
      return false;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      console.error("[RPG.save] clear failed:", e);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------
  RPG.engine = {
    init: init,
    startNewGame: startNewGame,
    changeScene: changeScene,
    getCurrentScene: getCurrentScene,
    registerScene: registerScene,
    gainExp: gainExp,
    gainGold: gainGold,
    spendGold: spendGold,
    getParty: getParty,
    getFlags: getFlags,
    isManagementCaseSolved: isManagementCaseSolved,
    isManagementCaseActive: isManagementCaseActive,
    isManagementCaseReady: isManagementCaseReady,
    acceptManagementCase: acceptManagementCase,
    markManagementCaseReady: markManagementCaseReady,
    completeManagementCase: completeManagementCase,
    getManagementCases: getManagementCases,
    getResidentTrust: getResidentTrust,
    discoverShareHouseContent: discoverShareHouseContent,
    unlockShareHouseContent: unlockShareHouseContent,
    getShareHouseContent: getShareHouseContent,
    canRecruit: canRecruit,
    recruitMember: recruitMember,
    isNpcRecruited: isNpcRecruited,
    maxPartySize: maxPartySize,
    recruitMainHero: recruitMainHero,
    transformYoyoyo: transformYoyoyo,
    tick: tick,
    createPartyMember: createPartyMember,
    recalcStats: recalcStats,
    checkLearnSpells: checkLearnSpells,
    expForLevel: expForLevel,
    maxLevel: maxLevel,
    consumeJustPressed: consumeJustPressed,
    // 共通ユーティリティ
    utils: {
      clamp: clamp,
      deepClone: deepClone,
      randInt: randInt,
    },
  };

  RPG.save = {
    save: saveGame,
    load: loadGame,
    hasSave: hasSave,
    clear: clearSave,
  };
})();
