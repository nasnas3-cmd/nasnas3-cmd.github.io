// battle.js
// 責務: 戦闘シーンのロジック(コマンド処理・行動順・ダメージ計算・勝敗判定)
// 公開API: window.RPG.battle = { enter, queueCommand, resolveTurn, checkBattleEnd, calcDamage }
// 他モジュール(RPG.data, RPG.state, RPG.engine, RPG.ui)は存在前提で参照する。

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  // ------------------------------------------------------------------
  // 内部状態
  // ------------------------------------------------------------------

  /**
   * battleState の構造:
   * {
   *   active: boolean,
   *   monsterGroup: [ { instanceId, monsterId, name, stats:{hp,maxHp,mp,maxMp,atk,def,spd,int,luck}, spriteShape, exp, gold, dropTable, isBoss, dead } ],
   *   party: [参照] RPG.state.party の生存メンバー配列(実体はRPG.state.partyの要素をそのまま使う),
   *   commandQueue: { actorId: {command, target, spellId, itemId} },
   *   turnOrder: [ {kind:"party"|"monster", ref, spd} ],
   *   log: [ "メッセージ", ... ],
   *   guardFlags: { actorId: boolean },
   *   turnCount: number,
   *   result: null | "win" | "lose" | "escape",
   *   onEnd: function|null,   // 戦闘終了後に呼び出すコールバック
   *   phase: "input" | "resolving" | "end"
   * }
   */
  let battleState = null;

  const ELEMENT_WEAK_MULT = 1.5;
  const ELEMENT_RESIST_MULT = 0.5;

  // ------------------------------------------------------------------
  // ユーティリティ
  // ------------------------------------------------------------------

  function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randRange(rate) {
    // ±rate (例 0.1 -> 0.9〜1.1倍)
    return 1 + (Math.random() * 2 - 1) * rate;
  }

  function isPartyDead(member) {
    return !member || member.hp <= 0;
  }

  function aliveParty() {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    return party.filter((m) => !isPartyDead(m));
  }

  function aliveMonsters() {
    if (!battleState) return [];
    return battleState.monsterGroup.filter((m) => !m.dead && m.stats.hp > 0);
  }

  function pushLog(text) {
    if (!battleState) return;
    battleState.log.push(text);
    if (window.RPG.ui && typeof window.RPG.ui.showMessage === "function") {
      window.RPG.ui.showMessage(text);
    }
  }

  // 戦闘終了(勝利/逃走/全滅)時専用のメッセージ登録。pushLog()と違い
  // ここでは即座にui.showMessage()を呼ばず、finishBattle()が結果確定後に
  // まとめて確認待ちキューへ積む(battleState.endMessages)。これにより、
  // 「メッセージを読み終える前にフィールドへ戻ってしまう」不具合を防ぐ。
  function pushEndMessage(text) {
    if (!battleState) return;
    battleState.log.push(text);
    battleState.endMessages = battleState.endMessages || [];
    battleState.endMessages.push(text);
  }

  // 戦闘ログを読み終えるまで、次の味方コマンドを表示しない。
  // 自動送り・マニュアル送りのどちらでも同じ待機処理を通す。
  function openCommandMenuWhenMessagesComplete() {
    const ui = window.RPG.ui;
    const open = function () {
      if (!battleState || battleState.result) return;
      if (ui && typeof ui.isMessageBusy === "function" && ui.isMessageBusy()) {
        window.setTimeout(open, 30);
        return;
      }
      if (ui && typeof ui.renderBattleUI === "function") ui.renderBattleUI(battleState);
      if (ui && typeof ui.openMenu === "function") {
        ui.openMenu("command", { actorIndex: 0 });
      }
    };
    open();
  }

  function getSpell(spellId) {
    const spells = (window.RPG.data && window.RPG.data.SPELLS) || {};
    return spells[spellId] || null;
  }

  function getItem(itemId) {
    const items = (window.RPG.data && window.RPG.data.ITEMS) || {};
    return items[itemId] || null;
  }

  // battle.js内部で使う汎用キー(atk/def/spd/int/luck)と、data.js/パーティメンバーの
  // 実データキー(chikara/mamori/subayasa/kashikosa/un)の対応表。
  const STAT_KEY_ALIASES = {
    atk: "chikara",
    def: "mamori",
    spd: "subayasa",
    int: "kashikosa",
    luck: "un",
  };

  function statOf(entity, key, fallback) {
    if (!entity) return fallback || 0;
    let base = null;
    if (entity.stats) {
      if (entity.stats[key] != null) base = entity.stats[key];
      else {
        const aliasKey = STAT_KEY_ALIASES[key];
        if (aliasKey && entity.stats[aliasKey] != null) base = entity.stats[aliasKey];
      }
    }
    if (base == null && entity[key] != null) base = entity[key];
    if (base == null) base = fallback || 0;

    // 装備ボーナス(パーティメンバーのみ)を反映する。calcDamage/statOf経由で
    // 参照しないと店で購入した武器防具が完全に無意味になってしまう。
    const aliasKey = STAT_KEY_ALIASES[key] || key;
    base += equipmentBonus(entity, aliasKey);

    // 補助呪文(ブレスヴァル/シェルガード等)によるバフを反映する。
    if (entity.buffs && entity.buffs[aliasKey]) {
      base += entity.buffs[aliasKey];
    }

    return base;
  }

  // パーティメンバーの装備(equipment.weapon/armor/shield/accessory)由来の
  // statBonus 合計を返す。モンスターには装備が無いため常に0。
  function equipmentBonus(entity, statKey) {
    if (!entity || !entity.equipment) return 0;
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    let total = 0;
    Object.keys(entity.equipment).forEach((slot) => {
      const itemId = entity.equipment[slot];
      if (!itemId) return;
      const def = itemsData[itemId];
      if (!def || !def.statBonus) return;
      if (def.statBonus[statKey] != null) total += def.statBonus[statKey];
    });
    return total;
  }

  // ------------------------------------------------------------------
  // 戦闘開始
  // ------------------------------------------------------------------

  /**
   * 戦闘開始、UI初期化
   * @param {Array} monsterGroup - モンスターID配列 or モンスター定義オブジェクト配列
   */
  function enter(monsterGroup, opts) {
    opts = opts || {};
    const MONSTERS = (window.RPG.data && window.RPG.data.MONSTERS) || {};

    const normalizedGroup = (monsterGroup || []).map((entry, idx) => {
      // entry は monsterId(文字列)か、{monsterId,...}のどちらか
      const monsterId = typeof entry === "string" ? entry : entry.monsterId;
      const def = MONSTERS[monsterId] || {};
      const baseStats = def.stats || {};
      return {
        instanceId: "m" + idx + "_" + monsterId,
        monsterId: monsterId,
        name: def.name || monsterId || "謎の敵",
        stats: {
          hp: baseStats.hp || 10,
          maxHp: baseStats.hp || 10,
          mp: baseStats.mp || 0,
          maxMp: baseStats.mp || 0,
          atk: baseStats.chikara || 5,
          def: baseStats.mamori || 3,
          spd: baseStats.subayasa || 5,
          int: baseStats.kashikosa || 3,
          luck: baseStats.un || 3,
          resist: baseStats.resist || {},
        },
        spriteShape: def.spriteShape || { type: "circle", color: "#a33" },
        exp: def.exp || 0,
        gold: def.gold || 0,
        dropTable: def.dropTable || [],
        isBoss: !!def.isBoss,
        isFinalBoss: !!def.isFinalBoss,
        // ボスの第2形態(HP閾値で強化+専用呪文発動)情報をコピーしないと
        // decideMonsterCommand() 側でボス特殊行動(深淵咆哮等)が絶対に発動しない。
        phase2: def.phase2 || null,
        phase2Applied: false,
        bossSpellId: (def.phase2 && def.phase2.specialSpell && def.phase2.specialSpell.id) || def.bossSpellId || null,
        // C-1: 敵AI行動パターン(aggressive/defensive/caster/support/flee)。
        // data.js MONSTERS[id].aiType が未設定なら現行動作(ランダム攻撃)のまま。
        aiType: def.aiType || null,
        dead: false,
      };
    });

    battleState = {
      active: true,
      monsterGroup: normalizedGroup,
      commandQueue: {},
      turnOrder: [],
      log: [],
      guardFlags: {},
      turnCount: 0,
      result: null,
      onEnd: opts.onEnd || null,
      isPostgame: !!opts.isPostgame,
      phase: "input",
      // 戦闘終了時(勝利/逃走/全滅)の結果メッセージ。finishBattle()が
      // これらを戦闘画面上で順番に表示し、プレイヤーがEnter/Zで最後まで
      // 読み終えてからシーン遷移する(pushEndMessage参照)。
      endMessages: [],
    };

    if (window.RPG.state) {
      // 戦闘終了後に元シーンへ戻れるよう、遷移前のシーン名を記録しておく。
      // (previousSceneが未設定のままだと勝利後に必ず"field"へ飛ばされる)
      const currentScene = window.RPG.engine && window.RPG.engine.getCurrentScene
        ? window.RPG.engine.getCurrentScene()
        : window.RPG.state.scene;
      if (currentScene && currentScene !== "battle") {
        window.RPG.state.previousScene = currentScene;
      }
      window.RPG.state.scene = "battle";
    }

    pushLog(
      normalizedGroup.length > 1
        ? `${normalizedGroup.map((m) => m.name).join("、")}が あらわれた!`
        : `${normalizedGroup[0] ? normalizedGroup[0].name : "敵"}が あらわれた!`
    );

    // ボスが混じっている場合は登場演出(大型フラッシュ)を1度だけトリガーする。
    if (normalizedGroup.some((m) => m.isBoss)) {
      triggerBossIntro();
    }

    openCommandMenuWhenMessagesComplete();

    return battleState;
  }

  // ------------------------------------------------------------------
  // コマンド入力(ui.jsから呼ばれる)
  // ------------------------------------------------------------------

  /**
   * @param {string} actorId - パーティメンバーのID(name または index文字列)
   * @param {string} command - "attack" | "spell" | "item" | "guard" | "run"
   * @param {object} target - { type:"monster"|"party", id } など
   */
  function queueCommand(actorId, command, target, extraId) {
    if (!battleState || battleState.phase !== "input") return;

    const entry = {
      command: command,
      target: target || {},
    };
    if (command === "spell") entry.spellId = extraId;
    if (command === "item") entry.itemId = extraId;

    battleState.commandQueue[actorId] = entry;

    const party = aliveParty();
    const allQueued = party.every((p) => battleState.commandQueue[p.id || p.name] !== undefined);

    if (allQueued) {
      resolveTurn();
    } else if (window.RPG.ui && typeof window.RPG.ui.openMenu === "function") {
      const nextIndex = party.findIndex(
        (p) => battleState.commandQueue[p.id || p.name] === undefined
      );
      window.RPG.ui.openMenu("command", { actorIndex: nextIndex });
    }
  }

  // ------------------------------------------------------------------
  // ダメージ計算(物理・呪文共用)
  // ------------------------------------------------------------------

  /**
   * @param {object} attacker - {stats:{atk,int,luck}} 相当
   * @param {object} defender - {stats:{def}} 相当
   * @param {object} moveData - { kind:"physical"|"spell", power, element, critBase }
   * @returns {object} { damage, isCrit, isMiss }
   */
  function calcDamage(attacker, defender, moveData) {
    moveData = moveData || {};
    const kind = moveData.kind || "physical";

    const atk = statOf(attacker, "atk", 5);
    const def = statOf(defender, "def", 3);
    const int = statOf(attacker, "int", 3);
    const luck = statOf(attacker, "luck", 3);

    const critRate = 1 / 32 + luck * 0.002;
    const isCrit = Math.random() < critRate;

    // C-4: 耐性・弱点マトリクス(ROADMAP B-5)。resist値の意味:
    // -1=弱点(1.5倍) / 0=通常(等倍) / 0.5=半減 / 1=無効(倍率0)。
    // 値が未定義(既存モンスターの多くはresist未設定)の場合は従来通り等倍のまま。
    let elementMult = 1;
    if (kind === "spell" && moveData.element) {
      const resist = (defender.stats && defender.stats.resist) || {};
      const resistValue = resist[moveData.element];
      if (resistValue === -1) elementMult = ELEMENT_WEAK_MULT;
      else if (resistValue === 0.5) elementMult = ELEMENT_RESIST_MULT;
      else if (resistValue === 1) elementMult = 0;
      // 0 または未定義は等倍(elementMult = 1のまま)
    }

    let base;
    if (kind === "physical") {
      base = atk * 1.0 - def / 2;
    } else {
      // 呪文
      const power = moveData.power || 0;
      base = power + int / 2;
    }

    base = Math.max(1, base);
    let damage = base * randRange(0.1) * elementMult;

    if (isCrit) damage *= 2;

    damage = Math.max(elementMult === 0 ? 0 : 1, Math.round(damage));

    return { damage: damage, isCrit: isCrit, isMiss: false, elementMult: elementMult };
  }

  // C-4: 弱点/耐性ヒット時のログメッセージ。elementMultが等倍(1)または
  // undefined(物理攻撃等、属性判定対象外)の場合は何も表示しない。
  function pushElementResultLog(elementMult) {
    if (elementMult == null || elementMult === 1) return;
    if (elementMult === ELEMENT_WEAK_MULT) {
      pushLog("こうかは ばつぐんだ!");
    } else if (elementMult === 0) {
      pushLog("しかし 効かなかった!");
    } else if (elementMult === ELEMENT_RESIST_MULT) {
      pushLog("あまり 効いていない…");
    }
  }

  // ------------------------------------------------------------------
  // 行動順計算
  // ------------------------------------------------------------------

  function buildTurnOrder() {
    const order = [];
    const party = aliveParty();

    party.forEach((member) => {
      const id = member.id || member.name;
      const cmd = battleState.commandQueue[id];
      if (!cmd) return;
      const isDisabled = member.status === "sleep" || member.status === "paralyze";
      order.push({
        kind: "party",
        ref: member,
        cmd: isDisabled ? { command: "none" } : cmd,
        spd: statOf(member, "spd", 5) * randRange(0.2),
      });
    });

    aliveMonsters().forEach((monster) => {
      // モンスターの行動: 単純にランダムでたたかうを選択(ボスは専用行動を後段で追加可)
      order.push({
        kind: "monster",
        ref: monster,
        cmd: monster.status === "sleep" || monster.status === "paralyze"
          ? { command: "none" }
          : decideMonsterCommand(monster),
        spd: statOf(monster, "spd", 5) * randRange(0.2),
      });
    });

    order.sort((a, b) => b.spd - a.spd);
    return order;
  }

  function decideMonsterCommand(monster) {
    // ボスは低HPで第2形態に移行し、専用呪文(深淵咆哮等)を使うことがある。
    applyBossPhase2IfNeeded(monster);
    if (monster.isBoss && monster.stats.hp <= monster.stats.maxHp * (monster.phase2 ? monster.phase2.hpThreshold : 0.5) && monster.bossSpellId) {
      // 専用呪文がallyAll(全体)かenemySingle(単体)かでtargetの組み方を変える。
      // (旧実装は常にscope:"all"を指定しており、単体状態異常呪文=闇縛りの呪等の
      //  対象選択が正しく機能しなかった)
      const bossSpell = getSpell(monster.bossSpellId);
      const isSingleTarget = bossSpell && !/All$/.test(bossSpell.target || "");
      if (isSingleTarget) {
        const singleTargets = aliveParty();
        if (singleTargets.length > 0) {
          const t = singleTargets[rnd(0, singleTargets.length - 1)];
          return { command: "spell", target: { type: "party", id: t.id || t.name }, spellId: monster.bossSpellId };
        }
      }
      return { command: "spell", target: { type: "party", scope: "all" }, spellId: monster.bossSpellId };
    }

    const targets = aliveParty();
    if (targets.length === 0) return { command: "attack", target: {} };

    // C-1: 敵AI行動パターン。aiType未設定(デフォルト)は従来通りランダム攻撃。
    const hpRatio = monster.stats.maxHp > 0 ? monster.stats.hp / monster.stats.maxHp : 1;

    if (monster.aiType === "flee") {
      // メタルほしくず等: 常に逃走を試みる。
      return { command: "run", target: {} };
    }

    if (monster.aiType === "support") {
      // 味方(他の生存モンスター)のHPが低ければ回復呪文を優先する。
      const ally = aliveMonsters().find((m) => m !== monster && m.stats.hp < m.stats.maxHp * 0.5);
      if (ally && monster.stats.mp >= 2) {
        const healSpellId = pickMonsterSpell(monster, "heal");
        if (healSpellId) {
          return { command: "spell", target: { type: "monster", id: ally.instanceId, scope: "ally" }, spellId: healSpellId };
        }
      }
    }

    if (monster.aiType === "caster") {
      // MPがあれば呪文を優先する。
      const spellId = pickMonsterSpell(monster, "damage");
      if (spellId) {
        const t = targets[rnd(0, targets.length - 1)];
        return { command: "spell", target: { type: "party", id: t.id || t.name }, spellId: spellId };
      }
    }

    if (monster.aiType === "defensive" && hpRatio <= 0.5 && Math.random() < 0.4) {
      // HP50%以下でぼうぎょ率上昇(通常より高確率で防御を選ぶ)。
      return { command: "guard", target: {} };
    }

    // aggressive: HP30%以下で全力攻撃(防御無視の通常攻撃を必ず選択)。
    // 通常のランダム攻撃と同じ処理だが、判定意図を明示するために分岐を残す。
    const t = targets[rnd(0, targets.length - 1)];
    return { command: "attack", target: { type: "party", id: t.id || t.name } };
  }

  // モンスターのMPで詠唱可能な呪文の中から、種別(kind: "damage"|"heal")に合う
  // ものを1つ選ぶ簡易ロジック。data.js SPELLSのeffectTypeで判定する。
  function pickMonsterSpell(monster, kind) {
    const spellsData = (window.RPG.data && window.RPG.data.SPELLS) || {};
    const mp = monster.stats.mp || 0;
    const candidates = Object.keys(spellsData).filter((id) => {
      const s = spellsData[id];
      if (!s || (s.mpCost || 0) > mp) return false;
      if (kind === "heal") return s.effectType === "heal" || s.effectType === "healAll";
      return s.effectType === "damage" || s.effectType === "damageAll";
    });
    if (!candidates.length) return null;
    return candidates[rnd(0, candidates.length - 1)];
  }

  // HP閾値を下回った時点で一度だけボスのフェーズ2ステータス補正を適用する。
  function applyBossPhase2IfNeeded(monster) {
    if (!monster || !monster.phase2 || monster.phase2Applied) return;
    const threshold = monster.phase2.hpThreshold != null ? monster.phase2.hpThreshold : 0.5;
    if (monster.stats.hp > monster.stats.maxHp * threshold) return;
    const bonus = monster.phase2.statBonus || {};
    Object.keys(bonus).forEach((key) => {
      const aliasKey = Object.keys(STAT_KEY_ALIASES).find((k) => STAT_KEY_ALIASES[k] === key) || key;
      monster.stats[aliasKey] = (monster.stats[aliasKey] || 0) + bonus[key];
    });
    monster.phase2Applied = true;
    pushLog(`${monster.name}の ようすが かわった!`);
    // C-2: 中ボス2フェーズ化の専用セリフ(黄昏騎士隊長/闇の監視者)。
    if (monster.phase2.quote) {
      pushLog(monster.phase2.quote);
    }
  }

  // ------------------------------------------------------------------
  // ターン解決
  // ------------------------------------------------------------------

  function resolveTurn() {
    if (!battleState) return;
    battleState.phase = "resolving";
    battleState.turnCount++;

    const order = buildTurnOrder();
    battleState.turnOrder = order;
    battleState.guardFlags = {};

    for (let i = 0; i < order.length; i++) {
      const entry = order[i];
      if (battleState.result) break; // 既に決着している場合は処理しない

      if (entry.kind === "party" && isPartyDead(entry.ref)) continue;
      if (entry.kind === "monster" && (entry.ref.dead || entry.ref.stats.hp <= 0)) continue;

      executeAction(entry);
      checkBattleEnd();
    }

    battleState.commandQueue = {};

    if (!battleState.result) {
      battleState.phase = "input";
      openCommandMenuWhenMessagesComplete();
    }
  }

  function executeAction(entry) {
    const cmd = entry.cmd;
    if (!cmd) return;

    switch (cmd.command) {
      case "attack":
        doAttack(entry.ref, cmd.target, entry.kind);
        break;
      case "spell":
        doSpell(entry.ref, cmd.target, cmd.spellId, entry.kind);
        break;
      case "item":
        doItem(entry.ref, cmd.target, cmd.itemId, entry.kind);
        break;
      case "guard":
        doGuard(entry.ref, entry.kind);
        break;
      case "run":
        doRun(entry.ref, entry.kind);
        break;
      case "none":
        pushLog(`${entry.ref.name}は うごけない!`);
        // 状態異常は行動を1回無駄にした時点で解除される簡易仕様。
        if (entry.ref.status) entry.ref.status = null;
        break;
      default:
        break;
    }
  }

  function resolveActorId(actor) {
    // モンスターは instanceId で一意に識別する(nameは同種モンスターで重複しうる上、
    // doGuard() が非パーティ側で保存するキーも instanceId のため、ここで一致させないと
    // モンスターの防御(guardFlags)がダメージ計算側で一切参照されなくなる)。
    if (actor && actor.instanceId) return actor.instanceId;
    return actor.id || actor.name;
  }

  function findMonsterTarget(target) {
    const alive = aliveMonsters();
    if (!alive.length) return null;
    if (target && target.id) {
      const found = alive.find((m) => m.instanceId === target.id);
      if (found) return found;
    }
    return alive[0];
  }

  function findPartyTarget(target) {
    const alive = aliveParty();
    if (!alive.length) return null;
    if (target && target.id) {
      const found = alive.find((m) => resolveActorId(m) === target.id);
      if (found) return found;
    }
    return alive[rnd(0, alive.length - 1)];
  }

  // 戦闘Canvas上でのモンスターの現在描画位置(cx, cy)を返す。
  // renderMonsters()内のレイアウト計算と同じロジックを使い、ヒットエフェクト/
  // ダメージポップアップの座標をモンスターの実際の表示位置に合わせる。
  function getMonsterScreenPos(monster) {
    const ctx = getBattleCtx();
    if (!ctx || !battleState) return null;
    const group = battleState.monsterGroup;
    const idx = group.indexOf(monster);
    if (idx < 0) return null;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const spacing = w / (group.length + 1);
    return { cx: spacing * (idx + 1), cy: h * 0.5 };
  }

  // パーティ側の被弾位置は画面下部中央付近に固定表示する(パーティ側は
  // Canvas上に個別イラストを持たないため)。
  function getPartyScreenPos() {
    const ctx = getBattleCtx();
    if (!ctx) return { cx: 0, cy: 0 };
    return { cx: ctx.canvas.width * 0.5, cy: ctx.canvas.height * 0.85 };
  }

  function getBattleCtx() {
    if (window.RPG.ui && typeof window.RPG.ui.getBattleCanvasContext === "function") {
      const c = window.RPG.ui.getBattleCanvasContext();
      if (c) return c;
    }
    const el = document.getElementById("canvas-battle");
    return el ? el.getContext("2d") : null;
  }

  function doAttack(attacker, target, kind) {
    const isPartyAttacker = kind === "party";
    const defender = isPartyAttacker ? findMonsterTarget(target) : findPartyTarget(target);
    if (!defender) return;

    const attackerName = isPartyAttacker ? attacker.name : attacker.name;
    const defenderName = isPartyAttacker ? defender.name : defender.name;

    let defStats = isPartyAttacker ? defender.stats : defender.stats;
    if (battleState.guardFlags[resolveActorId(defender)]) {
      // 防御中は被ダメージ軽減(まもり2倍扱い)
      defStats = Object.assign({}, defStats, { def: (defStats.def || 0) * 2 });
    }

    const result = calcDamage(attacker, { stats: defStats }, { kind: "physical" });
    applyDamage(defender, result.damage, isPartyAttacker ? "monster" : "party");
    if (window.RPG.Audio) window.RPG.Audio.playSe("hit");

    triggerHitEffect({ shakePower: result.isCrit ? 14 : 8 });
    const pos = isPartyAttacker ? getMonsterScreenPos(defender) : getPartyScreenPos();
    if (pos) {
      showFloatingText(pos.cx, pos.cy, result.damage, popupStyleForDamage(result, "physical"));
    }

    pushLog(
      `${attackerName}の こうげき! ${defenderName}に ${result.damage}の ダメージ${
        result.isCrit ? "(会心の一撃!)" : ""
      }`
    );
  }

  function applyDamage(target, damage, targetKind) {
    if (targetKind === "monster") {
      target.stats.hp = Math.max(0, target.stats.hp - damage);
      if (target.stats.hp <= 0) {
        target.dead = true;
      }
    } else {
      target.hp = Math.max(0, target.hp - damage);
    }
  }

  function doSpell(caster, target, spellId, kind) {
    const spell = getSpell(spellId);
    if (!spell) {
      pushLog(`${caster.name}は じゅもんを となえたが 失敗した!`);
      return;
    }

    const mpCost = spell.mpCost || 0;
    const casterMp = kind === "party" ? caster.mp : caster.stats.mp;
    if (casterMp < mpCost) {
      pushLog(`${caster.name}は MPが たりない!`);
      return;
    }
    if (kind === "party") caster.mp -= mpCost;
    else caster.stats.mp -= mpCost;

    pushLog(`${caster.name}の ${spell.name}!`);

    const effectType = spell.effectType || "damage";

    if (window.RPG.Audio) {
      if (effectType === "heal" || effectType === "healAll" || effectType === "revive") {
        window.RPG.Audio.playSe("heal");
      } else if (effectType === "warp") {
        window.RPG.Audio.playSe("warp");
      } else {
        window.RPG.Audio.playSe("spell");
      }
    }

    // 呪文詠唱の色つき光エフェクト(属性で色を変える簡易マッピング)
    triggerSpellEffect(spellEffectColor(spell));

    if (effectType === "damage" || effectType === "damageAll") {
      castDamageSpell(caster, target, spell, kind);
    } else if (effectType === "heal") {
      castHealSpell(caster, target, spell, kind);
    } else if (effectType === "healAll") {
      castHealAllSpell(caster, spell);
    } else if (effectType === "revive") {
      castReviveSpell(target, spell);
    } else if (effectType === "buff") {
      castBuffSpell(target, spell);
    } else if (effectType === "debuff" || effectType === "status") {
      castStatusSpell(target, spell, kind);
    } else if (effectType === "warp") {
      castWarpEffect();
    } else if (effectType === "heroSpecial") {
      // 黎明衝: 敵単体大ダメージ+味方全体HP微回復
      castDamageSpell(caster, target, spell, kind);
      const healAmt = Math.round((spell.power || 20) * 0.2);
      aliveParty().forEach((m) => {
        m.hp = Math.min(m.maxHp, m.hp + healAmt);
      });
      pushLog(`味方全体の HPが すこし かいふくした!`);
    } else {
      pushLog(`${spell.name}の効果は まだ 定義されていない。`);
    }
  }

  // 呪文の属性/種別から演出色を決める簡易マッピング。
  function spellEffectColor(spell) {
    const effectType = spell.effectType || "damage";
    if (effectType === "heal" || effectType === "healAll") return "#7dffb0";
    if (effectType === "revive") return "#ffe98a";
    if (effectType === "buff") return "#ffd76b";
    if (effectType === "warp") return "#c9a8ff";
    switch (spell.element) {
      case "fire": return "#ff8a3d";
      case "ice": return "#8adcff";
      case "thunder": return "#fff36b";
      case "dark": return "#a33cff";
      default: return "#7fd8ff";
    }
  }

  function castDamageSpell(caster, target, spell, kind) {
    const isPartyCaster = kind === "party";
    // spell.target は data.js 上 "enemyAll"/"allyAll"/"enemySingle" 等の命名のため、
    // "all" 完全一致ではなく末尾"All"で判定する(旧実装では全体呪文が単体扱いになっていた)。
    const scope = (spell.target === "all" || /All$/.test(spell.target || "")) ? "all" : "single";

    if (isPartyCaster) {
      const targets = scope === "all" ? aliveMonsters() : [findMonsterTarget(target)].filter(Boolean);
      targets.forEach((mon) => {
        const result = calcDamage(caster, mon, {
          kind: "spell",
          power: spell.power || 10,
          element: spell.element,
        });
        applyDamage(mon, result.damage, "monster");
        const pos = getMonsterScreenPos(mon);
        if (pos) showFloatingText(pos.cx, pos.cy, result.damage, popupStyleForDamage(result, "spell"));
        pushLog(`${mon.name}に ${result.damage}の ダメージ!`);
        pushElementResultLog(result.elementMult);
      });
    } else {
      const targets = scope === "all" ? aliveParty() : [findPartyTarget(target)].filter(Boolean);
      targets.forEach((member) => {
        const result = calcDamage(caster, { stats: {} }, {
          kind: "spell",
          power: spell.power || 10,
          element: spell.element,
        });
        applyDamage(member, result.damage, "party");
        const pos = getPartyScreenPos();
        showFloatingText(pos.cx, pos.cy, result.damage, popupStyleForDamage(result, "spell", true));
        pushLog(`${member.name}に ${result.damage}の ダメージ!`);
      });
    }
  }

  function castHealSpell(caster, target, spell, kind) {
    // C-1 support AI: モンスター同士の回復(味方モンスターへの単体回復呪文)。
    // target.scope === "ally" かつ kind === "monster" の場合のみモンスター側を対象にする。
    // それ以外(通常の味方側詠唱)は従来通りfindPartyTarget()を使う。
    if (kind === "monster" && target && target.scope === "ally") {
      const mon = aliveMonsters().find((m) => m.instanceId === target.id);
      if (!mon) return;
      const healAmt = spell.power || 20;
      mon.stats.hp = Math.min(mon.stats.maxHp, mon.stats.hp + healAmt);
      pushLog(`${mon.name}の HPが ${healAmt} かいふくした!`);
      return;
    }
    const member = findPartyTarget(target);
    if (!member) return;
    const healAmt = spell.power || 20;
    member.hp = Math.min(member.maxHp, member.hp + healAmt);
    const pos = getPartyScreenPos();
    if (pos) showFloatingText(pos.cx, pos.cy, healAmt, { color: "#7dffb0", prefix: "+" });
    pushLog(`${member.name}の HPが ${healAmt} かいふくした!`);
  }

  function castHealAllSpell(caster, spell) {
    const healAmt = spell.power || 15;
    aliveParty().forEach((m) => {
      m.hp = Math.min(m.maxHp, m.hp + healAmt);
    });
    const pos = getPartyScreenPos();
    if (pos) showFloatingText(pos.cx, pos.cy, healAmt, { color: "#7dffb0", prefix: "+" });
    pushLog(`味方全体の HPが かいふくした!`);
  }

  function castReviveSpell(target) {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    // target.id指定時でも、必ずhp<=0(戦闘不能)のメンバーだけを対象にする。
    // 生存メンバーを指定してもHPを削らないようにする。
    const dead = target && target.id
      ? party.find((m) => resolveActorId(m) === target.id && m.hp <= 0)
      : party.find((m) => m.hp <= 0);
    if (!dead) {
      pushLog(`蘇生できる仲間が いない。`);
      return;
    }
    dead.hp = Math.max(1, Math.round(dead.maxHp * 0.5));
    pushLog(`${dead.name}は 生き返った!`);
  }

  function castBuffSpell(target, spell) {
    const member = findPartyTarget(target);
    if (!member) return;
    member.buffs = member.buffs || {};
    const buffKey = spell.buffKey || "atk";
    member.buffs[buffKey] = (member.buffs[buffKey] || 0) + (spell.power || 5);
    pushLog(`${member.name}の 能力が あがった!`);
  }

  // ワープ系呪文/アイテム(ワープリンド・帰風の羽)共通処理。
  // 訪問済みの町(直近に訪れた町の座標)へ強制離脱する。escapeと同様に
  // finishBattle()経由でシーン遷移するため、ここではresultを立てるのみ。
  function castWarpEffect() {
    if (battleState.result) return;
    pushLog(`ひとすじの ひかりが パーティを つつみこんだ…`);
    battleState.result = "warp";
  }

  function castStatusSpell(target, spell, kind) {
    const isPartyCaster = kind === "party";
    const statusName = spell.statusEffect || "sleep";
    const statusLabel = statusName === "paralyze" ? "まひ" : "ねむり";

    if (isPartyCaster) {
      // 味方→敵への状態異常呪文
      const mon = findMonsterTarget(target);
      if (mon) {
        mon.status = statusName;
        pushLog(`${mon.name}は ${statusLabel}状態になった!`);
      }
    } else {
      // 敵→味方への状態異常呪文(旧実装ではここが未実装で完全に無視されていた)
      const member = findPartyTarget(target);
      if (member) {
        member.status = statusName;
        pushLog(`${member.name}は ${statusLabel}状態になった!`);
      }
    }
  }

  function doItem(actor, target, itemId, kind) {
    const item = getItem(itemId);
    if (!item) {
      pushLog(`${actor.name}は どうぐを つかったが 何も起きなかった。`);
      return;
    }
    const inventory = (window.RPG.state && window.RPG.state.inventory) || [];
    const entry = inventory.find((e) => e.itemId === itemId);
    if (!entry || entry.count <= 0) {
      pushLog(`${item.name}を もっていない!`);
      return;
    }

    const effect = item.effect || {};
    const member = kind === "party"
      ? effect.type === "revive"
        ? ((window.RPG.state && window.RPG.state.party) || []).find((m) =>
          m.hp <= 0 && (!target || !target.id || resolveActorId(m) === target.id))
        : findPartyTarget(target)
      : actor;
    if (effect.type === "heal") {
      const healAmt = effect.amount || 0;
      member.hp = Math.min(member.maxHp, member.hp + healAmt);
      const pos = getPartyScreenPos();
      if (pos) showFloatingText(pos.cx, pos.cy, healAmt, { color: "#7dffb0", prefix: "+" });
      pushLog(`${actor.name}は ${item.name}を つかった! ${member.name}のHPが かいふくした。`);
    } else if (effect.type === "mpHeal") {
      const mpAmt = effect.amount || 0;
      member.mp = Math.min(member.maxMp, member.mp + mpAmt);
      const pos = getPartyScreenPos();
      if (pos) showFloatingText(pos.cx, pos.cy, mpAmt, { color: "#8adcff", prefix: "+" });
      pushLog(`${actor.name}は ${item.name}を つかった! ${member.name}のMPが かいふくした。`);
    } else if (effect.type === "revive") {
      member.hp = Math.max(1, Math.round(member.maxHp * (effect.ratio || 0.5)));
      pushLog(`${actor.name}は ${item.name}を つかった! ${member.name}は 生き返った!`);
    } else if (effect.type === "cureStatus") {
      if (member.status === effect.statusEffect) {
        member.status = null;
        pushLog(`${actor.name}は ${item.name}を つかった! ${member.name}の じょうたいいじょうが なおった!`);
      } else {
        pushLog(`${actor.name}は ${item.name}を つかったが 効果がなかった。`);
      }
    } else if (effect.type === "warp") {
      pushLog(`${actor.name}は ${item.name}を つかった!`);
      castWarpEffect();
    } else {
      pushLog(`${actor.name}は ${item.name}を つかった。`);
    }

    entry.count -= 1;
    if (entry.count <= 0) {
      const idx = inventory.indexOf(entry);
      if (idx >= 0) inventory.splice(idx, 1);
    }
  }

  function doGuard(actor, kind) {
    const id = resolveActorId(actor);
    // guardFlags に書き込まないと doAttack 側の防御判定が一切機能しない
    // (防御コマンドが完全に飾りになってしまう)。
    battleState.guardFlags[id] = true;
    pushLog(`${actor.name}は みを まもっている。`);
  }

  function doRun(actor, kind) {
    if (battleState.result) return;
    const party = aliveParty();
    const avgSpd =
      party.reduce((sum, m) => sum + statOf(m, "spd", 5), 0) / Math.max(1, party.length);
    const monsterAvgSpd =
      aliveMonsters().reduce((sum, m) => sum + statOf(m, "spd", 5), 0) /
      Math.max(1, aliveMonsters().length);

    const successRate = Math.min(0.9, Math.max(0.1, 0.5 + (avgSpd - monsterAvgSpd) * 0.02));

    // C-5: にげる失敗時の救済。パーティ側の「にげる」が連続で2回失敗した場合、
    // 2回目は確定成功にする。ボス戦(いずれかのモンスターがisBoss)は対象外
    // (救済を適用せず、通常の成功率判定のままにする)。
    const hasBoss = aliveMonsters().some((m) => m.isBoss);
    const isPartyFlee = kind === "party";
    let forceSuccess = false;
    if (isPartyFlee && !hasBoss) {
      battleState.fleeFailCount = battleState.fleeFailCount || 0;
      if (battleState.fleeFailCount >= 1) {
        forceSuccess = true;
      }
    }

    if (forceSuccess || Math.random() < successRate) {
      // 逃走成功メッセージは戦闘画面上で確認(Enter/Z)させてからフィールドへ
      // 復帰させるため、pushLogではなくpushEndMessageでendMessagesへ積む。
      pushEndMessage(`${kind === "party" ? "パーティ" : "敵"}は にげだした!`);
      battleState.result = "escape";
      if (isPartyFlee) battleState.fleeFailCount = 0;
    } else {
      pushLog(`しかし まわりこまれてしまった!`);
      if (isPartyFlee && !hasBoss) {
        battleState.fleeFailCount = (battleState.fleeFailCount || 0) + 1;
      }
    }
  }

  // ------------------------------------------------------------------
  // 勝敗判定
  // ------------------------------------------------------------------

  function checkBattleEnd() {
    if (!battleState || battleState.result) {
      if (battleState && battleState.result) finishBattle();
      return battleState ? battleState.result : null;
    }

    const monstersAlive = aliveMonsters().length > 0;
    const partyAlive = aliveParty().length > 0;

    if (!monstersAlive) {
      battleState.result = "win";
      handleVictory();
      finishBattle();
    } else if (!partyAlive) {
      battleState.result = "lose";
      handleDefeat();
      finishBattle();
    }

    return battleState.result;
  }

  function handleVictory() {
    const defeated = battleState.monsterGroup;
    const totalExp = defeated.reduce((s, m) => s + (m.exp || 0), 0);
    let totalGold = defeated.reduce((s, m) => s + (m.gold || 0), 0);

    const party = aliveParty();

    // 行商人が生存中ならゴールド獲得量増加
    // (パーティメンバーは常に job プロパティのみを持つ。jobId は存在しないため判定しない)
    const hasMerchant = party.some((m) => m.job === "gyoushounin");
    if (hasMerchant) {
      totalGold = Math.round(totalGold * 1.2);
    }

    // 勝利/経験値/ゴールドのメッセージは戦闘画面上で確認(Enter/Z)させてから
    // フィールド/町へ復帰させるため、pushLogではなくpushEndMessageで
    // endMessagesへ積む(finishBattle()が確認完了後にシーン遷移する)。
    pushEndMessage(`戦闘に 勝利した!`);
    pushEndMessage(`${totalExp}の けいけんちを かくとく!`);
    pushEndMessage(`${totalGold}ゴールドを てにいれた!`);

    if (window.RPG.engine) {
      if (typeof window.RPG.engine.gainGold === "function") {
        window.RPG.engine.gainGold(totalGold);
      }
      if (typeof window.RPG.engine.gainExp === "function") {
        party.forEach((member) => {
          const growth = window.RPG.engine.gainExp(member, totalExp);
          if (growth && growth.leveledUp) {
            pushEndMessage(`${member.name}は レベルが ${growth.newLevels}あがった!`);
            (growth.newSpells || []).forEach((spellId) => {
              const spell = getSpell(spellId);
              pushEndMessage(`${member.name}は ${spell ? spell.name : spellId}を おぼえた!`);
            });
          }
        });
      }
    }

    // ボス撃破フラグの更新。ラスボス(isFinalBoss)撃破時はエンディングへ、
    // 中盤ボス撃破では転職の祠(教会の転職メニュー)を解放する。
    if (window.RPG.state) {
      window.RPG.state.flags = window.RPG.state.flags || { chapter: 1, defeatedBosses: [] };
      const flags = window.RPG.state.flags;
      flags.defeatedBosses = flags.defeatedBosses || [];
      defeated.forEach((mon) => {
        if (mon.isBoss && mon.monsterId && flags.defeatedBosses.indexOf(mon.monsterId) === -1) {
          flags.defeatedBosses.push(mon.monsterId);
        }
      });
      // 最初のボス撃破(涸れ井戸の遺跡 ゴレムナス相当)で転職の祠を解放する。
      if (!flags.classChangeUnlocked && flags.defeatedBosses.length > 0) {
        flags.classChangeUnlocked = true;
      }
      if (defeated.some((mon) => mon.monsterId === "goremuNasu")) {
        flags.chapter = Math.max(flags.chapter || 1, 2);
        pushEndMessage("給水設備の停止処理が完了した。次は家賃明細の調査だ。");
        if (window.RPG.engine && typeof window.RPG.engine.markManagementCaseReady === "function") {
          if (window.RPG.engine.markManagementCaseReady("waterInspection")) {
            pushEndMessage("管理案件「給水設備の再点検」の条件を達成した。管理案件ボードから報告しよう。");
          }
        }
      }
      if (defeated.some((mon) => mon.monsterId === "ferubaito")) {
        flags.chapter = Math.max(flags.chapter || 1, 3);
        pushEndMessage("防災設備が復旧した。星霜荘の住人たちが、よよよーの帰りを待っている。");
        if (window.RPG.engine && typeof window.RPG.engine.markManagementCaseReady === "function") {
          if (window.RPG.engine.markManagementCaseReady("disasterResponse")) {
            pushEndMessage("管理案件「避難経路の再確認」の条件を達成した。管理案件ボードから報告しよう。");
          }
        }
      }
      if (defeated.some((mon) => mon.monsterId === "yamiNoKanshisha")) {
        flags.chapter = Math.max(flags.chapter || 1, 6);
      }
      if (defeated.some((mon) => mon.isFinalBoss)) {
        flags.gameCleared = true;
        flags.chapter = Math.max(flags.chapter || 1, 7);
        if (battleState.isPostgame) {
          flags.postgameCleared = true;
        } else {
          flags.postgameUnlocked = true;
        }
        battleState.result = "win-ending";
      }

      // シェアハウス中ボス撃破: 管理AIを停止し、住人と新しいルールを作る。
      if (
        defeated.some((mon) => mon.monsterId === "shareHouseOverseer") &&
        !flags.gameCleared
      ) {
        flags.midBossDefeated = true;
        flags.chapter = Math.max(flags.chapter || 1, 5);
        const lines = window.RPG.data && window.RPG.data.SCENARIO_TEXT &&
          window.RPG.data.SCENARIO_TEXT.chapterMidBossDefeated;
        if (Array.isArray(lines)) lines.forEach((line) => pushEndMessage(line));
      }
    }

    // ドロップアイテム抽選
    defeated.forEach((mon) => {
      (mon.dropTable || []).forEach((drop) => {
        if (Math.random() < (drop.rate != null ? drop.rate : 0.1)) {
          pushEndMessage(`${defeatedItemName(drop.itemId)}を てにいれた!`);
            if (window.RPG.state && window.RPG.state.inventory) {
              const inv = window.RPG.state.inventory;
              const existing = inv.find((e) => e.itemId === drop.itemId);
              if (existing) existing.count += 1;
              else inv.push({ itemId: drop.itemId, count: 1 });
            }
            const fragmentColors = {
              aoNoSeisouShou: "blue",
              akaNoSeisouShou: "red",
              midoriNoSeisouShou: "green",
              kinNoSeisouShou: "gold",
            };
            const fragment = fragmentColors[drop.itemId];
            if (fragment && window.RPG.state && window.RPG.state.starFragments &&
                window.RPG.state.starFragments.indexOf(fragment) === -1) {
              window.RPG.state.starFragments.push(fragment);
            }
          }
      });
    });
  }

  function defeatedItemName(itemId) {
    const item = getItem(itemId);
    return item ? item.name : itemId;
  }

  function handleDefeat() {
    if (window.RPG.Audio) window.RPG.Audio.playSe("wipe");
    // 全滅演出: このメッセージは「パーティが 全滅してしまった」の確認(Enter/Z)を
    // プレイヤーが行うまで、finishBattle() 側の町復帰処理を進めさせてはいけない。
    // (以前は全滅後ただちに町へ遷移し、遷移後の村でメッセージが出る=画面が
    //  切り替わってから全滅メッセージが出るという不自然な順序だった)
    // win/escapeと同じくpushEndMessage()でendMessagesに積み、finishBattle()の
    // コールバックチェーンで確認完了後に町へ復帰させる(方式を統一)。
    pushEndMessage(`パーティは 全滅してしまった…`);

    if (window.RPG.state) {
      window.RPG.state.flags = window.RPG.state.flags || {};
      // 全滅後、町に強制送還されるがHP0のままだと次のエンカウントで即全滅=詰みになる。
      // ドラクエ同様、全滅ペナルティとして所持金半減の上、HP1で目を覚ます扱いにする。
      const party = window.RPG.state.party || [];
      const lostGold = Math.floor((window.RPG.state.gold || 0) / 2);
      window.RPG.state.gold = (window.RPG.state.gold || 0) - lostGold;
      party.forEach((m) => {
        m.hp = Math.max(1, Math.floor((m.maxHp || 1) * 0.1));
        m.mp = m.mp || 0;
      });
      battleState.pendingDefeatGoldLoss = lostGold;
      if (lostGold > 0) {
        pushEndMessage(`所持金の半分(${lostGold}G)を おとしてしまった…`);
      }
      // 風来の勇者転職条件: 全滅3回で metCriteriaForFuurai を解放(詰み救済)。
      const flags = window.RPG.state.flags;
      flags.defeatCount = (flags.defeatCount || 0) + 1;
      if (flags.defeatCount >= 3 && !flags.metCriteriaForFuurai) {
        flags.metCriteriaForFuurai = true;
        pushEndMessage("何度も　倒れても　立ち上がる　根性が　芽生えた…");
      }
    }
  }

  // 戦闘終了後、実際にシーン遷移(町/フィールド/エンディング復帰)を行う処理。
  // win/lose/escape/warp いずれの結果でも、戦闘画面上で結果メッセージを
  // 全て表示しプレイヤーがEnter/Zで読み終わった後に、この関数を呼ぶこと。
  function proceedAfterBattleEnd() {
    const result = battleState.result;
    const cb = battleState.onEnd;

    if (window.RPG.ui && typeof window.RPG.ui.closeMenu === "function") {
      window.RPG.ui.closeMenu();
    }

    if (result === "lose") {
      proceedAfterDefeat();
      return;
    }

    // ワープリンド/帰風の羽での戦闘離脱: 訪問済みの町(直近に訪れた町)へ移動する。
    if (result === "warp") {
      if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
        const state = window.RPG.state || {};
        const fallback = state.lastTownPosition || state.position || {};
        window.RPG.engine.changeScene("town", {
          mapId: fallback.mapId,
          x: fallback.x,
          y: fallback.y,
        });
      }
      return;
    }

    // ラスボス撃破時は onEnd(マップ復帰コールバック)より優先してエンディングへ。
    if (result === "win-ending") {
      if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
        window.RPG.engine.changeScene("ending", {});
      }
      return;
    }

    // 中ボス shareHouseOverseer 撃破 → よよよー変身: onEnd(マップ復帰)より
    // 優先して、ui.js が用意する変身カットシーンへ引き渡す。カットシーン完了後、
    // ui.js側は渡されたコールバックを呼び出し、そこで最終決戦(chickEmperor)を
    // 開始するか、未実装フォールバックとして通常のシーン復帰を行う。
    if (result === "win-transform") {
      const finalBossId = battleState.pendingFinalBossTrigger || "chickEmperor";
      const startFinalBattle = function () {
        if (window.RPG.battle && typeof window.RPG.battle.enter === "function") {
          window.RPG.battle.enter([finalBossId], {});
        }
      };
      if (window.RPG.ui && typeof window.RPG.ui.showYoyoyoTransformCutscene === "function") {
        window.RPG.ui.showYoyoyoTransformCutscene(startFinalBattle);
      } else {
        console.log(
          "[RPG.battle] yoyoyo transform cutscene UI (ui.js) 未実装のため、直接最終決戦へ移行します"
        );
        startFinalBattle();
      }
      return;
    }

    // win / escape: 呼び出し元(ボス戦の場合はmap.jsのdoWarp内onEnd、
    // 雑魚戦の場合はundefined)へ結果を渡す。ボス戦逃走時はmap.js側で
    // 再トリガー位置を避けた安全な位置へ戻す。
    if (typeof cb === "function") {
      cb(result);
    } else if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
      // previousScene へ戻る際、直前の位置(mapId/x/y)を渡さないとRPG.map.enterField()が
      // 未定義のmapIdでエラーになる。RPG.state.positionに保存済みの現在地を使って復帰する。
      const pos = (window.RPG.state && window.RPG.state.position) || {};
      window.RPG.engine.changeScene(
        (window.RPG.state && window.RPG.state.previousScene) || "field",
        { mapId: pos.mapId, x: pos.x, y: pos.y }
      );
    }
  }

  function finishBattle() {
    battleState.active = false;
    battleState.phase = "end";

    const result = battleState.result;

    // win/lose/escape いずれも、戦闘画面上で結果メッセージ(逃走/勝利の
    // 経験値・ゴールド・レベルアップ/全滅の所持金半減 等)を全て表示し、
    // プレイヤーがEnter/Zで最後まで読み終えたコールバックとして
    // proceedAfterBattleEnd()(実際のシーン遷移)を渡す、という単一の
    // コールバックチェーン方式に統一する(以前はwin/escapeの場合のみ、
    // pushLog()でメッセージキューに積んだ直後にsetTimeout(...,0)で
    // 即シーン遷移していたため、「にげだした」等のメッセージを
    // 読み終える前に画面がフィールドへ切り替わり、特にボス戦逃走時は
    // メッセージキュー/入力ハンドラの状態が宙に浮いたまま次のシーンへ
    // 移ることで操作不能になる不具合の原因になっていた)。
    const messages = (battleState.endMessages || []).slice();

    if (messages.length === 0) {
      proceedAfterBattleEnd();
      return;
    }

    const showNext = function () {
      const text = messages.shift();
      if (messages.length === 0) {
        if (window.RPG.ui && typeof window.RPG.ui.showMessage === "function") {
          window.RPG.ui.showMessage(text, proceedAfterBattleEnd);
        } else {
          proceedAfterBattleEnd();
        }
      } else {
        if (window.RPG.ui && typeof window.RPG.ui.showMessage === "function") {
          window.RPG.ui.showMessage(text, showNext);
        } else {
          showNext();
        }
      }
    };
    showNext();
  }

  // 全滅メッセージの確認(Enter/Z)後に呼ばれる、町への強制送還処理。
  // (以前はfinishBattle()内でメッセージ表示前に即実行されており、
  //  「村に着いてから全滅メッセージが出る」という不具合の原因だった)
  function proceedAfterDefeat() {
    if (window.RPG.ui && typeof window.RPG.ui.closeMenu === "function") {
      window.RPG.ui.closeMenu();
    }
    if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
      // 町へ強制送還する際、mapId等が無いとRPG.map.enterField()が未定義のマップIDで
      // エラーになる。直近に訪れた町の座標(無ければ現在地)を必ず渡す。
      const state = window.RPG.state || {};
      const fallback = state.lastTownPosition || state.position || {};
      window.RPG.engine.changeScene("town", {
        forcedReturn: true,
        mapId: fallback.mapId,
        x: fallback.x,
        y: fallback.y,
      });
    }
  }

  // ------------------------------------------------------------------
  // Canvas描画(モンスターのパーツ組み描画・背景・エフェクト)
  // ------------------------------------------------------------------

  // アニメーションクロック。renderMonsters()が呼ばれるたび経過時間を積算し、
  // 呼吸・浮遊・登場演出・エフェクトのタイミングに使う。
  let animClock = 0;
  let lastFrameTs = null;

  // 演出キュー: { type:"flash"|"shake"|"spell"|"popup"|"bossIntro", ... , startTs, duration }
  let effectQueue = [];

  function now() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  /**
   * 攻撃ヒット時のフラッシュ+画面シェイクを演出キューに積む。
   */
  function triggerHitEffect(opts) {
    opts = opts || {};
    effectQueue.push({
      type: "flash",
      color: opts.color || "rgba(255,255,255,0.55)",
      startTs: now(),
      duration: opts.duration || 120,
    });
    effectQueue.push({
      type: "shake",
      power: opts.shakePower || 8,
      startTs: now(),
      duration: opts.duration2 || 220,
    });
  }

  /** 呪文詠唱時の色つき光エフェクトを積む。 */
  function triggerSpellEffect(color) {
    effectQueue.push({
      type: "spell",
      color: color || "#7fd8ff",
      startTs: now(),
      duration: 420,
    });
  }

  /** ダメージ数字のポップアップを積む。cx/cyはcanvas座標。 */
  function triggerDamagePopup(cx, cy, text, color) {
    showFloatingText(cx, cy, text, { color: color || "#fff" });
  }

  /**
   * C-6: ダメージ/回復/弱点等のフロート数字演出。
   * style: { color, prefix, suffix, kind }
   */
  function popupStyleForDamage(result, kind, enemyHitParty) {
    result = result || {};
    if (result.elementMult === 0) {
      return { color: "#aaaaaa", text: "MISS" };
    }
    if (result.elementMult === ELEMENT_WEAK_MULT) {
      return { color: "#ffb347", suffix: "!" };
    }
    if (result.elementMult === ELEMENT_RESIST_MULT) {
      return { color: "#9aa0a6" };
    }
    if (result.isCrit) {
      return { color: "#ffd76b", suffix: "!!" };
    }
    if (kind === "spell") {
      return { color: enemyHitParty ? "#ff8a8a" : "#8adcff" };
    }
    return { color: "#ffffff" };
  }

  function showFloatingText(cx, cy, value, style) {
    style = style || {};
    let text = style.text != null ? String(style.text) : String(value);
    if (style.text == null && style.prefix) text = style.prefix + text;
    if (style.suffix) text += style.suffix;
    effectQueue.push({
      type: "popup",
      cx: cx,
      cy: cy,
      text: text,
      color: style.color || "#fff",
      startTs: now(),
      duration: style.duration || 600,
    });
    if (window.RPG.ui && typeof window.RPG.ui.showFloatingText === "function") {
      window.RPG.ui.showFloatingText(cx, cy, text, style);
    }
  }

  /** ボス登場演出(大型フラッシュ)をトリガーする。 */
  function triggerBossIntro() {
    effectQueue.push({
      type: "bossIntro",
      startTs: now(),
      duration: 900,
    });
  }

  // ------------------------------------------------------------------
  // 地形背景
  // ------------------------------------------------------------------

  // マップID/シーン名の文字列から地形カテゴリを推定する簡易ヒューリスティック。
  // (エンカウント経路がbattle.enter()にterrain種別を渡してこないため、
  //  RPG.state側の手がかりから逆算する)
  function guessTerrain() {
    const group = battleState && battleState.monsterGroup;
    if (group && group.some((m) => m.isBoss)) return "boss";

    const state = window.RPG.state || {};
    const mapId = (state.position && state.position.mapId) || state.currentMapId || "";
    const scene = state.scene || "";

    // data.js の MAPS[mapId].type === "dungeon" を最優先で見る。
    // 以前はマップIDの文字列に "dungeon/cave/ruin" 等が含まれるかどうかの
    // 簡易ヒューリスティックのみに頼っていたが、"suibotsuShrine"(水没神殿。
    // 水没クラゲが出る洞窟)や "fugadou_fN"/"tengaiRift_fN"/
    // "shareHouseArea_depths" のように、実際は type:"dungeon" のマップでも
    // このキーワードに一致しない命名のものが多数あり、それらは誤って
    // "plain"(青空の平原背景)判定になってしまっていた。
    const maps = (window.RPG.data && window.RPG.data.MAPS) || {};
    const mapDef = mapId ? maps[mapId] : null;
    if (mapDef && mapDef.type === "dungeon") return "dungeon";

    const hay = (mapId + " " + scene).toLowerCase();
    if (/(iseki|dungeon|douketsu|shinden|yaburetsu|ana|cave|ruin)/.test(hay)) return "dungeon";
    if (/(mori|forest|wood)/.test(hay)) return "forest";
    return "plain";
  }

  function drawBackground(ctx, terrain) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const groundY = h * 0.72;

    ctx.save();

    if (terrain === "boss") {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a0a24");
      grad.addColorStop(0.6, "#2c0f2e");
      grad.addColorStop(1, "#120814");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 不吉な光の柱
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 5; i++) {
        const x = (w / 5) * i + 40;
        const grad2 = ctx.createLinearGradient(x, 0, x, h);
        grad2.addColorStop(0, "#a33cff");
        grad2.addColorStop(1, "rgba(163,60,255,0)");
        ctx.fillStyle = grad2;
        ctx.fillRect(x - 20, 0, 40, h);
      }
      ctx.globalAlpha = 1;

      // 玉座間シルエット(柱)
      ctx.fillStyle = "#0a050c";
      for (let i = 0; i < 4; i++) {
        const x = (w / 4) * i + 20;
        ctx.fillRect(x, groundY - 160, 22, 170);
      }
      ctx.fillRect(0, groundY, w, h - groundY);
    } else if (terrain === "dungeon") {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1c1c22");
      grad.addColorStop(1, "#2e2a26");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 岩肌シルエット
      ctx.fillStyle = "#141418";
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      for (let x = 0; x <= w; x += 40) {
        ctx.lineTo(x, groundY - 10 - Math.sin(x * 0.05) * 14);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // 松明の淡い光
      ctx.globalAlpha = 0.25;
      [w * 0.15, w * 0.85].forEach((x) => {
        const g = ctx.createRadialGradient(x, groundY - 60, 5, x, groundY - 60, 90);
        g.addColorStop(0, "#ffb347");
        g.addColorStop(1, "rgba(255,179,71,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 90, groundY - 150, 180, 180);
      });
      ctx.globalAlpha = 1;
    } else if (terrain === "forest") {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#274a3a");
      grad.addColorStop(1, "#173226");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 木々のシルエット
      ctx.fillStyle = "#0f2419";
      for (let i = 0; i < 7; i++) {
        const x = (w / 7) * i + 20 + (i % 2) * 10;
        const th = 90 + (i % 3) * 20;
        ctx.beginPath();
        ctx.moveTo(x, groundY - th);
        ctx.lineTo(x - 34, groundY);
        ctx.lineTo(x + 34, groundY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#132a1e";
      ctx.fillRect(0, groundY, w, h - groundY);
    } else {
      // 平原
      const grad = ctx.createLinearGradient(0, 0, 0, groundY);
      grad.addColorStop(0, "#4a7fc9");
      grad.addColorStop(1, "#bcd9f0");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, groundY);

      // 遠景の丘シルエット
      ctx.fillStyle = "#6fae6f";
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.quadraticCurveTo(w * 0.25, groundY - 40, w * 0.5, groundY - 10);
      ctx.quadraticCurveTo(w * 0.75, groundY + 20, w, groundY - 20);
      ctx.lineTo(w, groundY + 20);
      ctx.lineTo(0, groundY + 20);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#3f8f4a";
      ctx.fillRect(0, groundY, w, h - groundY);
    }

    ctx.restore();
  }

  // ------------------------------------------------------------------
  // モンスター種族別描画関数
  // ------------------------------------------------------------------

  // spriteShape.shape の値 → 描画関数名の対応。データ上の形状ヒントと
  // モンスター名の傾向(狼系/鳥系/植物系/騎士系等)から近い種族シルエットを選ぶ。
  function pickMonsterDrawer(monster) {
    const id = monster.monsterId || "";
    const shape = (monster.spriteShape && monster.spriteShape.shape) || "circle";

    // ラスボス「ひよこ大王」(chickEmperor)は、よよよー変身どんでん返しの一貫性のため
    // gfx.js専用デザイン(禍々しいオーラ・王冠・巨大翼マント)を使う。gfx.js未読込等の
    // 異常時のみ既存のdrawDemonLordへフォールバックする。
    if (id === "chickEmperor") return drawChickEmperorBattle;
    if (monster.isFinalBoss) return drawDemonLord;
    if (/kishi|senpei|daichou/.test(id)) return drawArmoredKnight;
    if (/ookami|kemono|baito/.test(id)) return drawWolfBeast;
    if (/garasu|koumori/.test(id)) return drawWingedBeast;
    if (/tsuchigumo|gumo/.test(id)) return drawSpiderBug;
    if (/kinoko|moguri|kusa/.test(id)) return drawPlantBlob;
    if (/dama|kurage|bakemono|boukon|kanshisha|yami/.test(id)) return drawGhostBlob;
    if (/zonbi/.test(id)) return drawUndead;
    if (/goremu|banpei|soubu/.test(id)) return drawGolem;
    if (/nusubitto/.test(id)) return drawRogueHumanoid;

    switch (shape) {
      case "square": return drawGolem;
      case "triangle": return drawWingedBeast;
      case "diamond": return drawGhostBlob;
      default: return drawPlantBlob;
    }
  }

  function bodyColor(monster) {
    return (monster.spriteShape && monster.spriteShape.color) || "#a33";
  }

  function shade(hex, amt) {
    // 簡易的な明暗補正(#rrggbb限定、失敗時はそのまま返す)
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function drawEyes(ctx, cx, cy, size, angry) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - size / 5, cy - size / 8, size / 10, 0, Math.PI * 2);
    ctx.arc(cx + size / 5, cy - size / 8, size / 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = angry ? "#c11" : "#000";
    ctx.beginPath();
    ctx.arc(cx - size / 5, cy - size / 8, size / 22, 0, Math.PI * 2);
    ctx.arc(cx + size / 5, cy - size / 8, size / 22, 0, Math.PI * 2);
    ctx.fill();
    if (angry) {
      // 怒り眉
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - size / 3, cy - size / 4);
      ctx.lineTo(cx - size / 10, cy - size / 6);
      ctx.moveTo(cx + size / 3, cy - size / 4);
      ctx.lineTo(cx + size / 10, cy - size / 6);
      ctx.stroke();
    }
  }

  // 狼/獣系: 胴体+三角耳+牙+尻尾
  function drawWolfBeast(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const bob = Math.sin(t / 260) * size * 0.03;
    ctx.save();
    ctx.translate(0, bob);
    ctx.fillStyle = c;
    ctx.strokeStyle = shade(c, -40);
    ctx.lineWidth = 2;

    // 胴体
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.15, size * 0.5, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 頭
    ctx.beginPath();
    ctx.ellipse(cx, cy - size * 0.18, size * 0.32, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 耳
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.28, cy - size * 0.32);
    ctx.lineTo(cx - size * 0.4, cy - size * 0.6);
    ctx.lineTo(cx - size * 0.1, cy - size * 0.4);
    ctx.closePath();
    ctx.moveTo(cx + size * 0.28, cy - size * 0.32);
    ctx.lineTo(cx + size * 0.4, cy - size * 0.6);
    ctx.lineTo(cx + size * 0.1, cy - size * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 尻尾
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.45, cy + size * 0.25);
    ctx.quadraticCurveTo(cx + size * 0.8, cy + size * 0.1, cx + size * 0.7, cy - size * 0.2);
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = c;
    ctx.stroke();
    // 牙
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx - size * 0.06, cy + size * 0.1);
    ctx.lineTo(cx - size * 0.02, cy - size * 0.02);
    ctx.moveTo(cx + size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx + size * 0.06, cy + size * 0.1);
    ctx.lineTo(cx + size * 0.02, cy - size * 0.02);
    ctx.fill();

    drawEyes(ctx, cx, cy - size * 0.2, size, true);
    ctx.restore();
  }

  // 鳥/コウモリ系: 胴体+翼(羽ばたき)
  function drawWingedBeast(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const flap = Math.sin(t / 150) * 0.5 + 0.5; // 0..1
    ctx.save();
    ctx.fillStyle = c;
    ctx.strokeStyle = shade(c, -40);
    ctx.lineWidth = 2;

    // 翼(左右、羽ばたきで角度変化)
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(cx, cy);
      const wingAngle = side * (0.3 + flap * 0.5);
      ctx.rotate(wingAngle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * size * 0.75, -size * 0.35);
      ctx.lineTo(side * size * 0.55, size * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // 胴体
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.3, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // くちばし/耳
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12, cy - size * 0.3);
    ctx.lineTo(cx, cy - size * 0.5);
    ctx.lineTo(cx + size * 0.12, cy - size * 0.3);
    ctx.closePath();
    ctx.fillStyle = shade(c, -20);
    ctx.fill();
    ctx.stroke();

    drawEyes(ctx, cx, cy - size * 0.05, size, false);
    ctx.restore();
  }

  // 蜘蛛/虫系: 胴体+8脚
  function drawSpiderBug(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const legWig = Math.sin(t / 200) * 0.15;
    ctx.save();
    ctx.strokeStyle = shade(c, -50);
    ctx.lineWidth = size * 0.06;
    for (let i = 0; i < 4; i++) {
      const baseAngle = -0.9 + i * 0.55;
      [-1, 1].forEach((side) => {
        const ang = baseAngle * side + legWig * (i % 2 === 0 ? 1 : -1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const kx = cx + Math.cos(ang) * size * 0.55 * side;
        const ky = cy + Math.sin(ang) * size * 0.15 + size * 0.1;
        const ex = cx + Math.cos(ang) * size * 0.85 * side;
        const ey = ky + size * 0.25;
        ctx.quadraticCurveTo(kx, ky, ex, ey);
        ctx.stroke();
      });
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.1, size * 0.34, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy - size * 0.25, size * 0.22, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    drawEyes(ctx, cx, cy - size * 0.28, size * 0.8, true);
    ctx.restore();
  }

  // 植物/キノコ/スライム系: 丸い体+触手/胞子っぽい突起
  function drawPlantBlob(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const squish = 1 + Math.sin(t / 300) * 0.05;
    ctx.save();
    ctx.fillStyle = c;
    ctx.strokeStyle = shade(c, -40);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.1, size * 0.48 * squish, size * 0.4 / squish, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 傘/頭頂の突起
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.05, size * 0.4, Math.PI, 0);
    ctx.fill(); ctx.stroke();
    // 斑点
    ctx.fillStyle = shade(c, 40);
    [[-0.18, -0.15], [0.15, -0.2], [0, 0.05]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + size * dx, cy + size * dy, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    });
    drawEyes(ctx, cx, cy + size * 0.05, size, false);
    ctx.restore();
  }

  // 幽霊/浮遊系: ふわふわ揺れる輪郭+裾のギザギザ
  function drawGhostBlob(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const floatY = Math.sin(t / 260) * size * 0.08;
    ctx.save();
    ctx.translate(0, floatY);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = c;
    ctx.strokeStyle = shade(c, -40);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.05, size * 0.42, Math.PI, 0);
    ctx.lineTo(cx + size * 0.42, cy + size * 0.3);
    for (let i = 4; i >= 0; i--) {
      const x = cx - size * 0.42 + (size * 0.84 * i) / 4;
      const y = cy + size * (i % 2 === 0 ? 0.3 : 0.16);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawEyes(ctx, cx, cy - size * 0.1, size, false);
    ctx.restore();
  }

  // アンデッド系: 骨っぽい輪郭+ボロ布
  function drawUndead(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const sway = Math.sin(t / 400) * 0.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = c;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    // ボロ布の体
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.32, cy - size * 0.1);
    ctx.lineTo(cx - size * 0.4, cy + size * 0.45);
    ctx.lineTo(cx - size * 0.15, cy + size * 0.3);
    ctx.lineTo(cx, cy + size * 0.45);
    ctx.lineTo(cx + size * 0.15, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.45);
    ctx.lineTo(cx + size * 0.32, cy - size * 0.1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 頭蓋骨
    ctx.fillStyle = "#e8e3d0";
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.28, size * 0.26, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 目窩
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(cx - size * 0.1, cy - size * 0.3, size * 0.06, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.1, cy - size * 0.3, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ゴーレム/巨人系: 角ばった巨躯+腕
  function drawGolem(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const bob = Math.sin(t / 500) * size * 0.02;
    ctx.save();
    ctx.translate(0, bob);
    ctx.fillStyle = c;
    ctx.strokeStyle = shade(c, -50);
    ctx.lineWidth = 3;
    // 胴体
    ctx.fillRect(cx - size * 0.42, cy - size * 0.15, size * 0.84, size * 0.55);
    ctx.strokeRect(cx - size * 0.42, cy - size * 0.15, size * 0.84, size * 0.55);
    // 腕
    ctx.fillRect(cx - size * 0.65, cy - size * 0.05, size * 0.22, size * 0.4);
    ctx.fillRect(cx + size * 0.43, cy - size * 0.05, size * 0.22, size * 0.4);
    ctx.strokeRect(cx - size * 0.65, cy - size * 0.05, size * 0.22, size * 0.4);
    ctx.strokeRect(cx + size * 0.43, cy - size * 0.05, size * 0.22, size * 0.4);
    // 頭
    ctx.fillRect(cx - size * 0.22, cy - size * 0.45, size * 0.44, size * 0.32);
    ctx.strokeRect(cx - size * 0.22, cy - size * 0.45, size * 0.44, size * 0.32);
    // 亀裂模様
    ctx.strokeStyle = shade(c, -70);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, cy);
    ctx.lineTo(cx, cy + size * 0.15);
    ctx.lineTo(cx + size * 0.18, cy - size * 0.02);
    ctx.stroke();

    drawEyes(ctx, cx, cy - size * 0.3, size * 0.9, true);
    ctx.restore();
  }

  // 盗賊/人型系: 頭+胴体+マント+短剣
  function drawRogueHumanoid(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const sway = Math.sin(t / 240) * size * 0.03;
    ctx.save();
    ctx.translate(sway, 0);
    ctx.fillStyle = shade(c, -20);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    // マント
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.3, cy - size * 0.2);
    ctx.lineTo(cx - size * 0.5, cy + size * 0.5);
    ctx.lineTo(cx + size * 0.5, cy + size * 0.5);
    ctx.lineTo(cx + size * 0.3, cy - size * 0.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 頭
    ctx.fillStyle = "#e0b088";
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.35, size * 0.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // フード影
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.38, size * 0.24, Math.PI, 0);
    ctx.fill();
    // 短剣(武器)
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.35, cy + size * 0.05);
    ctx.lineTo(cx + size * 0.55, cy - size * 0.25);
    ctx.stroke();
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(cx + size * 0.32, cy + size * 0.02, size * 0.08, size * 0.12);

    drawEyes(ctx, cx, cy - size * 0.38, size * 0.7, false);
    ctx.restore();
  }

  // 甲冑騎士系: 甲冑胴体+剣+盾+兜
  function drawArmoredKnight(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    ctx.save();
    ctx.fillStyle = c;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    // 胴体(甲冑)
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.28, cy - size * 0.1);
    ctx.lineTo(cx - size * 0.35, cy + size * 0.45);
    ctx.lineTo(cx + size * 0.35, cy + size * 0.45);
    ctx.lineTo(cx + size * 0.28, cy - size * 0.1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 肩当て
    ctx.beginPath();
    ctx.arc(cx - size * 0.32, cy - size * 0.08, size * 0.14, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.32, cy - size * 0.08, size * 0.14, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 兜
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.32, size * 0.22, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 兜のスリット(目)
    ctx.strokeStyle = "#c11";
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy - size * 0.32);
    ctx.lineTo(cx - size * 0.02, cy - size * 0.32);
    ctx.moveTo(cx + size * 0.1, cy - size * 0.32);
    ctx.lineTo(cx + size * 0.02, cy - size * 0.32);
    ctx.stroke();
    // 剣
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.4, cy + size * 0.4);
    ctx.lineTo(cx + size * 0.55, cy - size * 0.35);
    ctx.stroke();
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.36, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.46, cy + size * 0.1);
    ctx.stroke();
    // 盾
    ctx.fillStyle = shade(c, -20);
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.45, cy + size * 0.12, size * 0.14, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.restore();
  }

  // ラスボス(ひよこ大王/chickEmperor)専用: gfx.jsの専用デザイン(禍々しいオーラ・
  // 王冠・巨大翼マント)へ委譲するアダプタ。drawMonster()側の呼び出し規約
  // (ctx, monster, cx, cy, size, t)とgfx.drawChickEmperorの引数(monster無し)を
  // ここで橋渡しする。gfx.js未読込等の異常時はdrawDemonLordへフォールバックする。
  function drawChickEmperorBattle(ctx, monster, cx, cy, size, t) {
    if (window.RPG.gfx && typeof window.RPG.gfx.drawChickEmperor === "function") {
      window.RPG.gfx.drawChickEmperor(ctx, cx, cy, size, t);
    } else {
      drawDemonLord(ctx, monster, cx, cy, size, t);
    }
  }

  // ラスボス(魔王)専用: 大型・角・翼・禍々しいオーラ
  function drawDemonLord(ctx, monster, cx, cy, size, t) {
    const c = bodyColor(monster);
    const pulse = 1 + Math.sin(t / 300) * 0.03;
    ctx.save();

    // オーラ
    const auraR = size * (0.9 + Math.sin(t / 220) * 0.08);
    const grad = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, auraR);
    grad.addColorStop(0, "rgba(163,60,255,0.35)");
    grad.addColorStop(1, "rgba(163,60,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // 翼
    ctx.fillStyle = shade(c, -30);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.1);
      ctx.lineTo(cx + side * size * 0.95, cy - size * 0.5);
      ctx.lineTo(cx + side * size * 0.8, cy + size * 0.1);
      ctx.lineTo(cx + side * size * 0.5, cy - size * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // 胴体
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.12 * pulse, size * 0.42, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 頭
    ctx.beginPath();
    ctx.ellipse(cx, cy - size * 0.42, size * 0.28, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 角
    ctx.fillStyle = "#e8e0d0";
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, cy - size * 0.6);
    ctx.lineTo(cx - size * 0.34, cy - size * 0.95);
    ctx.lineTo(cx - size * 0.08, cy - size * 0.62);
    ctx.closePath();
    ctx.moveTo(cx + size * 0.2, cy - size * 0.6);
    ctx.lineTo(cx + size * 0.34, cy - size * 0.95);
    ctx.lineTo(cx + size * 0.08, cy - size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    drawEyes(ctx, cx, cy - size * 0.44, size * 0.9, true);

    // 剣/杖(手に持つ武器)
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = size * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.4, cy + size * 0.4);
    ctx.lineTo(cx + size * 0.55, cy - size * 0.55);
    ctx.stroke();
    ctx.fillStyle = "#a33cff";
    ctx.beginPath();
    ctx.arc(cx + size * 0.55, cy - size * 0.6, size * 0.09, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * モンスターグループをCanvasに描画する(地形背景+個体イラスト+HPバー+エフェクト)。
   * ui.js の renderBattleUI / battle シーンの render(ctx) から毎フレーム呼ばれることを想定。
   */
  function renderMonsters(ctx) {
    if (!battleState || !ctx) return;

    const t = now();
    if (lastFrameTs == null) lastFrameTs = t;
    animClock += t - lastFrameTs;
    lastFrameTs = t;

    const group = battleState.monsterGroup;
    const count = group.length;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // 画面シェイク量を計算(shakeエフェクトが有効な間だけオフセット)
    let shakeX = 0, shakeY = 0;
    effectQueue = effectQueue.filter((fx) => t - fx.startTs < fx.duration);
    effectQueue.forEach((fx) => {
      if (fx.type === "shake") {
        const progress = (t - fx.startTs) / fx.duration;
        const decay = 1 - progress;
        shakeX = (Math.random() * 2 - 1) * fx.power * decay;
        shakeY = (Math.random() * 2 - 1) * fx.power * decay;
      }
    });

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground(ctx, guessTerrain());

    const spacing = w / (count + 1);
    group.forEach((mon, idx) => {
      if (mon.dead) return;
      const cx = spacing * (idx + 1);
      const cy = h * 0.5;
      const size = mon.isBoss ? Math.min(150, w * 0.22) : Math.min(80, w * 0.12);
      drawMonster(ctx, mon, cx, cy, size, animClock);
    });

    // 呪文エフェクト(画面全体を覆う色つき光の輪)/ボス登場フラッシュ
    effectQueue.forEach((fx) => {
      if (fx.type === "spell") {
        const progress = (t - fx.startTs) / fx.duration;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress) * 0.6;
        const grad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * (0.2 + progress * 0.6));
        grad.addColorStop(0, fx.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else if (fx.type === "bossIntro") {
        const progress = (t - fx.startTs) / fx.duration;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    });

    ctx.restore(); // shake分を戻す(popup/flashは画面固定表示にしたいのでshake外で描く)

    // ダメージポップアップ(shakeの影響を受けず画面固定で見やすく)
    effectQueue.forEach((fx) => {
      if (fx.type !== "popup") return;
      const progress = (t - fx.startTs) / fx.duration;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = fx.color;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      const y = fx.cy - progress * 30;
      ctx.strokeText(fx.text, fx.cx, y);
      ctx.fillText(fx.text, fx.cx, y);
      ctx.restore();
    });

    // ヒットフラッシュ(画面全体)
    effectQueue.forEach((fx) => {
      if (fx.type !== "flash") return;
      const progress = (t - fx.startTs) / fx.duration;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = fx.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    });
  }

  function drawMonster(ctx, monster, cx, cy, size, t) {
    const drawer = pickMonsterDrawer(monster);

    ctx.save();

    // HPバー(背景・個体イラストより手前・上に描く)
    const barW = size + 16;
    const barH = 7;
    const hpRatio = Math.max(0, monster.stats.hp / monster.stats.maxHp);
    const barY = cy - size * 0.62 - 18;
    ctx.fillStyle = "#222";
    ctx.fillRect(cx - barW / 2 - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = "#333";
    ctx.fillRect(cx - barW / 2, barY, barW, barH);
    ctx.fillStyle = hpRatio > 0.5 ? "#4caf50" : hpRatio > 0.2 ? "#ffb300" : "#e53935";
    ctx.fillRect(cx - barW / 2, barY, barW * hpRatio, barH);

    // 個体イラスト
    drawer(ctx, monster, cx, cy, size, t);

    // 名前ラベル(ボスは大きめ+金文字)
    ctx.fillStyle = monster.isBoss ? "#ffd76b" : "#fff";
    ctx.font = (monster.isBoss ? "bold 15px" : "12px") + " sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    const labelY = cy + size * 0.62 + 18;
    ctx.strokeText(monster.name, cx, labelY);
    ctx.fillText(monster.name, cx, labelY);

    ctx.restore();
  }

  function getState() {
    return battleState;
  }

  // ------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------

  window.RPG.battle = {
    enter: enter,
    queueCommand: queueCommand,
    resolveTurn: resolveTurn,
    checkBattleEnd: checkBattleEnd,
    calcDamage: calcDamage,
    renderMonsters: renderMonsters,
    getState: getState,
    // 対象選択UI(ui.js)から生存中の味方/敵一覧を参照するために公開する。
    aliveParty: aliveParty,
    aliveMonsters: aliveMonsters,
    resolveActorId: resolveActorId,
    showFloatingText: showFloatingText,
  };
})();
