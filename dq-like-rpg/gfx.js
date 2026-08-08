// gfx.js
// map.js から呼び出されるピクセルアート調のタイル/キャラクター描画ライブラリ。
// タイルはオフスクリーンcanvasにキャッシュして毎フレームの再計算コストを避ける。
// window.RPG.gfx として公開する。他モジュール(engine.js/ui.js/battle.js)は
// このファイルに依存しないため、ここでの変更は map.js からの呼び出し規約
// (TILE_SIZE, drawTileCached, drawWarpGlow, getJobAppearance, getNpcVariant,
// drawChickEmperor, buildCharacterSpriteMarkup の7項目)だけ守れば自由に変更してよい。

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  const TILE_SIZE = 32;

  // ------------------------------------------------------------------
  // 疑似乱数(タイルごとの点描パターンを毎回同じ形に固定するためのシード付き乱数)
  // ------------------------------------------------------------------
  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------
  // タイル描画キャッシュ
  // ------------------------------------------------------------------
  // キー: `${type}:${frame}` -> オフスクリーンcanvas
  const tileCache = new Map();

  // 水タイルはフレームアニメーションを持つ(2フレーム、約500msで切替)
  const WATER_FRAME_MS = 500;
  const WATER_FRAMES = 2;

  function getWaterFrame() {
    return Math.floor(Date.now() / WATER_FRAME_MS) % WATER_FRAMES;
  }

  // ワープ/入口タイルの発光演出も時間で変化させる
  const WARP_PULSE_MS = 1400;

  function getAnimTime() {
    return Date.now();
  }

  // タイル種別ごとの描画関数テーブル。各関数は 32x32 のオフスクリーンctxに
  // (0,0)起点で描画する。frame引数はアニメーションが必要な種別のみ使用。
  const TILE_PAINTERS = {
    field: paintGrass,
    forest: paintForest,
    mountain: paintMountain,
    water: paintWater,
    warp: paintWarp,
    townEntrance: paintTownEntrance,
    dungeonEntrance: paintDungeonEntrance,
    dungeon: paintDungeonWall,
    townWall: paintTownWall,
    townFloor: paintTownFloor,
    facility: paintFacility,
    chest: paintChestTile,
    stairsDown: paintStairs,
    stairsUp: paintStairs,
    bossFloor: paintBossFloor,
  };

  // data.js の type 文字列だけでは「道」「灰霧地帯」等の細分ができないため、
  // tileDef.name / facility 等の付加情報も見て個別ペインタへ分岐する。
  function resolvePainterKey(def) {
    if (!def) return "unknown";
    if (def.type === "field") {
      if (def.name === "森") return "forest";
      if (def.name === "山") return "mountain";
      if (def.name === "道") return "road";
      if (def.name === "灰霧地帯") return "ashfield";
      return "field";
    }
    if (def.type === "warp") {
      if (def.id === 5) return "townEntrance";
      if (def.id === 6) return "dungeonEntrance";
      return "warp";
    }
    if (def.type === "facility") return "facility:" + (def.facility || "generic");
    if (def.type === "townWall") return "townWall";
    if (def.type === "townFloor") return "townFloor";
    if (def.type === "dungeon") return "dungeon";
    if (def.type === "chest") return "chest";
    if (def.type === "stairsDown" || def.type === "stairsUp") return "stairs";
    if (def.type === "bossFloor") return "bossFloor";
    if (def.type === "lockedDoor") return "lockedDoor";
    if (def.type === "switchPlate") return "switchPlate";
    if (def.type === "closedGate") return "closedGate";
    if (def.type === "darknessFloor") return "darknessFloor";
    if (def.name === "海・水") return "water";
    return def.type || "unknown";
  }

  function getTileCanvas(tileId, def, frame) {
    const key = resolvePainterKey(def);
    const cacheKey = tileId + ":" + key + ":" + (frame || 0);
    let canvas = tileCache.get(cacheKey);
    if (canvas) return canvas;

    canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d");
    paintTileByKey(ctx, key, def, frame, tileId);
    tileCache.set(cacheKey, canvas);
    return canvas;
  }

  function paintTileByKey(ctx, key, def, frame, tileId) {
    const baseColor = (def && def.color) || "#000000";
    switch (key) {
      case "field":
        paintGrass(ctx, baseColor, tileId);
        break;
      case "forest":
        paintForest(ctx, baseColor, tileId);
        break;
      case "mountain":
        paintMountain(ctx, baseColor, tileId);
        break;
      case "road":
        paintRoad(ctx, baseColor, tileId);
        break;
      case "ashfield":
        paintAshField(ctx, baseColor, tileId);
        break;
      case "water":
        paintWater(ctx, baseColor, frame);
        break;
      case "warp":
        paintWarp(ctx, baseColor);
        break;
      case "townEntrance":
        paintTownEntrance(ctx, baseColor);
        break;
      case "dungeonEntrance":
        paintDungeonEntrance(ctx, baseColor);
        break;
      case "dungeon":
        paintDungeonWall(ctx, baseColor, tileId);
        break;
      case "townWall":
        paintTownWall(ctx, baseColor);
        break;
      case "townFloor":
        paintTownFloor(ctx, baseColor, tileId);
        break;
      case "chest":
        paintChestTile(ctx, baseColor);
        break;
      case "stairs":
        paintStairs(ctx, baseColor);
        break;
      case "bossFloor":
        paintBossFloor(ctx, baseColor);
        break;
      case "lockedDoor":
        paintLockedDoor(ctx, baseColor, tileId);
        break;
      case "switchPlate":
        paintSwitchPlate(ctx, baseColor, tileId);
        break;
      case "closedGate":
        paintClosedGate(ctx, baseColor, tileId);
        break;
      case "darknessFloor":
        paintDarknessFloor(ctx, baseColor, tileId);
        break;
      default:
        if (key.indexOf("facility:") === 0) {
          paintFacility(ctx, baseColor, key.slice("facility:".length));
        } else {
          ctx.fillStyle = baseColor;
          ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
        }
        break;
    }
  }

  // ------------------------------------------------------------------
  // 個別タイルペインタ
  // ------------------------------------------------------------------

  // 草原: ベース色 + 点描の草むらでテクスチャを作る
  function paintGrass(ctx, baseColor, tileId) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rng = makeRng((tileId || 0) * 7919 + 13);
    ctx.fillStyle = "#3d8636";
    for (let i = 0; i < 14; i++) {
      const x = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      const y = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = "#6bbf52";
    for (let i = 0; i < 8; i++) {
      const x = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      const y = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      ctx.fillRect(x, y, 1, 2);
    }
  }

  // 道: 明るい土色 + 小石の点描
  function paintRoad(ctx, baseColor, tileId) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rng = makeRng((tileId || 4) * 5231 + 91);
    ctx.fillStyle = "#a88f5e";
    for (let i = 0; i < 10; i++) {
      const x = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      const y = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      ctx.fillRect(x, y, 2, 1);
    }
    ctx.fillStyle = "#e0cf9d";
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      const y = 2 + Math.floor(rng() * (TILE_SIZE - 4));
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 灰霧地帯: 草原ベースに白い霧レイヤーを重ねる
  function paintAshField(ctx, baseColor, tileId) {
    paintGrass(ctx, "#5f6a52", tileId);
    ctx.fillStyle = "rgba(220,220,230,0.28)";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rng = makeRng((tileId || 7) * 3299 + 41);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rng() * TILE_SIZE);
      const y = Math.floor(rng() * TILE_SIZE);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 森: 草地の上に木のシルエット(幹+葉の三角)を複数配置
  function paintForest(ctx, baseColor, tileId) {
    paintGrass(ctx, "#2d6b34", tileId);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    function tree(cx, baseY, scale) {
      // 幹
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(cx - 2 * scale, baseY - 4 * scale, 4 * scale, 6 * scale);
      // 葉(三角シルエットを3段重ねて針葉樹風に)
      ctx.fillStyle = "#0d3d1a";
      for (let i = 0; i < 3; i++) {
        const w = (10 - i * 2) * scale;
        const y = baseY - (6 + i * 6) * scale;
        ctx.beginPath();
        ctx.moveTo(cx, y - 6 * scale);
        ctx.lineTo(cx + w / 2, y);
        ctx.lineTo(cx - w / 2, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#164d24";
      ctx.beginPath();
      ctx.moveTo(cx, baseY - 20 * scale);
      ctx.lineTo(cx + 3 * scale, baseY - 12 * scale);
      ctx.lineTo(cx - 3 * scale, baseY - 12 * scale);
      ctx.closePath();
      ctx.fill();
    }

    tree(11, 26, 0.9);
    tree(22, 24, 0.75);
  }

  // 山: ベース色の上に陰影付きの稜線を描く
  function paintMountain(ctx, baseColor, tileId) {
    ctx.fillStyle = "#8a7a68";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // 稜線(明部)
    ctx.fillStyle = "#a89880";
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, 2);
    ctx.lineTo(TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineTo(6, TILE_SIZE - 2);
    ctx.closePath();
    ctx.fill();

    // 陰影(暗部、右下側)
    ctx.fillStyle = "#4d4032";
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, 2);
    ctx.lineTo(TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineTo(TILE_SIZE / 2 + 4, TILE_SIZE - 2);
    ctx.closePath();
    ctx.fill();

    // 雪冠(頂上の白)
    ctx.fillStyle = "#eef2f6";
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, 2);
    ctx.lineTo(TILE_SIZE / 2 + 5, 10);
    ctx.lineTo(TILE_SIZE / 2 - 5, 10);
    ctx.closePath();
    ctx.fill();
  }

  // 水: フレームアニメーション付きの波模様(2フレーム)
  function paintWater(ctx, baseColor, frame) {
    ctx.fillStyle = "#1f5aa0";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#2d6fbd";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    const phase = frame ? 4 : 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 3; row++) {
      const y = 6 + row * 10;
      ctx.beginPath();
      ctx.moveTo(-4 + phase, y);
      ctx.quadraticCurveTo(8 + phase, y - 4, 16 + phase, y);
      ctx.quadraticCurveTo(24 + phase, y + 4, 36 + phase, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    for (let row = 0; row < 3; row++) {
      const y = 11 + row * 10;
      ctx.beginPath();
      ctx.moveTo(-4 - phase, y);
      ctx.quadraticCurveTo(8 - phase, y + 3, 16 - phase, y);
      ctx.quadraticCurveTo(24 - phase, y - 3, 36 - phase, y);
      ctx.stroke();
    }
  }

  // 通常ワープ: 光る渦。町入口・洞窟入口は専用アイコンを使う。
  function paintWarp(ctx, baseColor) {
    ctx.fillStyle = "#6a5a2a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // 敷石風の縁取り
    ctx.strokeStyle = "#3a2f14";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  function paintTownEntrance(ctx, baseColor) {
    ctx.fillStyle = "#5b9b55";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#e2c56e";
    ctx.fillRect(4, 15, 24, 15);
    ctx.fillStyle = "#b34d3c";
    ctx.beginPath();
    ctx.moveTo(2, 16);
    ctx.lineTo(16, 5);
    ctx.lineTo(30, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#553a2d";
    ctx.fillRect(13, 21, 6, 9);
    ctx.fillStyle = "#fff2a6";
    ctx.fillRect(5, 18, 5, 5);
    ctx.fillRect(22, 18, 5, 5);
  }

  function paintDungeonEntrance(ctx, baseColor) {
    ctx.fillStyle = "#2b3038";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#59616b";
    ctx.fillRect(3, 23, 26, 7);
    ctx.fillStyle = "#111522";
    ctx.beginPath();
    ctx.moveTo(4, 24);
    ctx.lineTo(4, 15);
    ctx.quadraticCurveTo(16, 2, 28, 15);
    ctx.lineTo(28, 24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#9b6b72";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 14);
    ctx.quadraticCurveTo(16, 4, 26, 14);
    ctx.stroke();
    ctx.fillStyle = "#d37b5f";
    ctx.fillRect(8, 25, 4, 2);
    ctx.fillRect(20, 25, 4, 2);
  }

  // 動的な渦の発光を上書き描画する(map.js の drawTileCached から呼ばれる)
  function drawWarpGlow(ctx, screenX, screenY, kind) {
    const t = getAnimTime() / WARP_PULSE_MS;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const cx = screenX + TILE_SIZE / 2;
    const cy = screenY + TILE_SIZE / 2;

    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, TILE_SIZE / 2);
    grad.addColorStop(0, "rgba(255,240,180," + (0.85 * pulse + 0.15) + ")");
    grad.addColorStop(0.5, "rgba(255,190,80," + (0.5 * pulse + 0.1) + ")");
    grad.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    if (kind === "townEntrance" || kind === "dungeonEntrance") {
      ctx.strokeStyle = kind === "townEntrance"
        ? "rgba(255,235,130,0.75)"
        : "rgba(190,110,180,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
      return;
    }

    // 渦巻き線
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const turns = 2.2;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * turns * Math.PI * 2 + t * Math.PI * 2;
      const r = (i / steps) * (TILE_SIZE / 2 - 3);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ダンジョン岩肌(壁): ごつごつした岩の質感
  function paintDungeonWall(ctx, baseColor, tileId) {
    ctx.fillStyle = "#26221c";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rng = makeRng((tileId || 8) * 6151 + 3);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rng() * (TILE_SIZE - 8));
      const y = Math.floor(rng() * (TILE_SIZE - 8));
      const s = 4 + Math.floor(rng() * 6);
      ctx.fillStyle = i % 2 === 0 ? "#3a352a" : "#1a1712";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y + s * 0.4);
      ctx.lineTo(x + s * 0.6, y + s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }

  // 町の外周壁(城壁): 石積み+胸壁の凹凸
  function paintTownWall(ctx) {
    ctx.fillStyle = "#7a6d58";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "#4d4335";
    ctx.lineWidth = 1;
    // 石積みの目地(レンガ状)
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const offset = row % 2 === 0 ? 0 : 8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(TILE_SIZE, y);
      ctx.stroke();
      for (let x = -offset; x < TILE_SIZE; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
      }
    }
    // 上端の胸壁(凹凸)
    ctx.fillStyle = "#5c5140";
    for (let x = 0; x < TILE_SIZE; x += 10) {
      ctx.fillRect(x, 0, 6, 4);
    }
  }

  // 町内の床タイル: 石畳風の目地
  function paintTownFloor(ctx, baseColor, tileId) {
    ctx.fillStyle = baseColor || "#b8a078";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "rgba(90,70,40,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, 0);
    ctx.lineTo(TILE_SIZE / 2, TILE_SIZE);
    ctx.moveTo(0, TILE_SIZE / 2);
    ctx.lineTo(TILE_SIZE, TILE_SIZE / 2);
    ctx.stroke();
  }

  // 施設(建物): 屋根+壁+窓のミニ建築物として描画。facilityIdで屋根色を変える。
  const FACILITY_ROOF_COLORS = {
    inn: "#a03020",
    weaponShop: "#555a66",
    itemShop: "#2e7a4a",
    church: "#d8d8ee",
    generic: "#7a4a30",
  };

  function paintFacility(ctx, baseColor, facilityId) {
    // 床下地
    ctx.fillStyle = "#b8a078";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // 壁
    ctx.fillStyle = "#d8c8a8";
    ctx.fillRect(3, 14, TILE_SIZE - 6, TILE_SIZE - 16);

    // 屋根
    const roofColor = FACILITY_ROOF_COLORS[facilityId] || FACILITY_ROOF_COLORS.generic;
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(1, 15);
    ctx.lineTo(TILE_SIZE / 2, 2);
    ctx.lineTo(TILE_SIZE - 1, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.stroke();

    // 窓(施設種別ごとに窓の色を変えて識別性を上げる)
    const windowColor = facilityId === "church" ? "#ffe9a0" : "#8fd0ff";
    ctx.fillStyle = windowColor;
    ctx.fillRect(TILE_SIZE / 2 - 3, 19, 6, 6);
    ctx.strokeStyle = "#6a4a28";
    ctx.strokeRect(TILE_SIZE / 2 - 3, 19, 6, 6);

    // ドア
    ctx.fillStyle = "#5a3a20";
    ctx.fillRect(TILE_SIZE / 2 - 4, TILE_SIZE - 8, 8, 8);
  }

  // 宝箱タイル: 金の縁取りをした木箱
  function paintChestTile(ctx) {
    ctx.fillStyle = "#7a6a50";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#8a5a20";
    ctx.fillRect(6, 12, TILE_SIZE - 12, TILE_SIZE - 16);
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(6, 12, TILE_SIZE - 12, 4);
    ctx.strokeStyle = "#5a3a10";
    ctx.strokeRect(6, 12, TILE_SIZE - 12, TILE_SIZE - 16);
    ctx.fillStyle = "#e8cf6a";
    ctx.fillRect(TILE_SIZE / 2 - 2, 17, 4, 4);
  }

  // 階段
  function paintStairs(ctx) {
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "#c9c9dd";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.strokeRect(2 + i * 2, 2 + i * 6, TILE_SIZE - 4 - i * 4, 4);
      ctx.fillStyle = "rgba(180,180,220,0.15)";
      ctx.fillRect(2 + i * 2, 2 + i * 6, TILE_SIZE - 4 - i * 4, 4);
    }
  }

  // ボス部屋床: 不穏な紫床+装飾
  function paintBossFloor(ctx) {
    ctx.fillStyle = "#2a1424";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "rgba(200,60,120,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, 4);
    ctx.lineTo(TILE_SIZE / 2, TILE_SIZE - 4);
    ctx.moveTo(4, TILE_SIZE / 2);
    ctx.lineTo(TILE_SIZE - 4, TILE_SIZE / 2);
    ctx.stroke();
  }

  function paintLockedDoor(ctx, baseColor) {
    ctx.fillStyle = baseColor || "#8a5030";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#5a3018";
    ctx.fillRect(6, 4, 20, 24);
    ctx.fillStyle = "#c9a060";
    ctx.beginPath();
    ctx.arc(22, 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2010";
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 4, 20, 24);
  }

  function paintSwitchPlate(ctx, baseColor, tileId) {
    ctx.fillStyle = baseColor || "#6a6a70";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#909098";
    ctx.fillRect(8, 10, 16, 12);
    ctx.strokeStyle = "#404048";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 10, 16, 12);
    const rng = makeRng((tileId || 0) + 25);
    if (rng() > 0.5) {
      ctx.fillStyle = "#b8e060";
      ctx.fillRect(12, 14, 8, 4);
    }
  }

  function paintClosedGate(ctx, baseColor) {
    ctx.fillStyle = baseColor || "#2a2a38";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "#888898";
    ctx.lineWidth = 3;
    for (let i = 6; i <= 26; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 2);
      ctx.lineTo(i, TILE_SIZE - 2);
      ctx.stroke();
    }
  }

  function paintDarknessFloor(ctx, baseColor, tileId) {
    ctx.fillStyle = baseColor || "#2a2418";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rng = makeRng((tileId || 0) + 27);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 6; i++) {
      const px = Math.floor(rng() * 28) + 2;
      const py = Math.floor(rng() * 28) + 2;
      ctx.fillRect(px, py, 2, 2);
    }
  }

  // ------------------------------------------------------------------
  // 公開: タイル描画(map.js から呼ばれるエントリポイント)
  // ------------------------------------------------------------------
  function drawTileCached(ctx, tileId, def, screenX, screenY, painterKeyOverride) {
    const key = painterKeyOverride || resolvePainterKey(def);
    let frame = 0;
    if (key === "water") frame = getWaterFrame();

    const canvas = getTileCanvas(tileId, def, frame);
    ctx.drawImage(canvas, screenX, screenY);

    // ワープ演出のみ動的にオーバーレイ(渦のアニメーションはキャッシュできないため)
    if (key === "warp" || key === "townEntrance" || key === "dungeonEntrance") {
      drawWarpGlow(ctx, screenX, screenY, key);
    }
  }

  // ------------------------------------------------------------------
  // キャラクタースプライト(主人公・隊列メンバー・NPC)
  // ------------------------------------------------------------------

  // 職業ごとの配色・装備シルエット定義。
  // bodyColor: 服の色 / accentColor: 装備(武器・杖等)の色 / helm: 頭防具の有無
  const JOB_APPEARANCE = {
    akatsukiKenshi: { bodyColor: "#2a5ad0", accentColor: "#dcdcdc", equip: "sword", skin: "#f5d6a8", hair: "#3a2818" },
    goukenhei: { bodyColor: "#8a3020", accentColor: "#c0c0c0", equip: "axe", skin: "#e8b888", hair: "#1a1a1a" },
    hoshiyomi: { bodyColor: "#4a2a8a", accentColor: "#c9a2ff", equip: "rod", skin: "#f0d8b8", hair: "#202040" },
    iyashiNoMiko: { bodyColor: "#e8e8f4", accentColor: "#f5c94a", equip: "staff", skin: "#f5d6a8", hair: "#c9a227" },
    gyoushounin: { bodyColor: "#3a7a3a", accentColor: "#8a5a20", equip: "bag", skin: "#e8b888", hair: "#4a3018" },
    // ひよこ勇者よよよー: 他ジョブとは異なる丸っこいひよこシルエットで描画する
    // (SVGスプライト側でchick:trueを見てhero-chickクラスへ分岐する)。
    yoyoyo: { bodyColor: "#ffe066", accentColor: "#ff9a1f", equip: "none", skin: "#ffe066", hair: "#ff9a1f", chick: true },
  };
  const DEFAULT_JOB_APPEARANCE = { bodyColor: "#3aa050", accentColor: "#cccccc", equip: "none", skin: "#f5d6a8", hair: "#2a1a10" };

  function getJobAppearance(jobId) {
    return JOB_APPEARANCE[jobId] || DEFAULT_JOB_APPEARANCE;
  }

  // ------------------------------------------------------------------
  // ひよこ大王(よよよーの変貌後の姿)専用カットシーン描画。
  // 戦闘スプライトはbattle.js側の独自描画系(pickMonsterDrawer)が担当するため
  // ここでは中ボス撃破直後の変身カットシーン(map.js)で使う、フィールド上に
  // 一時的に大写しするための大型・威圧的な演出用スプライトとして提供する。
  // cx, cy: 描画中心座標(px) / size: 概ねの半径スケール(px) / t: 経過ms(演出用)
  // ------------------------------------------------------------------
  function drawChickEmperor(ctx, cx, cy, size, t) {
    const time = typeof t === "number" ? t : Date.now();
    const pulse = 0.5 + 0.5 * Math.sin(time / 420);

    ctx.save();

    // 禍々しいオーラ(パルスする暗紫〜赤のグロー)
    const auraR = size * (1.15 + 0.08 * pulse);
    const grad = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, auraR);
    grad.addColorStop(0, "rgba(120,10,30," + (0.35 + 0.15 * pulse) + ")");
    grad.addColorStop(0.7, "rgba(60,5,20,0.25)");
    grad.addColorStop(1, "rgba(20,0,10,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // マント/翼(大きく黒ずんだ羽を左右に広げる、威圧感の演出)
    const wingSpread = size * (0.95 + 0.05 * pulse);
    ctx.fillStyle = "#241018";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.25, cy + size * 0.1);
      ctx.quadraticCurveTo(
        cx + side * wingSpread, cy - size * 0.2,
        cx + side * wingSpread * 0.9, cy + size * 0.55
      );
      ctx.quadraticCurveTo(
        cx + side * size * 0.55, cy + size * 0.45,
        cx + side * size * 0.25, cy + size * 0.1
      );
      ctx.closePath();
      ctx.fill();
    });

    // 胴体(通常のひよこよりはるかに肥大化した卵型シルエット)
    ctx.fillStyle = "#3a3020";
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.25, size * 0.55, size * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5c4a20";
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.3, size * 0.42, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭部(禍々しく変色した黄〜黒のグラデーション)
    const headR = size * 0.4;
    const headY = cy - size * 0.35;
    const headGrad = ctx.createRadialGradient(cx, headY, headR * 0.1, cx, headY, headR);
    headGrad.addColorStop(0, "#5c4a10");
    headGrad.addColorStop(1, "#2a2010");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // 王冠(金と黒の禍々しい王権の象徴)
    ctx.fillStyle = "#c9a227";
    const crownY = headY - headR * 0.95;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.8, crownY + headR * 0.35);
    ctx.lineTo(cx - headR * 0.8, crownY);
    ctx.lineTo(cx - headR * 0.4, crownY + headR * 0.3);
    ctx.lineTo(cx, crownY - headR * 0.25);
    ctx.lineTo(cx + headR * 0.4, crownY + headR * 0.3);
    ctx.lineTo(cx + headR * 0.8, crownY);
    ctx.lineTo(cx + headR * 0.8, crownY + headR * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6a4a10";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#8a1030";
    ctx.beginPath();
    ctx.arc(cx, crownY - headR * 0.2, headR * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // くちばし(巨大で鋭い、下向きに歪んだ形状)
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.35, headY + headR * 0.25);
    ctx.lineTo(cx, headY + headR * 0.75);
    ctx.lineTo(cx + headR * 0.35, headY + headR * 0.25);
    ctx.closePath();
    ctx.fill();

    // 目(発光する赤い瞳、脈動する)
    const eyeGlow = 0.6 + 0.4 * pulse;
    ctx.fillStyle = "rgba(255,40,40," + eyeGlow + ")";
    ctx.beginPath();
    ctx.arc(cx - headR * 0.35, headY - headR * 0.05, headR * 0.16, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.35, headY - headR * 0.05, headR * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx - headR * 0.35, headY - headR * 0.05, headR * 0.06, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.35, headY - headR * 0.05, headR * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ------------------------------------------------------------------
  // NPC描画: 数バリエーションの村人ルック
  // ------------------------------------------------------------------
  const NPC_VARIANTS = [
    { bodyColor: "#c94a4a", skin: "#f0d0a0", hair: "#4a2818", hat: false },
    { bodyColor: "#4a7ac9", skin: "#e8c090", hair: "#1a1a1a", hat: true, hatColor: "#3a5a8a" },
    { bodyColor: "#c9a227", skin: "#f5d6a8", hair: "#8a5a20", hat: false },
    { bodyColor: "#5a8a5a", skin: "#e0b080", hair: "#202020", hat: true, hatColor: "#3a5a30" },
    { bodyColor: "#8a5ac9", skin: "#f0d0b0", hair: "#c9a227", hat: false },
  ];

  function getNpcVariant(npc) {
    if (npc && npc.color) {
      // マップ定義側で色指定済みのNPCは、その色を体色として使いつつ
      // バリエーションindexは名前のハッシュで決めて見た目を安定させる。
      const idx = hashString(npc.id || npc.name || "") % NPC_VARIANTS.length;
      return Object.assign({}, NPC_VARIANTS[idx], { bodyColor: npc.color });
    }
    const idx = hashString((npc && (npc.id || npc.name)) || "npc") % NPC_VARIANTS.length;
    return NPC_VARIANTS[idx];
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  // フィールド用キャラクタースプライト(SVG)の内部マークアップを生成する。
  // 主人公・隊列メンバー・NPCのすべてが同一構造のSVGを使い、CSSクラス
  // (facing-*, is-walking, is-chick, equip-*, has-hat)とカスタムプロパティ
  // (--body-color, --accent-color, --skin-color, --hair-color, --hat-color)で
  // 見た目を切り替える。マークアップの実体をここに一元化し、index.htmlとの
  // 二重管理を避ける(HTML側のsvg要素は空で置き、map.jsが遅延populateする)。
  function buildCharacterSpriteMarkup() {
    return '' +
      '<g class="hero-shadow"><ellipse cx="16" cy="28" rx="8" ry="3" /></g>' +
      '<g class="hero-normal">' +
      '<g class="hero-legs"><rect class="hero-leg hero-leg-left" x="11" y="20" width="3" height="8" /><rect class="hero-leg hero-leg-right" x="18" y="20" width="3" height="8" /></g>' +
      '<rect class="hero-body" x="8" y="10" width="16" height="14" rx="1" /><circle class="hero-head" cx="16" cy="8" r="6" /><path class="hero-hair" d="M9.8 7.2a6.2 6.2 0 0 1 12.4 0v-2a6.2 6.2 0 0 0-12.4 0z" /><path class="hero-hat" d="M9 5h14l-7 -9z" /><circle class="hero-face" cx="16" cy="9" r="1.4" />' +
      '<g class="hero-equip hero-equip-sword"><path d="M24 17l3-9 1.8.7-3 9z" /><rect x="23" y="17" width="6" height="2" rx=".5" /></g><g class="hero-equip hero-equip-axe"><rect x="24" y="10" width="2" height="12" /><path d="M25 10l5 2-5 3z" /></g><g class="hero-equip hero-equip-rod hero-equip-staff"><rect x="24" y="8" width="2" height="15" /><circle cx="25" cy="8" r="3" /></g><g class="hero-equip hero-equip-bag"><rect x="3" y="14" width="6" height="7" rx="1" /></g>' +
      '</g>' +
      '<g class="hero-chick"><g class="hero-chick-legs"><rect x="12" y="24" width="3" height="5" /><rect x="18" y="24" width="3" height="5" /></g><ellipse class="hero-chick-body" cx="16" cy="21" rx="7" ry="8.5" /><ellipse class="hero-chick-wing" cx="23" cy="19" rx="3" ry="5" transform="rotate(22 23 19)" /><circle class="hero-chick-head" cx="16" cy="11" r="6.5" /><path class="hero-chick-tuft" d="M13 6l3-4 3 4z" /><path class="hero-chick-beak" d="M16 11l5 2-5 2z" /><circle class="hero-chick-eye" cx="18" cy="10" r="1" /></g>';
  }

  // ------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------
  RPG.gfx = {
    TILE_SIZE: TILE_SIZE,
    drawTileCached: drawTileCached,
    drawWarpGlow: drawWarpGlow,
    getJobAppearance: getJobAppearance,
    getNpcVariant: getNpcVariant,
    drawChickEmperor: drawChickEmperor,
    buildCharacterSpriteMarkup: buildCharacterSpriteMarkup,
  };
})();
