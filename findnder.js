(function () {
  "use strict";
  var KEY_LIKE = "balldefender_like", KEY_DISLIKE = "balldefender_dislike", KEY_VOTED = "balldefender_voted";

  // 一次性重置：把点赞/差评计数和投票状态归零
  try {
    if (!localStorage.getItem("balldefender_vote_reset_v1")) {
      localStorage.setItem(KEY_LIKE, "0");
      localStorage.setItem(KEY_DISLIKE, "0");
      localStorage.removeItem(KEY_VOTED);
      localStorage.setItem("balldefender_vote_reset_v1", "1");
    }
  } catch (e) {}

  function load(key) { try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  function loadVoted() { try { return localStorage.getItem(KEY_VOTED) || ""; } catch (e) { return ""; } }
  function saveVoted(v) { try { if (v) localStorage.setItem(KEY_VOTED, v); else localStorage.removeItem(KEY_VOTED); } catch (e) {} }

  var like = load(KEY_LIKE), dislike = load(KEY_DISLIKE);
  var voted = loadVoted();   // "" | "like" | "dislike"
  var likeBtn = document.getElementById("likeBtn");
  var dislikeBtn = document.getElementById("dislikeBtn");
  var likeCnt = document.getElementById("likeCnt");
  var dislikeCnt = document.getElementById("dislikeCnt");
  var fsBtn = document.getElementById("fsBtn");

  function renderCounts() {
    likeCnt.textContent = String(like);
    dislikeCnt.textContent = String(dislike);
    likeBtn.classList.toggle("voted", voted === "like");
    dislikeBtn.classList.toggle("voted", voted === "dislike");
    var hasVoted = voted !== "";
    likeBtn.disabled = hasVoted;
    dislikeBtn.disabled = hasVoted;
    likeBtn.title = hasVoted ? (voted === "like" ? "已点赞" : "已投过票") : "点赞";
    dislikeBtn.title = hasVoted ? (voted === "dislike" ? "已吐槽" : "已投过票") : "吐槽";
  }
  renderCounts();

  likeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (voted !== "") return;
    like++; voted = "like"; save(KEY_LIKE, like); saveVoted(voted); renderCounts();
  });
  dislikeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (voted !== "") return;
    dislike++; voted = "dislike"; save(KEY_DISLIKE, dislike); saveVoted(voted); renderCounts();
  });

  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement); }
  function isZoomed() { var s = document.getElementById("stage"); return !!(s && s.classList.contains("zoom")); }
  function updateFsIcon() { var on = isFs() || isZoomed(); fsBtn.textContent = on ? "✕" : "⛶"; fsBtn.title = on ? "缩小" : "放大"; }
  function applyZoom(on) {
    var s = document.getElementById("stage");
    if (s) s.classList.toggle("zoom", on);
    window.dispatchEvent(new Event("resize"));
  }
  function toggleFs() {
    if (isFs()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } else if (isZoomed()) {
      applyZoom(false);
    } else {
      var el = document.documentElement;
      if (el.requestFullscreen) {
        var p = el.requestFullscreen();
        if (p && p.catch) p.catch(function () { applyZoom(true); updateFsIcon(); });
      } else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
      else if (el.msRequestFullscreen) { el.msRequestFullscreen(); }
      applyZoom(true);
    }
    updateFsIcon();
  }
  fsBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleFs(); });
  document.addEventListener("fullscreenchange", function () { if (!isFs()) applyZoom(false); updateFsIcon(); });
  document.addEventListener("webkitfullscreenchange", function () { if (!isFs()) applyZoom(false); updateFsIcon(); });
  document.addEventListener("msfullscreenchange", function () { if (!isFs()) applyZoom(false); updateFsIcon(); });
  updateFsIcon();
})();


(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  // ---- Logical canvas size (drawn coordinates) ----
  var W = 420, H = 720;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var COLS = 10;
  var CELL = W / COLS;            // 42
  var BLOCK = 34;                 // block side
  var PAD = (CELL - BLOCK) / 2;   // 4
  var LAUNCHER_Y = H - 46;
  var BALL_R = 8;
  var PICKUP_R = 14;
  var BALL_SPEED = 720;
  var FILL_P = 0.68;              // ~7 of 10 slots filled per row (not full)

  var TWO_PI = Math.PI * 2;

  // ---- State ----
  var G = {
    phase: "aim",       // "aim" | "fly" | "over"
    queue: 1,           // permanent ball count
    balls: [],          // flying balls
    blocks: [],         // descending number blocks
    pickups: [],        // bonus orbs
    particles: [],
    floaters: [],
    stars: [],
    score: 0,
    best: 0,
    rowsSpawned: 0,
    time: 0,
    shake: 0,
    muted: false,
    aimAngle: -Math.PI / 2,
    aiming: false,
    pointerActive: false,
    started: false,
    restartBtn: null
  };

  // 一次性重置：把最高分与点赞/吐槽计数回到初始（0）
  try {
    if (!localStorage.getItem("balldefender_reset_v1")) {
      localStorage.setItem("balldefender_best", "0");
      localStorage.setItem("balldefender_like", "0");
      localStorage.setItem("balldefender_dislike", "0");
      localStorage.setItem("balldefender_reset_v1", "1");
    }
  } catch (e) {}
  try {
    G.best = parseInt(localStorage.getItem("balldefender_best"), 10) || 0;
  } catch (e) { G.best = 0; }

  // ---- Helpers ----
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function blockColor(hp) {
    if (hp <= 1) return "#34d399";
    if (hp === 2) return "#38bdf8";
    if (hp === 3) return "#818cf8";
    if (hp === 4) return "#c084fc";
    if (hp === 5) return "#fbbf24";
    if (hp === 6) return "#fb923c";
    return "#f87171";
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    var nx = Math.max(rx, Math.min(cx, rx + rw));
    var ny = Math.max(ry, Math.min(cy, ry + rh));
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---- Resize / pointer mapping ----
  function resize() {
    var stage = document.getElementById("stage");
    var zoomed = stage && stage.classList.contains("zoom");
    var availW = zoomed ? window.innerWidth : window.innerWidth - 16;
    var availH = zoomed ? window.innerHeight : window.innerHeight - 16;
    var scale = Math.min(availW / W, availH / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    canvas.width = Math.floor(W * scale * DPR);
    canvas.height = Math.floor(H * scale * DPR);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  // ---- Audio ----
  var AC = null;
  function audio() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    }
    return AC;
  }
  function beep(freq, dur, type, vol) {
    if (G.muted) return;
    var ac = audio();
    if (!ac) return;
    if (ac.resume) ac.resume();
    var o = ac.createOscillator(), g2 = ac.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g2.gain.value = vol || 0.12;
    o.connect(g2); g2.connect(ac.destination);
    o.start();
    g2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.stop(ac.currentTime + dur);
  }
  function soundHit() { beep(190, 0.06, "square", 0.05); }
  function soundDestroy() { beep(330, 0.12, "triangle", 0.12); beep(540, 0.10, "triangle", 0.08); }
  function soundPickup() { beep(660, 0.08, "sine", 0.12); setTimeout(function () { beep(880, 0.10, "sine", 0.10); }, 60); }
  function soundShoot() { beep(150, 0.08, "sawtooth", 0.045); }

  // ---- Spawning ----
  function maxHp() {
    return Math.max(2, 1 + Math.floor(G.queue / 2) + Math.floor(G.rowsSpawned / 10));
  }
  function spawnRow() {
    G.rowsSpawned++;
    var mhp = maxHp();

    // lanes already occupied by a descending bonus ball stay clear
    var reserved = {};
    for (var i = 0; i < G.pickups.length; i++) {
      if (G.pickups[i].col !== undefined) reserved[G.pickups[i].col] = true;
    }

    var emptyCols = [];
    for (var c = 0; c < COLS; c++) {
      if (reserved[c]) continue;
      if (Math.random() < FILL_P) {
        G.blocks.push({ x: c * CELL + PAD, y: PAD, w: BLOCK, h: BLOCK, hp: randInt(1, mhp) });
      } else {
        emptyCols.push(c);
      }
    }

    // occasionally drop an independent bonus ball into a free cell
    if (Math.random() < 0.55 && emptyCols.length > 0) {
      var col = emptyCols[Math.floor(Math.random() * emptyCols.length)];
      G.pickups.push({
        col: col,
        x: col * CELL + CELL / 2,
        y: CELL / 2,
        r: PICKUP_R,
        bonus: Math.random() < 0.2 ? 2 : 1
      });
    }
  }
  function stepDown() {
    // everything drops exactly one cell
    for (var i = 0; i < G.blocks.length; i++) G.blocks[i].y += CELL;
    for (var j = 0; j < G.pickups.length; j++) G.pickups[j].y += CELL;
    // cull bonus balls that fell off the bottom
    for (var k = G.pickups.length - 1; k >= 0; k--) {
      if (G.pickups[k].y - G.pickups[k].r > H) G.pickups.splice(k, 1);
    }
    // a fresh row slides in at the top
    spawnRow();
    // game over if any block reached the danger line
    for (var m = 0; m < G.blocks.length; m++) {
      if (G.blocks[m].y + G.blocks[m].h >= LAUNCHER_Y) { endGame(); return; }
    }
  }

  // ---- Shooting / balls ----
  function shoot(angle) {
    G.phase = "fly";
    var n = G.queue;
    var spread = n > 1 ? Math.min(0.6, n * 0.05) : 0;
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) : 0.5;
      var off = (t - 0.5) * spread;
      var a = angle + off + rand(-0.03, 0.03);
      G.balls.push({ x: W / 2, y: LAUNCHER_Y, vx: Math.cos(a) * BALL_SPEED, vy: Math.sin(a) * BALL_SPEED, life: 0 });
    }
    soundShoot();
  }
  function spawnExtraBall(x, y) {
    var a = -Math.PI / 2 + rand(-0.75, 0.75);
    G.balls.push({ x: x, y: y - PICKUP_R, vx: Math.cos(a) * BALL_SPEED, vy: Math.sin(a) * BALL_SPEED, life: 0 });
  }

  function resolveBlockBounce(b, blk) {
    var cx = blk.x + blk.w / 2, cy = blk.y + blk.h / 2;
    var overlapX = (blk.w / 2 + BALL_R) - Math.abs(b.x - cx);
    var overlapY = (blk.h / 2 + BALL_R) - Math.abs(b.y - cy);
    var jitter = rand(-0.25, 0.25);
    if (overlapX < overlapY) {
      b.vx = -b.vx;
      b.vy += jitter;
      b.x += (b.x < cx ? -overlapX : overlapX);
    } else {
      b.vy = -b.vy;
      b.vx += jitter;
      b.y += (b.y < cy ? -overlapY : overlapY);
    }
    var sp = Math.hypot(b.vx, b.vy) || BALL_SPEED;
    var s = BALL_SPEED / sp;
    b.vx *= s; b.vy *= s;
  }

  function updateBalls(dt) {
    for (var i = G.balls.length - 1; i >= 0; i--) {
      var b = G.balls[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life += dt;

      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
      else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

      if (b.y > H + BALL_R || b.life > 12) { G.balls.splice(i, 1); continue; }

      // Blocks
      var hitBlock = false;
      for (var j = 0; j < G.blocks.length; j++) {
        var blk = G.blocks[j];
        if (circleRect(b.x, b.y, BALL_R, blk.x, blk.y, blk.w, blk.h)) {
          resolveBlockBounce(b, blk);
          blk.hp--;
          hitBlock = true;
          if (blk.hp <= 0) {
            G.blocks.splice(j, 1);
            G.score += 10;
            addParticles(blk.x + blk.w / 2, blk.y + blk.h / 2, blockColor(blk.hp + 1), 12);
            addFloater(blk.x + blk.w / 2, blk.y + blk.h / 2, "+10", "#e2e8f0");
            G.shake = 5;
            soundDestroy();
          } else {
            addParticles(b.x, b.y, blockColor(blk.hp), 4);
            G.score += 2;
            soundHit();
          }
          break;
        }
      }
      if (hitBlock) continue;

      // Bonus orbs
      for (var k = 0; k < G.pickups.length; k++) {
        var p = G.pickups[k];
        var dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy < (BALL_R + p.r) * (BALL_R + p.r)) {
          G.pickups.splice(k, 1);
          G.queue += p.bonus;
          for (var m = 0; m < p.bonus; m++) spawnExtraBall(p.x, p.y);
          addParticles(p.x, p.y, "#fbbf24", 14);
          addFloater(p.x, p.y, "+" + p.bonus + " 🏐", "#fde68a");
          G.score += 20 * p.bonus;
          soundPickup();
          break;
        }
      }
    }
  }

  // ---- Effects ----
  function addParticles(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TWO_PI;
      var sp = rand(40, 200);
      G.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.4, 0.9), max: 0.9, color: color, size: rand(2, 5) });
    }
  }
  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
    }
  }
  function drawParticles() {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TWO_PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function addFloater(x, y, text, color) {
    G.floaters.push({ x: x, y: y, text: text, color: color, life: 1.0 });
  }
  function updateFloaters(dt) {
    for (var i = G.floaters.length - 1; i >= 0; i--) {
      var f = G.floaters[i];
      f.life -= dt; f.y -= 42 * dt;
      if (f.life <= 0) G.floaters.splice(i, 1);
    }
  }
  function drawFloaters() {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var i = 0; i < G.floaters.length; i++) {
      var f = G.floaters[i];
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = "700 15px \"Rajdhani\", system-ui, sans-serif";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function initStars() {
    G.stars = [];
    for (var i = 0; i < 44; i++) {
      G.stars.push({ x: Math.random() * W, y: Math.random() * H, r: rand(0.4, 1.8), s: rand(8, 24) });
    }
  }

  // ---- Update ----
  function update(dt) {
    G.time += dt;
    updateParticles(dt);
    updateFloaters(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    if (G.phase === "over") return;

    if (G.phase === "fly") {
      updateBalls(dt);
      if (G.balls.length === 0) {
        stepDown();                    // one volley = one step down
        if (G.phase !== "over") G.phase = "aim";
      }
    }
  }

  function endGame() {
    G.phase = "over";
    if (G.score > G.best) {
      G.best = G.score;
      try { localStorage.setItem("balldefender_best", G.best); } catch (e) {}
    }
  }

  function reset() {
    G.phase = "aim"; G.queue = 1; G.balls = []; G.blocks = []; G.pickups = [];
    G.particles = []; G.floaters = [];
    G.score = 0; G.rowsSpawned = 0; G.time = 0;
    G.shake = 0; G.started = false; G.aiming = false;
    G.aimAngle = -Math.PI / 2;
    spawnRow(); // seed the first row at the top
  }

  // ---- Render ----
  function render() {
    ctx.save();
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

    // Background
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1b2450");
    grad.addColorStop(0.5, "#111a38");
    grad.addColorStop(1, "#0a1024");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    drawStars();

    // Screen shake
    if (G.shake > 0) {
      ctx.translate(rand(-1, 1) * G.shake, rand(-1, 1) * G.shake);
    }

    drawDangerLine();
    for (var i = 0; i < G.blocks.length; i++) drawBlock(G.blocks[i]);
    for (var j = 0; j < G.pickups.length; j++) drawPickup(G.pickups[j]);
    for (var k = 0; k < G.balls.length; k++) drawBall(G.balls[k]);

    ctx.restore();

    drawParticles();
    drawFloaters();

    if (G.phase === "aim") drawAim();
    drawHUD();
    if (G.phase === "over") drawGameOver();
    else if (!G.started) drawHint();
  }

  function drawStars() {
    for (var i = 0; i < G.stars.length; i++) {
      var s = G.stars[i];
      var yy = (s.y + G.time * s.s) % H;
      ctx.globalAlpha = 0.22 + 0.18 * Math.sin(G.time * 2 + s.x);
      ctx.fillStyle = "#93c5fd";
      ctx.beginPath(); ctx.arc(s.x, yy, s.r, 0, TWO_PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDangerLine() {
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "rgba(248,113,113,.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, LAUNCHER_Y); ctx.lineTo(W, LAUNCHER_Y); ctx.stroke();
    ctx.restore();
  }

  function drawBlock(b) {
    roundRect(b.x, b.y, b.w, b.h, 7);
    ctx.fillStyle = blockColor(b.hp);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // top highlight
    ctx.fillStyle = "rgba(255,255,255,.14)";
    roundRect(b.x + 2, b.y + 2, b.w - 4, 6, 3);
    ctx.fill();

    // number centered
    ctx.fillStyle = "#fff";
    ctx.font = "700 " + Math.round(b.h * 0.52) + "px \"Rajdhani\", system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.hp), b.x + b.w / 2, b.y + b.h / 2 + 1);
  }

  function drawPickup(p) {
    var pulse = 1 + Math.sin(G.time * 5) * 0.08;
    var r = p.r * pulse;

    var rg = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 1.8);
    rg.addColorStop(0, "rgba(251,191,36,.5)");
    rg.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, TWO_PI); ctx.fill();

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#7c2d12";
    ctx.font = "700 " + Math.round(r * 1.1) + "px \"Rajdhani\", system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+" + p.bonus, p.x, p.y + 1);
  }

  function drawBall(b) {
    ctx.strokeStyle = "rgba(103,232,249,.28)";
    ctx.lineWidth = BALL_R * 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, BALL_R * 0.4, 0, TWO_PI); ctx.fill();
  }

  function drawBallAt(x, y) {
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath(); ctx.arc(x - 2, y - 2, BALL_R * 0.4, 0, TWO_PI); ctx.fill();
  }

  function drawAim() {
    var n = G.queue;
    if (n === 1) {
      drawBallAt(W / 2, LAUNCHER_Y);
    } else {
      drawBallAt(W / 2 - 14, LAUNCHER_Y);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#eaf6ff";
      ctx.font = "700 24px \"Rajdhani\", system-ui, sans-serif";
      ctx.fillText("×" + n, W / 2 + 2, LAUNCHER_Y + 1);
    }

    if (G.aiming || G.pointerActive) {
      var dx = Math.cos(G.aimAngle), dy = Math.sin(G.aimAngle);
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(226,232,240,.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, LAUNCHER_Y);
      ctx.lineTo(W / 2 + dx * 92, LAUNCHER_Y + dy * 92);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHUD() {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 20px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("分数 " + G.score, 14, 12);

    ctx.fillStyle = "rgba(226,232,240,.72)";
    ctx.font = "600 14px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("小球 × " + G.queue, 14, 38);
    ctx.fillText("最高 " + G.best, 14, 58);

    // mute button
    ctx.textAlign = "center";
    ctx.font = "18px system-ui";
    ctx.fillText(G.muted ? "🔇" : "🔊", W - 28, 30);
  }

  function drawHint() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 40px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("BallDefender", W / 2, H * 0.30);

    ctx.fillStyle = "rgba(203,213,225,.82)";
    ctx.font = "600 16px system-ui";
    ctx.fillText("拖动瞄准 · 点击发射", W / 2, H * 0.30 + 44);
    ctx.fillText("击碎数字方块 · 命中 🏐 获得小球", W / 2, H * 0.30 + 70);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(7,10,22,.72)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "700 42px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("游戏结束", W / 2, H / 2 - 66);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 18px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("分数 " + G.score, W / 2, H / 2 - 20);
    ctx.fillText("最高 " + G.best, W / 2, H / 2 + 10);

    var bw = 190, bh = 54, bx = W / 2 - bw / 2, by = H / 2 + 50;
    roundRect(bx, by, bw, bh, 27);
    ctx.fillStyle = "#6366f1";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 19px \"Rajdhani\", system-ui, sans-serif";
    ctx.fillText("重新开始", W / 2, by + bh / 2 + 1);
    G.restartBtn = { x: bx, y: by, w: bw, h: bh };
  }

  // ---- Input ----
  function aimAngleFrom(p) {
    var dx = p.x - W / 2, dy = p.y - LAUNCHER_Y;
    if (dy > -20) dy = -20;      // force aim upward
    return Math.atan2(dy, dx);
  }

  function onDown(e) {
    e.preventDefault();
    audio();
    var p = pointerPos(e);

    // mute toggle
    if (p.x >= W - 52 && p.x <= W - 8 && p.y >= 12 && p.y <= 48) {
      G.muted = !G.muted;
      return;
    }
    if (G.phase === "aim") {
      G.aiming = true;
      G.aimAngle = aimAngleFrom(p);
    } else if (G.phase === "over" && G.restartBtn) {
      if (p.x >= G.restartBtn.x && p.x <= G.restartBtn.x + G.restartBtn.w &&
          p.y >= G.restartBtn.y && p.y <= G.restartBtn.y + G.restartBtn.h) {
        reset();
      }
    }
  }
  function onMove(e) {
    var p = pointerPos(e);
    G.pointerActive = true;
    if (G.phase === "aim") G.aimAngle = aimAngleFrom(p);
  }
  function onUp(e) {
    if (G.phase === "aim" && G.aiming) {
      G.aiming = false;
      G.started = true;
      shoot(G.aimAngle);
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---- Main loop ----
  initStars();
  reset();
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
