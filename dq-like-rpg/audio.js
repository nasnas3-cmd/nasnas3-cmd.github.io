// audio.js
// 依存: なし(Web Audio API のみ、外部音声ファイル不要)
// 提供: window.RPG.Audio
//
// チップチューン風 BGM をコードで自動生成して再生する。
// - BGM: title / town / field / dungeon / battle / bossBattle / ending の7曲をループ再生
// - SE : decide / cancel / hit / spell / heal / levelup / warp / wipe
// - Mキーでミュート切替、状態は localStorage に保存
// - 最初のユーザー入力で AudioContext を resume (ブラウザの自動再生制限対策)
//
// index.html への統合は以下の1行の追加のみで良い:
//   <script src="audio.js"></script>
// (他ファイルからは window.RPG.Audio.playBgm("field") のように呼び出すだけで良い)

(function () {
  "use strict";

  window.RPG = window.RPG || {};

  const MUTE_KEY = "rpg_audio_muted";

  let ctx = null;
  let masterGain = null;
  let bgmGain = null;
  let sfxGain = null;
  let muted = false;

  let currentBgmName = null;
  let bgmTimerId = null;
  let bgmGeneration = 0; // 現在再生中のBGM世代(切替時に古いスケジュールを無効化する)
  // 現在のBGM世代専用の出力ノード。ノートは1ループ分まとめてタイムラインに
  // 予約されるため、タイマー解除だけでは鳴り続ける。stopBgmでこのノードごと
  // 切断することで予約済みノートも即座に停止できる。
  let bgmLoopGain = null;

  // --------------------------------------------------------------------
  // 初期化 / AudioContext
  // --------------------------------------------------------------------

  function loadMuteState() {
    try {
      const raw = localStorage.getItem(MUTE_KEY);
      muted = raw === "1";
    } catch (e) {
      muted = false;
    }
  }

  function saveMuteState() {
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) {
      // 無視 (privateモード等でlocalStorage不可の場合)
    }
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);

    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.35;
    bgmGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);

    return ctx;
  }

  function resumeContext() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === "suspended") {
      c.resume().catch(function () {
        /* 無視 */
      });
    }
  }

  // 最初のユーザー入力(クリック/キー/タッチ)で AudioContext を resume する。
  function installAutoResume() {
    const events = ["keydown", "mousedown", "touchstart", "pointerdown"];
    function handler() {
      resumeContext();
      events.forEach(function (ev) {
        document.removeEventListener(ev, handler);
      });
    }
    events.forEach(function (ev) {
      document.addEventListener(ev, handler, { once: false, passive: true });
    });
  }

  // タブが非表示(別タブへ移動/最小化)になったら音声全体を停止し、
  // 戻ってきたら再開する。WebAudioは放っておくとバックグラウンドでも
  // 鳴り続けるため、明示的にsuspend/resumeする。
  function installVisibilityPause() {
    document.addEventListener("visibilitychange", function () {
      if (!ctx) return;
      if (document.hidden) {
        ctx.suspend().catch(function () {
          /* 無視 */
        });
      } else {
        resumeContext();
      }
    });
  }

  // --------------------------------------------------------------------
  // ミュート切替 (Bキー)
  // 注: 以前はMキーに割り当てていたが、Mキーはフィールドメニューを開く
  // ショートカット(engine.js側)に割り当てられたため、Bキーに変更した。
  // --------------------------------------------------------------------

  function setMuted(value) {
    muted = !!value;
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : 1;
    }
    saveMuteState();
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  // Bキーでのミュート切替は engine.js の onGlobalShortcutKeyDown が
  // window.RPG.Audio.toggleMute() を呼ぶ形で一元管理する
  // (戦闘中/会話中/メニュー操作中のシーン/状態ガードも engine.js 側に集約するため)。
  // ここでは重複してリスナーを張らない。
  function installMuteKey() {
    // no-op (engine.js に統合済み)
  }

  // --------------------------------------------------------------------
  // 音源生成の基礎ユーティリティ
  // --------------------------------------------------------------------

  // 音名(例 "C4","A#3","R"=休符) -> 周波数(Hz)
  const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const noteFreqCache = {};
  function noteToFreq(note) {
    if (!note || note === "R") return 0;
    if (noteFreqCache[note]) return noteFreqCache[note];
    const m = /^([A-G]#?)(-?\d+)$/.exec(note);
    if (!m) return 0;
    const semitone = NOTE_INDEX[m[1]];
    const octave = parseInt(m[2], 10);
    // A4 = 440Hz を基準に計算
    const n = (octave - 4) * 12 + (semitone - 9);
    const freq = 440 * Math.pow(2, n / 12);
    noteFreqCache[note] = freq;
    return freq;
  }

  // 単純な矩形波/三角波のノートを1つ鳴らす。
  function playTone(destination, freq, startTime, duration, opts) {
    if (!ctx || !freq) return;
    opts = opts || {};
    const type = opts.type || "square";
    const gainLevel = opts.gain != null ? opts.gain : 0.2;
    const attack = opts.attack != null ? opts.attack : 0.005;
    const release = opts.release != null ? opts.release : 0.03;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (opts.vibrato) {
      osc.frequency.setValueAtTime(freq, startTime);
    }

    const gainNode = ctx.createGain();
    const sustainEnd = Math.max(startTime + attack, startTime + duration - release);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gainLevel, startTime + attack);
    gainNode.gain.setValueAtTime(gainLevel, sustainEnd);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  // ドラム(ノイズ)を1発鳴らす。kind: "kick" | "snare" | "hat"
  function playDrum(destination, kind, startTime, gainLevel) {
    if (!ctx) return;
    gainLevel = gainLevel != null ? gainLevel : 0.25;

    if (kind === "kick") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainLevel, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      osc.connect(g);
      g.connect(destination);
      osc.start(startTime);
      osc.stop(startTime + 0.16);
      return;
    }

    // snare / hat はノイズバッファで生成する。
    const duration = kind === "snare" ? 0.15 : 0.05;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = kind === "snare" ? "bandpass" : "highpass";
    filter.frequency.value = kind === "snare" ? 1800 : 7000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainLevel, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(destination);
    noise.start(startTime);
    noise.stop(startTime + duration + 0.02);
  }

  // --------------------------------------------------------------------
  // BGM 楽曲定義
  // 各曲: tempo(BPM), melody/bass = [{note, beats}...] の配列(1周分)、drum = パターン文字列配列
  // beats は 1拍=四分音符 の長さの倍数。
  // --------------------------------------------------------------------

  const SONGS = {
    // タイトル画面: 荘厳・ゆったり
    title: {
      tempo: 88,
      melodyType: "triangle",
      bassType: "square",
      melody: [
        { note: "G4", beats: 1 }, { note: "C5", beats: 1 }, { note: "E5", beats: 1 }, { note: "G5", beats: 1 },
        { note: "F5", beats: 1 }, { note: "E5", beats: 1 }, { note: "D5", beats: 1 }, { note: "C5", beats: 1 },
        { note: "A4", beats: 1 }, { note: "C5", beats: 1 }, { note: "D5", beats: 1 }, { note: "E5", beats: 1 },
        { note: "D5", beats: 2 }, { note: "C5", beats: 2 }
      ],
      bass: [
        { note: "C3", beats: 2 }, { note: "G2", beats: 2 },
        { note: "A2", beats: 2 }, { note: "E2", beats: 2 },
        { note: "F2", beats: 2 }, { note: "C3", beats: 2 },
        { note: "G2", beats: 2 }, { note: "C3", beats: 2 }
      ],
      drum: ["kick", "", "hat", "", "kick", "", "hat", ""]
    },

    // 町: 楽しい・和やか(長調のスキップするような旋律+軽いバウンス)
    town: {
      tempo: 112,
      melodyType: "triangle",
      bassType: "triangle",
      melody: [
        { note: "G4", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "C5", beats: 0.5 },
        { note: "D5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "F5", beats: 1 },
        { note: "E5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "A4", beats: 0.5 },
        { note: "G4", beats: 1.5 }, { note: "R", beats: 0.5 },
        { note: "A4", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "F5", beats: 0.5 }, { note: "A5", beats: 0.5 },
        { note: "G5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "D5", beats: 1 },
        { note: "E5", beats: 0.5 }, { note: "G5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "C5", beats: 1.5 }, { note: "R", beats: 0.5 }
      ],
      bass: [
        { note: "C3", beats: 2 }, { note: "G2", beats: 2 },
        { note: "A2", beats: 2 }, { note: "E2", beats: 2 },
        { note: "F2", beats: 2 }, { note: "C3", beats: 2 },
        { note: "G2", beats: 2 }, { note: "C3", beats: 2 }
      ],
      drum: ["kick", "", "hat", "hat", "kick", "", "hat", ""]
    },

    // フィールド: 勇敢で壮大(ファンファーレ風の跳躍と堂々とした行進バス)
    field: {
      tempo: 120,
      melodyType: "square",
      bassType: "square",
      melody: [
        { note: "C5", beats: 1 }, { note: "G4", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "E5", beats: 1 },
        { note: "C5", beats: 0.5 }, { note: "E5", beats: 0.5 },
        { note: "G5", beats: 1.5 }, { note: "E5", beats: 0.5 }, { note: "G5", beats: 1 }, { note: "A5", beats: 1 },
        { note: "F5", beats: 1 }, { note: "A5", beats: 0.5 }, { note: "G5", beats: 0.5 }, { note: "E5", beats: 1 },
        { note: "C5", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "E5", beats: 1 }, { note: "D5", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "D5", beats: 1 },
        { note: "G4", beats: 1 }
      ],
      bass: [
        { note: "C3", beats: 1 }, { note: "C3", beats: 1 }, { note: "G2", beats: 1 }, { note: "G2", beats: 1 },
        { note: "A2", beats: 1 }, { note: "A2", beats: 1 }, { note: "E2", beats: 1 }, { note: "E2", beats: 1 },
        { note: "F2", beats: 1 }, { note: "F2", beats: 1 }, { note: "C3", beats: 1 }, { note: "C3", beats: 1 },
        { note: "G2", beats: 1 }, { note: "G2", beats: 1 }, { note: "G2", beats: 1 }, { note: "G2", beats: 1 }
      ],
      drum: ["kick", "hat", "snare", "hat", "kick", "hat", "snare", "snare"]
    },

    // ダンジョン: 暗い不気味さ(半音のうねり・長い休符・低く軋むバス)
    dungeon: {
      tempo: 76,
      melodyType: "triangle",
      bassType: "square",
      melody: [
        { note: "D4", beats: 1.5 }, { note: "C#4", beats: 0.5 }, { note: "D4", beats: 1 }, { note: "R", beats: 1 },
        { note: "F4", beats: 1 }, { note: "E4", beats: 0.5 }, { note: "D#4", beats: 0.5 }, { note: "D4", beats: 1 },
        { note: "R", beats: 1 },
        { note: "G#3", beats: 1.5 }, { note: "A3", beats: 0.5 }, { note: "A#3", beats: 1 }, { note: "A3", beats: 0.5 },
        { note: "G#3", beats: 0.5 },
        { note: "D4", beats: 1 }, { note: "C#4", beats: 1 }, { note: "D4", beats: 1 }, { note: "R", beats: 1 }
      ],
      bass: [
        { note: "D2", beats: 3 }, { note: "R", beats: 1 },
        { note: "G#1", beats: 3 }, { note: "R", beats: 1 },
        { note: "A1", beats: 3 }, { note: "R", beats: 1 },
        { note: "D2", beats: 2 }, { note: "A#1", beats: 2 }
      ],
      drum: ["kick", "", "", "", "", "", "hat", ""]
    },

    // 通常戦闘: 緊迫
    battle: {
      tempo: 150,
      melodyType: "square",
      bassType: "square",
      melody: [
        { note: "E5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "R", beats: 0.5 }, { note: "E5", beats: 0.5 },
        { note: "R", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "R", beats: 0.5 },
        { note: "G5", beats: 1 }, { note: "R", beats: 1 }, { note: "G4", beats: 1 }, { note: "R", beats: 1 },
        { note: "D5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "R", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "R", beats: 0.5 }, { note: "B4", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "R", beats: 0.5 },
        { note: "F5", beats: 1 }, { note: "R", beats: 1 }
      ],
      bass: [
        { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 },
        { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 },
        { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 },
        { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }
      ],
      drum: ["kick", "hat", "snare", "hat", "kick", "kick", "snare", "hat"]
    },

    // ボス戦(中ボス含む): 通常戦闘より切迫した追い立てる短調オスティナート
    bossBattle: {
      tempo: 164,
      melodyType: "square",
      bassType: "square",
      melody: [
        { note: "A4", beats: 0.5 }, { note: "A4", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "A4", beats: 0.5 },
        { note: "D#5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "E5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "F5", beats: 0.5 }, { note: "E5", beats: 0.5 },
        { note: "D#5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "B4", beats: 0.5 },
        { note: "C5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "D#5", beats: 0.5 }, { note: "F5", beats: 0.5 },
        { note: "G5", beats: 1 }, { note: "D#5", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "C5", beats: 0.5 }, { note: "B4", beats: 0.5 }, { note: "C5", beats: 0.5 }, { note: "G4", beats: 0.5 },
        { note: "A4", beats: 1.5 }, { note: "R", beats: 0.5 }
      ],
      bass: [
        { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 },
        { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 }, { note: "A2", beats: 0.5 },
        { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 },
        { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 }, { note: "F2", beats: 0.5 },
        { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 },
        { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 }, { note: "G2", beats: 0.5 },
        { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 },
        { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 }, { note: "E2", beats: 0.5 }
      ],
      drum: ["kick", "kick", "snare", "hat", "kick", "hat", "snare", "kick"]
    },

    // ラスボス戦: 最後の戦いにふさわしい勇猛果敢な専用曲
    // (疾走する短調ギャロップから高音域へ駆け上がるヒロイックな旋律)
    finalBoss: {
      tempo: 178,
      melodyType: "square",
      bassType: "square",
      melody: [
        { note: "D5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "A4", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "F5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "D5", beats: 0.5 }, { note: "E5", beats: 0.5 },
        { note: "F5", beats: 0.5 }, { note: "G5", beats: 0.5 }, { note: "A5", beats: 1 },
        { note: "G5", beats: 0.5 }, { note: "F5", beats: 0.5 }, { note: "E5", beats: 1 },
        { note: "D5", beats: 0.5 }, { note: "F5", beats: 0.5 }, { note: "A5", beats: 0.5 }, { note: "D6", beats: 0.5 },
        { note: "C6", beats: 0.5 }, { note: "A5", beats: 0.5 }, { note: "A#5", beats: 0.5 }, { note: "A5", beats: 0.5 },
        { note: "G5", beats: 0.5 }, { note: "A5", beats: 0.5 }, { note: "A#5", beats: 0.5 }, { note: "A5", beats: 0.5 },
        { note: "G5", beats: 0.5 }, { note: "F5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "C#5", beats: 0.5 },
        { note: "D5", beats: 1 }, { note: "A4", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "F5", beats: 1 }, { note: "E5", beats: 0.5 }, { note: "D5", beats: 0.5 },
        { note: "C#5", beats: 0.5 }, { note: "E5", beats: 0.5 }, { note: "A4", beats: 0.5 }, { note: "C#5", beats: 0.5 },
        { note: "D5", beats: 1.5 }, { note: "R", beats: 0.5 }
      ],
      bass: [
        { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 },
        { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 },
        { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 },
        { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 }, { note: "A#1", beats: 0.5 },
        { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 },
        { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 }, { note: "G1", beats: 0.5 },
        { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 },
        { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 },
        { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 },
        { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 }, { note: "D2", beats: 0.5 },
        { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 }, { note: "A1", beats: 0.5 },
        { note: "C#2", beats: 0.5 }, { note: "C#2", beats: 0.5 }, { note: "C#2", beats: 0.5 }, { note: "C#2", beats: 0.5 }
      ],
      drum: ["kick", "kick", "snare", "kick", "kick", "hat", "snare", "snare"]
    },

    // エンディング: 感動
    ending: {
      tempo: 84,
      melodyType: "triangle",
      bassType: "triangle",
      melody: [
        { note: "C5", beats: 1.5 }, { note: "E5", beats: 0.5 }, { note: "G5", beats: 2 },
        { note: "F5", beats: 1 }, { note: "E5", beats: 1 }, { note: "D5", beats: 2 },
        { note: "C5", beats: 1.5 }, { note: "D5", beats: 0.5 }, { note: "E5", beats: 2 },
        { note: "G5", beats: 1 }, { note: "F5", beats: 1 }, { note: "E5", beats: 2 }
      ],
      bass: [
        { note: "C3", beats: 4 }, { note: "F2", beats: 4 },
        { note: "G2", beats: 4 }, { note: "C3", beats: 4 }
      ],
      drum: ["", "", "hat", "", "", "", "hat", ""]
    }
  };

  // --------------------------------------------------------------------
  // BGM 再生エンジン
  // --------------------------------------------------------------------

  function totalBeats(track) {
    let total = 0;
    for (let i = 0; i < track.length; i++) total += track[i].beats;
    return total;
  }

  function scheduleLoop(song, generation, dest) {
    if (!ctx || !dest) return;

    // AudioContextがsuspend中(タブ非表示・初回入力前の自動再生制限)は
    // currentTimeが進まないため、このままノートを予約すると同じ時刻に
    // 何周分も積み重なり、復帰した瞬間に重なった轟音ループが鳴るバグになる。
    // 予約はせず、短い間隔で復帰を待ってから改めて1周分を予約する。
    if (ctx.state === "suspended") {
      bgmTimerId = window.setTimeout(function () {
        if (generation !== bgmGeneration) return;
        scheduleLoop(song, generation, dest);
      }, 250);
      return;
    }

    const beatSec = 60 / song.tempo;
    const melodyBeats = totalBeats(song.melody);
    const bassBeats = totalBeats(song.bass);
    const loopBeats = Math.max(melodyBeats, bassBeats);
    const loopDuration = loopBeats * beatSec;

    const startTime = ctx.currentTime + 0.05;

    // メロディ
    let t = startTime;
    song.melody.forEach(function (step) {
      const dur = step.beats * beatSec;
      if (step.note !== "R") {
        playTone(dest, noteToFreq(step.note), t, dur * 0.92, {
          type: song.melodyType,
          gain: 0.18,
          attack: 0.005,
          release: Math.min(0.05, dur * 0.3)
        });
      }
      t += dur;
    });

    // ベース
    t = startTime;
    song.bass.forEach(function (step) {
      const dur = step.beats * beatSec;
      if (step.note !== "R") {
        playTone(dest, noteToFreq(step.note), t, dur * 0.95, {
          type: song.bassType,
          gain: 0.14,
          attack: 0.01,
          release: Math.min(0.08, dur * 0.3)
        });
      }
      t += dur;
    });

    // ドラム(8分音符換算のパターンをループ全体に敷き詰める)
    if (song.drum && song.drum.length) {
      const drumStepSec = beatSec * 0.5;
      const stepsInLoop = Math.round(loopDuration / drumStepSec);
      t = startTime;
      for (let i = 0; i < stepsInLoop; i++) {
        const kind = song.drum[i % song.drum.length];
        if (kind) playDrum(dest, kind, t, kind === "kick" ? 0.3 : 0.15);
        t += drumStepSec;
      }
    }

    // 次のループを予約する。世代が変わっていたら(=別のBGMに切替済み)何もしない。
    const nextDelayMs = loopDuration * 1000;
    bgmTimerId = window.setTimeout(function () {
      if (generation !== bgmGeneration) return;
      scheduleLoop(song, generation, dest);
    }, Math.max(50, nextDelayMs - 60));
  }

  function stopBgm() {
    bgmGeneration++;
    if (bgmTimerId) {
      window.clearTimeout(bgmTimerId);
      bgmTimerId = null;
    }
    // 予約済みノートを即座に止める。クリックノイズ防止に50msだけフェードし、
    // その後ノードごと切断してオシレーターの出力を完全に遮断する。
    if (bgmLoopGain && ctx) {
      const g = bgmLoopGain;
      try {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + 0.05);
      } catch (e) {
        /* 古いブラウザ等でAudioParam操作に失敗しても切断は行う */
      }
      window.setTimeout(function () {
        try {
          g.disconnect();
        } catch (e) {
          /* 無視 */
        }
      }, 80);
    }
    bgmLoopGain = null;
    currentBgmName = null;
  }

  function playBgm(name) {
    if (!SONGS[name]) return;
    if (currentBgmName === name) return; // 既に再生中なら何もしない(即切替のみ、同曲は継続)
    const c = ensureContext();
    if (!c) return;
    resumeContext();

    stopBgm();
    currentBgmName = name;
    bgmGeneration++;
    bgmLoopGain = c.createGain();
    bgmLoopGain.gain.value = 1;
    bgmLoopGain.connect(bgmGain);
    scheduleLoop(SONGS[name], bgmGeneration, bgmLoopGain);
  }

  // --------------------------------------------------------------------
  // 効果音 (SE)
  // --------------------------------------------------------------------

  function playSe(name) {
    const c = ensureContext();
    if (!c) return;
    resumeContext();
    const now = ctx.currentTime + 0.01;

    switch (name) {
      case "decide": // 決定音
        playTone(sfxGain, noteToFreq("C5"), now, 0.06, { type: "square", gain: 0.3, release: 0.02 });
        playTone(sfxGain, noteToFreq("G5"), now + 0.05, 0.08, { type: "square", gain: 0.3, release: 0.03 });
        break;
      case "cancel": // キャンセル音
        playTone(sfxGain, noteToFreq("G4"), now, 0.06, { type: "square", gain: 0.25, release: 0.02 });
        playTone(sfxGain, noteToFreq("C4"), now + 0.05, 0.08, { type: "square", gain: 0.25, release: 0.03 });
        break;
      case "hit": // 攻撃ヒット
        playDrum(sfxGain, "snare", now, 0.35);
        playTone(sfxGain, noteToFreq("A2"), now, 0.08, { type: "square", gain: 0.25, release: 0.03 });
        break;
      case "spell": // 呪文
        playTone(sfxGain, noteToFreq("E5"), now, 0.1, { type: "triangle", gain: 0.22, release: 0.05 });
        playTone(sfxGain, noteToFreq("A5"), now + 0.08, 0.12, { type: "triangle", gain: 0.22, release: 0.06 });
        playTone(sfxGain, noteToFreq("D6"), now + 0.16, 0.16, { type: "triangle", gain: 0.2, release: 0.08 });
        break;
      case "heal": // 回復
        playTone(sfxGain, noteToFreq("C5"), now, 0.12, { type: "triangle", gain: 0.22, release: 0.06 });
        playTone(sfxGain, noteToFreq("E5"), now + 0.1, 0.12, { type: "triangle", gain: 0.22, release: 0.06 });
        playTone(sfxGain, noteToFreq("G5"), now + 0.2, 0.18, { type: "triangle", gain: 0.22, release: 0.08 });
        break;
      case "levelup": // レベルアップ
        ["C5", "E5", "G5", "C6"].forEach(function (note, i) {
          playTone(sfxGain, noteToFreq(note), now + i * 0.09, 0.16, { type: "square", gain: 0.26, release: 0.05 });
        });
        break;
      case "warp": // 扉/ワープ
        (function () {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(0.25, now + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
          osc.connect(g);
          g.connect(sfxGain);
          osc.start(now);
          osc.stop(now + 0.34);
        })();
        break;
      case "wipe": // 全滅
        (function () {
          const notes = ["G4", "F4", "D#4", "C4", "A3"];
          notes.forEach(function (note, i) {
            playTone(sfxGain, noteToFreq(note), now + i * 0.14, 0.22, {
              type: "triangle",
              gain: 0.24,
              release: 0.1
            });
          });
        })();
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------------
  // 公開API
  // --------------------------------------------------------------------

  loadMuteState();
  installAutoResume();
  installMuteKey();
  installVisibilityPause();

  window.RPG.Audio = {
    playBgm: playBgm,
    stopBgm: stopBgm,
    playSe: playSe,
    toggleMute: toggleMute,
    setMuted: setMuted,
    isMuted: function () {
      return muted;
    },
    // デバッグ/拡張用に生成済み楽曲一覧も公開しておく
    songNames: Object.keys(SONGS)
  };
})();
