/* ==========================================================================
   ui.js
   星霜のフロンティア - UIレイヤー(メッセージ/コマンド/ステータス/ショップ/教会)
   window.RPG.ui として公開。他モジュール(RPG.state, RPG.engine, RPG.battle,
   RPG.map, RPG.data)の状態を参照して最終的なDOM描画・入力受付を行う。
   ========================================================================== */

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  // ------------------------------------------------------------------------
  // DOM要素キャッシュ
  // ------------------------------------------------------------------------

  const els = {};

  function cacheEls() {
    els.screenTitle = document.getElementById("screen-title");
    els.screenMap = document.getElementById("screen-map");
    els.screenBattle = document.getElementById("screen-battle");
    els.canvasBattle = document.getElementById("canvas-battle");
    els.screenEnding = document.getElementById("screen-ending");
    els.endingContent = document.getElementById("ending-content");

    els.btnNewGame = document.getElementById("btn-new-game");
    els.btnContinue = document.getElementById("btn-continue");
    els.titleNameInput = document.getElementById("title-name-input");
    els.heroNameField = document.getElementById("hero-name-field");
    els.btnNameConfirm = document.getElementById("btn-name-confirm");

    els.hudLocation = document.getElementById("hud-location");
    els.hudGold = document.getElementById("hud-gold");

    els.battlePartyStatus = document.getElementById("battle-party-status");

    els.messageWindow = document.getElementById("message-window");
    els.messageText = document.getElementById("message-text");
    els.messageCursor = document.getElementById("message-cursor");

    els.commandWindow = document.getElementById("command-window");
    els.commandList = document.getElementById("command-list");

    els.statusWindow = document.getElementById("status-window");
    els.statusContent = document.getElementById("status-content");

    els.shopWindow = document.getElementById("shop-window");
    els.shopHeader = document.getElementById("shop-header");
    els.shopList = document.getElementById("shop-list");
    els.shopFooter = document.getElementById("shop-footer");

    els.churchWindow = document.getElementById("church-window");
    els.churchContent = document.getElementById("church-content");

    els.innWindow = document.getElementById("inn-window");
    els.innContent = document.getElementById("inn-content");

    els.btnMenuOpen = document.getElementById("btn-menu-open");
  }

  // ------------------------------------------------------------------------
  // 内部状態
  // ------------------------------------------------------------------------

  const ui = {
    messageQueue: [],
    messageBusy: false,
    messageMode: "normal",
    typeSpeedMs: 28,
    currentMenu: null, // { type, options, selectedIndex, onSelect }
  };

  const MESSAGE_MODE_KEY = "seisou_frontier_message_mode";
  const MESSAGE_MODES = {
    fast: { label: "早い", typeSpeedMs: 8, advanceMs: 350 },
    normal: { label: "普通", typeSpeedMs: 28, advanceMs: 850 },
    slow: { label: "遅い", typeSpeedMs: 60, advanceMs: 1600 },
    manual: { label: "マニュアル", typeSpeedMs: 28, advanceMs: 0 },
  };

  function loadMessageMode() {
    try {
      const saved = localStorage.getItem(MESSAGE_MODE_KEY);
      setMessageMode(saved && MESSAGE_MODES[saved] ? saved : "normal", false);
    } catch (e) {
      setMessageMode("normal", false);
    }
  }

  function setMessageMode(mode, persist) {
    if (!MESSAGE_MODES[mode]) mode = "normal";
    ui.messageMode = mode;
    ui.typeSpeedMs = MESSAGE_MODES[mode].typeSpeedMs;
    if (persist !== false) {
      try {
        localStorage.setItem(MESSAGE_MODE_KEY, mode);
      } catch (e) {
        // localStorageが使えない環境でもゲーム自体は継続する。
      }
    }
  }

  function currentMessageModeLabel() {
    return MESSAGE_MODES[ui.messageMode].label;
  }

  function isBattleAutoAdvance() {
    return !!(window.RPG.state && window.RPG.state.scene === "battle" && ui.messageMode !== "manual");
  }

  // ------------------------------------------------------------------------
  // メッセージウィンドウ (1文字送り演出)
  // ------------------------------------------------------------------------

  /**
   * メッセージウィンドウにテキストを1文字ずつ表示する。
   * @param {string} text
   * @param {function} [callback] 表示完了(決定キー押下)後に呼ばれる
   */
  function showMessage(text, callback) {
    ui.messageQueue.push({ text: text, callback: callback });
    if (!ui.messageBusy) {
      processMessageQueue();
    }
  }

  function processMessageQueue() {
    if (ui.messageQueue.length === 0) {
      ui.messageBusy = false;
      // キューが空になった = 表示すべき会話/メッセージがもう無いということなので、
      // メッセージウィンドウを閉じてフィールド操作に戻す。
      // (これが無いと、NPCとの会話が最終ページまで進んでも
      //  ウィンドウが表示されたままになり、フィールド操作に復帰できなかった)
      if (els.messageWindow) els.messageWindow.classList.add("hidden");
      if (els.messageText) els.messageText.textContent = "";
      return;
    }
    ui.messageBusy = true;
    const entry = ui.messageQueue.shift();
    typeMessage(entry.text, function () {
      const advance = function () {
        if (typeof entry.callback === "function") entry.callback();
        processMessageQueue();
      };
      if (isBattleAutoAdvance()) {
        window.setTimeout(advance, MESSAGE_MODES[ui.messageMode].advanceMs);
      } else {
        // フィールド会話とマニュアル設定は決定待ち。
        waitForAdvance(advance);
      }
    });
  }

  function typeMessage(text, onDone) {
    els.messageWindow.classList.remove("hidden");
    els.messageCursor.classList.add("hidden");
    els.messageText.textContent = "";
    let i = 0;
    let finished = false;
    ui._typingSkipRequested = false;

    function finish() {
      if (finished) return;
      finished = true;
      if (ui._typeTimer) clearTimeout(ui._typeTimer);
      document.removeEventListener("keydown", onSkipKey);
      els.messageWindow.removeEventListener("click", onSkipKey);
      els.messageText.textContent = text;
      els.messageCursor.classList.remove("hidden");
      if (typeof onDone === "function") onDone();
    }

    function onSkipKey(e) {
      // 決定キーに加えキャンセルキー(X/Esc)でも表示を完了できるようにする
      // (店の購入メッセージ等をESC連打で抜けられるように)。
      // stopPropagationで、消費したキーがmap.jsのフィールド操作へ漏れるのを防ぐ。
      if (e.type === "click" || e.key === " " || isConfirmKey(e) || isCancelKey(e)) {
        if (e.type === "keydown") {
          e.preventDefault();
          e.stopPropagation();
        }
        finish();
      }
    }

    document.addEventListener("keydown", onSkipKey);
    els.messageWindow.addEventListener("click", onSkipKey);

    function step() {
      if (finished) return;
      if (i >= text.length) {
        finish();
        return;
      }
      els.messageText.textContent += text.charAt(i);
      i++;
      ui._typeTimer = setTimeout(step, ui.typeSpeedMs);
    }
    step();
  }

  function waitForAdvance(onAdvance) {
    let done = false;
    function handler(e) {
      if (done) return;
      // キャンセルキー(X/Esc)でもメッセージを送れるようにする。
      // stopPropagationで、送りに使ったキーが同一イベント内で
      // map.jsの移動/正面アクションを誤発火させるのを防ぐ。
      if (e.type === "click" || e.key === " " || isConfirmKey(e) || isCancelKey(e)) {
        if (e.type === "keydown") {
          e.preventDefault();
          e.stopPropagation();
        }
        done = true;
        document.removeEventListener("keydown", handler);
        els.messageWindow.removeEventListener("click", handler);
        onAdvance();
      }
    }
    document.addEventListener("keydown", handler);
    els.messageWindow.addEventListener("click", handler);
  }

  function hideMessage() {
    if (ui._typeTimer) clearTimeout(ui._typeTimer);
    els.messageWindow.classList.add("hidden");
    els.messageText.textContent = "";
    ui.messageQueue = [];
    ui.messageBusy = false;
  }

  // ------------------------------------------------------------------------
  // コマンド/各種メニュー
  // ------------------------------------------------------------------------

  /**
   * メニューを開く。
   * @param {string} menuType "command" | "spell" | "item" | "shop" | "status" | "church"
   * @param {object} options { items: [{label, value, disabled}], onSelect, onCancel, title }
   */
  function openMenu(menuType, options) {
    options = options || {};
    ui.currentMenu = {
      type: menuType,
      options: options,
      selectedIndex: options.selectedIndex || 0,
    };

    switch (menuType) {
      case "command":
        if (options.actorIndex != null && !options.items) {
          openBattleCommandMenu(options.actorIndex);
          return;
        }
        renderCommandList(options);
        break;
      case "spell":
      case "item":
      case "target":
        renderCommandList(options);
        break;
      case "status":
        renderStatusWindow(options);
        break;
      case "shop":
        // openShop() が個別に描画するため、ここでは選択状態のみ保持
        break;
      case "church":
        // openChurch() が個別に描画する
        break;
      case "custom":
        // options.render(selectedIndex) が呼び出し元(ショップ/宿屋/教会等)の
        // 独自DOM描画を担う。onGlobalKeyDown からの矢印/決定/キャンセルは
        // 通常のメニューと共通の仕組みに乗せつつ、描画だけ委譲する。
        if (typeof options.render === "function") options.render(ui.currentMenu.selectedIndex);
        break;
      default:
        renderCommandList(options);
    }
  }

  function closeMenu() {
    els.commandWindow.classList.add("hidden");
    els.statusWindow.classList.add("hidden");
    els.shopWindow.classList.add("hidden");
    els.churchWindow.classList.add("hidden");
    if (els.innWindow) els.innWindow.classList.add("hidden");
    els.commandList.innerHTML = "";
    ui.currentMenu = null;
  }

  // Xキー(キャンセル)のグローバルハンドラ。現在開いているメニューの
  // onCancel コールバックがあればそれを呼び、無ければ単にメニューを閉じる。
  function handleCancelKey() {
    if (!ui.currentMenu) return;
    if (window.RPG.Audio) window.RPG.Audio.playSe("cancel");
    const menu = ui.currentMenu;
    const options = menu.options || {};
    if (typeof options.onCancel === "function") {
      options.onCancel();
    } else {
      closeMenu();
    }
  }

  // Escape/Backspace は X(キャンセル)の別名として扱う。
  function isCancelKey(e) {
    return e.code === "KeyX" || e.key === "x" || e.key === "X" ||
      e.key === "Escape" || e.key === "Backspace";
  }

  // Enter は Z(決定)の別名として扱う。
  function isConfirmKey(e) {
    return e.code === "KeyZ" || e.key === "z" || e.key === "Z" ||
      e.key === "Enter" || e.code === "NumpadEnter";
  }

  // ArrowLeft/ArrowRightは、宿屋の「はい/いいえ」等の横並び2択メニューでも
  // 上下キーと同じ感覚で操作できるよう、ArrowUp/ArrowDownの別名として扱う。
  const ARROW_DIR = {
    ArrowUp: -1,
    ArrowLeft: -1,
    ArrowDown: 1,
    ArrowRight: 1,
  };

  // メニュー表示中の矢印キー上下でselectedIndexを移動し、Zキーで確定する。
  // フィールド移動はキーボード、メニューはマウスのみという操作系の分裂を解消する。
  function onGlobalKeyDown(e) {
    if (ui.messageBusy) return;

    if (isCancelKey(e)) {
      if (ui.currentMenu) {
        // メニューが消費したキャンセルキーをmap.js側へ漏らさない
        e.preventDefault();
        e.stopPropagation();
      }
      handleCancelKey();
      return;
    }

    if (!ui.currentMenu) return;

    // メニュー表示中は矢印/決定/スペースをここで消費し、map.jsの
    // フィールド移動・正面アクションへ伝播させない(メニュー操作中に
    // キャラが歩いてエンカウントする不具合の防止)。
    if (ARROW_DIR[e.key] || isConfirmKey(e) || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
    }

    const menu = ui.currentMenu;
    const options = menu.options || {};
    const items = options.items || [];
    if (!items.length) return;

    if (ARROW_DIR[e.key]) {
      moveMenuSelection(items, ARROW_DIR[e.key]);
      return;
    }

    if (isConfirmKey(e)) {
      const idx = menu.selectedIndex || 0;
      const item = items[idx];
      if (item && !item.disabled && typeof options.onSelect === "function") {
        if (window.RPG.Audio) window.RPG.Audio.playSe("decide");
        options.onSelect(item, idx);
      }
    }
  }

  function moveMenuSelection(items, delta) {
    if (!ui.currentMenu) return;
    let idx = ui.currentMenu.selectedIndex || 0;
    for (let i = 0; i < items.length; i++) {
      idx = (idx + delta + items.length) % items.length;
      if (!items[idx].disabled) break;
    }
    ui.currentMenu.selectedIndex = idx;
    const render = ui.currentMenu.options && ui.currentMenu.options.render;
    if (typeof render === "function") {
      render(idx);
    } else {
      renderCommandList(ui.currentMenu.options);
    }
  }

  document.addEventListener("keydown", onGlobalKeyDown);

  // ------------------------------------------------------------------------
  // 戦闘コマンド構築(たたかう/じゅもん/どうぐ/ぼうぎょ/にげる)
  // ------------------------------------------------------------------------

  function battleActorId(actor) {
    return actor.id || actor.name;
  }

  // actorIndex番目の生存パーティメンバーの戦闘コマンド一覧を開く。
  function openBattleCommandMenu(actorIndex) {
    const battle = window.RPG.battle;
    if (!battle || !battle.getState) return;
    const state = battle.getState();
    if (!state) return;
    const party = ((window.RPG.state && window.RPG.state.party) || []).filter(function (m) {
      return m.hp > 0;
    });
    const actor = party[actorIndex] || party[0];
    if (!actor) return;

    openMenu("command", {
      items: [
        { label: "たたかう", value: "attack" },
        { label: "じゅもん", value: "spell" },
        { label: "どうぐ", value: "item" },
        { label: "ぼうぎょ", value: "guard" },
        { label: "にげる", value: "run" },
      ],
      onSelect: function (item) {
        handleBattleCommandSelect(actor, actorIndex, item.value);
      },
      onCancel: function () {
        // 戦闘コマンドメニューは行動選択の最上位であり、閉じてしまうと
        // 再度開くための手段(キー/ボタン)が存在せず、ウィンドウが消えたまま
        // 完全に無応答の状態になってしまう。この階層ではキャンセルを無視し、
        // 必ずメニューが表示され続けるようにする。
      },
    });
  }

  function handleBattleCommandSelect(actor, actorIndex, value) {
    const battle = window.RPG.battle;
    if (!battle) return;

    if (value === "attack") {
      // たたかうは常に敵単体を選ばせる(旧実装は対象選択が無く、findMonsterTarget()の
      // フォールバック(先頭の敵)に固定されていた。複数体との戦闘で選べないのは不便なため
      // 単体攻撃と同様に対象選択カーソルを挟む)。
      openBattleTargetMenu(actor, actorIndex, "monster", null, function (targetId) {
        closeMenu();
        battle.queueCommand(battleActorId(actor), "attack", { type: "monster", id: targetId });
      }, function () {
        openBattleCommandMenu(actorIndex);
      });
    } else if (value === "guard") {
      closeMenu();
      battle.queueCommand(battleActorId(actor), "guard", {});
    } else if (value === "run") {
      closeMenu();
      battle.queueCommand(battleActorId(actor), "run", {});
    } else if (value === "spell") {
      openBattleSpellMenu(actor, actorIndex);
    } else if (value === "item") {
      openBattleItemMenu(actor, actorIndex);
    }
  }

  function openBattleSpellMenu(actor, actorIndex) {
    const spellsData = (window.RPG.data && window.RPG.data.SPELLS) || {};
    const known = Array.isArray(actor.spells) ? actor.spells : [];
    const items = known
      .map(function (spellId) { return spellsData[spellId]; })
      .filter(Boolean)
      .map(function (spell) {
        return {
          label: spell.name + "(MP" + spell.mpCost + ")",
          value: spell.id,
          disabled: (actor.mp || 0) < spell.mpCost,
        };
      });
    items.push({ label: "もどる", value: "back" });

    openMenu("spell", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openBattleCommandMenu(actorIndex);
          return;
        }
        const spell = spellsData[item.value];
        const targetsMonster = spell && spell.target && spell.target.indexOf("enemy") === 0;
        const targetsAll = spell && spell.target && /All$/.test(spell.target);
        const targetsSelf = spell && spell.target === "self";

        if (targetsAll || targetsSelf) {
          // 全体呪文/自己完結呪文(ワープ等)は対象選択不要でそのまま確定する。
          closeMenu();
          window.RPG.battle.queueCommand(battleActorId(actor), "spell", {
            type: targetsMonster ? "monster" : "party",
          }, item.value);
          return;
        }

        // 単体対象呪文: 対象選択カーソル(敵 or 味方)を挟んでから確定する。
        openBattleTargetMenu(actor, actorIndex, targetsMonster ? "monster" : "party", null, function (targetId) {
          closeMenu();
          window.RPG.battle.queueCommand(battleActorId(actor), "spell", {
            type: targetsMonster ? "monster" : "party",
            id: targetId,
          }, item.value);
        }, function () {
          openBattleSpellMenu(actor, actorIndex);
        }, spell.effectType === "revive");
      },
      onCancel: function () {
        openBattleCommandMenu(actorIndex);
      },
    });
  }

  function openBattleItemMenu(actor, actorIndex) {
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const inventory = (window.RPG.state && window.RPG.state.inventory) || [];
    const items = inventory
      .map(function (entry) {
        const def = itemsData[entry.itemId];
        if (!def || def.type !== "consumable") return null;
        return {
          label: def.name + " x" + entry.count,
          value: entry.itemId,
          disabled: entry.count <= 0,
        };
      })
      .filter(Boolean);
    items.push({ label: "もどる", value: "back" });

    openMenu("item", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openBattleCommandMenu(actorIndex);
          return;
        }
        const def = itemsData[item.value];
        const effect = (def && def.effect) || {};
        // アイテムの効果がパーティ全体に及ぶもの(healAll相当)や自己完結(warp)は
        // 対象選択不要。それ以外(heal/mpHeal/revive/cureStatus等の単体効果)は
        // 対象選択カーソルを挟む(旧実装は常にランダムな味方が対象になっていた)。
        if (effect.type === "warp" || effect.scope === "all") {
          closeMenu();
          window.RPG.battle.queueCommand(battleActorId(actor), "item", { type: "party" }, item.value);
          return;
        }

        openBattleTargetMenu(actor, actorIndex, "party", null, function (targetId) {
          closeMenu();
          window.RPG.battle.queueCommand(battleActorId(actor), "item", { type: "party", id: targetId }, item.value);
        }, function () {
          openBattleItemMenu(actor, actorIndex);
        }, effect.type === "revive");
      },
      onCancel: function () {
        openBattleCommandMenu(actorIndex);
      },
    });
  }

  // ------------------------------------------------------------------------
  // 対象選択カーソル(単体攻撃/単体呪文/単体アイテム共通)
  // 矢印キー上下で味方 or 敵の中からカーソルを移動し、Zで決定・Xでキャンセル。
  // 既存のコマンドメニュー(openMenu("command"/"spell"/"item", ...))と同じ
  // ui.currentMenu / onGlobalKeyDown の仕組みに乗せることで操作感を統一する。
  // ------------------------------------------------------------------------

  function openBattleTargetMenu(actor, actorIndex, scope, presetTargets, onConfirm, onCancel, includeDeadParty) {
    const battle = window.RPG.battle;
    let candidates;
    if (scope === "monster") {
      candidates = (battle && battle.aliveMonsters ? battle.aliveMonsters() : []).map(function (m) {
        return { label: m.name, value: m.instanceId };
      });
    } else {
      const party = includeDeadParty
        ? ((window.RPG.state && window.RPG.state.party) || []).filter(function (m) { return m.hp <= 0; })
        : (battle && battle.aliveParty ? battle.aliveParty() : []);
      candidates = party.map(function (m) {
        return { label: m.name + "(HP " + m.hp + "/" + m.maxHp + ")", value: battleActorId(m) };
      });
    }

    if (!candidates.length) {
      // 対象がいない場合はそのままキャンセル扱いで元のメニューへ戻す
      if (typeof onCancel === "function") onCancel();
      return;
    }

    openMenu("target", {
      items: candidates,
      onSelect: function (item) {
        if (typeof onConfirm === "function") onConfirm(item.value);
      },
      onCancel: function () {
        if (typeof onCancel === "function") onCancel();
      },
    });
  }

  function renderCommandList(options) {
    const items = options.items || [];
    els.commandList.innerHTML = "";

    if (options.title) {
      const titleItem = document.createElement("li");
      titleItem.className = "command-title";
      titleItem.textContent = options.title;
      els.commandList.appendChild(titleItem);
    }

    items.forEach(function (item, idx) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "dq-command-item";
      btn.textContent = item.label;
      btn.disabled = !!item.disabled;
      if (idx === ui.currentMenu.selectedIndex) btn.classList.add("selected");

      btn.addEventListener("click", function () {
        if (item.disabled) return;
        ui.currentMenu.selectedIndex = idx;
        if (typeof options.onSelect === "function") {
          options.onSelect(item, idx);
        }
      });

      li.appendChild(btn);
      els.commandList.appendChild(li);
    });

    els.commandWindow.classList.remove("hidden");
  }

  // ------------------------------------------------------------------------
  // ステータス画面
  // ------------------------------------------------------------------------

  function renderStatusWindow(options) {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    let html = "";

    party.forEach(function (member, idx) {
      const equipment = member.equipment || {};
      const condition = hpCondition(member.hp, member.maxHp);
      const condClass = condition ? " cond-" + condition : "";
      html += '<div class="status-member-block' + condClass + '">';
      html += '<div class="status-member-name">' + escapeHtml(member.name) +
        "(Lv" + member.level + " " + escapeHtml(jobName(member.job)) + ")</div>";
      html += statBarRow("HP", member.hp, member.maxHp, "hp", condition);
      html += statBarRow("MP", member.mp, member.maxMp, "mp", condition);
      html += '<table><tbody>';
      html += statRow("ちから", member, "chikara");
      html += statRow("まもり", member, "mamori");
      html += statRow("すばやさ", member, "subayasa");
      html += statRow("かしこさ", member, "kashikosa");
      html += statRow("うんのよさ", member, "un");
      html += "</tbody></table>";
      html += '<div class="status-equip-row">';
      ["weapon", "armor", "accessory"].forEach(function (slot) {
        const equippedId = equipment[slot];
        const equippedName = equippedId && itemsData[equippedId] ? itemsData[equippedId].name : "なし";
        html += '<button class="dq-command-item status-equip-btn" data-member="' + idx +
          '" data-slot="' + slot + '">' + slotLabel(slot) + ": " + escapeHtml(equippedName) + "</button>";
      });
      html += "</div>";
      html += "</div>";
    });
    html += '<button class="dq-command-item status-back-btn">もどる</button>';

    els.statusContent.innerHTML = html;
    els.statusWindow.classList.remove("hidden");

    els.statusContent.querySelectorAll(".status-equip-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const memberIdx = parseInt(btn.getAttribute("data-member"), 10);
        const slot = btn.getAttribute("data-slot");
        openEquipMenu(party[memberIdx], slot);
      });
    });
    els.statusContent.querySelectorAll(".status-back-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeMenu();
      });
    });
  }

  function slotLabel(slot) {
    if (slot === "weapon") return "武器";
    if (slot === "armor") return "防具";
    return "装飾品";
  }

  // 所持している装備アイテムの中から、対象スロット・職業に装備可能なものを選ばせる。
  // onBack: 選択/キャンセル後の戻り先。省略時は従来通りステータス画面へ戻る
  // (フィールドメニューの「そうび」からはスロット選択メニューへ戻す)。
  function equippedCountByOthers(itemId, member) {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    return party.reduce(function (count, other) {
      if (other === member) return count;
      const equipment = other.equipment || {};
      return count + Object.keys(equipment).filter(function (slot) {
        return equipment[slot] === itemId;
      }).length;
    }, 0);
  }

  function openEquipMenu(member, slot, onBack) {
    if (!member) return;
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const jobsData = (window.RPG.data && window.RPG.data.JOBS) || {};
    const job = jobsData[member.job] || {};
    const equipableTypes = job.equipableTypes || [];
    const inventory = (window.RPG.state && window.RPG.state.inventory) || [];

    const slotTypeMap = { weapon: "weapon", armor: "armor", accessory: "accessory" };
    const wantedType = slotTypeMap[slot];

    const items = inventory
      .map(function (entry) {
        const def = itemsData[entry.itemId];
        if (!def || def.type !== wantedType) return null;
        if (equippedCountByOthers(entry.itemId, member) >= entry.count) return null;
        const equipKey = def.weaponType || def.armorType || def.type;
        if (!equipableTypes.length || equipableTypes.indexOf(equipKey) !== -1 || def.type === "accessory") {
          return { label: def.name, value: entry.itemId };
        }
        return null;
      })
      .filter(Boolean);
    items.push({ label: "はずす", value: "unequip" });
    items.push({ label: "もどる", value: "back" });

    // ステータス画面(z-index:40)とコマンドウィンドウ(z-index:50)は
    // styles.cssでレイヤーを分離済みのため、DOM操作でステータス画面を
    // 隠さなくても装備選択メニューは正しく手前に表示される。

    const goBack = typeof onBack === "function"
      ? onBack
      : function () { renderStatusWindow({}); };
    const goBackAfterEquip = typeof onBack === "function"
      ? onBack
      : function () { closeMenu(); renderStatusWindow({}); };

    openMenu("item", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          goBack();
          return;
        }
        member.equipment = member.equipment || { weapon: null, armor: null, accessory: null };
        member.equipment[slot] = item.value === "unequip" ? null : item.value;
        goBackAfterEquip();
      },
      onCancel: function () {
        goBack();
      },
    });
  }

  function statWithEquipment(member, statKey) {
    const base = member && member.stats && Number(member.stats[statKey]) || 0;
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const equipment = (member && member.equipment) || {};
    const bonus = Object.keys(equipment).reduce(function (sum, slot) {
      const item = itemsData[equipment[slot]];
      return sum + (item && item.statBonus && Number(item.statBonus[statKey]) || 0);
    }, 0);
    return { value: base + bonus, bonus: bonus };
  }

  function statRow(label, member, statKey) {
    const stat = statWithEquipment(member, statKey);
    const bonusText = stat.bonus ? ' <span class="status-stat-bonus">(' + (stat.bonus > 0 ? "+" : "") + stat.bonus + ')</span>' : "";
    return "<tr><th>" + escapeHtml(label) + "</th><td>" + stat.value + bonusText + "</td></tr>";
  }

  // HPの残量から状態区分を判定する。呼び出し元(ステータス画面/戦闘UI)双方で
  // 名前・数値・ゲージ全体の配色を揃えるために使う共通ロジック。
  // "down": 戦闘不能(HP0) → 赤, "low": HP20%以下 → 橙, "": 通常
  function hpCondition(hp, maxHp) {
    const cur = hp != null ? hp : 0;
    const max = maxHp || 1;
    if (cur <= 0) return "down";
    if (cur / max <= 0.2) return "low";
    return "";
  }

  function statBarRow(label, current, max, kind, condition) {
    max = max || 1;
    current = current != null ? current : 0;
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    // ゲージ自体の危険色(赤)は従来通りHP25%以下で発火させ、
    // condition(20%以下=橙/0=赤)によるステータス全体の警告色と重ねて見せる。
    const lowClass = kind === "hp" && pct <= 25 ? " low" : "";
    const condClass = condition ? " cond-" + condition : "";
    return (
      '<div class="stat-bar-row' + condClass + '">' +
      '<span class="stat-bar-label">' + label + "</span>" +
      '<span class="stat-bar-track"><span class="stat-bar-fill ' + kind + lowClass + '" style="width:' + pct + '%"></span></span>' +
      '<span class="stat-bar-value">' + current + "/" + max + "</span>" +
      "</div>"
    );
  }

  function jobName(jobId) {
    const jobs = window.RPG.data && window.RPG.data.JOBS;
    if (jobs && jobs[jobId]) return jobs[jobId].name;
    return jobId || "-";
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ------------------------------------------------------------------------
  // 戦闘UI(HP/MPバー・コマンドウィンドウ)
  // ------------------------------------------------------------------------

  /**
   * 戦闘中のパーティステータスカードとコマンドウィンドウを描画する。
   * @param {object} battleState RPG.battle が持つ内部状態のスナップショット
   */
  function renderBattleUI(battleState) {
    battleState = battleState || {};
    const party = battleState.party || (window.RPG.state && window.RPG.state.party) || [];

    els.battlePartyStatus.innerHTML = "";
    party.forEach(function (member) {
      const condition = hpCondition(member.hp, member.maxHp);
      const card = document.createElement("div");
      card.className = "battle-member-card" + (member.hp <= 0 ? " dead" : "") +
        (condition ? " cond-" + condition : "");
      const statusLabel = battleStatusLabel(member.status);
      card.innerHTML =
        '<div class="battle-member-name">' + escapeHtml(member.name) + "</div>" +
        (statusLabel ? '<div class="battle-member-status">' + escapeHtml(statusLabel) + "</div>" : "") +
        statBarRow("HP", member.hp, member.maxHp, "hp", condition) +
        statBarRow("MP", member.mp, member.maxMp, "mp", condition);
      els.battlePartyStatus.appendChild(card);
    });

    if (battleState.commandOptions) {
      openMenu("command", battleState.commandOptions);
    }
  }

  // data.jsには状態異常名のテーブルはなく、sleep/paralyzeの状態値だけが定義されている。
  function battleStatusLabel(status) {
    const labels = { poison: "どく", sleep: "ねむり", paralyze: "まひ" };
    return status ? (labels[status] || status) : "";
  }

  // ------------------------------------------------------------------------
  // ショップUI(武器屋/道具屋)
  // ------------------------------------------------------------------------

  /**
   * ショップの売買UIを開く。
   * @param {string} shopId 町(マップ)ID。SHOP_INVENTORYの参照キーとして使う。
   * @param {string} mode "buy" | "sell"
   * @param {string} [shopType] "weaponShop" | "itemShop"。省略時は全ITEMSから選ぶ(後方互換)。
   * @param {function} [onClose] ウィンドウを閉じたときに呼ばれるコールバック(入力ロック解除用)
   * @param {number} [initialSelectedIndex] 再表示時に維持するカーソル位置
   */
  function openShop(shopId, mode, shopType, onClose, initialSelectedIndex) {
    mode = mode || "buy";
    ui._shopOnClose = onClose || ui._shopOnClose || null;

    const list = buildShopList(shopId, mode, shopType);
    // 「とじる」を選択肢の末尾に追加し、他のメニュー同様に矢印キー+Z/Xで
    // 完結できるようにする(旧実装はクリックでしか閉じられなかった)。
    const items = list.map(function (item) {
      const price = mode === "buy" ? item.price : Math.floor((item.price || 0) / 2);
      return {
        label: item.name + (item.count ? "  x" + item.count : ""),
        price: price,
        item: item,
      };
    });
    items.push({ label: "とじる", isClose: true });
    const selectedIndex = Math.max(0, Math.min(initialSelectedIndex || 0, items.length - 1));

    openMenu("custom", {
      items: items,
      selectedIndex: selectedIndex,
      render: function (selectedIndex) {
        renderShopWindow(shopId, mode, shopType, items, selectedIndex);
      },
      onSelect: function (item) {
        if (item.isClose) {
          closeShop();
          return;
        }
        handleShopTransaction(shopId, mode, shopType, item.item, item.price, ui.currentMenu.selectedIndex);
      },
      onCancel: function () {
        closeShop();
      },
    });
  }

  function buildShopList(shopId, mode, shopType) {
    const items = window.RPG.data && window.RPG.data.ITEMS;
    const state = window.RPG.state || {};

    if (mode === "buy") {
      const inventoryData = (window.RPG.data && window.RPG.data.SHOP_INVENTORY) || {};
      const townInventory = inventoryData[shopId] || {};
      const allowedIds = shopType ? (townInventory[shopType] || []) : null;

      if (allowedIds) {
        // 町別の品揃え(SHOP_INVENTORY)が定義されている場合はそれに限定する
        return allowedIds
          .map(function (id) { return items && items[id] ? Object.assign({ id: id }, items[id]) : null; })
          .filter(Boolean);
      }
      // shopType未指定時は従来通り全品揃え(後方互換フォールバック)
      return Object.keys(items || {})
        .map(function (id) { return Object.assign({ id: id }, items[id]); })
        .filter(function (it) { return it.price != null; });
    }

    return ((state.inventory) || []).map(function (entry) {
      const def = items && items[entry.itemId];
      return Object.assign({ id: entry.itemId, count: entry.count }, def);
    });
  }

  function renderShopWindow(shopId, mode, shopType, items, selectedIndex) {
    const state = window.RPG.state || {};
    const gold = state.gold || 0;

    els.shopHeader.textContent =
      (mode === "buy" ? "なにを　かいますか？" : "なにを　うりますか？") +
      "　(所持金: " + gold + "G)";

    els.shopList.innerHTML = "";

    items.forEach(function (entry, idx) {
      const li = document.createElement("li");
      if (idx === selectedIndex) li.classList.add("selected");

      const nameSpan = document.createElement("span");
      nameSpan.textContent = entry.label;
      li.appendChild(nameSpan);

      if (!entry.isClose) {
        const priceSpan = document.createElement("span");
        priceSpan.className = "item-price";
        priceSpan.textContent = entry.price + "G";
        li.appendChild(priceSpan);
      }

      li.addEventListener("click", function () {
        ui.currentMenu.selectedIndex = idx;
        if (entry.isClose) {
          closeShop();
          return;
        }
        handleShopTransaction(shopId, mode, shopType, entry.item, entry.price, idx);
      });
      els.shopList.appendChild(li);
    });

    els.shopFooter.textContent =
      "↑↓で選択、Z/クリックで" + (mode === "buy" ? "購入" : "売却") + "、X/Escで戻る";

    els.shopWindow.classList.remove("hidden");
  }

  function handleShopTransaction(shopId, mode, shopType, item, price, selectedIndex) {
    const engine = window.RPG.engine;
    if (!engine) return;

    if (mode === "buy") {
      if ((window.RPG.state.gold || 0) < price) {
        showMessage("おかねが　たりない！");
        return;
      }
      engine.spendGold(price);
      addToInventory(item.id, 1);
      showMessage(item.name + "を　かった！");
    } else {
      removeFromInventory(item.id, 1);
      engine.gainGold(price);
      showMessage(item.name + "を　うった！");
    }
    openShop(shopId, mode, shopType, undefined, selectedIndex);
  }

  function addToInventory(itemId, count) {
    const inv = window.RPG.state.inventory = window.RPG.state.inventory || [];
    const entry = inv.find(function (e) { return e.itemId === itemId; });
    if (entry) entry.count += count;
    else inv.push({ itemId: itemId, count: count });
  }

  function removeFromInventory(itemId, count) {
    const inv = window.RPG.state.inventory || [];
    const entry = inv.find(function (e) { return e.itemId === itemId; });
    if (!entry) return;
    entry.count -= count;
    if (entry.count <= 0) {
      window.RPG.state.inventory = inv.filter(function (e) { return e.itemId !== itemId; });
    }
  }

  function closeShop() {
    closeMenu();
    const cb = ui._shopOnClose;
    ui._shopOnClose = null;
    if (typeof cb === "function") cb();
  }

  // ------------------------------------------------------------------------
  // 教会UI(蘇生/状態回復/転職/仲間並び替え)
  // ------------------------------------------------------------------------

  // 転職に必要な最低レベル
  const JOB_CHANGE_MIN_LEVEL = 20;

  /**
   * 教会メニューを開く。
   * @param {string} churchId
   * @param {function} [onClose] ウィンドウを閉じたときに呼ばれるコールバック(入力ロック解除用)
   */
  function openChurch(churchId, onClose) {
    const state = window.RPG.state || {};
    const party = state.party || [];
    ui._churchOnClose = onClose || ui._churchOnClose || null;

    // 転職はレベル20以上のメンバーが1人でもいれば選択肢として表示する
    // (実際に転職可能かどうかはメンバー選択時にさらに判定する)
    const flags = state.flags || {};
    const anyEligibleForJobChange = party.some(function (m) { return (m.level || 1) >= JOB_CHANGE_MIN_LEVEL; });

    const items = [
      { label: "状態異常回復(10G)", act: "heal-status" },
      { label: "蘇生(50G)", act: "revive" },
      { label: "仲間の並び替え", act: "reorder" },
    ];
    if (flags.classChangeUnlocked && anyEligibleForJobChange) {
      items.push({ label: "転職(Lv" + JOB_CHANGE_MIN_LEVEL + "以上)", act: "job-change" });
    }
    items.push({ label: "やめる", act: "close" });

    openMenu("custom", {
      items: items,
      render: function (selectedIndex) {
        renderChurchWindow(items, selectedIndex);
      },
      onSelect: function (item) {
        handleChurchAction(churchId, item.act, party);
      },
      onCancel: function () {
        closeChurch();
      },
    });
  }

  function renderChurchWindow(items, selectedIndex) {
    let html = '<h3>星霜の礼拝堂</h3><ul class="command-list">';
    items.forEach(function (item, idx) {
      const selClass = idx === selectedIndex ? " selected" : "";
      html += '<li><button class="dq-command-item' + selClass + '" data-idx="' + idx + '">' +
        escapeHtml(item.label) + "</button></li>";
    });
    html += "</ul>";

    els.churchContent.innerHTML = html;
    els.churchWindow.classList.remove("hidden");

    els.churchContent.querySelectorAll("[data-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        if (!ui.currentMenu) return;
        ui.currentMenu.selectedIndex = idx;
        const item = items[idx];
        if (typeof ui.currentMenu.options.onSelect === "function") {
          ui.currentMenu.options.onSelect(item, idx);
        }
      });
    });
  }

  function handleChurchAction(churchId, action, party) {
    const engine = window.RPG.engine;
    switch (action) {
      case "heal-status": {
        const cost = 10;
        if (!engine || !engine.spendGold(cost)) {
          showMessage("おかねが　たりない！");
          break;
        }
        party.forEach(function (m) { m.status = null; });
        showMessage("状態異常を　回復した！");
        break;
      }
      case "revive": {
        const cost = 50;
        const hasDead = party.some(function (m) { return m.hp <= 0; });
        if (!hasDead) {
          showMessage("蘇生できる仲間が　いない。");
          break;
        }
        if (!engine || !engine.spendGold(cost)) {
          showMessage("おかねが　たりない！");
          break;
        }
        party.forEach(function (m) {
          if (m.hp <= 0) m.hp = Math.floor(m.maxHp / 2);
        });
        showMessage("戦闘不能から　蘇生した！");
        break;
      }
      case "reorder":
        closeChurch();
        openReorderMenu();
        break;
      case "job-change":
        openJobChangeMenu(party);
        break;
      case "close":
      default:
        closeChurch();
        break;
    }
  }

  function openJobChangeMenu(party) {
    const items = party.map(function (member, idx) {
      const eligible = (member.level || 1) >= JOB_CHANGE_MIN_LEVEL;
      return {
        label: member.name + "(Lv" + member.level + " " + jobName(member.job) + ")",
        value: String(idx),
        disabled: !eligible,
      };
    });
    items.push({ label: "やめる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          openChurch();
          return;
        }
        const member = party[parseInt(item.value, 10)];
        if (!member || (member.level || 1) < JOB_CHANGE_MIN_LEVEL) {
          showMessage("まだ　レベルが　たりない。");
          return;
        }
        openJobPickMenu(member);
      },
      onCancel: function () {
        closeMenu();
        openChurch();
      },
    });
  }

  function getAvailableJobsForMember(member) {
    const jobsData = (window.RPG.data && window.RPG.data.JOBS) || {};
    const flags = (window.RPG.state && window.RPG.state.flags) || {};
    const result = [];
    Object.keys(jobsData).forEach(function (jobId) {
      const job = jobsData[jobId];
      if (!job || job.hidden) return;
      if (job.isHero) return;
      if (jobId === "yoyoyo") return;
      result.push(jobId);
    });
    if (member.job === "tabigarasu" && flags.metCriteriaForFuurai) {
      result.push("fuuraiNoYuusha");
    }
    return result;
  }

  function openJobPickMenu(member) {
    const jobsData = (window.RPG.data && window.RPG.data.JOBS) || {};
    const jobIds = getAvailableJobsForMember(member);
    const items = jobIds.map(function (jobId) {
      const job = jobsData[jobId];
      return {
        label: job ? job.name : jobId,
        value: jobId,
        disabled: member.job === jobId,
      };
    });
    items.push({ label: "やめる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          openJobChangeMenu((window.RPG.state && window.RPG.state.party) || []);
          return;
        }
        if (member.job === item.value) {
          showMessage("いまと　同じ　職業だ。");
          return;
        }
        member.job = item.value;
        if (window.RPG.engine && typeof window.RPG.engine.recalcStats === "function") {
          window.RPG.engine.recalcStats(member);
        }
        if (window.RPG.engine && typeof window.RPG.engine.checkLearnSpells === "function") {
          window.RPG.engine.checkLearnSpells(member);
        }
        showMessage(member.name + "は　" + jobName(member.job) + "に　転職した！");
        closeMenu();
        openChurch();
      },
      onCancel: function () {
        closeMenu();
        openJobChangeMenu((window.RPG.state && window.RPG.state.party) || []);
      },
    });
  }

  /** C-6: battle.js の Canvas 描画と連携するフロート数字API(将来DOM重ね用のフック)。 */
  function showFloatingText(cx, cy, text, style) {
    // 実際の描画は battle.js の effectQueue + renderMonsters() が担当。
  }

  function closeChurch() {
    closeMenu();
    const cb = ui._churchOnClose;
    ui._churchOnClose = null;
    if (typeof cb === "function") cb();
  }

  // ------------------------------------------------------------------------
  // 宿屋UI(料金表示→はい/いいえ→全回復+セーブ推奨メッセージ)
  // ------------------------------------------------------------------------

  const DEFAULT_INN_PRICE = 10;

  function innPriceFor(innId) {
    const prices = (window.RPG.data && window.RPG.data.INN_PRICES) || {};
    return prices[innId] != null ? prices[innId] : DEFAULT_INN_PRICE;
  }

  /**
   * 宿屋UIを開く。料金を表示し、はい/いいえで確認後、全回復する。
   * @param {string} innId 町(マップ)ID
   * @param {function} [onClose] ウィンドウを閉じたときに呼ばれるコールバック(入力ロック解除用)
   */
  function openInn(innId, onClose) {
    ui._innOnClose = onClose || ui._innOnClose || null;
    const price = innPriceFor(innId);
    const gold = (window.RPG.state && window.RPG.state.gold) || 0;

    openInnPrompt(
      "ひとばん　" + price + "Gだよ。とまっていくかい？　(所持金: " + gold + "G)",
      innId,
      price
    );
  }

  // はい/いいえの2択メニュー。左右矢印(上下も可)でカーソル移動、Z/Enterで決定、
  // X/Escでキャンセル(「いいえ」相当)にする。既存のcommand-window系メニューと
  // 同じ ui.currentMenu / onGlobalKeyDown の仕組みに乗せて操作感を統一する。
  function openInnPrompt(message, innId, price) {
    const items = [
      { label: "はい", act: "yes" },
      { label: "いいえ", act: "no" },
    ];

    openMenu("custom", {
      items: items,
      render: function (selectedIndex) {
        renderInnWindow(message, items, selectedIndex);
      },
      onSelect: function (item) {
        handleInnAction(innId, price, item.act);
      },
      onCancel: function () {
        closeInn();
      },
    });
  }

  function renderInnWindow(message, items, selectedIndex) {
    if (!els.innContent) return;
    let html = "<h3>やどや</h3>";
    html += "<p>" + escapeHtml(message) + "</p>";
    html += '<ul class="command-list">';
    items.forEach(function (item, idx) {
      const selClass = idx === selectedIndex ? " selected" : "";
      html += '<li><button class="dq-command-item' + selClass + '" data-idx="' + idx + '">' +
        escapeHtml(item.label) + "</button></li>";
    });
    html += "</ul>";
    els.innContent.innerHTML = html;

    els.innContent.querySelectorAll("[data-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        if (!ui.currentMenu) return;
        ui.currentMenu.selectedIndex = idx;
        const item = items[idx];
        if (typeof ui.currentMenu.options.onSelect === "function") {
          ui.currentMenu.options.onSelect(item, idx);
        }
      });
    });

    if (els.innWindow) els.innWindow.classList.remove("hidden");
  }

  function handleInnAction(innId, price, action) {
    if (action === "yes") {
      stayAtInn(innId, price);
      return;
    }
    closeInn();
  }

  function stayAtInn(innId, price) {
    const engine = window.RPG.engine;
    const state = window.RPG.state || {};

    if (!engine || !engine.spendGold(price)) {
      openInnPrompt("おかねが　たりないようだね…", innId, price);
      return;
    }

    const party = state.party || [];
    party.forEach(function (m) {
      m.hp = m.maxHp;
      m.mp = m.maxMp;
      m.status = null;
    });

    openInnResult();
  }

  // 宿泊完了後の「とじる」だけの単一選択肢メニュー。Z/Enter/クリックいずれでも
  // 閉じられ、X/Escでも閉じられる(キャンセル=とじる扱い)。
  function openInnResult() {
    const items = [{ label: "とじる", act: "close" }];

    openMenu("custom", {
      items: items,
      render: function (selectedIndex) {
        renderInnResultWindow(items, selectedIndex);
      },
      onSelect: function () {
        closeInn();
      },
      onCancel: function () {
        closeInn();
      },
    });
  }

  function renderInnResultWindow(items, selectedIndex) {
    if (!els.innContent) return;
    let html =
      "<h3>やどや</h3><p>ぐっすりねむって　からだの　げんきが　全回復した！</p>" +
      '<p class="inn-save-hint">とびらを　でるまえに、ぼうけんのしょに　きろくすることを　おすすめするよ。</p>' +
      '<ul class="command-list">';
    items.forEach(function (item, idx) {
      const selClass = idx === selectedIndex ? " selected" : "";
      html += '<li><button class="dq-command-item' + selClass + '" data-idx="' + idx + '">' +
        escapeHtml(item.label) + "</button></li>";
    });
    html += "</ul>";
    els.innContent.innerHTML = html;

    els.innContent.querySelectorAll("[data-idx]").forEach(function (btn) {
      btn.addEventListener("click", closeInn);
    });

    if (els.innWindow) els.innWindow.classList.remove("hidden");
  }

  function closeInn() {
    closeMenu();
    const cb = ui._innOnClose;
    ui._innOnClose = null;
    if (typeof cb === "function") cb();
  }

  // ------------------------------------------------------------------------
  // シーン⇔画面(.screen)の切り替え
  // ------------------------------------------------------------------------

  function showScreen(screenEl) {
    [els.screenTitle, els.screenMap, els.screenBattle, els.screenEnding].forEach(function (el) {
      if (!el) return;
      if (el === screenEl) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  // RPG.map / RPG.battle が担当するシーンをエンジンに登録する。
  function registerSceneHandlers() {
    const engine = window.RPG.engine;
    if (!engine || !engine.registerScene) return;

    engine.registerScene("title", {
      enter: function () {
        showScreen(els.screenTitle);
        if (els.btnMenuOpen) els.btnMenuOpen.classList.add("hidden");
        // 「つづきから」ボタンの有効/無効はinit()時のwireTitleScreen()で一度だけ
        // 設定されるため、ゲーム中にセーブしてからタイトルに戻ってきても
        // (ページ再読み込みを伴わない限り)反映されず、直後にセーブした
        // データがあるのに選択できないままになってしまう。タイトル画面に
        // 入るたびに最新のhasSave()で必ず再判定する。
        if (window.RPG.save && els.btnContinue) {
          els.btnContinue.disabled = !window.RPG.save.hasSave();
        }
        if (window.RPG.Audio) window.RPG.Audio.playBgm("title");
      },
    });

    const fieldHandler = {
      enter: function (params) {
        showScreen(els.screenMap);
        if (els.btnMenuOpen) els.btnMenuOpen.classList.remove("hidden");
        if (window.RPG.map && window.RPG.map.enterField) {
          window.RPG.map.enterField(params && params.mapId, params && params.x, params && params.y);
        }
        if (window.RPG.Audio) {
          const mapDef =
            window.RPG.data && window.RPG.data.MAPS && params && params.mapId
              ? window.RPG.data.MAPS[params.mapId]
              : null;
          const mapType = mapDef ? mapDef.type : "field";
          window.RPG.Audio.playBgm(mapType === "town" ? "town" : mapType === "dungeon" ? "dungeon" : "field");
        }
      },
      update: function (dt) {
        if (window.RPG.map && window.RPG.map.update) window.RPG.map.update(dt);
      },
      render: function (ctx) {
        if (window.RPG.map && window.RPG.map.render) window.RPG.map.render(ctx);
      },
    };
    engine.registerScene("field", fieldHandler);
    engine.registerScene("town", fieldHandler);
    engine.registerScene("dungeon", fieldHandler);

    engine.registerScene("battle", {
      enter: function (params) {
        showScreen(els.screenBattle);
        if (els.btnMenuOpen) els.btnMenuOpen.classList.add("hidden");
        if (window.RPG.battle && window.RPG.battle.enter) {
          // params全体(onEnd等)を渡す。ボス戦の onEnd コールバックが
          // 実行されないと勝利後のフラグ更新・エンディング分岐が機能しない。
          window.RPG.battle.enter(params && params.monsterGroup, params || {});
        }
        if (window.RPG.Audio) {
          const group = (params && params.monsterGroup) || [];
          const monsterDefs = (window.RPG.data && window.RPG.data.MONSTERS) || {};
          const hasBoss = group.some(function (m) {
            if (!m) return false;
            if (m.isBoss) return true;
            const def = m.monsterId ? monsterDefs[m.monsterId] : null;
            return !!(def && def.isBoss);
          });
          // ラスボス(isFinalBoss)は専用曲。それ以外のボス・中ボスはbossBattle。
          const hasFinalBoss = group.some(function (m) {
            if (!m) return false;
            if (m.isFinalBoss) return true;
            const def = m.monsterId ? monsterDefs[m.monsterId] : null;
            return !!(def && def.isFinalBoss);
          });
          window.RPG.Audio.playBgm(hasFinalBoss ? "finalBoss" : hasBoss ? "bossBattle" : "battle");
        }
      },
      render: function () {
        if (window.RPG.battle && window.RPG.battle.renderMonsters && els.canvasBattle) {
          const battleCtx = els.canvasBattle.getContext("2d");
          if (battleCtx) {
            battleCtx.clearRect(0, 0, els.canvasBattle.width, els.canvasBattle.height);
            window.RPG.battle.renderMonsters(battleCtx);
          }
        }
      },
    });

    engine.registerScene("ending", {
      enter: function () {
        showScreen(els.screenEnding);
        if (els.btnMenuOpen) els.btnMenuOpen.classList.add("hidden");
        renderEnding();
        if (window.RPG.Audio) window.RPG.Audio.playBgm("ending");
      },
    });
  }

  function renderEnding() {
    if (!els.endingContent) return;
    const flags = (window.RPG.state && window.RPG.state.flags) || {};
    let html = "";
    if (flags.postgameCleared) {
      html =
        '<h2>管理権限の　朝も　取り戻した</h2>' +
        '<p>裏管理室で暴走していた　ひよこ大王を　よよよーは止めた。</p>' +
        '<p>管理画面には、ようやく「話し合って決める」という新しい項目が追加された。</p>';
    } else {
      html =
        '<h2>シェアハウスの　朝が　戻った</h2>' +
        '<p>副管理人よよよーと　住人たちは、' +
        '終わらぬ契約の管理王ゾルガディアを　停止させた。</p>' +
        '<p>星霜荘には　久しぶりの朝日が差し込み、住人たちは紙ではなく顔を見て挨拶を交わした。</p>' +
        '<p>困りごとは　これからも起きる。それでも、話し合って解決できる一日が始まった。</p>';
    }
    if (flags.postgameUnlocked && !flags.postgameCleared) {
      html += '<button id="btn-postgame" class="ending-action">裏管理室へ進む</button>';
    }
    html += '<p class="ending-credit">-  おわり  -</p>';
    els.endingContent.innerHTML = html;

    const postgameButton = document.getElementById("btn-postgame");
    if (postgameButton) postgameButton.addEventListener("click", startPostgameIntro);
  }

  function startPostgameIntro() {
    const flags = window.RPG.state && window.RPG.state.flags;
    if (!flags || flags.postgameStarted) return;
    flags.postgameStarted = true;
    const lines = [
      "エンディングの翌朝、管理画面の隅に見覚えのない赤い通知が点滅した。",
      "『裏管理室: 権限継承エラー。ひよこ型管理権限が暴走しています』",
      "よよよー「……終わったと思ったら、まだ裏メニューが残ってたのか！」",
    ];
    const startBattle = function () {
      if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
        window.RPG.engine.changeScene("battle", {
          monsterGroup: ["chickEmperor"],
          isPostgame: true,
        });
      }
    };
    let index = 0;
    const next = function () {
      if (index >= lines.length) {
        startBattle();
        return;
      }
      showMessage(lines[index++], next);
    };
    next();
  }

  // ------------------------------------------------------------------------
  // タイトル画面イベント配線
  // ------------------------------------------------------------------------

  function wireTitleScreen() {
    const save = window.RPG.save;
    if (save && els.btnContinue) {
      els.btnContinue.disabled = !save.hasSave();
    }

    if (els.btnNewGame) {
      els.btnNewGame.addEventListener("click", function () {
        els.titleNameInput.classList.remove("hidden");
        els.heroNameField.focus();
      });
    }

    const confirmNewGameName = function () {
      const name = (els.heroNameField.value || "").trim() || "契約監査人";
      els.titleNameInput.classList.add("hidden");
      if (window.RPG.engine && window.RPG.engine.startNewGame) {
        window.RPG.engine.startNewGame(name);
      }
    };

    if (els.btnNameConfirm) {
      els.btnNameConfirm.addEventListener("click", confirmNewGameName);
    }
    if (els.heroNameField) {
      els.heroNameField.addEventListener("keydown", function (e) {
        if (isConfirmKey(e)) {
          e.preventDefault();
          confirmNewGameName();
        }
      });
    }

    if (els.btnContinue) {
      els.btnContinue.addEventListener("click", function () {
        if (els.btnContinue.disabled) return;
        const loaded = save && save.load ? save.load() : null;
        if (loaded && window.RPG.engine) {
          // fieldHandler.enter(params) は params.mapId/x/y だけを見て
          // RPG.map.enterField() を呼ぶため、ロードした位置(loaded.position)を
          // 必ず渡す。渡さないとmapId=undefinedとなり画面が真っ黒のまま操作不能になる。
          const pos = loaded.position || {};
          const sceneName = loaded.scene === "town" || loaded.scene === "dungeon" ? loaded.scene : "field";
          window.RPG.engine.changeScene(sceneName, {
            fromSave: true,
            mapId: pos.mapId,
            x: pos.x,
            y: pos.y,
          });
        }
      });
    }
  }

  // フィールドのメインメニュー(旧「メニュー」ボタンの中身)。
  // メニューボタンのクリックと、engine.js が仲介するMキーショートカットの
  // 両方から呼べるよう名前付き関数として切り出す。
  function openFieldMainMenu() {
    openMenu("command", {
      items: [
        { label: "ステータス", value: "status" },
        { label: "じゅもん", value: "spell" },
        { label: "どうぐ", value: "item" },
        { label: "そうび", value: "equip" },
        { label: "しらべる", value: "inspect" },
        { label: "隊列変更", value: "reorder" },
        { label: "管理案件", value: "management" },
        { label: "住人の信頼", value: "trust" },
        { label: "戦闘メッセージ速度", value: "message-speed" },
        { label: "セーブ", value: "save" },
        { label: "そうさほうほう", value: "howto" },
        { label: "とじる", value: "close" },
      ],
      onSelect: function (item) {
        closeMenu();
        if (item.value === "status") {
          openMenu("status", {
            onCancel: function () {
              closeMenu();
            },
          });
        } else if (item.value === "save") {
          if (window.RPG.save) window.RPG.save.save();
          showMessage("ぼうけんの　しょを　きろくした。");
        } else if (item.value === "item") {
          openFieldItemMenu();
        } else if (item.value === "spell") {
          openFieldSpellMenu();
        } else if (item.value === "equip") {
          openFieldEquipMenu();
        } else if (item.value === "inspect") {
          if (window.RPG.map && typeof window.RPG.map.inspectFront === "function") {
            window.RPG.map.inspectFront();
          }
        } else if (item.value === "reorder") {
          openReorderMenu();
        } else if (item.value === "management") {
          openManagementCaseMenu();
        } else if (item.value === "trust") {
          openResidentTrustMenu();
        } else if (item.value === "message-speed") {
          openMessageSpeedMenu();
        } else if (item.value === "howto") {
          showMessage(
            "そうさほうほう\n" +
              "いどう：↑↓←→\n" +
              "けってい：Z / Enter\n" +
              "もどる：X / Esc\n" +
              "メニュー：M\n" +
              "BGM ON/OFF：B\n" +
              "タイトルへ：T"
          );
        } else if (item.value === "close") {
          // 何もしない(既にcloseMenu済み)
        }
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  function openMessageSpeedMenu() {
    const items = Object.keys(MESSAGE_MODES).map(function (mode) {
      const setting = MESSAGE_MODES[mode];
      return {
        label: setting.label + (mode === ui.messageMode ? "　(現在)" : ""),
        value: mode,
        disabled: mode === ui.messageMode,
      };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openFieldMainMenu();
          return;
        }
        setMessageMode(item.value);
        closeMenu();
        showMessage("戦闘メッセージ速度を　「" + currentMessageModeLabel() + "」に設定した。");
      },
      onCancel: function () {
        openFieldMainMenu();
      },
    });
  }

  function openManagementCaseMenu() {
    const cases = (window.RPG.engine && window.RPG.engine.getManagementCases)
      ? window.RPG.engine.getManagementCases() : {};
    const flags = (window.RPG.state && window.RPG.state.flags) || {};
    const chapter = flags.chapter || 1;
    const items = Object.keys(cases).map(function (caseId) {
      const caseDef = cases[caseId];
      const solved = window.RPG.engine && window.RPG.engine.isManagementCaseSolved
        ? window.RPG.engine.isManagementCaseSolved(caseId) : false;
      const active = window.RPG.engine && window.RPG.engine.isManagementCaseActive
        ? window.RPG.engine.isManagementCaseActive(caseId) : false;
      const ready = window.RPG.engine && window.RPG.engine.isManagementCaseReady
        ? window.RPG.engine.isManagementCaseReady(caseId) : false;
      const unlocked = chapter >= (caseDef.unlockChapter || 1);
      return {
        label: (solved ? "✓ " : ready ? "! " : active ? "○ " : unlocked ? "・ " : "？ ") + caseDef.title,
        value: caseId,
        disabled: !unlocked,
        caseDef: caseDef,
        solved: solved,
        active: active,
        ready: ready,
      };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openFieldMainMenu();
          return;
        }
        if (item.solved) {
          closeMenu();
          showMessage(item.caseDef.title + "\n解決済みだ。報酬: " + (item.caseDef.rewardText || "-") );
          return;
        }
        if (item.ready) {
          const completed = window.RPG.engine && window.RPG.engine.completeManagementCase
            ? window.RPG.engine.completeManagementCase(item.value) : null;
          closeMenu();
          showMessage(completed
            ? item.caseDef.title + "を　報告した！ " + (item.caseDef.rewardText || "報酬を受け取った。")
            : "この管理案件は　まだ　報告できない。");
          return;
        }
        if (!item.active) {
          const accepted = window.RPG.engine && window.RPG.engine.acceptManagementCase
            ? window.RPG.engine.acceptManagementCase(item.value) : false;
          closeMenu();
          showMessage(accepted
            ? item.caseDef.title + "を　受注した。\n" + item.caseDef.description
            : "この管理案件は　受注できない。");
          return;
        }
        closeMenu();
        const status = item.ready ? "報告可能" : "対応中";
        showMessage(
          item.caseDef.title + "\n" + item.caseDef.description + "\n状態: " + status +
          "\n報酬: " + (item.caseDef.rewardText || "-")
        );
      },
      onCancel: function () {
        openFieldMainMenu();
      },
    });
  }

  function openResidentTrustMenu() {
    const trust = window.RPG.engine && window.RPG.engine.getResidentTrust
      ? window.RPG.engine.getResidentTrust() : {};
    const labels = [
      ["roujinInk", "インク・ジェネレーション"],
      ["maboroshiNyuukyosha", "幻の入居者"],
      ["community", "星霜荘の住人全体"],
    ];
    const items = labels.map(function (entry) {
      const value = trust[entry[0]] || 0;
      return { label: entry[1] + "　信頼度 " + value, value: entry[0] };
    });
    items.push({ label: "もどる", value: "back" });
    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openFieldMainMenu();
          return;
        }
        closeMenu();
        showMessage(item.label + "\n案件を解決すると、住人との信頼が深まる。");
      },
      onCancel: function () {
        openFieldMainMenu();
      },
    });
  }

  function wireGlobalMenuButton() {
    if (!els.btnMenuOpen) return;
    els.btnMenuOpen.addEventListener("click", function () {
      openFieldMainMenu();
    });
  }

  // ------------------------------------------------------------------------
  // フィールドメニュー「そうび」: メンバー選択 → スロット選択 → 装備/はずす
  // ------------------------------------------------------------------------

  function openFieldEquipMenu() {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    const items = party.map(function (m, idx) {
      return { label: m.name, value: String(idx) };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          return;
        }
        openFieldEquipSlotMenu(party[parseInt(item.value, 10)]);
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  function openFieldEquipSlotMenu(member) {
    if (!member) {
      closeMenu();
      return;
    }
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const equipment = member.equipment || {};
    const items = ["weapon", "armor", "accessory"].map(function (slot) {
      const id = equipment[slot];
      const name = id && itemsData[id] ? itemsData[id].name : "なし";
      return { label: slotLabel(slot) + "：" + name, value: slot };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openFieldEquipMenu();
          return;
        }
        // 装備/はずす後はこのスロット選択メニューへ戻り、変更結果を確認できるようにする
        openEquipMenu(member, item.value, function () {
          openFieldEquipSlotMenu(member);
        });
      },
      onCancel: function () {
        openFieldEquipMenu();
      },
    });
  }

  // ------------------------------------------------------------------------
  // フィールドメニュー「じゅもん」: 使い手選択 → 呪文選択 → (単体なら)対象選択
  // フィールドで使えるのは回復/全体回復/蘇生/ワープのみ(攻撃呪文は戦闘専用)。
  // ------------------------------------------------------------------------

  const FIELD_SPELL_TYPES = { heal: true, healAll: true, revive: true, warp: true };

  function openFieldSpellMenu() {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    const hasCaster = party.some(function (m) { return (m.spells || []).length > 0; });
    if (!hasCaster) {
      showMessage("じゅもんを　つかえる　なかまが　いない。");
      closeMenu();
      return;
    }
    const items = party.map(function (m, idx) {
      return {
        label: m.name + "　MP " + (m.mp || 0) + "/" + (m.maxMp || 0),
        value: String(idx),
        disabled: !(m.spells || []).length || m.hp <= 0,
      };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          return;
        }
        openFieldSpellList(party[parseInt(item.value, 10)]);
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  function openFieldSpellList(caster) {
    const spellsData = (window.RPG.data && window.RPG.data.SPELLS) || {};
    const usable = (caster.spells || [])
      .map(function (id) { return spellsData[id]; })
      .filter(function (s) { return s && FIELD_SPELL_TYPES[s.effectType]; });

    if (!usable.length) {
      showMessage(caster.name + "は　ここで　つかえる　じゅもんを　しらない。");
      openFieldSpellMenu();
      return;
    }

    const items = usable.map(function (s) {
      return { label: s.name + "　MP" + s.mpCost, value: s.id, disabled: (caster.mp || 0) < s.mpCost };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("spell", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          openFieldSpellMenu();
          return;
        }
        castFieldSpell(caster, spellsData[item.value]);
      },
      onCancel: function () {
        openFieldSpellMenu();
      },
    });
  }

  function castFieldSpell(caster, spell) {
    if (!spell) return;
    const state = window.RPG.state || {};
    const party = state.party || [];

    // 単体対象(回復/蘇生)は対象メンバーを選ばせる
    if (spell.effectType === "heal" || spell.effectType === "revive") {
      const items = party.map(function (m, idx) {
        const dead = m.hp <= 0;
        return {
          label: m.name + "　HP " + m.hp + "/" + m.maxHp,
          value: String(idx),
          disabled: spell.effectType === "revive" ? !dead : dead,
        };
      });
      items.push({ label: "もどる", value: "back" });
      openMenu("target", {
        items: items,
        onSelect: function (item) {
          if (item.value === "back") {
            openFieldSpellList(caster);
            return;
          }
          applyFieldSpell(caster, spell, party[parseInt(item.value, 10)]);
        },
        onCancel: function () {
          openFieldSpellList(caster);
        },
      });
      return;
    }

    applyFieldSpell(caster, spell, null);
  }

  function applyFieldSpell(caster, spell, target) {
    const state = window.RPG.state || {};
    const party = state.party || [];
    if ((caster.mp || 0) < spell.mpCost) return;

    if (spell.effectType === "warp") {
      const dest = state.lastTownPosition;
      if (!dest || !dest.mapId) {
        showMessage("まだ　ワープできる　町が　ない。");
        return;
      }
      caster.mp -= spell.mpCost;
      closeMenu();
      showMessage(caster.name + "は　" + spell.name + "を　となえた！");
      if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
        window.RPG.engine.changeScene("town", { mapId: dest.mapId, x: dest.x, y: dest.y });
      }
      if (window.RPG.Audio) window.RPG.Audio.playSe("warp");
      updateHud();
      return;
    }

    caster.mp -= spell.mpCost;

    if (spell.effectType === "heal" && target) {
      target.hp = Math.min(target.maxHp, target.hp + (spell.power || 0));
      showMessage(caster.name + "は　" + spell.name + "を　となえた！ " + target.name + "のHPが　かいふくした。");
    } else if (spell.effectType === "healAll") {
      party.forEach(function (m) {
        if (m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + (spell.power || 0));
      });
      showMessage(caster.name + "は　" + spell.name + "を　となえた！ なかま全員のHPが　かいふくした。");
    } else if (spell.effectType === "revive" && target) {
      target.hp = Math.max(1, Math.round(target.maxHp * (spell.power || 0.5)));
      showMessage(caster.name + "は　" + spell.name + "を　となえた！ " + target.name + "は　いきかえった！");
    }

    if (window.RPG.Audio) window.RPG.Audio.playSe("heal");
    updateHud();
    // 続けて使えるよう呪文一覧へ戻る(MP残量・HPは再構築で最新化される)
    openFieldSpellList(caster);
  }

  // フィールド(戦闘外)でのどうぐ使用。回復/MP回復系はその場で効果を適用する。
  function openFieldItemMenu() {
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const inventory = (window.RPG.state && window.RPG.state.inventory) || [];
    const items = inventory
      .map(function (entry) {
        const def = itemsData[entry.itemId];
        if (!def || def.type !== "consumable") return null;
        return { label: def.name + " x" + entry.count, value: entry.itemId, disabled: entry.count <= 0 };
      })
      .filter(Boolean);
    items.push({ label: "もどる", value: "back" });

    openMenu("item", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          return;
        }
        useFieldItem(item.value);
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  function useFieldItem(itemId) {
    const itemsData = (window.RPG.data && window.RPG.data.ITEMS) || {};
    const def = itemsData[itemId];
    const state = window.RPG.state || {};
    const inventory = state.inventory || [];
    const entry = inventory.find(function (e) { return e.itemId === itemId; });
    if (!def || !entry || entry.count <= 0) {
      closeMenu();
      return;
    }
    const effect = def.effect || {};
    const member = (state.party || [])[0];
    if (effect.type === "heal" && member) {
      member.hp = Math.min(member.maxHp, member.hp + (effect.power || effect.amount || 0));
      showMessage(def.name + "を　つかった！ " + member.name + "のHPが　かいふくした。");
    } else if (effect.type === "mpHeal" && member) {
      member.mp = Math.min(member.maxMp, member.mp + (effect.power || effect.amount || 0));
      showMessage(def.name + "を　つかった！ " + member.name + "のMPが　かいふくした。");
    } else if (effect.type === "revive") {
      const dead = (state.party || []).find(function (m) { return m.hp <= 0; });
      if (dead) {
        dead.hp = Math.max(1, Math.round(dead.maxHp * (effect.ratio || effect.power || 0.5)));
        showMessage(def.name + "を　つかった！ " + dead.name + "は　いきかえった！");
      } else {
        showMessage("いきかえらせる　なかまが　いない。");
        return;
      }
    } else if (effect.type === "cureStatus") {
      const target = (state.party || []).find(function (m) { return m.status === effect.statusEffect; });
      if (target) {
        target.status = null;
        showMessage(def.name + "を　つかった！ " + target.name + "の　じょうたいいじょうが　なおった。");
      } else {
        showMessage("その　じょうたいいじょうの　なかまが　いない。");
        return;
      }
    } else if (effect.type === "warp") {
      closeMenu();
      if (window.RPG.engine && typeof window.RPG.engine.changeScene === "function") {
        const dest = state.lastTownPosition || state.position || {};
        showMessage(def.name + "を　つかった！ 町へ　ワープした!");
        window.RPG.engine.changeScene("town", {
          mapId: dest.mapId,
          x: dest.x,
          y: dest.y,
        });
      }
      entry.count -= 1;
      if (entry.count <= 0) {
        state.inventory = inventory.filter(function (e) { return e.itemId !== itemId; });
      }
      return;
    } else {
      showMessage(def.name + "を　つかった。");
    }
    entry.count -= 1;
    if (entry.count <= 0) {
      state.inventory = inventory.filter(function (e) { return e.itemId !== itemId; });
    }
    closeMenu();
  }

  // 隊列(先頭〜末尾の並び順)変更メニュー。選択したメンバーを1つ前に繰り上げる。
  function openReorderMenu() {
    const party = (window.RPG.state && window.RPG.state.party) || [];
    const items = party.map(function (member, idx) {
      return { label: (idx + 1) + ". " + member.name, value: String(idx) };
    });
    items.push({ label: "もどる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          return;
        }
        const idx = parseInt(item.value, 10);
        if (idx > 0) {
          const tmp = party[idx - 1];
          party[idx - 1] = party[idx];
          party[idx] = tmp;
        }
        openReorderMenu();
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  // ------------------------------------------------------------------------
  // 酒場UI(星霜酒場:職業を選んで仲間を作る。DQ3のルイーダの酒場相当)
  // ------------------------------------------------------------------------

  /**
   * 酒場NPCとの会話後に呼ばれる。職業選択→仲間加入までを行う。
   * @param {object} npc data.js側のNPC定義(guildHall: true が付与されているもの)
   */
  function openGuildHall(npc) {
    const engine = window.RPG.engine;
    const jobsData = (window.RPG.data && window.RPG.data.JOBS) || {};

    if (engine && !engine.canRecruit()) {
      showMessage("なかまが　これ以上　増やせない！(最大" + engine.maxPartySize() + "人)");
      return;
    }

    // 主人公専用職・隠し職は酒場では選べない
    const items = Object.keys(jobsData)
      .filter(function (jobId) {
        const job = jobsData[jobId];
        return job && !job.isHero && !job.hidden && jobId !== "yoyoyo";
      })
      .map(function (jobId) {
        return { label: jobsData[jobId].name, value: jobId };
      });
    items.push({ label: "やめる", value: "back" });

    openMenu("command", {
      items: items,
      onSelect: function (item) {
        if (item.value === "back") {
          closeMenu();
          return;
        }
        closeMenu();
        recruitFromGuildHall(item.value);
      },
      onCancel: function () {
        closeMenu();
      },
    });
  }

  function recruitFromGuildHall(jobId) {
    const engine = window.RPG.engine;
    const jobsData = (window.RPG.data && window.RPG.data.JOBS) || {};
    const job = jobsData[jobId];
    if (!engine || !job) return;

    // 職業名をそのままデフォルト名にするが、同職業を複数雇うと名前が重複し、
    // 戦闘コマンド解決(旧: nameベース)が衝突する原因になっていた。
    // 既に同名のメンバーがいる場合は連番を付加して一意な表示名にする。
    const party = (window.RPG.state && window.RPG.state.party) || [];
    let name = job.name;
    let suffix = 1;
    while (party.some(function (m) { return m.name === name; })) {
      suffix += 1;
      name = job.name + suffix;
    }
    // 酒場加入は同一NPCの重複判定対象外(recruitId未指定=何度でも同職を仲間にできる)
    const result = engine.recruitMember(null, name, jobId, 1);

    if (result.success) {
      showMessage(name + "が　なかまに　なった！");
    } else if (result.reason === "party_full") {
      showMessage("なかまが　これ以上　増やせない！(最大" + engine.maxPartySize() + "人)");
    }
  }

  // ------------------------------------------------------------------------
  // C-7: レベルアップ演出(黄フラッシュ+上昇ステータス表示)
  // engine.js の gainExp() からレベルアップ確定時に呼ばれる。
  // index.html/styles.css を変更せず、ui.js側でDOM/スタイルを都度生成する。
  // ------------------------------------------------------------------------

  let levelUpOverlayEl = null;

  function ensureLevelUpOverlay() {
    if (levelUpOverlayEl) return levelUpOverlayEl;
    const el = document.createElement("div");
    el.id = "rpg-levelup-overlay";
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.display = "none";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.zIndex = "9998";
    el.style.pointerEvents = "none";
    el.style.background = "rgba(255,231,120,0)";
    el.style.transition = "background 0.15s ease-out";
    el.innerHTML =
      '<div id="rpg-levelup-card" style="background:rgba(20,16,8,0.92);border:2px solid #ffd76b;' +
      'border-radius:8px;padding:16px 24px;color:#ffe98a;font-family:inherit;text-align:center;' +
      'box-shadow:0 0 24px rgba(255,215,107,0.6);"></div>';
    document.body.appendChild(el);
    levelUpOverlayEl = el;
    return el;
  }

  /**
   * レベルアップ演出を表示する。
   * @param {object} member パーティメンバー(name, level等)
   * @param {number} newLevels 今回上昇したレベル数
   * @param {object} [statDiff] 上昇した各ステータスの差分 { chikara, mamori, subayasa, kashikosa, un, maxHp, maxMp }
   */
  function showLevelUp(member, newLevels, statDiff) {
    if (!member) return;
    const el = ensureLevelUpOverlay();
    const card = document.getElementById("rpg-levelup-card");
    if (!card) return;

    const diff = statDiff || {};
    const rows = [
      ["HP", diff.maxHp], ["MP", diff.maxMp],
      ["ちから", diff.chikara], ["まもり", diff.mamori],
      ["すばやさ", diff.subayasa], ["かしこさ", diff.kashikosa], ["うんのよさ", diff.un],
    ].filter(function (pair) { return pair[1] != null && pair[1] !== 0; })
      .map(function (pair) { return "<div>" + pair[0] + " +" + pair[1] + "</div>"; })
      .join("");

    card.innerHTML =
      '<div style="font-size:18px;font-weight:bold;">' + escapeHtml(member.name) +
      " は レベル " + member.level + " に あがった!</div>" +
      '<div style="font-size:12px;margin-top:6px;">' + rows + "</div>";

    el.style.display = "flex";
    el.style.background = "rgba(255,231,120,0.35)";
    window.setTimeout(function () {
      el.style.background = "rgba(255,231,120,0)";
    }, 60);
    window.setTimeout(function () {
      el.style.display = "none";
    }, 1400);
  }

  // ------------------------------------------------------------------------
  // HUD更新(gold等)
  // ------------------------------------------------------------------------

  function updateHud() {
    const state = window.RPG.state || {};
    if (els.hudGold) {
      els.hudGold.textContent = "所持金: " + (state.gold || 0) + " G";
    }
    if (els.hudLocation && state.position) {
      els.hudLocation.textContent = state.position.mapId || "-";
    }
  }

  // ------------------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------------------

  function init() {
    cacheEls();
    loadMessageMode();
    wireTitleScreen();
    wireGlobalMenuButton();
    registerSceneHandlers();
    updateHud();
    setInterval(updateHud, 500);

    if (window.RPG.engine && window.RPG.engine.init) {
      window.RPG.engine.init();
    }
  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ------------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------------

  // ------------------------------------------------------------------------
  // シェアハウス管理AI停止演出。公開関数名は旧経路との互換用に残す。
  // ------------------------------------------------------------------------
  /**
   * 旧バージョンの呼び出し元から使われても、よよよーを離脱・変身させず、
   * 管理AI停止後の住人との再出発を表示する。
   * @param {function} onComplete
   */
  function showYoyoyoTransformCutscene(onComplete) {
    const lines = (window.RPG.data && window.RPG.data.SCENARIO_TEXT &&
      window.RPG.data.SCENARIO_TEXT.chapterMidBossDefeated) || [
        "管理AIは停止した。これからは住人と一緒にルールを作り直そう。"
      ];

    function playLine(index) {
      if (index >= lines.length) {
        finishCutscene();
        return;
      }
      showMessage(lines[index], function () {
        playLine(index + 1);
      });
    }

    function finishCutscene() {
      if (typeof onComplete === "function") onComplete();
    }

    playLine(0);
  }

  window.RPG.ui = {
    showMessage: showMessage,
    showYoyoyoTransformCutscene: showYoyoyoTransformCutscene,
    hideMessage: hideMessage,
    openMenu: openMenu,
    closeMenu: closeMenu,
    renderBattleUI: renderBattleUI,
    openShop: openShop,
    closeShop: closeShop,
    openChurch: openChurch,
    closeChurch: closeChurch,
    openInn: openInn,
    closeInn: closeInn,
    openGuildHall: openGuildHall,
    updateHud: updateHud,
    // engine.js のグローバルショートカット(M/T/B)が、メニュー操作中や
    // メッセージ送り中に誤発火しないようガードするための状態参照。
    isMenuOpen: function () {
      return !!ui.currentMenu;
    },
    isMessageBusy: function () {
      return !!ui.messageBusy;
    },
    openFieldMenu: openFieldMainMenu,
    // C-7: レベルアップ演出(engine.js の gainExp() から呼ばれる)。
    showLevelUp: showLevelUp,
    showFloatingText: showFloatingText,
  };
})();
