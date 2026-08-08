// map.js
// フィールド/町/ダンジョン共通のタイル描画・移動・衝突判定・マップ遷移・
// ランダムエンカウント・NPC配置と会話トリガーを担当するモジュール。
// window.RPG.map として公開する。

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  const TILE_SIZE = 32; // 1タイルの描画サイズ(px)
  const MOVE_DURATION = 0.15; // 1マス移動にかかる秒数

  // 方向定義: dx, dy, 向きID
  const DIRECTIONS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  // 内部状態
  const mapState = {
    mapId: null,
    mapDef: null,
    tiles: null,
    width: 0,
    height: 0,
    areaId: null,
    warps: [],
    npcs: [],
    stepsSinceEncounter: 0,

    // プレイヤー位置(タイル座標)
    playerX: 0,
    playerY: 0,
    // 描画用の補間位置(タイル座標系の実数)
    renderX: 0,
    renderY: 0,
    facing: "down",

    // 移動アニメーション制御
    isMoving: false,
    moveElapsed: 0,
    moveFromX: 0,
    moveFromY: 0,
    moveToX: 0,
    moveToY: 0,

    // 入力状態
    pressedKeys: {},
    lastInputDir: null,

    // 会話・イベント中は移動不可
    inputLocked: false,

    // カメラ(タイル単位)
    cameraX: 0,
    cameraY: 0,

    // 主人公の移動履歴(隊列表示用)。各要素は { x, y } のタイル座標。
    // 先頭(index 0)が最新の主人公位置で、末尾ほど過去の位置。
    // 2人目以降のパーティメンバーはこの履歴を1マスずつ遅れて辿ることで
    // DQ風の隊列歩行を表現する。
    trail: [],

    // よよよー変身カットシーン用の一時的なオーバーレイ演出。
    // null以外の場合、render()がフィールド描画の上に暗転+ボスの大写しを重ねる。
    cutsceneMonster: null,

    // ギミック: マップ進入時にtiles配列をdeep cloneし、鍵扉/スイッチ壁の
    // 開閉状態をここで保持する(data.jsのMAPS定義自体は書き換えない)。
    darknessConfig: null,
  };

  const TRAIL_MAX_LENGTH = 32; // MAX_PARTY_SIZE(4)より十分大きい余裕を持たせる

  // ------------------------------------------------------------------
  // シナリオイベント: 契約監査人(タイトル入力名)の中盤加入
  // ------------------------------------------------------------------
  // data.js のNPC定義(recruit:{jobId,level})は既存の職業仲間用の汎用パターンで、
  // engine.js側のsetupRecruitEvents()が自動でonTalkを差し込む方式になっている。
  // メイン主人公の加入はタイトル入力名を使う特別処理(RPG.engine.recruitMainHero())
  // のため、data.jsを変更せずmap.js側でNPCを動的に配置し、専用のonTalkを持たせる。
  const MAIN_HERO_EVENT_MAP_ID = "varenshtadt";
  const MAIN_HERO_EVENT_NPC_ID = "mainHeroWandererNpc";
  const MAIN_HERO_EVENT_X = 10;
  const MAIN_HERO_EVENT_Y = 9;

  function createMainHeroEventNpc() {
    const heroName = (RPG.state && RPG.state.heroName) || "旅人";
    return {
      id: MAIN_HERO_EVENT_NPC_ID,
    name: "契約監査人",
      x: MAIN_HERO_EVENT_X,
      y: MAIN_HERO_EVENT_Y,
      dialogues: [
        "バレンシュタットの契約書は、読めば読むほど項目が増える。",
        "あなたたちが集めた設備記録を見せてほしい。二重徴収の原因を追っているんだ。",
        "名を聞くより先に、こちらから名乗ろう。",
        "わたしは " + heroName + "。管理会社の契約監査人として、星霜荘に派遣された。",
        "副管理人よよよー、あなたの現場記録に署名する。今日から一緒に解決しよう。"
      ],
      afterRecruitDialogues: [
        "設備記録と契約書を照合しよう。数字は嘘をつかないが、書いた人はたまに間違える。"
      ],
      onTalk: function () {
        handleMainHeroRecruitTalk();
      }
    };
  }

  // マップ入場時、既存のNPC定義(data.js)には無いシナリオ限定NPCを動的に追加する。
  function injectScenarioNpcs(mapId) {
    if (mapId === MAIN_HERO_EVENT_MAP_ID) {
      mapState.npcs.push(createMainHeroEventNpc());
    }
    if (mapId === "shareHouseArea") {
      mapState.npcs.forEach(function (npc) {
        if (!npc.managementCase) return;
        npc.onTalk = function () {
          resolveManagementCase(npc.managementCase);
        };
      });
    }
  }

  function resolveManagementCase(caseId) {
    if (!RPG.state || !RPG.state.flags) return;
    const cases = (RPG.data && RPG.data.MANAGEMENT_CASES) || {};
    const caseDef = cases[caseId];
    if (RPG.engine && RPG.engine.isManagementCaseSolved && RPG.engine.isManagementCaseSolved(caseId)) {
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("この管理案件は　解決済みだ。次の相談を探そう。");
      }
      return;
    }
    if (RPG.engine && RPG.engine.isManagementCaseActive && RPG.engine.isManagementCaseActive(caseId)) {
      const completed = RPG.engine.completeManagementCase(caseId);
      if (completed && RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage(caseDef.title + "を　解決した！ " + (caseDef.rewardText || "報酬を受け取った。"));
      }
      return;
    }
    const chapter = (RPG.state.flags && RPG.state.flags.chapter) || 1;
    if (!caseDef || chapter < (caseDef.unlockChapter || 1)) {
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("この管理案件は　まだ　準備中だ。");
      }
      return;
    }
    const accepted = RPG.engine && RPG.engine.acceptManagementCase
      ? RPG.engine.acceptManagementCase(caseId) : false;
    if (accepted && RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage(caseDef.title + "を　受注した。\n" + caseDef.description);
    }
  }

  // メイン主人公加入NPCとの会話終了後に呼ばれる。加入処理自体は
  // engine.js の RPG.engine.recruitMainHero() (タイトル入力名で暁の剣士を作成し、
  // flags.mainHeroRecruited = true を立てる)に委譲する。
  function handleMainHeroRecruitTalk() {
    if (!RPG.engine || typeof RPG.engine.recruitMainHero !== "function") return;
    const result = RPG.engine.recruitMainHero();
    const ui = RPG.ui;
    if (!result) return;
    if (result.success) {
      const name = (RPG.state && RPG.state.heroName) || "なかま";
      if (ui && typeof ui.showMessage === "function") {
        ui.showMessage(name + "が　なかまに　なった！");
      }
    } else if (result.reason === "party_full") {
      if (ui && typeof ui.showMessage === "function") {
        ui.showMessage("なかまが　これ以上　増やせない！");
      }
    }
    // reason === "already_recruited" の場合は何もしない
    // (再訪問時はafterRecruitDialoguesのみで会話が完結する)。
  }

  const KEY_TO_DIR = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };

  let keyListenersAttached = false;

  function attachKeyListeners() {
    if (keyListenersAttached) return;
    keyListenersAttached = true;

    window.addEventListener("keydown", (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // 会話・メニュー等で入力ロック中は移動キーを蓄積しない
      // (ロック解除直後に押しっぱなしの方向へ勝手に動き出すのを防ぐ)。
      if (mapState.inputLocked || isUiBlocking()) return;

      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        mapState.pressedKeys[dir] = true;
        mapState.lastInputDir = dir;
      }
      // 決定キー(Enter/Space/Z)でNPC/タイルへの正面アクション。
      // メニュー操作のZ決定とキーを揃え、フィールドでも同じ決定キーで統一する。
      if (e.key === "Enter" || e.code === "NumpadEnter" || e.key === " " || e.key === "z" || e.key === "Z" || e.code === "KeyZ") {
        handleActionKey();
      }
    });

    window.addEventListener("keyup", (e) => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        mapState.pressedKeys[dir] = false;
      }
    });
  }

  // メニュー/メッセージ表示中かどうか。ui.jsのキーイベントはstopPropagationで
  // 遮断されるが、メニューを開く前から押しっぱなしの方向キー(pressedKeys)による
  // 移動継続はイベント経由ではないため、update側でもこの判定でガードする。
  function isUiBlocking() {
    const u = window.RPG && window.RPG.ui;
    if (!u) return false;
    if (typeof u.isMenuOpen === "function" && u.isMenuOpen()) return true;
    if (typeof u.isMessageBusy === "function" && u.isMessageBusy()) return true;
    return false;
  }

  function handleActionKey() {
    const dir = DIRECTIONS[mapState.facing];
    const tx = mapState.playerX + dir.dx;
    const ty = mapState.playerY + dir.dy;

    // 正面のNPCと会話
    const npc = findNpcAt(tx, ty);
    if (npc) {
      talkToNpc(npc);
      return;
    }

    // 現在地タイルのアクション(施設・階段・宝箱など)は移動時に処理されるため、
    // ここでは正面がアクション可能なタイル(宝箱等)かも確認する。
    const tile = getTile(tx, ty);
    if (tile != null) {
      RPG.map.onTileAction(tile, tx, ty);
    }
  }

  // 「しらべる」コマンド(メニュー): 正面のタイルを調べる。
  // 宝箱(walkable:falseで上には乗れない)はこれで開ける。
  // Zキー(handleActionKey)と違い、何も無い場合もメッセージで応答する。
  function inspectFront() {
    const dir = DIRECTIONS[mapState.facing];
    const tx = mapState.playerX + dir.dx;
    const ty = mapState.playerY + dir.dy;

    const npc = findNpcAt(tx, ty);
    if (npc) {
      talkToNpc(npc);
      return;
    }

    const tileId = getTile(tx, ty);
    const def = tileId != null ? getTileDef(tileId) : null;
    if (def && def.type === "chest") {
      openChest(tx, ty);
      return;
    }

    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage("しらべてみたが なにも みつからなかった。");
    }
  }

  // 加入イベントNPC(npc.recruit定義あり)が既に加入済みかどうか。
  // flags.recruitedNpcs (セーブ/ロード後も維持) を参照するため、リロード後も
  // 元NPCが再出現しない。
  function isNpcAlreadyRecruited(npc) {
    // メイン主人公加入NPCは汎用recruitパターンを使わない特別処理のため、
    // flags.mainHeroRecruited を直接見て判定する。
    if (npc && npc.id === MAIN_HERO_EVENT_NPC_ID) {
      return !!(RPG.state && RPG.state.flags && RPG.state.flags.mainHeroRecruited);
    }
    return !!(npc && npc.recruit && RPG.engine && typeof RPG.engine.isNpcRecruited === "function" && RPG.engine.isNpcRecruited(npc.id));
  }

  function findNpcAt(x, y) {
    return mapState.npcs.find((n) => n.x === x && n.y === y && !n.defeated && !isNpcAlreadyRecruited(n)) || null;
  }

  function talkToNpc(npc) {
    mapState.inputLocked = true;

    // 加入イベントNPCは、一度加入済みなら同じ勧誘台詞ではなく短い挨拶に切り替える。
    // 加入済み判定は engine.js の flags.recruitedNpcs (defeatedBossesと同じパターン) を使う。
    const alreadyRecruited = isNpcAlreadyRecruited(npc);
    const caseSolved = !!(npc.managementCase && RPG.engine && RPG.engine.isManagementCaseSolved &&
      RPG.engine.isManagementCaseSolved(npc.managementCase));
    const trust = RPG.engine && RPG.engine.getResidentTrust ? RPG.engine.getResidentTrust() : {};
    const highTrust = caseSolved && npc.id && (trust[npc.id] || 0) >= 2;
    let lines;
    if (alreadyRecruited) {
      lines = Array.isArray(npc.afterRecruitDialogues) && npc.afterRecruitDialogues.length
        ? npc.afterRecruitDialogues
        : ["がんばろうな！"];
    } else if (highTrust && Array.isArray(npc.highTrustDialogues) && npc.highTrustDialogues.length) {
      lines = npc.highTrustDialogues;
    } else if (caseSolved && Array.isArray(npc.afterCaseDialogues) && npc.afterCaseDialogues.length) {
      lines = npc.afterCaseDialogues;
    } else {
      lines = Array.isArray(npc.dialogues)
        ? npc.dialogues
        : (Array.isArray(npc.dialogue) ? npc.dialogue : [npc.dialogue || ""]);
    }
    let idx = 0;

    function showNext() {
      if (idx >= lines.length) {
        // 最後のメッセージを閉じる決定キー(Enter/Z)は、ui.js側の
        // waitForAdvanceハンドラ(document)→map.js側のアクションキー
        // ハンドラ(window)の順に、同一のkeydownイベント内で両方とも
        // 発火する。ここでinputLockedを同期的にfalseへ戻すと、
        // 会話を閉じたのと全く同じキー入力でhandleActionKey()が
        // 即座に再度実行され、プレイヤーがNPCの正面に立ったままだと
        // 会話が自動的に再開してしまい、いつまでも会話ウィンドウが
        // 消えないように見える不具合になっていた。
        // 1フレーム分ロック解除を遅らせ、次のキー入力からフィールド
        // 操作に戻れるようにする。
        setTimeout(function () {
          mapState.inputLocked = false;
        }, 0);
        // 既に加入済みNPCとの再会話では、加入処理(handleRecruitTalk)を再実行しない。
        if (!alreadyRecruited && !caseSolved && typeof npc.onTalk === "function") {
          npc.onTalk();
        }
        return;
      }
      const line = lines[idx++];
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage(line, showNext);
      } else {
        // ui.js未実装/未ロード時のフォールバック
        console.log("[NPC] " + npc.name + ": " + line);
        showNext();
      }
    }

    showNext();
  }

  // ------------------------------------------------------------------
  // マップ進入処理
  // ------------------------------------------------------------------

  function enterField(mapId, startX, startY) {
    const mapDef = RPG.data && RPG.data.MAPS ? RPG.data.MAPS[mapId] : null;
    if (!mapDef) {
      console.error("[RPG.map] 未定義のマップID: " + mapId);
      return;
    }

    mapState.mapId = mapId;
    mapState.mapDef = mapDef;
    mapState.tiles = cloneTiles(mapDef.tiles);
    applyPersistedGimmicks(mapDef);
    mapState.darknessConfig = mapDef.darkness || null;
    tryLightDarkness();
    mapState.width = mapDef.width;
    mapState.height = mapDef.height;
    mapState.areaId = mapDef.areaId || null;
    mapState.warps = mapDef.warps || [];
    mapState.npcs = (mapDef.npcs || []).map((n) => Object.assign({}, n));
    injectScenarioNpcs(mapId);

    mapState.playerX = typeof startX === "number" ? startX : (mapDef.startX || 0);
    mapState.playerY = typeof startY === "number" ? startY : (mapDef.startY || 0);
    mapState.renderX = mapState.playerX;
    mapState.renderY = mapState.playerY;
    mapState.facing = "down";
    mapState.isMoving = false;
    mapState.moveElapsed = 0;
    mapState.inputLocked = false;
    mapState.pressedKeys = {};
    mapState.stepsSinceEncounter = 0;

    // マップ遷移時は前マップの移動軌跡を引きずらず、現在地から
    // 通行可能な隣接マスへ隊列履歴を再構成する。
    mapState.trail = initializeFollowerTrail(mapState.playerX, mapState.playerY);

    updateCamera();
    attachKeyListeners();

    // engine.state の現在位置を更新(存在すれば)
    if (RPG.state) {
      RPG.state.position = {
        mapId: mapId,
        x: mapState.playerX,
        y: mapState.playerY,
      };

      // 封牙洞の設備復旧後、星霜荘を本編の拠点として開放する。
      if (mapId === "shareHouseArea" && RPG.state.flags && RPG.state.flags.chapter < 4) {
        RPG.state.flags.chapter = 4;
      }
      if (mapId === "shareHouseArea" && RPG.state.flags && !RPG.state.flags.shareHouseIntroSeen) {
        RPG.state.flags.shareHouseIntroSeen = true;
        if (RPG.engine && typeof RPG.engine.unlockShareHouseContent === "function") {
          RPG.engine.unlockShareHouseContent();
        }
        const lines = RPG.data && RPG.data.SCENARIO_TEXT && RPG.data.SCENARIO_TEXT.chapterShareHouse;
        if (RPG.ui && typeof RPG.ui.showMessage === "function" && Array.isArray(lines)) {
          lines.forEach(function (line) { RPG.ui.showMessage(line); });
        }
      }
    }
  }

  function initializeFollowerTrail(x, y) {
    const trail = [{ x: x, y: y }];
    const party = (RPG.state && RPG.state.party) || [];
    const followerCount = Math.max(0, Math.min(maxFollowerCount(), party.length - 1));
    const candidates = [
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
    ];

    for (let i = 0; i < followerCount; i++) {
      const anchor = trail[trail.length - 1];
      const candidate = candidates
        .map((offset) => ({ x: anchor.x + offset.dx, y: anchor.y + offset.dy }))
        .find((pos) => !trail.some((entry) => isSameTile(entry, pos)) && isWalkable(pos.x, pos.y));
      if (!candidate) break;
      trail.push(candidate);
    }
    return trail;
  }

  // ------------------------------------------------------------------
  // ギミック(鍵扉・スイッチ壁・暗闇)
  // ------------------------------------------------------------------

  function cloneTiles(tiles) {
    if (!tiles) return null;
    return tiles.map(function (row) { return row.slice(); });
  }

  function doorKey(x, y) {
    return x + "_" + y;
  }

  function getGimmickState(mapId) {
    if (!RPG.state) return null;
    RPG.state.flags = RPG.state.flags || {};
    RPG.state.flags.gimmicks = RPG.state.flags.gimmicks || {};
    if (!RPG.state.flags.gimmicks[mapId]) {
      RPG.state.flags.gimmicks[mapId] = { openedDoors: [], switches: [] };
    }
    return RPG.state.flags.gimmicks[mapId];
  }

  function isDoorOpened(x, y) {
    const gs = getGimmickState(mapState.mapId);
    return !!(gs && gs.openedDoors.indexOf(doorKey(x, y)) !== -1);
  }

  function isSwitchPressed(switchId) {
    const gs = getGimmickState(mapState.mapId);
    return !!(gs && gs.switches.indexOf(switchId) !== -1);
  }

  function setTileAt(x, y, tileId) {
    if (!mapState.tiles || y < 0 || y >= mapState.height || x < 0 || x >= mapState.width) return;
    mapState.tiles[y][x] = tileId;
  }

  function hasInventoryItem(itemId) {
    const inv = (RPG.state && RPG.state.inventory) || [];
    return inv.some(function (e) { return e.itemId === itemId && e.count > 0; });
  }

  function consumeInventoryItem(itemId) {
    const inv = (RPG.state && RPG.state.inventory) || [];
    const entry = inv.find(function (e) { return e.itemId === itemId; });
    if (!entry || entry.count <= 0) return false;
    entry.count -= 1;
    return true;
  }

  function openDoorTile(x, y) {
    setTileAt(x, y, 20);
    const gs = getGimmickState(mapState.mapId);
    if (gs && gs.openedDoors.indexOf(doorKey(x, y)) === -1) {
      gs.openedDoors.push(doorKey(x, y));
    }
  }

  function applyPersistedGimmicks(mapDef) {
    const gs = getGimmickState(mapDef.id);
    if (!gs) return;

    (gs.openedDoors || []).forEach(function (key) {
      const parts = key.split("_");
      const x = parseInt(parts[0], 10);
      const y = parseInt(parts[1], 10);
      if (!isNaN(x) && !isNaN(y)) setTileAt(x, y, 20);
    });

    (mapDef.switches || []).forEach(function (sw) {
      if (gs.switches.indexOf(sw.id) !== -1) {
        (sw.opens || []).forEach(function (pos) {
          setTileAt(pos.x, pos.y, 20);
        });
      }
    });
  }

  function findLockedDoorDef(x, y) {
    const doors = (mapState.mapDef && mapState.mapDef.lockedDoors) || [];
    return doors.find(function (d) { return d.x === x && d.y === y; }) || null;
  }

  function isWarpRequirementMet(warp) {
    if (!warp) return false;
    if (warp.requiresOpenedDoor) {
      const door = warp.requiresOpenedDoor;
      if (!isDoorOpened(door.x, door.y)) return false;
    }
    return true;
  }

  function tryUnlockDoor(x, y) {
    if (isDoorOpened(x, y)) return true;
    const doorDef = findLockedDoorDef(x, y);
    if (!doorDef) {
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("扉は　固く　閉ざされている…");
      }
      return false;
    }
    if (!hasInventoryItem(doorDef.keyItemId)) {
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("鍵が　合わない…　どこかに　古びた鍵が　あるはずだ。");
      }
      return false;
    }
    if (doorDef.consumeKey !== false) {
      consumeInventoryItem(doorDef.keyItemId);
    }
    openDoorTile(x, y);
    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage(doorDef.message || "扉を　開けた！");
    }
    return true;
  }

  function handleSwitchPlate(x, y) {
    const switches = (mapState.mapDef && mapState.mapDef.switches) || [];
    const sw = switches.find(function (s) { return s.x === x && s.y === y; });
    if (!sw || isSwitchPressed(sw.id)) return;

    const gs = getGimmickState(mapState.mapId);
    gs.switches.push(sw.id);
    (sw.opens || []).forEach(function (pos) {
      setTileAt(pos.x, pos.y, 20);
    });
    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage(sw.message || "スイッチが　押された！");
    }
  }

  function hasDarknessLit() {
    const cfg = mapState.darknessConfig;
    if (!cfg) return true;
    if (cfg.litItemId && hasInventoryItem(cfg.litItemId)) return true;
    const gs = getGimmickState(mapState.mapId);
    return !!(gs && gs.darknessLit);
  }

  function tryLightDarkness() {
    const cfg = mapState.darknessConfig;
    if (!cfg || hasDarknessLit()) return;
    if (cfg.litItemId && hasInventoryItem(cfg.litItemId)) {
      const gs = getGimmickState(mapState.mapId);
      gs.darknessLit = true;
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage(cfg.litMessage || "松明が　暗闇を　照らした！");
      }
    }
  }

  function drawDarknessOverlay(ctx, canvas) {
    const cfg = mapState.darknessConfig;
    if (!cfg || hasDarknessLit()) return;

    const viewTilesW = Math.ceil(canvas.width / TILE_SIZE);
    const viewTilesH = Math.ceil(canvas.height / TILE_SIZE);
    let camX = mapState.cameraX - viewTilesW / 2;
    let camY = mapState.cameraY - viewTilesH / 2;
    camX = Math.max(0, Math.min(mapState.width - viewTilesW, camX));
    camY = Math.max(0, Math.min(mapState.height - viewTilesH, camY));
    if (mapState.width <= viewTilesW) camX = (mapState.width - viewTilesW) / 2;
    if (mapState.height <= viewTilesH) camY = (mapState.height - viewTilesH) / 2;

    const radius = (cfg.radius || 2.5) * TILE_SIZE;
    const playerScreenX = (mapState.renderX - camX) * TILE_SIZE;
    const playerScreenY = (mapState.renderY - camY) * TILE_SIZE;
    const viewW = canvas.width;
    const viewH = canvas.height;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.globalCompositeOperation = "destination-out";
    const grad = ctx.createRadialGradient(
      playerScreenX, playerScreenY, radius * 0.15,
      playerScreenX, playerScreenY, radius
    );
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // タイル参照・衝突判定
  // ------------------------------------------------------------------

  function getTile(x, y) {
    if (!mapState.tiles) return null;
    if (y < 0 || y >= mapState.height || x < 0 || x >= mapState.width) return null;
    const row = mapState.tiles[y];
    if (!row) return null;
    return row[x];
  }

  function getTileDef(tileId) {
    return (RPG.data && RPG.data.TILE_TYPES) ? RPG.data.TILE_TYPES[tileId] : null;
  }

  function isWalkable(x, y) {
    const tileId = getTile(x, y);
    if (tileId == null) return false;

    // NPCがいるマスは通行不可
    if (findNpcAt(x, y)) return false;

    const def = getTileDef(tileId);
    if (!def) return false;

    if (def.requiresBoat && !hasInventoryItem("fune")) return false;
    if (tileId === 24 && !isDoorOpened(x, y)) return false;
    if (tileId === 26) return false;

    return !!def.walkable;
  }

  // ------------------------------------------------------------------
  // 更新処理(移動・エンカウント判定)
  // ------------------------------------------------------------------

  function update(dt) {
    if (!mapState.mapDef) return;

    if (mapState.isMoving) {
      progressMovement(dt);
      return;
    }

    if (mapState.inputLocked || isUiBlocking()) return;

    // 押下中の方向キーから移動開始
    const dir = getActiveDirection();
    if (!dir) return;

    mapState.facing = dir;
    const delta = DIRECTIONS[dir];
    const nx = mapState.playerX + delta.dx;
    const ny = mapState.playerY + delta.dy;

    if (!isWalkable(nx, ny)) {
      if (getTile(nx, ny) === 24) {
        tryUnlockDoor(nx, ny);
      }
      return;
    }

    mapState.isMoving = true;
    mapState.moveElapsed = 0;
    mapState.moveFromX = mapState.playerX;
    mapState.moveFromY = mapState.playerY;
    mapState.moveToX = nx;
    mapState.moveToY = ny;
  }

  function getActiveDirection() {
    // 最後に押されたキーを優先し、押されていなければ他方向を確認
    const order = mapState.lastInputDir
      ? [mapState.lastInputDir, "up", "down", "left", "right"]
      : ["up", "down", "left", "right"];
    for (const d of order) {
      if (mapState.pressedKeys[d]) return d;
    }
    return null;
  }

  function progressMovement(dt) {
    mapState.moveElapsed += dt;
    const t = Math.min(1, mapState.moveElapsed / MOVE_DURATION);

    mapState.renderX = mapState.moveFromX + (mapState.moveToX - mapState.moveFromX) * t;
    mapState.renderY = mapState.moveFromY + (mapState.moveToY - mapState.moveFromY) * t;

    if (t >= 1) {
      mapState.isMoving = false;
      mapState.playerX = mapState.moveToX;
      mapState.playerY = mapState.moveToY;
      mapState.renderX = mapState.playerX;
      mapState.renderY = mapState.playerY;

      if (RPG.state) {
        RPG.state.position = {
          mapId: mapState.mapId,
          x: mapState.playerX,
          y: mapState.playerY,
        };
      }

      // 隊列表示用の移動履歴に主人公の新しい位置を追加(先頭に積む)。
      // 同じマスへの往復(その場足踏み)で履歴が無駄に伸びないよう、
      // 直前の記録と同座標でなければ追加する。
      const lastTrail = mapState.trail[0];
      if (!lastTrail || lastTrail.x !== mapState.playerX || lastTrail.y !== mapState.playerY) {
        mapState.trail.unshift({ x: mapState.playerX, y: mapState.playerY });
        if (mapState.trail.length > TRAIL_MAX_LENGTH) {
          mapState.trail.length = TRAIL_MAX_LENGTH;
        }
      }

      updateCamera();
      onArriveAtTile();
    }
  }

  function onArriveAtTile() {
    const tileId = getTile(mapState.playerX, mapState.playerY);
    if (tileId == null) return;

    // エンカウント判定
    if (checkEncounter(tileId)) {
      return; // 戦闘に遷移した場合はタイルアクションを処理しない
    }

    // 施設/ワープ/宝箱などのタイルアクション
    RPG.map.onTileAction(tileId, mapState.playerX, mapState.playerY);
  }

  function updateCamera() {
    mapState.cameraX = mapState.renderX;
    mapState.cameraY = mapState.renderY;
  }

  // ------------------------------------------------------------------
  // ランダムエンカウント判定
  // ------------------------------------------------------------------

  function checkEncounter(tile) {
    const def = getTileDef(tile);
    if (!def || !def.encounterRate) return false;

    if (mapState.mapDef && mapState.mapDef.type === "dungeon") {
      mapState.stepsSinceEncounter += 1;
      // 洞窟では入場直後の1〜3歩で敵が出ないようにする。
      if (mapState.stepsSinceEncounter <= 3) return false;
    }

    // def.encounterRate は data.js の TILE_TYPES で「1歩あたりの発生確率」として
    // 直接定義されている(草原0.06=6%、森0.12=12%、灰霧地帯0.18=18%等)。
    // 以前はここに基礎確率定数 ENCOUNTER_RATE(0.05)を乗算しており、
    // 実際の発生率が0.3%程度まで下がってしまい、エンカウントがほぼ起きない
    // 原因になっていた。tileのencounterRateをそのまま閾値として使う。
    const roll = Math.random();
    if (roll >= def.encounterRate) {
      return false;
    }

    const areaId = mapState.areaId;
    const tableDef = (RPG.data && RPG.data.ENCOUNT_TABLES) ? RPG.data.ENCOUNT_TABLES[areaId] : null;
    const table = tableDef ? tableDef.groups : null;
    if (!table || !table.length) return false;

    const monsterGroup = pickMonsterGroup(table);
    if (!monsterGroup) return false;

    mapState.stepsSinceEncounter = 0;

    if (RPG.engine && typeof RPG.engine.changeScene === "function") {
      RPG.engine.changeScene("battle", { monsterGroup: monsterGroup });
      return true;
    }
    return false;
  }

  function pickMonsterGroup(table) {
    // table: [{ monsterIds: [...], weight: number }, ...] を想定。
    // weightが無い場合は均等抽選。
    const totalWeight = table.reduce((sum, entry) => sum + (entry.weight || 1), 0);
    let roll = Math.random() * totalWeight;
    for (const entry of table) {
      roll -= (entry.weight || 1);
      if (roll <= 0) {
        return entry.monsterIds || entry.group || entry.monsters || entry;
      }
    }
    const last = table[table.length - 1];
    return last.monsterIds || last.group || last.monsters || last;
  }

  // ------------------------------------------------------------------
  // タイルアクション(施設・階段・宝箱・ワープ)
  // ------------------------------------------------------------------

  function onTileAction(tile, x, y) {
    const px = typeof x === "number" ? x : mapState.playerX;
    const py = typeof y === "number" ? y : mapState.playerY;

    const def = getTileDef(tile);
    if (!def) return;

    // ワープ判定(町入口/ダンジョン入口/階段など)
    const warp = findWarpAt(px, py);
    if (!warp) {
      const blockedWarp = mapState.warps.find(function (w) {
        if (w.fromX !== px || w.fromY !== py) return false;
        const chapterBlocked = w.requiresChapter &&
          (!RPG.state || !RPG.state.flags || (RPG.state.flags.chapter || 1) < w.requiresChapter);
        return chapterBlocked || !isWarpRequirementMet(w);
      });
      if (blockedWarp && RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage(blockedWarp.message || "まだ　この先へは　進めない。");
      }
    }
    if (warp) {
      doWarp(warp);
      return;
    }

    switch (def.type) {
      case "town-entrance":
        // マップ定義にwarp未設定の場合のフォールバック
        break;
      case "dungeon-entrance":
        break;
      case "chest":
        openChest(px, py);
        break;
      case "stairs-up":
      case "stairs-down":
        // warpsで処理されるのが基本だが、フォールバックとして何もしない
        break;
      case "facility":
        handleFacility(def, px, py);
        break;
      case "pitfall":
        handlePitfall(px, py);
        break;
      case "prayer":
        handlePrayer(px, py);
        break;
      case "switchPlate":
        handleSwitchPlate(px, py);
        break;
      case "darknessFloor":
        tryLightDarkness();
        break;
      default:
        break;
    }
  }

  // 落とし穴タイル: mapDef.pitfalls: [{x, y, toX, toY}] で同一マップ内の
  // 着地先座標へ強制ワープする(罠だが実際には近道になっている箇所もある)。
  function handlePitfall(x, y) {
    const mapDef = mapState.mapDef;
    const pitDef = (mapDef.pitfalls || []).find((p) => p.x === x && p.y === y);
    if (!pitDef) return;

    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage("落とし穴に落ちた！");
    }

    mapState.playerX = pitDef.toX;
    mapState.playerY = pitDef.toY;
    mapState.renderX = pitDef.toX;
    mapState.renderY = pitDef.toY;
    updateCamera();
  }

  // 祈り床タイル: HP/MP全回復+セーブ確認。1マスにつき1回だけメッセージを
  // 出すのではなく、踏むたびに全回復して構わない(ボス直前の詰み防止が目的)。
  function handlePrayer(x, y) {
    if (RPG.state && RPG.state.party) {
      RPG.state.party.forEach(function (member) {
        if (typeof member.maxHp === "number") member.hp = member.maxHp;
        if (typeof member.maxMp === "number") member.mp = member.maxMp;
      });
    }
    if (RPG.save && typeof RPG.save.save === "function") {
      RPG.save.save();
    }
    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage("やすらぎの祈り床だ。HP/MPが全回復し、旅の記録が刻まれた。");
    }
  }

  // 施設タイル(宿屋/武器屋/道具屋/教会)に進入した際の分岐処理。
  // 会話・メニュー操作と同様に入力をロックしてUIモジュールへ処理を委譲する。
  function handleFacility(def, x, y) {
    if (!RPG.ui) return;
    const townId = mapState.mapId;

    switch (def.facility) {
      case "inn":
        if (typeof RPG.ui.openInn === "function") {
          mapState.inputLocked = true;
          RPG.ui.openInn(townId, function () {
            mapState.inputLocked = false;
          });
        }
        break;
      case "weaponShop":
        if (typeof RPG.ui.openShop === "function") {
          mapState.inputLocked = true;
          RPG.ui.openShop(townId, "buy", "weaponShop", function () {
            mapState.inputLocked = false;
          });
        }
        break;
      case "itemShop":
        if (typeof RPG.ui.openShop === "function") {
          mapState.inputLocked = true;
          RPG.ui.openShop(townId, "buy", "itemShop", function () {
            mapState.inputLocked = false;
          });
        }
        break;
      case "church":
        if (typeof RPG.ui.openChurch === "function") {
          mapState.inputLocked = true;
          RPG.ui.openChurch(townId, function () {
            mapState.inputLocked = false;
          });
        }
        break;
      default:
        break;
    }
  }

  function findWarpAt(x, y) {
    // requiresDefeatedBoss / requiresBossAlive: ボス撃破後にダンジョン外へ
    // 直接脱出できるワープをボス戦トリガーマスと同じ座標に重ねて配置するための
    // 条件フラグ(data.js参照)。同じ座標の2つの warp のうち、現在の
    // flags.defeatedBosses の状態に合う片方だけが有効になる。
    const defeatedBosses = (RPG.state && RPG.state.flags && RPG.state.flags.defeatedBosses) || [];
    const chapter = (RPG.state && RPG.state.flags && RPG.state.flags.chapter) || 1;
    return mapState.warps.find((w) => w.fromX === x && w.fromY === y &&
      (!w.requiresChapter || chapter >= w.requiresChapter) &&
      (!w.requiresDefeatedBoss || defeatedBosses.indexOf(w.requiresDefeatedBoss) !== -1) &&
      (!w.requiresBossAlive || defeatedBosses.indexOf(w.requiresBossAlive) === -1) &&
      isWarpRequirementMet(w)) || null;
  }

  function doWarp(warp) {
    // ボス部屋への warp (toMapId が "battle_boss_" で始まる) はマップ遷移ではなく
    // ボス戦闘への遷移として扱う。MAPS に battle_boss_* エントリは存在しないため、
    // 現在のマップ定義の bossId を使って戦闘を開始する。
    if (typeof warp.toMapId === "string" && warp.toMapId.indexOf("battle_boss_") === 0) {
      const bossId = (mapState.mapDef && mapState.mapDef.bossId) ||
        warp.toMapId.slice("battle_boss_".length);

      // 撃破済みのボスは再戦不可(キーアイテムの重複入手やラスボスの周回討伐を防ぐ)。
      // 撃破フラグ(flags.defeatedBosses)にIDがあれば戦闘を発生させず、通路として素通りさせる。
      const defeatedBosses = (RPG.state && RPG.state.flags && RPG.state.flags.defeatedBosses) || [];
      if (bossId && defeatedBosses.indexOf(bossId) !== -1) {
        RPG.map.enterField(mapState.mapId, warp.fromX, warp.fromY);
        return;
      }

      // 契約上、中ボス shareHouseOverseer は「メイン主人公加入済みでパーティが
      // 4人になった状態」で挑む想定のシナリオ演出。人数不足のまま最深部トリガー
      // タイルへ到達しても不意打ち的に強制戦闘へ突入しないよう、ここでガードする。
      if (bossId === "shareHouseOverseer") {
        const party = (RPG.state && RPG.state.party) || [];
        if (party.length < 4) {
          if (RPG.ui && typeof RPG.ui.showMessage === "function") {
            RPG.ui.showMessage("何か底知れぬ気配がする……。今の仲間だけでは踏み込めない。");
          }
          RPG.map.enterField(mapState.mapId, warp.fromX, warp.fromY);
          return;
        }
      }

      // 逃走時にボスの再トリガータイル(fromX/fromY)へ戻すと、その場から
      // 動くだけで即再戦になってしまう(ボスは未撃破のまま同じマップに残るため)。
      // 直前にいた安全なタイル(trail[1]。無ければ入場位置)を退避先として控えておく。
      const retreatPos = mapState.trail && mapState.trail[1]
        ? { x: mapState.trail[1].x, y: mapState.trail[1].y }
        : { x: warp.fromX, y: warp.fromY };

      if (RPG.engine && typeof RPG.engine.changeScene === "function") {
        RPG.engine.changeScene("battle", {
          monsterGroup: [{ monsterId: bossId }],
          onEnd: function (result) {
            // enterField() を直接呼ぶと engine の currentSceneName が "battle" の
            // まま残り、tick がマップの update/render を実行せず完全フリーズする。
            // 必ず changeScene() を経由してシーン状態と画面表示を戻すこと。
            const mapDef = RPG.data && RPG.data.MAPS ? RPG.data.MAPS[mapState.mapId] : null;
            const sceneName = mapDef && mapDef.type === "dungeon" ? "dungeon"
              : mapDef && mapDef.type === "town" ? "town" : "field";
            if (result === "win") {
              RPG.engine.changeScene(sceneName, { mapId: mapState.mapId, x: warp.fromX, y: warp.fromY });
            } else if (result === "escape") {
              // 逃走: ボスは未撃破のままなので、トリガータイルを避けた
              // 直前の安全な位置へ戻す(再トリガー防止)。
              RPG.engine.changeScene(sceneName, { mapId: mapState.mapId, x: retreatPos.x, y: retreatPos.y });
            }
            // "lose" は battle.js の finishBattle 側で町へ強制送還されるため、
            // ここでは何もしない(このコールバックはそもそも呼ばれない想定)。
          },
        });
      }
      return;
    }

    // シーン種別(field/town/dungeon)をまたぐ移動は必ずchangeScene()を経由する。
    // enterField()を直接呼ぶとシーンenterハンドラ(BGM切替・フェード演出)が
    // 実行されず、町に入ってもフィールドBGMが流れ続けるバグになる。
    mapState.inputLocked = true;
    const destDef = RPG.data && RPG.data.MAPS ? RPG.data.MAPS[warp.toMapId] : null;
    const destScene = destDef && destDef.type === "town" ? "town"
      : destDef && destDef.type === "dungeon" ? "dungeon" : "field";
    if (RPG.engine && typeof RPG.engine.changeScene === "function") {
      // inputLockedはenterField()側で解除される(フェード中の二重ワープ防止)
      RPG.engine.changeScene(destScene, { mapId: warp.toMapId, x: warp.toX, y: warp.toY });
    } else {
      RPG.map.enterField(warp.toMapId, warp.toX, warp.toY);
    }
  }

  function openChest(x, y) {
    const chestKey = mapState.mapId + ":" + x + "," + y;
    if (RPG.state && RPG.state.flags && RPG.state.flags.openedChests && RPG.state.flags.openedChests[chestKey]) {
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("たからばこは からっぽだ。");
      }
      return; // 開封済み
    }

    const mapDef = mapState.mapDef;
    const chestDef = (mapDef.chests || []).find((c) => c.x === x && c.y === y);
    if (!chestDef) {
      // タイルは宝箱だが中身の定義が無い(データ不備)場合も空扱いにする
      if (RPG.ui && typeof RPG.ui.showMessage === "function") {
        RPG.ui.showMessage("たからばこは からっぽだ。");
      }
      return;
    }

    if (RPG.state) {
      RPG.state.flags = RPG.state.flags || {};
      RPG.state.flags.openedChests = RPG.state.flags.openedChests || {};
      RPG.state.flags.openedChests[chestKey] = true;

      if (chestDef.itemId) {
        RPG.state.inventory = RPG.state.inventory || [];
        const existing = RPG.state.inventory.find((i) => i.itemId === chestDef.itemId);
        if (existing) {
          existing.count += (chestDef.count || 1);
        } else {
          RPG.state.inventory.push({ itemId: chestDef.itemId, count: chestDef.count || 1 });
        }

        const fragmentColors = {
          aoNoSeisouShou: "blue",
          akaNoSeisouShou: "red",
          midoriNoSeisouShou: "green",
          kinNoSeisouShou: "gold",
        };
        const fragment = fragmentColors[chestDef.itemId];
        if (fragment && RPG.state.starFragments.indexOf(fragment) === -1) {
          RPG.state.starFragments.push(fragment);
        }
      }
      if (chestDef.gold && RPG.engine && typeof RPG.engine.gainGold === "function") {
        RPG.engine.gainGold(chestDef.gold);
      }
    }

    const itemData = (RPG.data && RPG.data.ITEMS && chestDef.itemId) ? RPG.data.ITEMS[chestDef.itemId] : null;
    const itemName = itemData ? itemData.name : "";
    const message = chestDef.itemId
      ? ("たからばこをあけた！\n" + itemName + " をてにいれた！")
      : "たからばこをあけた！";

    if (RPG.ui && typeof RPG.ui.showMessage === "function") {
      RPG.ui.showMessage(message);
    } else {
      console.log("[Chest] " + message);
    }
  }

  // ------------------------------------------------------------------
  // 描画処理
  // ------------------------------------------------------------------

  function render(ctx) {
    if (!ctx || !mapState.mapDef) {
      hideHeroSpriteOverlay();
      return;
    }

    const canvas = ctx.canvas;
    const effectsCtx = getMapEffectsContext();
    const viewTilesW = Math.ceil(canvas.width / TILE_SIZE);
    const viewTilesH = Math.ceil(canvas.height / TILE_SIZE);

    // カメラ中心座標(プレイヤー中心スクロール、マップ端でクランプ)
    let camX = mapState.cameraX - viewTilesW / 2;
    let camY = mapState.cameraY - viewTilesH / 2;
    camX = Math.max(0, Math.min(mapState.width - viewTilesW, camX));
    camY = Math.max(0, Math.min(mapState.height - viewTilesH, camY));
    if (mapState.width <= viewTilesW) camX = (mapState.width - viewTilesW) / 2;
    if (mapState.height <= viewTilesH) camY = (mapState.height - viewTilesH) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const startCol = Math.floor(camX);
    const startRow = Math.floor(camY);
    const offsetX = -(camX - startCol) * TILE_SIZE;
    const offsetY = -(camY - startRow) * TILE_SIZE;

    for (let row = 0; row <= viewTilesH + 1; row++) {
      const ty = startRow + row;
      if (ty < 0 || ty >= mapState.height) continue;
      for (let col = 0; col <= viewTilesW + 1; col++) {
        const tx = startCol + col;
        if (tx < 0 || tx >= mapState.width) continue;

        const tileId = mapState.tiles[ty][tx];
        drawTile(ctx, tileId, offsetX + col * TILE_SIZE, offsetY + row * TILE_SIZE);
      }
    }

    // NPC描画(SVGスプライト同期。加入済み・撃破済みの非表示判定はsyncNpcSprites内)
    syncNpcSprites(camX, camY);

    // 隊列(2人目以降の仲間)描画。主人公の移動履歴を1マスずつ遅れて辿らせる。
    // 衝突判定は主人公のみで行うため、隊列メンバーはタイルの通行可否を無視して
    // 見た目上追従するだけの純粋な演出。
    updateFollowerSprites(camX, camY);

    // プレイヤー描画
    const playerScreenX = (mapState.renderX - camX) * TILE_SIZE;
    const playerScreenY = (mapState.renderY - camY) * TILE_SIZE;
    updateHeroSpriteOverlay(playerScreenX, playerScreenY);

    // ワープ(渦)のマスに乗っている間は、渦の発光演出をプレイヤーの上にも
    // 重ねて描く。tile側の演出はプレイヤー描画より前に済んでいるため、
    // そのままだとプレイヤーが渦を覆い隠してしまい、他の場所と違って
    // 「渦の中にいる」ようには見えず、渦の上にただ立っているだけに見えて
    // しまう不具合があった。移動中(渦から出て行く/渦へ入っていく途中)は
    // 対象にせず、その場に静止している時だけ重ねて表示を統一する。
    if (!mapState.isMoving) {
      const playerTileDef = getTileDef(getTile(mapState.playerX, mapState.playerY));
      if (playerTileDef && playerTileDef.type === "warp" && RPG.gfx && typeof RPG.gfx.drawWarpGlow === "function") {
        if (effectsCtx) RPG.gfx.drawWarpGlow(effectsCtx, playerScreenX, playerScreenY);
      }
    }

    // よよよー変身カットシーン演出(ui.jsのshowYoyoyoTransformCutsceneから
    // setCutsceneMonster()経由で有効化される)。フィールドの上に暗転+
    // ボスの大写しシルエットを重ねる。
    drawCutsceneOverlay(ctx, canvas);
    drawDarknessOverlay(ctx, canvas);
  }

  function getMapEffectsContext() {
    const effectsCanvas = document.getElementById("canvas-map-effects");
    if (!effectsCanvas) return null;
    const effectsCtx = effectsCanvas.getContext("2d");
    if (effectsCtx) effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
    return effectsCtx;
  }

  function hideHeroSpriteOverlay() {
    const heroSprite = document.getElementById("hero-sprite-svg");
    if (heroSprite) heroSprite.classList.add("hidden");
    for (let i = 0; i < maxFollowerCount(); i++) {
      const el = getFollowerSpriteEl(i);
      if (el) el.classList.add("hidden");
    }
    const npcLayer = document.getElementById("npc-sprite-layer");
    if (npcLayer) npcLayer.innerHTML = "";
    getMapEffectsContext();
  }

  // SVGスプライト1要素の見た目を同期する共通ヘルパー。主人公・隊列・NPCの
  // 3者すべてがこれを通る。el初回利用時はgfx.jsの共通マークアップを流し込む。
  const SPRITE_STATE_CLASSES = [
    "hidden", "facing-up", "facing-down", "facing-left", "facing-right",
    "is-walking", "is-chick", "is-cutscene", "has-hat",
    "equip-sword", "equip-axe", "equip-rod", "equip-staff", "equip-bag",
  ];
  const FALLBACK_APPEARANCE = { bodyColor: "#3aa050", accentColor: "#cccccc", skin: "#f5d6a8", hair: "#2a1a10", equip: "none" };

  function syncCharacterSprite(el, opts) {
    if (!el) return;
    if (el.childElementCount === 0 && RPG.gfx && typeof RPG.gfx.buildCharacterSpriteMarkup === "function") {
      el.innerHTML = RPG.gfx.buildCharacterSpriteMarkup();
    }
    const a = opts.appearance || FALLBACK_APPEARANCE;

    el.classList.remove.apply(el.classList, SPRITE_STATE_CLASSES);
    el.classList.add("facing-" + (opts.facing || "down"));
    if (opts.walking) el.classList.add("is-walking");
    if (a.chick) el.classList.add("is-chick");
    if (a.equip && a.equip !== "none") el.classList.add("equip-" + a.equip);
    if (a.hat) el.classList.add("has-hat");
    if (opts.cutsceneHidden) el.classList.add("is-cutscene");
    el.style.transform = "translate3d(" + opts.screenX + "px, " + opts.screenY + "px, 0)";
    el.style.setProperty("--body-color", a.bodyColor);
    el.style.setProperty("--accent-color", a.accentColor);
    el.style.setProperty("--skin-color", a.skin);
    el.style.setProperty("--hair-color", a.hair);
    if (a.hatColor) el.style.setProperty("--hat-color", a.hatColor);
  }

  // 先頭キャラだけはcanvasでは描かず、タイルと同じ512px座標系のSVGを同期する。
  function updateHeroSpriteOverlay(screenX, screenY) {
    const heroSprite = document.getElementById("hero-sprite-svg");
    if (!heroSprite) return;
    const party = (RPG.state && RPG.state.party) || [];
    const hero = party[0];
    const appearance = RPG.gfx && typeof RPG.gfx.getJobAppearance === "function" ? RPG.gfx.getJobAppearance(hero && hero.job) : null;
    syncCharacterSprite(heroSprite, {
      screenX: screenX,
      screenY: screenY,
      facing: mapState.facing,
      appearance: appearance,
      walking: mapState.isMoving,
      cutsceneHidden: !!mapState.cutsceneMonster,
    });
  }

  function drawCutsceneOverlay(ctx, canvas) {
    if (!mapState.cutsceneMonster) return;
    if (!RPG.gfx || typeof RPG.gfx.drawChickEmperor !== "function") return;

    ctx.save();
    ctx.fillStyle = "rgba(6,0,12,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const size = Math.min(canvas.width, canvas.height) * 0.32;
    RPG.gfx.drawChickEmperor(ctx, canvas.width / 2, canvas.height / 2, size, Date.now());
    ctx.restore();
  }

  // ui.js のカットシーン演出から呼ばれる: オーバーレイに表示するモンスターを設定/解除する。
  function setCutsceneMonster(monsterKey) {
    mapState.cutsceneMonster = monsterKey || null;
  }

  function clearCutsceneMonster() {
    mapState.cutsceneMonster = null;
  }

  function getFollowerSpriteEl(index) {
    return document.getElementById("follower-sprite-" + (index + 1));
  }

  // 隊列スプライトの最大数(=パーティ最大人数-主人公1)。engine.js未ロード時は
  // 既定値4に合わせて3にフォールバックする。
  function maxFollowerCount() {
    const engine = RPG.engine;
    const maxParty = engine && typeof engine.maxPartySize === "function" ? engine.maxPartySize() : 4;
    return maxParty - 1;
  }

  function isSameTile(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
  }

  // 隊列キャラが主人公や前方の隊列キャラと同じ履歴座標を使わないようにする。
  // ワープ直後・ロード直後・移動アニメーション中の重複履歴が残っていても、
  // 同じマスへSVGを重ねて描画せず、履歴が有効になるまで非表示にする。
  function isValidFollowerTrailPosition(trail, trailIndex) {
    if (!Array.isArray(trail) || trailIndex < 1 || !trail[trailIndex]) return null;
    const pos = trail[trailIndex];
    for (let i = 0; i < trailIndex; i++) {
      if (isSameTile(pos, trail[i])) return null;
    }
    return pos;
  }

  // 隊列(2人目以降の仲間)のSVGスプライト同期。主人公の移動履歴(trail)を
  // 1マスずつ遅れて辿らせる。衝突判定は主人公のみで行うため、隊列メンバーは
  // タイルの通行可否を無視して見た目上追従するだけの純粋な演出。
  function updateFollowerSprites(camX, camY) {
    const party = (RPG.state && RPG.state.party) || [];
    // party[0] は主人公自身なので、2人目(index 1)以降が隊列表示の対象。
    const followers = party.slice(1);

    // 停止中は仲間自身の履歴座標(trail[i+1])に置く。1にすると
    // prevPos(主人公側の履歴)へ補間し、主人公と同じマスに重なる。
    const t = mapState.isMoving ? Math.min(1, mapState.moveElapsed / MOVE_DURATION) : 0;

    for (let i = 0; i < maxFollowerCount(); i++) {
      const el = getFollowerSpriteEl(i);
      if (!el) continue;
      const member = followers[i];
      // i=0(2人目)は1マス遅れ(trail[1]→trail[0]方向)、i=1(3人目)は2マス遅れ…
      const trailIndex = i + 1;
      const pos = isValidFollowerTrailPosition(mapState.trail, trailIndex);
      if (!member || !pos) {
        // 仲間がいない/履歴がまだ足りない(移動直後・マップ進入直後)場合は非表示
        el.classList.add("hidden");
        continue;
      }
      const prevPos = mapState.trail[trailIndex - 1];

      // prevPos(1マス手前=進行方向側の履歴)へ向けて、主人公の移動進行度tで補間する。
      let renderX = pos.x;
      let renderY = pos.y;
      // 主人公が後退して隊列キャラの現在地へ入る場合、双方を同時に
      // 反対方向へ補間すると移動途中で同じ座標を通過する。主人公の
      // 移動完了まで隊列キャラを待機させ、完了後に次の履歴へ進める。
      const followerTargetIsHeroDestination = mapState.isMoving &&
        mapState.moveToX === pos.x && mapState.moveToY === pos.y;
      if (followerTargetIsHeroDestination) {
        renderX = pos.x;
        renderY = pos.y;
      } else if (prevPos) {
        renderX = pos.x + (prevPos.x - pos.x) * t;
        renderY = pos.y + (prevPos.y - pos.y) * t;
      }

      // 1マス前の履歴との差分から隊列メンバーの向きを推定する
      let facing = "down";
      if (prevPos) {
        const dx = prevPos.x - pos.x;
        const dy = prevPos.y - pos.y;
        if (dx > 0) facing = "right";
        else if (dx < 0) facing = "left";
        else if (dy > 0) facing = "down";
        else if (dy < 0) facing = "up";
      }

      const appearance = RPG.gfx && typeof RPG.gfx.getJobAppearance === "function" ? RPG.gfx.getJobAppearance(member.job) : null;
      syncCharacterSprite(el, {
        screenX: (renderX - camX) * TILE_SIZE,
        screenY: (renderY - camY) * TILE_SIZE,
        facing: facing,
        appearance: appearance,
        walking: mapState.isMoving,
        cutsceneHidden: !!mapState.cutsceneMonster,
      });
    }
  }

  // NPCのSVGスプライト同期。NPC数はマップごとに異なるため、層内のsvg要素数を
  // その都度NPC数に合わせる(可変数プール)。NPCはフィールド上を移動しないが、
  // カメラスクロールで画面上の位置は毎フレーム変わりうるので、位置・表示状態の
  // 同期は主人公・隊列と同様にrender()から毎フレーム行う(高々数体なので軽量)。
  function syncNpcSprites(camX, camY) {
    const layer = document.getElementById("npc-sprite-layer");
    if (!layer) return;
    const npcs = mapState.npcs || [];

    while (layer.childElementCount < npcs.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 32 32");
      svg.setAttribute("class", "hero-sprite hidden");
      svg.setAttribute("role", "presentation");
      layer.appendChild(svg);
    }
    while (layer.childElementCount > npcs.length) {
      layer.removeChild(layer.lastChild);
    }

    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const el = layer.children[i];
      if (npc.defeated || isNpcAlreadyRecruited(npc)) {
        // ここではsyncCharacterSpriteを呼ばないため、新規プールスロットは
        // 中身が空の<svg>のまま非表示になることがある(意図的な挙動。後で
        // このスロットを表示NPCが再利用した際にsyncCharacterSpriteが populate する)。
        el.classList.add("hidden");
        continue;
      }
      syncCharacterSprite(el, {
        screenX: (npc.x - camX) * TILE_SIZE,
        screenY: (npc.y - camY) * TILE_SIZE,
        facing: npc.facing || "down",
        appearance: npcSpriteAppearance(npc),
        walking: false,
        cutsceneHidden: !!mapState.cutsceneMonster,
      });
    }
  }

  // NPCの見た目を決める。加入イベントNPC(recruit.jobIdあり)は加入後の隊列
  // スプライトと同じ職業配色にし、「話しかけたNPCと加入後の見た目が違う」
  // 不自然さを避ける。それ以外は村人ルック(NPC_VARIANTSのハッシュ配色)。
  function npcSpriteAppearance(npc) {
    if (!RPG.gfx) return null;
    if (npc.recruit && npc.recruit.jobId && typeof RPG.gfx.getJobAppearance === "function") {
      return RPG.gfx.getJobAppearance(npc.recruit.jobId);
    }
    if (typeof RPG.gfx.getNpcVariant !== "function") return null;
    const variant = RPG.gfx.getNpcVariant(npc);
    return {
      bodyColor: variant.bodyColor,
      accentColor: "#cccccc",
      skin: variant.skin,
      hair: variant.hair,
      equip: "none",
      hat: !!variant.hat,
      hatColor: variant.hatColor,
    };
  }

  function drawTile(ctx, tileId, screenX, screenY) {
    const def = getTileDef(tileId);

    if (RPG.gfx && typeof RPG.gfx.drawTileCached === "function") {
      RPG.gfx.drawTileCached(ctx, tileId, def, screenX, screenY);
      return;
    }

    // gfx.js未ロード時のフォールバック(旧・単色ベタ塗り実装)
    const color = def ? def.color : "#000000";
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  }

  // ------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------

  RPG.map = {
    enterField: enterField,
    update: update,
    render: render,
    checkEncounter: checkEncounter,
    onTileAction: onTileAction,
    inspectFront: inspectFront,

    // よよよー変身カットシーン用オーバーレイ制御(ui.jsから呼ばれる)
    setCutsceneMonster: setCutsceneMonster,
    clearCutsceneMonster: clearCutsceneMonster,

    // デバッグ・他モジュール連携用の補助アクセサ
    getPlayerPosition: function () {
      return { x: mapState.playerX, y: mapState.playerY };
    },
    getCurrentMapId: function () {
      return mapState.mapId;
    },
  };
})();
