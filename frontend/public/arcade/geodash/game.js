// GEO RUNNER — Geometry Dash inspired, handcrafted levels, authentic physics

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ── LOGICAL WORLD ────────────────────────────────────────────────────────────
// 480 wide × 480 tall logical units.
// Increasing LH adds sky above while keeping ground near the bottom,
// exactly like making the screen taller — no distortion, PX === PY always.
const T = 40;
const LW = 480, LH = 480;
let PX = 1, PY = 1, CW = LW, CH = LH;

// Ground stays near the bottom — 1 tile from the bottom edge
const GROUND_Y = LH - T;  // 480 - 40 = 440
const CEIL_Y   = 0;

function resize() {
  CW = window.innerWidth; CH = window.innerHeight;

  // Uniform scale — pick the smaller axis so the full logical world fits
  const scale = Math.min(CW / LW, CH / LH);
  const rw = Math.floor(LW * scale);
  const rh = Math.floor(LH * scale);

  canvas.width  = rw * (window.devicePixelRatio || 1);
  canvas.height = rh * (window.devicePixelRatio || 1);
  canvas.style.width  = rw + 'px';
  canvas.style.height = rh + 'px';
  // Center in the available space (black bars on unused sides)
  canvas.style.left = Math.floor((CW - rw) / 2) + 'px';
  canvas.style.top  = Math.floor((CH - rh) / 2) + 'px';

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  // PX === PY always — uniform, no distortion
  PX = rw / LW;
  PY = rh / LH;
}
window.addEventListener('resize', resize);

// ── CONSTANTS ────────────────────────────────────────────────────────────────
// T is declared above in the world section

// ── PHYSICS (logical units / second) ─────────────────────────────────────────
const CUBE_GRAV  = 1750;
const CUBE_JUMP  = -660;
const CUBE_MAXVY = 660;
const SHIP_GRAV  = 850;
const SHIP_THRU  = -1700;
const SHIP_MAXVY = 420;
const BALL_GRAV  = 1500;
const BALL_JUMP  = -560;
const WAVE_SPD   = 260;
const ORB_BOOST  = -620;

// Coyote time: allow jump for this many seconds after walking off a ledge
const COYOTE_TIME = 0.1;

// ── GAME STATE ────────────────────────────────────────────────────────────────
const MODES = { CUBE:0, SHIP:1, WAVE:2, BALL:3 };
let gameState = 'READY';  // READY | PLAYING | DEAD
let score = 0, best = 0;
let coinsCollected = 0, bestCoins = 0;
let held = false, waveDirUp = true;
let pressedThisFrame = false;
let camX = 0;
let lastTime = 0;
let deathCount = 0;

// Player — y initialised to ground position using the const GROUND_Y
const P = {
  x: 80, y: GROUND_Y - T,
  vy: 0, rot: 0,
  grounded: true,
  coyote: 0,
  mode: MODES.CUBE,
  w: T * 0.9, h: T * 0.9,
};

// Run first resize now that everything is declared
resize();

// How many seconds of invincibility + safe air-time after a portal transition
// During this window all obstacle collisions are skipped so the shape change
// is smooth and the player has time to react to the new control scheme.
let transitionTimer = 0;
const TRANSITION_GRACE = 1.8; // seconds

// ── LEVEL DATA ───────────────────────────────────────────────────────────────
// Each tile X is relative to world start. The level loops with increasing speed.
// Obstacle types:
//   spike(x, flipped)  — triangle on ground or ceiling
//   block(x, y, w, h)  — solid rectangle (y from top of ground)
//   orb(x, y)          — yellow orb, gives boost on tap
//   portal(x, mode)    — switches game mode


// ── LEVEL SECTIONS ─────────────────────────────────────────────────────────
// Sections tile end-to-end forever. Difficulty is driven purely by `si`
// (section index, 0-based), never loops back.
//
// Difficulty tiers (each tier has multiple distinct layout variants):
//   si 0     → Tutorial        (isolated spikes, max breathing room)
//   si 1-2   → Easy            (single spikes, simple 1-high blocks)
//   si 3-5   → Medium-Easy     (spike pairs, 2-high blocks, first orbs)
//   si 6-9   → Medium          (triple spikes, orb chains, first mode portals)
//   si 10-14 → Medium-Hard     (dense triples, stacked blocks, spike-behind-block)
//   si 15-19 → Hard            (quad spikes, multi-block towers, tight orb sequences)
//   si 20+   → Extreme         (full density, ceiling spikes + ground combos)
//
// Fair-jump rule: after any block's right edge, ≥3 clear tiles before next hazard
// at Easy, ≥2 at Medium-Hard, ≥1 at Extreme (by then player knows what to expect).
//
// Pure cube mode — no portals, no mode switches ever.
// Difficulty increases steadily through spikes, blocks, ceiling spikes, and orbs.

const SECT_W = 60;

function buildSection(si) {
  const obs = [];
  const ox = si * SECT_W * T;

  function spk(tx)        { obs.push({ type:'spike', x: ox+tx*T, flipped:false }); }
  function cspk(tx)       { obs.push({ type:'spike', x: ox+tx*T, flipped:true  }); }
  function blk(tx, h)     { obs.push({ type:'block', x:ox+tx*T, y:GROUND_Y-h*T, w:T,   h:h*T }); }
  function wblk(tx, h, w) { obs.push({ type:'block', x:ox+tx*T, y:GROUND_Y-h*T, w:w*T, h:h*T }); }
  function orb(tx, fy)    { obs.push({ type:'orb',   x:ox+tx*T+T/2, y:GROUND_Y-fy*T }); }
  // Visual-only portal gate — placed near the END of sections just before
  // a theme colour change, so the player sees the gate right as colours shift.
  // Theme changes every 8000 camX units; section width = SECT_W*T = 2400 units.
  // Theme boundary sections: 3, 6, 9(≈10), 13, 16, 20, 23, 26, 29, 33...
  // Gate spawns at tile 55 (near section end) of those sections.
  const THEME_GATE_SECTIONS = [3, 6, 9, 13, 16, 20, 23];
  const GATE_LABELS = [
    /* 3  */ '😌 Easy',
    /* 6  */ '💪 Light Work',
    /* 9  */ '🔒 Locked In',
    /* 13 */ '⚡ Cracked',
    /* 16 */ '😤 Crash Out',
    /* 20 */ '🏆 Final Boss',
    /* 23 */ '💀 You\'re Cooked',
  ];

  function gate(tx, label) {
    obs.push({ type:'portal', x:ox+tx*T, mode:MODES.CUBE, label });
  }

  const v = si % 4;

  // Gate near the end of this section (tile 55) if it's a theme-gate section
  const gateIdx = THEME_GATE_SECTIONS.indexOf(si);
  if (gateIdx >= 0) gate(55, GATE_LABELS[gateIdx]);

  // ── si 0 — Tutorial ───────────────────────────────────────────────────────
  if (si === 0) {
    spk(8); spk(16); spk(24);
    blk(32,1);
    spk(40); spk(50);

  // ── si 1-2 — Easy ─────────────────────────────────────────────────────────
  } else if (si <= 2) {
    if (v <= 1) {
      spk(5); spk(12);
      blk(19,1); spk(24);
      spk(31); spk(38);
      blk(45,1); spk(50); spk(55);
    } else {
      spk(6); spk(14); spk(21);
      blk(28,1); spk(33);
      spk(40); spk(47);
      blk(53,1); spk(57);
    }

  // ── si 3-5 — Medium-Easy ──────────────────────────────────────────────────
  } else if (si <= 5) {
    if (v === 0) {
      spk(4); spk(5);
      blk(12,1); spk(17); spk(18);
      spk(25); spk(26);
      blk(33,2); spk(38); spk(39);
      spk(46); spk(47); blk(54,1);
    } else if (v === 1) {
      spk(4); spk(5);
      orb(11,2.5); spk(15); spk(16);
      spk(23); spk(24);
      blk(31,1); spk(36); spk(37);
      orb(43,2.5); spk(48); spk(49);
    } else if (v === 2) {
      blk(5,1); spk(9); spk(10);
      spk(17); spk(18); spk(19);
      blk(27,2); spk(32); spk(33);
      spk(40); spk(41);
      orb(47,2.5); spk(52); spk(53);
    } else {
      spk(4); spk(5); spk(6);
      blk(14,1); spk(19); spk(20);
      orb(27,2.5);
      spk(32); spk(33); spk(34);
      blk(42,2); spk(47); spk(48);
      spk(55); spk(56);
    }

  // ── si 6-9 — Medium ───────────────────────────────────────────────────────
  } else if (si <= 9) {
    if (v === 0) {
      spk(3); spk(4); spk(5);
      orb(11,2.5); spk(14); spk(15); spk(16);
      blk(23,2); spk(28); spk(29); spk(30);
      orb(37,3); spk(40); spk(41); spk(42);
      blk(49,1); spk(54); spk(55); spk(56);
    } else if (v === 1) {
      cspk(8); cspk(9); spk(8); spk(9);
      blk(16,2); spk(20); spk(21); spk(22);
      cspk(20); cspk(21);
      spk(28); spk(29); spk(30);
      blk(37,2); spk(41); spk(42); spk(43);
      cspk(41); cspk(42);
      orb(49,3); spk(53); spk(54); spk(55);
    } else if (v === 2) {
      spk(4); spk(5); spk(6);
      blk(14,1); spk(18); spk(19); spk(20);
      blk(27,2); spk(32); spk(33);
      spk(39); spk(40); spk(41);
      orb(48,3); spk(52); spk(53); spk(54);
    } else {
      spk(4); spk(5); cspk(9); cspk(10);
      blk(16,2); spk(20); spk(21);
      cspk(25); cspk(26);
      spk(30); spk(31); spk(32);
      blk(38,2); spk(43); spk(44);
      cspk(48); cspk(49);
      spk(53); spk(54); spk(55);
    }

  // ── si 10-14 — Medium-Hard ────────────────────────────────────────────────
  } else if (si <= 14) {
    if (v === 0) {
      spk(3); spk(4); spk(5);
      wblk(12,1,2); spk(16); spk(17); spk(18);
      spk(24); spk(25); spk(26);
      wblk(33,2,2); spk(38); spk(39); spk(40);
      orb(46,3); spk(49); spk(50); spk(51);
      blk(57,1);
    } else if (v === 1) {
      cspk(4); cspk(5); cspk(6);
      spk(4); spk(5); spk(6);
      blk(13,2); spk(17); spk(18); spk(19);
      cspk(17); cspk(18);
      spk(25); spk(26); spk(27);
      blk(33,3); cspk(33); cspk(34);
      spk(38); spk(39); spk(40);
      cspk(46); cspk(47);
      orb(52,3); spk(55); spk(56);
    } else if (v === 2) {
      spk(3); spk(4);
      blk(10,2); spk(14); spk(15); spk(16);
      spk(22); spk(23); spk(24);
      blk(30,3); spk(35); spk(36); spk(37);
      orb(43,3.5); spk(47); spk(48); spk(49); spk(50);
      blk(56,2);
    } else {
      orb(5,2.5); spk(8); spk(9); spk(10);
      spk(16); spk(17); spk(18);
      orb(24,3); spk(27); spk(28); spk(29); spk(30);
      blk(36,2); spk(41); spk(42); spk(43);
      orb(49,3.5); spk(53); spk(54); spk(55); spk(56);
    }

  // ── si 15-19 — Hard ───────────────────────────────────────────────────────
  } else if (si <= 19) {
    if (v === 0) {
      spk(2); spk(3); spk(4); spk(5);
      blk(11,3); spk(16); spk(17); spk(18); spk(19);
      spk(25); spk(26); spk(27); spk(28);
      blk(34,3); spk(39); spk(40); spk(41); spk(42);
      orb(48,3.5); spk(51); spk(52); spk(53); spk(54);
    } else if (v === 1) {
      cspk(4); cspk(5); cspk(6); cspk(7);
      spk(4); spk(5); spk(6);
      blk(13,3); spk(18); spk(19); spk(20); spk(21);
      cspk(18); cspk(19); cspk(20);
      spk(27); spk(28); spk(29); spk(30);
      blk(36,4); cspk(36); cspk(37);
      spk(43); spk(44); spk(45); spk(46);
      cspk(51); cspk(52); cspk(53);
      orb(56,4);
    } else if (v === 2) {
      spk(3); spk(4); spk(5);
      cspk(3); cspk(4);
      blk(11,2); spk(15); spk(16); spk(17);
      cspk(15); cspk(16);
      spk(23); spk(24); spk(25); spk(26);
      orb(32,3.5);
      blk(37,3); spk(42); spk(43); spk(44); spk(45);
      cspk(42); cspk(43);
      spk(51); spk(52); spk(53);
    } else {
      cspk(4); cspk(5); cspk(6); cspk(7);
      spk(4); spk(5); spk(6); spk(7);
      blk(14,3); spk(19); spk(20); spk(21); spk(22);
      cspk(19); cspk(20); cspk(21);
      spk(28); spk(29); spk(30); spk(31);
      blk(37,4); cspk(37); cspk(38); cspk(39);
      spk(44); spk(45); spk(46); spk(47);
      cspk(52); cspk(53); cspk(54);
      orb(57,4);
    }

  // ── si 20+ — Extreme ──────────────────────────────────────────────────────
  } else {
    const xv = si % 6;
    if (xv === 0) {
      spk(2); spk(3); spk(4); spk(5);
      cspk(2); cspk(3);
      wblk(10,3,2); spk(14); spk(15); spk(16); spk(17);
      spk(22); spk(23); spk(24); spk(25);
      cspk(22); cspk(23); cspk(24);
      wblk(30,4,2); spk(36); spk(37); spk(38); spk(39);
      orb(44,4); spk(47); spk(48); spk(49); spk(50); spk(51);
      blk(56,3);
    } else if (xv === 1) {
      cspk(3); cspk(4); cspk(5); cspk(6);
      spk(3); spk(4); spk(5); spk(6);
      wblk(12,4,2); spk(17); spk(18); spk(19); spk(20);
      cspk(17); cspk(18); cspk(19);
      spk(25); spk(26); spk(27); spk(28);
      cspk(25); cspk(26); cspk(27);
      wblk(33,5,2); spk(39); spk(40); spk(41); spk(42);
      cspk(39); cspk(40); cspk(41);
      orb(47,4); spk(50); spk(51); spk(52); spk(53);
    } else if (xv === 2) {
      orb(4,3); spk(7); spk(8); spk(9); spk(10);
      cspk(7); cspk(8);
      spk(15); spk(16); spk(17); spk(18);
      orb(23,3.5);
      blk(27,3); spk(32); spk(33); spk(34); spk(35);
      cspk(32); cspk(33); cspk(34);
      orb(40,4); spk(43); spk(44); spk(45); spk(46); spk(47);
      blk(52,4); spk(58);
    } else if (xv === 3) {
      cspk(3); cspk(4); cspk(5); cspk(6); cspk(7);
      spk(3); spk(4); spk(5); spk(6); spk(7);
      wblk(12,5,2); spk(18); spk(19); spk(20); spk(21); spk(22);
      cspk(18); cspk(19); cspk(20); cspk(21);
      orb(27,4.5);
      spk(30); spk(31); spk(32); spk(33); spk(34);
      cspk(30); cspk(31); cspk(32); cspk(33);
      wblk(39,5,2); spk(45); spk(46); spk(47); spk(48); spk(49);
      cspk(45); cspk(46); cspk(47); cspk(48);
      orb(54,4.5); spk(57); spk(58);
    } else if (xv === 4) {
      spk(2); spk(3); cspk(5); cspk(6);
      spk(9); spk(10); spk(11); cspk(9); cspk(10);
      orb(16,3);
      blk(20,3); spk(25); spk(26); spk(27); cspk(25); cspk(26);
      spk(32); spk(33); spk(34); spk(35);
      orb(40,4); spk(43); spk(44); spk(45); spk(46);
      cspk(43); cspk(44); cspk(45);
      wblk(51,4,2); spk(55); spk(56); spk(57);
    } else {
      spk(2); spk(3); spk(4); spk(5); spk(6);
      cspk(2); cspk(3); cspk(4); cspk(5);
      wblk(11,4,3); spk(16); spk(17); spk(18); spk(19); spk(20);
      cspk(16); cspk(17); cspk(18); cspk(19);
      orb(25,4);
      spk(28); spk(29); spk(30); spk(31);
      cspk(28); cspk(29); cspk(30);
      wblk(36,5,2); spk(42); spk(43); spk(44); spk(45); spk(46);
      cspk(42); cspk(43); cspk(44); cspk(45);
      orb(51,4); spk(54); spk(55); spk(56); spk(57);
    }
  }

  return obs;
}

// Live obstacles — pre-generate first 4 sections
let sections = [];
let nextSection = 0;
let allObs = [];

function loadSection(si) {
  sections.push(si);
  const obs = buildSection(si);
  allObs = allObs.concat(obs);
}

function initLevel() {
  sections = []; nextSection = 0; allObs = [];
  for (let i = 0; i < 4; i++) loadSection(nextSection++);
}

// ── PARTICLES ────────────────────────────────────────────────────────────────
let parts = [];
function burst(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    parts.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.8,
      col,
      sz: 2 + Math.random() * 3,
    });
  }
}

// ── SPEED ────────────────────────────────────────────────────────────────────
// Ramps from 240 (tutorial) to 420 (extreme) as sections accumulate.
// Using camX so speed is continuous, not jumpy between sections.
function getSpeed() {
  // camX at si=20 ≈ 20 * 60 * 40 = 48000 units
  const progress = Math.min(camX / 48000, 1);
  return 240 + progress * 180; // 240 → 420 u/s
}

// ── RESET / INIT ─────────────────────────────────────────────────────────────
function resetGame() {
  camX = 0; score = 0; lastReportedScore = -1;
  coinsCollected = 0;
  held = false; waveDirUp = true;
  pressedThisFrame = false;
  transitionTimer = 0;
  P.x = 80; P.y = GROUND_Y - P.h;
  P.vy = 0; P.rot = 0;
  P.grounded = true; P.coyote = 0; P.mode = MODES.CUBE;
  parts = [];
  lastTime = 0;
  initLevel();
  gameState = 'PLAYING';
  try { window.parent.postMessage({ type: 'GEODASH_PLAYING' }, '*'); } catch(e) {}
}

// ── INPUT ────────────────────────────────────────────────────────────────────
function onPress() {
  if (gameState !== 'PLAYING') { resetGame(); return; }
  pressedThisFrame = true;
  if (P.mode === MODES.CUBE) {
    if (P.grounded || P.coyote > 0) {
      P.vy = CUBE_JUMP; P.grounded = false; P.coyote = 0;
      burst(P.x + P.w/2, P.y + P.h, '#FF916C', 6);
    }
  } else if (P.mode === MODES.SHIP) {
    held = true;
  } else if (P.mode === MODES.WAVE) {
    waveDirUp = true;
  } else if (P.mode === MODES.BALL) {
    if (P.grounded || P.coyote > 0) {
      P.vy = BALL_JUMP; P.grounded = false; P.coyote = 0;
      burst(P.x + P.w/2, P.y + P.h, '#ffd700', 6);
    }
  }
}

function onRelease() {
  held = false;
  waveDirUp = false;
}

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault(); onPress();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') onRelease();
});
canvas.addEventListener('touchstart', e => { e.preventDefault(); onPress(); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); onRelease(); }, { passive: false });
canvas.addEventListener('mousedown',  () => onPress());
canvas.addEventListener('mouseup',    () => onRelease());

// ── PHYSICS ──────────────────────────────────────────────────────────────────
// Block collision uses a two-pass sweep: vertical first, then horizontal.
// This matches real GD's grid-snap behaviour and eliminates corner slip.
//
// We keep a separate list of "solid tops" that were confirmed this frame
// so updatePhysics and block-collision share grounded state correctly.

let solidTopY = null;   // if non-null, the Y of a block top the player is standing on this frame

function updatePhysics(dt) {
  const mode = P.mode;
  const inGrace = transitionTimer > 0;

  // Tick coyote timer down
  if (P.coyote > 0) P.coyote = Math.max(0, P.coyote - dt);

  if (mode === MODES.CUBE) {
    P.vy += CUBE_GRAV * dt;
    if (P.vy > CUBE_MAXVY) P.vy = CUBE_MAXVY;
    P.y += P.vy * dt;

    if (P.y + P.h >= GROUND_Y) {
      P.y = GROUND_Y - P.h; P.vy = 0;
      if (!P.grounded) P.coyote = 0;
      P.grounded = true;
      P.rot = Math.round(P.rot / (Math.PI/2)) * (Math.PI/2);
    } else {
      if (P.grounded) P.coyote = COYOTE_TIME;
      P.grounded = false;
      P.rot += (P.vy > 0 ? 1 : -1) * 3.5 * dt;
    }
    // Ceiling: clamp during grace, kill after
    if (P.y <= CEIL_Y) {
      if (inGrace) { P.y = CEIL_Y + 1; P.vy = Math.abs(P.vy) * 0.3; }
      else die();
    }

  } else if (mode === MODES.SHIP) {
    const force = held ? SHIP_THRU : SHIP_GRAV;
    P.vy += force * dt;
    if (P.vy < -SHIP_MAXVY) P.vy = -SHIP_MAXVY;
    if (P.vy >  SHIP_MAXVY) P.vy =  SHIP_MAXVY;
    P.y += P.vy * dt;
    P.rot = Math.max(-0.55, Math.min(0.55, P.vy / SHIP_MAXVY * 0.55));
    // Clamp to boundaries during grace, kill after
    if (P.y + P.h >= GROUND_Y) {
      if (inGrace) { P.y = GROUND_Y - P.h - 1; P.vy = -Math.abs(P.vy) * 0.3; }
      else die();
    }
    if (P.y <= CEIL_Y) {
      if (inGrace) { P.y = CEIL_Y + 1; P.vy =  Math.abs(P.vy) * 0.3; }
      else die();
    }
    P.grounded = false; P.coyote = 0;

  } else if (mode === MODES.WAVE) {
    const dir = waveDirUp ? -1 : 1;
    P.y += dir * WAVE_SPD * dt;
    // Spin smoothly in the direction of travel
    P.rot += dir * 5 * dt;

    // Wave boundary — use half-diagonal as effective radius so the
    // rotated diamond tip doesn't clip into the floor/ceiling
    const halfDiag = (P.w * 0.5) * Math.SQRT2 * 0.5; // ≈ P.w * 0.354
    if (P.y + P.h / 2 + halfDiag >= GROUND_Y) {
      if (inGrace) { P.y = GROUND_Y - P.h / 2 - halfDiag - 1; waveDirUp = true; }
      else die();
    }
    if (P.y + P.h / 2 - halfDiag <= CEIL_Y) {
      if (inGrace) { P.y = CEIL_Y + halfDiag - P.h / 2 + 1; waveDirUp = false; }
      else die();
    }
    P.grounded = false; P.coyote = 0;

  } else if (mode === MODES.BALL) {
    P.vy += BALL_GRAV * dt;
    if (P.vy > CUBE_MAXVY) P.vy = CUBE_MAXVY;
    P.y += P.vy * dt;
    if (P.y + P.h >= GROUND_Y) {
      P.y = GROUND_Y - P.h; P.vy = 0;
      if (!P.grounded) P.coyote = 0;
      P.grounded = true;
      P.rot = Math.round(P.rot / (Math.PI/2)) * (Math.PI/2);
    } else {
      if (P.grounded) P.coyote = COYOTE_TIME;
      P.grounded = false;
      P.rot += 4 * dt;
    }
    if (P.y <= CEIL_Y) { P.y = CEIL_Y + 1; P.vy = Math.abs(P.vy) * 0.5; }
  }
}

// ── COLLISION HELPERS ─────────────────────────────────────────────────────────
function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh, pad) {
  pad = pad || 0;
  return ax+pad < bx+bw && ax+aw-pad > bx && ay+pad < by+bh && ay+ah-pad > by;
}

// Spike hitbox — only the inner tip ~35% of the spike is lethal.
// This matches real GD where grazing the base of a spike is safe.
function spikeHit(px, py, pw, ph, sx, sy, sw, sh, flipped) {
  // Narrow the hitbox to the central 40% width and top 40% height (tip)
  const hx = sx + sw * 0.30, hw = sw * 0.40;
  const hy = flipped ? sy         : sy + sh * 0.55;   // ground spike: only the sharp top portion
  const hh = flipped ? sh * 0.45  : sh * 0.40;        // ceiling spike: only the hanging tip
  // Extra 5px padding inward so pixel-perfect grazes never kill
  return rectOverlap(px, py, pw, ph, hx, hy, hw, hh, 5);
}

function die() {
  if (gameState !== 'PLAYING') return;
  // Never kill during the post-portal grace window
  if (transitionTimer > 0) return;
  gameState = 'DEAD';
  deathCount++;
  if (score > best) best = score;
  if (coinsCollected > bestCoins) bestCoins = coinsCollected;
  burst(P.x + P.w/2, P.y + P.h/2, '#FF916C', 24);
  try {
    window.parent.postMessage({
      type: 'GEODASH_SCORE',
      score,
      coins: coinsCollected,
      levelName: 'Geo Runner',
    }, '*');
  } catch(e) {}
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (gameState !== 'PLAYING') return;

  const spd = getSpeed();
  const dx = spd * dt;
  camX += dx;
  score = Math.floor(camX / 10);

  // Move player world-X forward (camera follows)
  P.x += dx; // P.x stays at screen position ~80 while world scrolls

  // Tick down the post-portal grace window BEFORE physics runs
  // so inGrace is always accurate when updatePhysics checks it
  if (transitionTimer > 0) transitionTimer = Math.max(0, transitionTimer - dt);

  updatePhysics(dt);
  if (gameState !== 'PLAYING') return;

  // Lazy-load next section when we're within 2 sections of the end
  const loadedWidth = nextSection * SECT_W * T;
  if (P.x + LW * 2 > loadedWidth) {
    loadSection(nextSection++);
  }

  // Scroll offset: player is fixed at screen x=80, world behind them
  const screenOffX = P.x - 80;

  // Process obstacles
  for (let i = allObs.length - 1; i >= 0; i--) {
    const o = allObs[i];
    const ox = o.x - screenOffX; // screen X

    // Cull far-left objects
    if (ox + T * 4 < 0) { allObs.splice(i, 1); continue; }
    // Skip objects far right (not yet relevant)
    if (ox > LW + T * 2) continue;

    // During post-portal grace period: skip spikes and blocks entirely.
    // Portals and orbs still process normally so the exit portal fires on time.
    if (transitionTimer > 0 && (o.type === 'spike' || o.type === 'block')) continue;

    if (o.type === 'spike') {
      const sw = T * 0.9, sh = T * 0.9;
      const sy = o.flipped ? CEIL_Y : GROUND_Y - sh;
      // Wave uses a smaller inner hitbox — the diamond inscribed square
      // is ~70% of the bounding box, so we shrink P.w/P.h for wave
      const hpad = P.mode === MODES.WAVE ? P.w * 0.20 : 0;
      if (spikeHit(P.x - screenOffX + hpad, P.y + hpad, P.w - hpad*2, P.h - hpad*2,
                   ox, sy, sw, sh, o.flipped)) {
        die(); return;
      }

    } else if (o.type === 'block') {
      const psx = P.x - screenOffX;
      // Shrink hitbox for wave — use inscribed-square approximation
      const wpad = P.mode === MODES.WAVE ? P.w * 0.20 : 0;
      const bsx = ox, bsy = o.y, bsw = o.w, bsh = o.h;

      // ── Two-pass sweep collision (no minimum-overlap ambiguity) ──────────
      // Pass 1 — vertical: did the player's bottom cross the block's top this frame?
      // We use the Y position BEFORE this frame's physics move (prevY) to determine
      // the approach direction unambiguously.
      // Since we don't store prevY we reconstruct it: prevY = P.y - P.vy*dt
      const prevBottom = (P.y - P.vy * dt) + P.h;   // bottom edge last frame
      const curBottom  = P.y + P.h;                  // bottom edge this frame
      const prevTop    = P.y - P.vy * dt;             // top edge last frame

      // Horizontal overlap — is the player over this block at all?
      // Use the padded hitbox for wave mode
      const hOverlap = (psx + wpad) + (P.w - wpad*2) > bsx + 2 &&
                       (psx + wpad) < bsx + bsw - 2;

      if (!hOverlap) continue;

      // Padded vertical edges for wave
      const effY    = P.y  + wpad;
      const effH    = P.h  - wpad * 2;
      const prevEffBottom = (effY - P.vy * dt) + effH;
      const curEffBottom  = effY + effH;
      const prevEffTop    = effY - P.vy * dt;

      const crossedTop = prevEffBottom <= bsy + 1 && curEffBottom >= bsy;
      const crossedBot = prevEffTop >= bsy + bsh - 1 && effY <= bsy + bsh;

      if (crossedTop && P.vy >= 0) {
        if (P.mode === MODES.CUBE || P.mode === MODES.BALL) {
          P.y      = bsy - P.h;
          P.vy     = 0;
          P.grounded = true;
          P.coyote   = 0;
          P.rot = Math.round(P.rot / (Math.PI/2)) * (Math.PI/2);
        } else {
          die(); return; // ship/wave hit block top = die
        }

      } else if (crossedBot && P.vy < 0) {
        P.y  = bsy + bsh;
        P.vy = 0;

      } else {
        if (rectOverlap(psx + wpad, P.y + wpad, P.w - wpad*2, P.h - wpad*2,
                        bsx, bsy, bsw, bsh, 0)) {
          die(); return;
        }
      }

    } else if (o.type === 'portal') {
      const psx = ox;
      const psh = T * 3.5, psy = GROUND_Y - psh, psw = T * 0.7;
      if (rectOverlap(P.x - screenOffX, P.y, P.w, P.h, psx, psy, psw, psh, 0)) {
        // Visual-only portal — player stays CUBE, no physics change.
        // The burst + flash signals "next level" to the user.
        burst(P.x - screenOffX + P.w/2, P.y + P.h/2, '#00ff87', 20);
        burst(P.x - screenOffX + P.w/2, P.y + P.h/2, '#ffffff', 8);
        allObs.splice(i, 1);
        break; // only one portal per frame
      }

    } else if (o.type === 'orb') {
      // Coins are collected automatically on proximity — no tap required
      if (!o.used) {
        const osx = ox;
        const pcx = P.x - screenOffX + P.w / 2;
        const pcy = P.y + P.h / 2;
        const dist = Math.hypot(pcx - osx, pcy - o.y);
        if (dist < T * 0.38 + P.w * 0.45) {
          o.used = true;
          coinsCollected++;
          burst(osx, o.y, '#ffd700', 12);
          // Post live coin update to React
          try {
            window.parent.postMessage({
              type: 'GEODASH_SCORE_UPDATE',
              score,
              coins: coinsCollected,
            }, '*');
          } catch(e) {}
        }
      }
    }
  }

  // Update particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }

  // Clear the single-frame tap flag after all logic has consumed it
  pressedThisFrame = false;
}

// ── THEMES ───────────────────────────────────────────────────────────────────
const THEMES = [
  { sky1:'#0a0e1a', sky2:'#0d1f3c', ground:'#1a3a6a', gline:'#2a5a9a', block:'#1e4a8a', blockH:'#2a6ac0', spike:'#c8d8ff' },
  { sky1:'#1a0828', sky2:'#2a1048', ground:'#5a1a7a', gline:'#8a2aaa', block:'#6a1a8a', blockH:'#9a2abc', spike:'#e8b0ff' },
  { sky1:'#1a0a00', sky2:'#2a1200', ground:'#7a2a00', gline:'#c04000', block:'#8a2800', blockH:'#d04800', spike:'#ffd0a0' },
  { sky1:'#001a0a', sky2:'#002a12', ground:'#006a1a', gline:'#00aa2a', block:'#005a18', blockH:'#008a28', spike:'#a0ffb0' },
];
function getTheme() {
  const idx = Math.floor(camX / 8000) % THEMES.length;
  return THEMES[idx];
}

// Background star field — more stars to fill the taller 480-unit sky
const STARS = Array.from({length: 90}, () => ({
  x: Math.random() * LW, y: Math.random() * (GROUND_Y * 0.92),
  r: 0.4 + Math.random() * 1.4,
  sp: 0.1 + Math.random() * 0.4,
}));

// ── DRAW ──────────────────────────────────────────────────────────────────────
function lx(v) { return v * PX; }
function ly(v) { return v * PY; }

function drawBg() {
  const t = getTheme();
  const rw = canvas.width  / (window.devicePixelRatio||1);
  const rh = canvas.height / (window.devicePixelRatio||1);

  const g = ctx.createLinearGradient(0, 0, 0, ly(GROUND_Y));
  g.addColorStop(0, t.sky1); g.addColorStop(1, t.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, rw, rh);

  // Stars (parallax)
  ctx.fillStyle = '#ffffff';
  for (const s of STARS) {
    const sx = ((s.x - camX * s.sp * 0.08) % LW + LW) % LW;
    ctx.globalAlpha = 0.5 + Math.random()*0.5;
    ctx.beginPath();
    ctx.arc(lx(sx), ly(s.y), s.r * Math.min(PX,PY), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGround() {
  const t = getTheme();
  const rw = canvas.width / (window.devicePixelRatio||1);
  const rh = canvas.height / (window.devicePixelRatio||1);
  // Ground block
  ctx.fillStyle = t.ground;
  ctx.fillRect(0, ly(GROUND_Y), rw, rh - ly(GROUND_Y));
  // Grid lines on ground
  ctx.strokeStyle = t.gline + '60';
  ctx.lineWidth = 1;
  const gridSpacing = lx(T);
  const off = lx(camX % T);
  for (let x = -off; x < rw; x += gridSpacing) {
    ctx.beginPath(); ctx.moveTo(x, ly(GROUND_Y)); ctx.lineTo(x, rh); ctx.stroke();
  }
  // Ground top line
  ctx.strokeStyle = t.gline;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ly(GROUND_Y)); ctx.lineTo(rw, ly(GROUND_Y)); ctx.stroke();
}

function drawObstacles() {
  const t = getTheme();
  const screenOffX = P.x - 80;

  for (const o of allObs) {
    const ox = lx(o.x - screenOffX);
    if (ox + lx(T*4) < 0 || ox > lx(LW + T*2)) continue;

    if (o.type === 'spike') {
      const sw = lx(T * 0.9), sh = ly(T * 0.9);
      const sy = o.flipped ? ly(CEIL_Y) : ly(GROUND_Y - T * 0.9);
      ctx.fillStyle = t.spike;
      ctx.beginPath();
      if (o.flipped) {
        ctx.moveTo(ox + sw/2, sy + sh);
        ctx.lineTo(ox + sw, sy);
        ctx.lineTo(ox, sy);
      } else {
        ctx.moveTo(ox + sw/2, sy);
        ctx.lineTo(ox + sw, sy + sh);
        ctx.lineTo(ox, sy + sh);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 1; ctx.stroke();

    } else if (o.type === 'block') {
      const bx = ox, by = ly(o.y), bw = lx(o.w), bh = ly(o.h);
      // Main fill
      ctx.fillStyle = t.block;
      ctx.fillRect(bx, by, bw, bh);
      // Highlight top edge
      ctx.fillStyle = t.blockH;
      ctx.fillRect(bx, by, bw, ly(5));
      // Grid lines on block face
      ctx.strokeStyle = t.gline + '80';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);

    } else if (o.type === 'portal') {
      const psh = ly(T * 3.5), psy = ly(GROUND_Y - T * 3.5);
      const psw = lx(T * 0.7);
      const col = '#00ff87';

      // Glow fill + border
      ctx.fillStyle = col + '25';
      ctx.fillRect(ox, psy, psw, psh);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(ox, psy, psw, psh);

      // Animated horizontal scan lines inside gate
      const glowAlpha = 0.35 + 0.25 * Math.sin(Date.now() / 200);
      ctx.globalAlpha = glowAlpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let g = 0; g < 3; g++) {
        const gy = psy + psh * (0.25 + g * 0.25);
        ctx.beginPath(); ctx.moveTo(ox + lx(2), gy); ctx.lineTo(ox + psw - lx(2), gy); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Label drawn ABOVE the portal, horizontally, fully visible
      const label = o.label || '';
      if (label) {
        const labelFs = lx(T * 0.36);
        ctx.font = `bold ${labelFs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Shadow for legibility
        ctx.fillStyle = '#000000aa';
        ctx.fillText(label, ox + psw / 2 + 1, psy - lx(4) + 1);
        // Text
        ctx.fillStyle = col;
        ctx.fillText(label, ox + psw / 2, psy - lx(4));
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      }

    } else if (o.type === 'orb' && !o.used) {
      const osx = lx(o.x - screenOffX), osy = ly(o.y), orr = lx(T * 0.38);
      const grad = ctx.createRadialGradient(osx, osy, orr*0.1, osx, osy, orr);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, '#ffd700');
      grad.addColorStop(1, '#ff880060');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(osx, osy, orr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(osx, osy, orr, 0, Math.PI*2); ctx.stroke();
    }
  }
}

function drawPlayer() {
  const sx = lx(80);  // player is always drawn at screen x=80
  const sy = ly(P.y);
  const sw = lx(P.w), sh = ly(P.h);
  const cx = sx + sw/2, cy = sy + sh/2;

  // ── Grace-window shield ring ─────────────────────────────────────────
  // Visible for the full TRANSITION_GRACE seconds after a portal.
  // Pulses and fades so player knows exactly when invincibility ends.
  if (transitionTimer > 0) {
    const frac    = transitionTimer / TRANSITION_GRACE;   // 1 → 0
    const pulse   = 0.6 + 0.4 * Math.sin(Date.now() / 80); // oscillates 0.6–1.0
    const radius  = sw * 0.82 * pulse;
    const modeCol = P.mode === MODES.SHIP ? '#ff64c8'
                  : P.mode === MODES.WAVE ? '#64ffee'
                  : P.mode === MODES.BALL ? '#ffd700'
                  : '#00ff87';
    ctx.save();
    ctx.globalAlpha = frac * 0.75 * pulse;
    ctx.strokeStyle = modeCol;
    ctx.lineWidth   = lx(3);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Inner fill glow
    ctx.globalAlpha = frac * 0.18 * pulse;
    ctx.fillStyle   = modeCol;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(P.rot);

  if (P.mode === MODES.CUBE) {
    // Main cube
    ctx.fillStyle = '#00ff87';
    ctx.beginPath();
    ctx.roundRect(-sw*0.48, -sh*0.48, sw*0.96, sh*0.96, sw*0.1);
    ctx.fill();
    ctx.strokeStyle = '#00aa55'; ctx.lineWidth = sw*0.08; ctx.stroke();
    // Inner decoration
    ctx.fillStyle = '#ffffff80';
    ctx.beginPath();
    ctx.roundRect(-sw*0.22, -sh*0.22, sw*0.44, sh*0.44, sw*0.05);
    ctx.fill();

  } else if (P.mode === MODES.SHIP) {
    ctx.fillStyle = '#ff64c8';
    ctx.beginPath();
    ctx.moveTo(sw*0.5, 0);
    ctx.lineTo(-sw*0.4, -sh*0.4);
    ctx.lineTo(-sw*0.15, 0);
    ctx.lineTo(-sw*0.4, sh*0.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#cc2090'; ctx.lineWidth = sw*0.06; ctx.stroke();
    if (held) {
      ctx.fillStyle = '#ff880099';
      ctx.beginPath();
      ctx.moveTo(-sw*0.15, -sh*0.15);
      ctx.lineTo(-sw*0.65, 0);
      ctx.lineTo(-sw*0.15, sh*0.15);
      ctx.closePath(); ctx.fill();
    }

  } else if (P.mode === MODES.WAVE) {
    ctx.fillStyle = '#64ffee';
    ctx.beginPath();
    ctx.moveTo(0, -sh*0.5);
    ctx.lineTo(sw*0.5, 0);
    ctx.lineTo(0, sh*0.5);
    ctx.lineTo(-sw*0.5, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#00ccaa'; ctx.lineWidth = sw*0.06; ctx.stroke();

  } else if (P.mode === MODES.BALL) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(0, 0, sw*0.48, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#cc9900'; ctx.lineWidth = sw*0.08; ctx.stroke();
    ctx.fillStyle = '#ffffff70';
    ctx.beginPath(); ctx.arc(-sw*0.1, -sh*0.1, sw*0.2, 0, Math.PI*2); ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  for (const p of parts) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.col;
    ctx.fillRect(lx(p.x)-p.sz, ly(p.y)-p.sz, p.sz*2, p.sz*2);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const rw = canvas.width / (window.devicePixelRatio||1);
  const fs = lx(T * 0.7);

  // Score (top-right)
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#00000050';
  ctx.fillText(score, rw - lx(10) + 2, ly(T*0.9) + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(score, rw - lx(10), ly(T*0.9));
  if (best > 0) {
    ctx.font = `${fs*0.6}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff70';
    ctx.fillText('BEST ' + best, rw - lx(10), ly(T*0.9) + fs*0.7);
  }
  ctx.textAlign = 'left';

  // Coin counter (top-left, after mode label)
  const cfs = fs * 0.6;
  ctx.font = `${cfs}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff60';
  ctx.fillText('CUBE', lx(8), ly(T*0.6));
  // Gold coin icon + count
  const cy = ly(T*0.6) + cfs + lx(3);
  ctx.beginPath();
  ctx.arc(lx(8) + cfs*0.45, cy - cfs*0.35, cfs*0.42, 0, Math.PI*2);
  ctx.fillStyle = '#ffd700';
  ctx.fill();
  ctx.strokeStyle = '#cc9900';
  ctx.lineWidth = lx(1.5);
  ctx.stroke();
  ctx.font = `bold ${cfs}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffd700';
  ctx.fillText('×' + coinsCollected, lx(8) + cfs + lx(4), cy);
}

function drawScreen(title, sub, col) {
  const rw = canvas.width / (window.devicePixelRatio||1);
  const rh = canvas.height / (window.devicePixelRatio||1);
  ctx.fillStyle = '#00000075';
  ctx.fillRect(0, 0, rw, rh);
  const cx = rw / 2, cy = rh * 0.4;
  const fs = lx(T * 1.0);
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = col;
  ctx.fillText(title, cx, cy);
  ctx.font = `${fs*0.52}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(sub, cx, cy + fs * 1.1);
  if (best > 0) {
    ctx.font = `${fs*0.44}px system-ui, sans-serif`;
    ctx.fillStyle = '#4EF0A0cc';
    ctx.fillText('BEST: ' + best, cx, cy + fs * 1.1 + fs*0.56);
  }
  ctx.textAlign = 'left';
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBg();
  drawGround();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawHUD();
  if (gameState === 'READY') drawScreen('GEO RUNNER', 'Tap / Space to play', '#00ff87');
  if (gameState === 'DEAD')  drawScreen('YOU DIED', `Score: ${score}  •  Tap to retry`, '#FF916C');
}

// ── GAME LOOP ─────────────────────────────────────────────────────────────────
let lastReportedScore = -1;

function loop(ts) {
  if (lastTime === 0) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();

  // Push live score + coins to parent React component every time score changes
  if (gameState === 'PLAYING' && score !== lastReportedScore) {
    lastReportedScore = score;
    try {
      window.parent.postMessage({ type: 'GEODASH_SCORE_UPDATE', score, coins: coinsCollected }, '*');
    } catch(e) {}
  }

  requestAnimationFrame(loop);
}

// Init
initLevel();
requestAnimationFrame(loop);
