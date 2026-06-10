const screens = {
  home: document.getElementById("homeScreen"),
  select: document.getElementById("selectScreen"),
  battle: document.getElementById("battleScreen"),
};

const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const countdownEl = document.getElementById("countdown");
const scoreboard = document.getElementById("scoreboard");
const matchTitle = document.getElementById("matchTitle");

const goSelectBtn = document.getElementById("goSelectBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const launchBtn = document.getElementById("launchBtn");
const muteBtn = document.getElementById("muteBtn");
const stopBtn = document.getElementById("stopBtn");
const restartBtn = document.getElementById("restartBtn");
const resetBtn = document.getElementById("resetBtn");
const speedButtons = document.querySelectorAll(".speed-btn");
const slotOneCards = document.getElementById("slotOneCards");
const slotTwoCards = document.getElementById("slotTwoCards");

const ARENA_SIZE = canvas.width;
const BALL_RADIUS = 51;
const HIT_KNOCKBACK = 520;
const HIT_COOLDOWN = 0.48;
const KIM_SKILL_COOLDOWN = 5;
const LEE_AURA_RATE = 5;
const ULT_MAX = 100;
const ULT_GAIN_PER_POINT = 0.5;
const KIM_ULT_SPEED_BONUS = 100;
const LEE_ULT_SHIELD_GAIN = 50;
const LEE_ULT_DRAIN_RATE = 10;
const BJD_SKILL_COOLDOWN = 3;
const LSJ_LETTERS = ["엄", "마", "없", "는", "거", "맞", "지"];
const LSJ_LETTER_INTERVAL = 1;
const LSJ_BURST_INTERVAL = 0.11;
const LETTER_PROJECTILE_SPEED = 680;
const HOMING_PROJECTILE_SPEED = 520;

const fighters = {
  kim: {
    id: "kim",
    name: "김성윤",
    color: "#55c7f7",
    imageSrc: "ksy.png",
    tags: ["탱커", "폭발적인 피해", "체력 회복"],
    maxHp: 250,
    speed: 300,
    skill: "5초마다 체력 10 회복 후 다음 접촉 피해가 60으로 증가.",
    ult: "이동속도가 100 증가하고 잃은 체력의 25% 회복 후 다음 접촉 피해는 60 + 상대 현재 체력의 20%.",
  },
  lee: {
    id: "lee",
    name: "이지호",
    color: "#ff6b6b",
    imageSrc: "ljh.png",
    tags: ["탱커", "지속적인 피해", "체력 회복"],
    maxHp: 300,
    speed: 260,
    auraRadius: 300,
    skill: "넓은 반경 안에 상대가 없으면 초당 5 회복, 있으면 상대가 초당 5 피해. 이 스킬은 궁극기 게이지 효율이 2배다.",
    ult: "50의 보호막을 획득하고 중앙으로 이동 후 피해를 입을 때까지 경기장 전체에 초당 10 피해, 입힌 피해만큼 체력 회복.",
  },
  bjd: {
    id: "bjd",
    name: "배정대",
    color: "#f4d35e",
    imageSrc: "bjd.png",
    tags: ["메이지", "폭발적인 피해"],
    maxHp: 150,
    speed: 350,
    skill: "3초마다 강한 파동을 만들어 가까울수록 큰 피해를 줌.",
    ult: "맵 전역에 빠른 파동을 분출하여 맞은 적에게 30 피해와 5초 기절.",
  },
  lsj: {
    id: "lsj",
    name: "이서준",
    color: "#8bd3ff",
    imageSrc: "lsj.png",
    tags: ["원거리 딜러", "빠른 공격"],
    maxHp: 200,
    speed: 300,
    skill: "1초마다 글자를 모으고 7글자가 모이면 가장 가까운 적에게 하나씩 발사.",
    ult: "모든 글자를 유도탄으로 날려 가장 가까운 적에게 반드시 적중.",
  },
};

const fighterImages = {};
for (const fighter of Object.values(fighters)) {
  const image = new Image();
  image.src = fighter.imageSrc;
  fighterImages[fighter.id] = image;
}

let selected = { one: "kim", two: "lee" };
let balls = [];
let particles = [];
let shockwaves = [];
let projectiles = [];
let damageTexts = [];
let state = "home";
let countdownTimers = [];
let animationId = 0;
let lastTime = 0;
let simSpeed = 1;
let pausedState = null;
let pausedCountdownText = "";
let screenShake = 0;
let screenFlash = 0;
let audioCtx = null;
let masterGain = null;
let lastSoundAt = {};
let soundMuted = false;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomAngle = () => Math.random() * Math.PI * 2;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = soundMuted ? 0 : 0.22;
  masterGain.connect(audioCtx.destination);
}

function ensureAudio() {
  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playTone({ freq = 440, endFreq = freq, duration = 0.12, type = "sine", volume = 0.5, delay = 0 }) {
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playNoise({ duration = 0.14, volume = 0.35, filter = 900, delay = 0 }) {
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime + delay;
  const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const biquad = audioCtx.createBiquadFilter();
  source.buffer = buffer;
  biquad.type = "lowpass";
  biquad.frequency.value = filter;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(biquad);
  biquad.connect(gain);
  gain.connect(masterGain);
  source.start(now);
  source.stop(now + duration);
}

function playSound(name) {
  if (!audioCtx || soundMuted) return;
  const nowMs = performance.now();
  const limit = {
    wall: 55,
    collision: 90,
    aura: 180,
    letter: 35,
    damage: 55,
  }[name] || 0;
  if (limit && nowMs - (lastSoundAt[name] || 0) < limit) return;
  lastSoundAt[name] = nowMs;

  if (name === "wall") playTone({ freq: 220, endFreq: 90, duration: 0.07, type: "triangle", volume: 0.18 });
  if (name === "collision") {
    playTone({ freq: 120, endFreq: 55, duration: 0.14, type: "sine", volume: 0.34 });
    playNoise({ duration: 0.08, volume: 0.16, filter: 700 });
  }
  if (name === "kimSkill") {
    playTone({ freq: 180, endFreq: 520, duration: 0.24, type: "sawtooth", volume: 0.2 });
    playTone({ freq: 360, endFreq: 180, duration: 0.18, type: "triangle", volume: 0.12, delay: 0.03 });
  }
  if (name === "kimUlt") {
    playNoise({ duration: 0.28, volume: 0.34, filter: 1200 });
    playTone({ freq: 90, endFreq: 520, duration: 0.42, type: "sawtooth", volume: 0.32 });
    playTone({ freq: 55, endFreq: 38, duration: 0.35, type: "sine", volume: 0.42 });
  }
  if (name === "leeUlt") {
    playTone({ freq: 70, endFreq: 130, duration: 0.55, type: "sine", volume: 0.34 });
    playTone({ freq: 210, endFreq: 120, duration: 0.55, type: "triangle", volume: 0.16 });
  }
  if (name === "aura") {
    playTone({ freq: 95, endFreq: 82, duration: 0.11, type: "sawtooth", volume: 0.08 });
    playNoise({ duration: 0.07, volume: 0.05, filter: 360 });
  }
  if (name === "bjdWave") {
    playNoise({ duration: 0.22, volume: 0.38, filter: 520 });
    playTone({ freq: 75, endFreq: 35, duration: 0.32, type: "sine", volume: 0.45 });
  }
  if (name === "bjdUlt") {
    playNoise({ duration: 0.55, volume: 0.48, filter: 1500 });
    playTone({ freq: 180, endFreq: 45, duration: 0.7, type: "sawtooth", volume: 0.38 });
    playTone({ freq: 660, endFreq: 220, duration: 0.45, type: "square", volume: 0.12 });
  }
  if (name === "letter") playTone({ freq: 620, endFreq: 980, duration: 0.055, type: "square", volume: 0.16 });
  if (name === "letterUlt") playTone({ freq: 820, endFreq: 1320, duration: 0.075, type: "square", volume: 0.22 });
  if (name === "stun") playTone({ freq: 950, endFreq: 520, duration: 0.18, type: "triangle", volume: 0.22 });
  if (name === "damage") playTone({ freq: 180, endFreq: 120, duration: 0.07, type: "triangle", volume: 0.11 });
  if (name === "shieldBreak") {
    playNoise({ duration: 0.16, volume: 0.28, filter: 2200 });
    playTone({ freq: 760, endFreq: 180, duration: 0.22, type: "square", volume: 0.18 });
    playTone({ freq: 1220, endFreq: 420, duration: 0.12, type: "triangle", volume: 0.12, delay: 0.02 });
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  muteBtn.textContent = soundMuted ? "소리 켜기" : "음소거";
  if (masterGain) masterGain.gain.value = soundMuted ? 0 : 0.22;
}

function showScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.classList.toggle("hidden", screenName !== name);
  }
  state = name;
}

function renderCharacterSelect() {
  renderSlot(slotOneCards, "one");
  renderSlot(slotTwoCards, "two");
}

function renderSlot(container, slot) {
  container.innerHTML = "";
  for (const fighter of Object.values(fighters)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `character-card ${selected[slot] === fighter.id ? "selected" : ""}`;
    card.innerHTML = `
      <h3 style="color:${fighter.color}">${fighter.name}</h3>
      <p>Tags: ${fighter.tags.join(", ")}</p>
      <p>Stats: HP ${fighter.maxHp}, Speed ${fighter.speed}px/s</p>
      <p>Skill: ${fighter.skill}</p>
      <p>Ult: ${fighter.ult}</p>
    `;
    card.addEventListener("click", () => {
      selected[slot] = fighter.id;
      renderCharacterSelect();
    });
    container.appendChild(card);
  }
}

function makeBall(fighterId, x, y) {
  const data = fighters[fighterId];
  return {
    ...data,
    x,
    y,
    vx: 0,
    vy: 0,
    r: BALL_RADIUS,
    hp: data.maxHp,
    shield: 0,
    ultCharge: 0,
    ultActive: false,
    ultPrimed: false,
    ultSpeedApplied: false,
    needleAngle: randomAngle(),
    needleSpin: (Math.random() > 0.5 ? 1 : -1) * (2.4 + Math.random() * 2.4),
    hitCooldown: 0,
    empowered: false,
    skillTimer: data.id === "kim" || data.id === "bjd" ? 0 : 1,
    drinkFlash: 0,
    letters: [],
    letterTimer: 0,
    letterBurstQueue: [],
    letterBurstTimer: 0,
    letterBurstHoming: false,
    pendingDamageText: { damage: 0, heal: 0 },
    status: {},
  };
}

function startMatch() {
  ensureAudio();
  stopAnimation();
  setSimSpeed(1);
  stopBtn.textContent = "중단";
  pausedState = null;
  showScreen("battle");
  balls = [
    makeBall(selected.one, ARENA_SIZE * 0.28, ARENA_SIZE * 0.5),
    makeBall(selected.two, ARENA_SIZE * 0.72, ARENA_SIZE * 0.5),
  ];
  particles = [];
  shockwaves = [];
  projectiles = [];
  damageTexts = [];
  screenShake = 0;
  screenFlash = 0;
  matchTitle.textContent = `${balls[0].name} vs ${balls[1].name}`;
  state = "countdown";
  countdownEl.classList.remove("start-flash");
  countdownEl.classList.remove("hidden");
  countdownEl.textContent = "3";
  renderScoreboard();
  syncHud();
  lastTime = performance.now();
  scheduleCountdown();
  animationId = requestAnimationFrame(loop);
}

function stopAnimation() {
  cancelAnimationFrame(animationId);
  for (const timer of countdownTimers) clearTimeout(timer);
  countdownTimers = [];
}

function stopMatch() {
  if (state === "stopped") {
    resumeMatch();
    return;
  }
  if (state === "ended") return;
  stopAnimation();
  if (state === "battle" || state === "home" || state === "select") return;
  pausedState = state;
  pausedCountdownText = countdownEl.textContent;
  state = "stopped";
  stopBtn.textContent = "재생";
  countdownEl.classList.remove("start-flash");
  countdownEl.classList.remove("hidden");
  countdownEl.textContent = "중단됨";
  draw();
}

function resumeMatch() {
  if (!pausedState) return;
  state = pausedState;
  pausedState = null;
  stopBtn.textContent = "중단";
  lastTime = performance.now();

  if (state === "countdown") {
    countdownEl.textContent = pausedCountdownText;
    countdownEl.classList.remove("hidden");
    resumeCountdown();
  } else {
    countdownEl.classList.add("hidden");
  }

  animationId = requestAnimationFrame(loop);
}

function resumeCountdown() {
  const count = Number(countdownEl.textContent);
  if (!Number.isFinite(count) || count <= 0) {
    beginMovement();
    return;
  }

  countdownTimers = [];
  for (let next = count - 1; next >= 1; next -= 1) {
    countdownTimers.push(
      setTimeout(() => {
        if (state === "countdown") countdownEl.textContent = String(next);
      }, (count - next) * 1000),
    );
  }
  countdownTimers.push(
    setTimeout(() => {
      if (state === "countdown") beginMovement();
    }, count * 1000),
  );
}

function scheduleCountdown() {
  countdownTimers = [
    setTimeout(() => {
      if (state === "countdown") countdownEl.textContent = "2";
    }, 1000),
    setTimeout(() => {
      if (state === "countdown") countdownEl.textContent = "1";
    }, 2000),
    setTimeout(() => {
      if (state === "countdown") beginMovement();
    }, 3000),
  ];
}
function beginMovement() {
  state = "fighting";
  countdownEl.textContent = "START";
  countdownEl.classList.add("start-flash");
  setTimeout(() => {
    if (state === "fighting") countdownEl.classList.add("hidden");
  }, 420);

  for (const ball of balls) {
    ball.vx = Math.cos(ball.needleAngle) * ball.speed;
    ball.vy = Math.sin(ball.needleAngle) * ball.speed;
  }
}

function loop(time) {
  const rawDt = Math.min((time - lastTime) / 1000, 0.033);
  const dt = rawDt * simSpeed;
  lastTime = time;
  update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

function update(dt) {
  updateParticles(dt);
  updateShockwaves(dt);
  updateProjectiles(dt);
  flushDamageTextQueues();
  updateDamageTexts(dt);
  screenShake = Math.max(0, screenShake - dt);
  screenFlash = Math.max(0, screenFlash - dt);

  if (state === "countdown") {
    for (const ball of balls) ball.needleAngle += ball.needleSpin * dt;
    return;
  }

  if (state !== "fighting") return;

  for (const ball of balls) {
    updateStatuses(ball, dt);
    ball.hitCooldown = Math.max(0, ball.hitCooldown - dt);
    ball.drinkFlash = Math.max(0, ball.drinkFlash - dt);
    updateLsjBurst(ball, dt);
    if (canAct(ball)) {
      updateKimAbility(ball, dt);
      updateBjdAbility(ball, dt);
      updateLsjAbility(ball, dt);
    }
    updateLeeUltimate(ball, dt);
    if (ball.id === "lee" && ball.ultActive) continue;
    if (canMove(ball)) {
      const slow = getSlowMultiplier(ball);
      ball.x += ball.vx * dt * slow;
      ball.y += ball.vy * dt * slow;
      bounceOnWalls(ball);
    }
  }

  updateLeeAura(dt);
  resolveBallHit();
  syncHud();
  checkWinner();
}

function updateKimAbility(ball, dt) {
  if (ball.id !== "kim" || ball.empowered || ball.ultPrimed) return;
  ball.skillTimer += dt;
  if (ball.skillTimer >= KIM_SKILL_COOLDOWN) {
    ball.skillTimer = KIM_SKILL_COOLDOWN;
    ball.empowered = true;
    ball.drinkFlash = 0.9;
    applyHeal(ball, 10);
    burst(ball.x, ball.y, "#b56cff", 28);
    playSound("kimSkill");
  }
}

function updateBjdAbility(ball, dt) {
  if (ball.id !== "bjd" || ball.ultActive) return;
  ball.skillTimer += dt;
  if (ball.skillTimer >= BJD_SKILL_COOLDOWN) {
    ball.skillTimer = 0;
    burst(ball.x, ball.y, "#f4d35e", 22);
    castBjdWave(ball);
  }
}

function updateLsjAbility(ball, dt) {
  if (ball.id !== "lsj" || ball.ultActive) return;
  ball.letterTimer += dt;
  while (ball.letterTimer >= LSJ_LETTER_INTERVAL && ball.letters.length < LSJ_LETTERS.length) {
    ball.letterTimer -= LSJ_LETTER_INTERVAL;
    ball.letters.push(LSJ_LETTERS[ball.letters.length]);
    burst(ball.x, ball.y, "#8bd3ff", 8);
  }

  if (ball.letters.length >= LSJ_LETTERS.length) queueLsjLetters(ball, false);
}

function castBjdWave(ball) {
  playSound("bjdWave");
  addShockwave(ball.x, ball.y, 500, "#f4d35e", 0.9, 16);
  addShockwave(ball.x, ball.y, 500, "#ffffff", 0.55, 7);
  screenShake = Math.max(screenShake, 0.18);
  for (const target of balls) {
    if (target === ball || target.hp <= 0) continue;
    const d = distance(ball, target);
    let damage = 0;
    if (d <= 100) damage = 100;
    else if (d <= 200) damage = 80;
    else if (d <= 300) damage = 60;
    else if (d <= 400) damage = 40;
    else if (d <= 500) damage = 20;
    if (damage > 0) {
      applyDamage(target, damage, { source: ball });
      knockAway(target, ball, 260 + damage * 3);
    }
  }
}

function queueLsjLetters(ball, homing) {
  if (ball.letterBurstQueue.length) return;
  ball.letterBurstQueue = ball.letters.length ? ball.letters.splice(0, ball.letters.length) : [...LSJ_LETTERS];
  ball.letterBurstTimer = 0;
  ball.letterBurstHoming = homing;
  ball.letterTimer = 0;
  burst(ball.x, ball.y, homing ? "#ffffff" : "#8bd3ff", homing ? 34 : 18);
}

function updateLsjBurst(ball, dt) {
  if (ball.id !== "lsj" || !ball.letterBurstQueue.length) return;
  ball.letterBurstTimer -= dt;
  while (ball.letterBurstTimer <= 0 && ball.letterBurstQueue.length) {
    const letter = ball.letterBurstQueue.shift();
    fireLsjLetter(ball, letter, ball.letterBurstHoming);
    ball.letterBurstTimer += LSJ_BURST_INTERVAL;
  }
}

function fireLsjLetter(ball, letter, homing) {
  const target = nearestEnemy(ball);
  if (!target) return;
  const firedCount = LSJ_LETTERS.length - ball.letterBurstQueue.length - 1;
  const angle = angleTo(ball, target) + (homing ? 0 : (firedCount - 3) * 0.055);
  projectiles.push({
    type: "letter",
    owner: ball,
    target,
    homing,
    letter,
    x: ball.x + Math.cos(angle) * (ball.r + 12),
    y: ball.y + Math.sin(angle) * (ball.r + 12),
    vx: Math.cos(angle) * (homing ? HOMING_PROJECTILE_SPEED : LETTER_PROJECTILE_SPEED),
    vy: Math.sin(angle) * (homing ? HOMING_PROJECTILE_SPEED : LETTER_PROJECTILE_SPEED),
    r: 13,
    damage: 20,
    life: 3.2,
    color: homing ? "#ffffff" : "#8bd3ff",
    trail: [],
  });
  playSound(homing ? "letterUlt" : "letter");
  burst(ball.x, ball.y, homing ? "#ffffff" : "#8bd3ff", homing ? 8 : 5);
}

function updateLeeUltimate(ball, dt) {
  if (ball.id !== "lee" || !ball.ultActive) return;
  ball.x = ARENA_SIZE / 2;
  ball.y = ARENA_SIZE / 2;
  ball.vx = 0;
  ball.vy = 0;

  let totalDamage = 0;
  for (const target of balls) {
    if (target === ball || target.hp <= 0) continue;
    totalDamage += applyDamage(target, LEE_ULT_DRAIN_RATE * dt, { source: ball, fromUltimate: true }).hpDamage;
    if (Math.random() < 0.65) addParticle(target.x, target.y, "#ff6b6b", 3);
  }

  if (totalDamage > 0) {
    applyHeal(ball, totalDamage, { fromUltimate: true });
    if (Math.random() < 0.8) addParticle(ball.x, ball.y, "#ffd166", 3);
  }
}

function updateProjectiles(dt) {
  for (const projectile of projectiles) {
    projectile.life -= dt;
    projectile.trail.push({ x: projectile.x, y: projectile.y });
    if (projectile.trail.length > (projectile.homing ? 10 : 14)) projectile.trail.shift();
    if (projectile.homing && projectile.target && projectile.target.hp > 0) {
      const angle = angleTo(projectile, projectile.target);
      projectile.vx = Math.cos(angle) * HOMING_PROJECTILE_SPEED;
      projectile.vy = Math.sin(angle) * HOMING_PROJECTILE_SPEED;
    }
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    for (const target of balls) {
      if (target === projectile.owner || target.hp <= 0) continue;
      if (distance(projectile, target) <= projectile.r + target.r) {
        applyDamage(target, projectile.damage, { source: projectile.owner, fromUltimate: projectile.homing });
        knockAway(target, projectile.owner, projectile.homing ? 460 : 230);
        burst(target.x, target.y, projectile.color, projectile.homing ? 24 : 12);
        projectile.life = 0;
        break;
      }
    }
  }
  projectiles = projectiles.filter(
    (projectile) =>
      projectile.life > 0 &&
      projectile.x > -60 &&
      projectile.y > -60 &&
      projectile.x < ARENA_SIZE + 60 &&
      projectile.y < ARENA_SIZE + 60,
  );
}

function updateLeeAura(dt) {
  for (const lee of balls.filter((ball) => ball.id === "lee")) {
    const target = balls.find((ball) => ball !== lee && ball.hp > 0);
    if (!target) continue;
    const inAura = distance(lee, target) <= lee.auraRadius;
    if (inAura) {
      applyDamage(target, LEE_AURA_RATE * dt, { source: lee, ultGainMultiplier: 2 });
      if (Math.random() < 0.45) addParticle(target.x, target.y, "#ff6b6b", 3);
      if (Math.random() < 0.08) playSound("aura");
    } else {
      applyHeal(lee, LEE_AURA_RATE * dt, { ultGainMultiplier: 2 });
      if (Math.random() < 0.25) addParticle(lee.x, lee.y, "#ff9b9b", 2);
    }
  }
}

function resolveBallHit() {
  const [a, b] = balls;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const overlap = a.r + b.r - dist;
  if (overlap <= 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  if (a.hitCooldown > 0 || b.hitCooldown > 0) return;

  const aHit = applyContactDamage(a, b);
  const bHit = applyContactDamage(b, a);
  a.hitCooldown = HIT_COOLDOWN;
  b.hitCooldown = HIT_COOLDOWN;

  const aAnchored = a.id === "lee" && a.ultActive && bHit.hpDamage === 0;
  const bAnchored = b.id === "lee" && b.ultActive && aHit.hpDamage === 0;
  const aForce = bHit.ultimateHit ? HIT_KNOCKBACK * 1.75 : HIT_KNOCKBACK;
  const bForce = aHit.ultimateHit ? HIT_KNOCKBACK * 1.75 : HIT_KNOCKBACK;

  if (!aAnchored) {
    a.vx = -nx * aForce;
    a.vy = -ny * aForce;
  }
  if (!bAnchored) {
    b.vx = nx * bForce;
    b.vy = ny * bForce;
  }
  burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffffff", 24);
  playSound("collision");
}

function applyContactDamage(attacker, defender) {
  let damage = 0;
  let ultimateHit = false;
  if (attacker.id === "kim" && attacker.ultPrimed) {
    damage = 60 + defender.hp * 0.2;
    ultimateHit = true;
    attacker.ultPrimed = false;
    if (attacker.ultSpeedApplied) {
      attacker.speed -= KIM_ULT_SPEED_BONUS;
      attacker.ultSpeedApplied = false;
      setVelocityMagnitude(attacker, attacker.speed);
    }
    attacker.skillTimer = 0;
    attacker.drinkFlash = 0;
    burst(attacker.x, attacker.y, "#ff2f2f", 34);
  } else if (attacker.id === "kim" && attacker.empowered) {
    damage = 60;
    attacker.empowered = false;
    attacker.skillTimer = 0;
    attacker.drinkFlash = 0;
    burst(attacker.x, attacker.y, "#b56cff", 18);
  }
  const result = damage > 0 ? applyDamage(defender, damage, { source: attacker, fromUltimate: ultimateHit }) : emptyDamageResult();
  return { ...result, ultimateHit };
}

function emptyDamageResult() {
  return { shieldDamage: 0, hpDamage: 0, totalDamage: 0 };
}

function applyDamage(target, amount, options = {}) {
  amount = applyDamageModifiers(options.source, target, amount);
  const beforeHp = target.hp;
  const beforeShield = target.shield;
  const shieldDamage = Math.min(target.shield, amount);
  target.shield -= shieldDamage;
  const hpDamage = Math.min(target.hp, amount - shieldDamage);
  target.hp -= hpDamage;
  if (shieldDamage + hpDamage > 0) target.pendingDamageText.damage += shieldDamage + hpDamage;
  if (beforeShield > 0 && target.shield <= 0 && shieldDamage > 0) playSound("shieldBreak");
  wakeOnDamage(target, hpDamage);

  if (target.id === "lee" && target.ultActive && beforeHp > target.hp) {
    target.ultActive = false;
    target.vx += (Math.random() - 0.5) * HIT_KNOCKBACK;
    target.vy += (Math.random() - 0.5) * HIT_KNOCKBACK;
    burst(target.x, target.y, "#ffd166", 30);
    playSound("damage");
  }

  if (options.source && !options.fromUltimate) gainUltimate(options.source, hpDamage, options.ultGainMultiplier);

  return { shieldDamage, hpDamage, totalDamage: shieldDamage + hpDamage };
}

function applyHeal(target, amount, options = {}) {
  const beforeHp = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const healed = target.hp - beforeHp;
  if (healed > 0) target.pendingDamageText.heal += healed;
  if (!options.fromUltimate) gainUltimate(target, healed, options.ultGainMultiplier);
  return healed;
}

function gainUltimate(ball, amount, multiplier = 1) {
  if (ball.ultActive || ball.ultPrimed || ball.hp <= 0) return;
  ball.ultCharge = Math.min(ULT_MAX, ball.ultCharge + amount * ULT_GAIN_PER_POINT * multiplier);
  if (ball.ultCharge >= ULT_MAX) castUltimate(ball);
}

function castUltimate(ball) {
  ball.ultCharge = 0;
  if (ball.id === "kim") castKimUltimate(ball);
  if (ball.id === "lee") castLeeUltimate(ball);
  if (ball.id === "bjd") castBjdUltimate(ball);
  if (ball.id === "lsj") castLsjUltimate(ball);
}

function castKimUltimate(ball) {
  ball.empowered = false;
  ball.ultPrimed = true;
  ball.skillTimer = 0;
  applyHeal(ball, (ball.maxHp - ball.hp) * 0.25, { fromUltimate: true });
  if (!ball.ultSpeedApplied) {
    ball.speed += KIM_ULT_SPEED_BONUS;
    ball.ultSpeedApplied = true;
    setVelocityMagnitude(ball, ball.speed);
  }
  ball.drinkFlash = 1.1;
  burst(ball.x, ball.y, "#ff2f2f", 44);
  playSound("kimUlt");
}

function castLeeUltimate(ball) {
  ball.ultActive = true;
  ball.shield += LEE_ULT_SHIELD_GAIN;
  ball.x = ARENA_SIZE / 2;
  ball.y = ARENA_SIZE / 2;
  ball.vx = 0;
  ball.vy = 0;
  burst(ball.x, ball.y, "#ffd166", 54);
  screenFlash = 0.35;
  screenShake = 0.45;
  playSound("leeUlt");
}

function castBjdUltimate(ball) {
  ball.ultActive = true;
  addShockwave(ball.x, ball.y, ARENA_SIZE * 1.25, "#ffffff", 0.95, 18);
  addShockwave(ball.x, ball.y, ARENA_SIZE * 1.05, "#f4d35e", 0.8, 12);
  screenFlash = 0.55;
  screenShake = 0.75;
  playSound("bjdUlt");
  for (const target of balls) {
    if (target === ball || target.hp <= 0) continue;
    applyDamage(target, 30, { source: ball, fromUltimate: true });
    addStatus(target, "stun", 5);
    knockAway(target, ball, 720);
  }
  setTimeout(() => {
    ball.ultActive = false;
  }, 500);
}

function castLsjUltimate(ball) {
  ball.ultActive = true;
  ball.letters = [...LSJ_LETTERS];
  queueLsjLetters(ball, true);
  addShockwave(ball.x, ball.y, 260, "#8bd3ff", 0.85, 10);
  addShockwave(ball.x, ball.y, 180, "#ffffff", 0.8, 7);
  screenFlash = 0.38;
  screenShake = 0.35;
  playSound("letterUlt");
  setTimeout(() => {
    ball.ultActive = false;
  }, 850);
}

function setVelocityMagnitude(ball, speed) {
  const angle = Math.atan2(ball.vy, ball.vx);
  if (!Number.isFinite(angle)) return;
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

function updateStatuses(ball, dt) {
  for (const key of Object.keys(ball.status)) {
    ball.status[key] -= dt;
    if (ball.status[key] <= 0) delete ball.status[key];
  }
}

function addStatus(ball, type, duration) {
  ball.status[type] = Math.max(ball.status[type] || 0, duration);
  playSound(type === "stun" ? "stun" : "damage");
}

function canAct(ball) {
  return !ball.status.stun && !ball.status.sleep;
}

function canMove(ball) {
  return canAct(ball) && !ball.status.root;
}

function getSlowMultiplier(ball) {
  return ball.status.slow ? 0.5 : 1;
}

function applyDamageModifiers(source, target, amount) {
  let result = amount;
  if (source?.status?.weakened) result *= 0.67;
  if (target.status.vulnerable) result *= 1.5;
  return result;
}

function wakeOnDamage(target, hpDamage) {
  if (hpDamage > 0 && target.status.sleep) delete target.status.sleep;
}

function knockAway(target, source, force) {
  if (target.id === "lee" && target.ultActive) return;
  const angle = angleTo(source, target);
  target.vx += Math.cos(angle) * force;
  target.vy += Math.sin(angle) * force;
}

function bounceOnWalls(ball) {
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
    burst(ball.x, ball.y, ball.color, 8);
    playSound("wall");
  } else if (ball.x + ball.r > ARENA_SIZE) {
    ball.x = ARENA_SIZE - ball.r;
    ball.vx = -Math.abs(ball.vx);
    burst(ball.x, ball.y, ball.color, 8);
    playSound("wall");
  }

  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
    burst(ball.x, ball.y, ball.color, 8);
    playSound("wall");
  } else if (ball.y + ball.r > ARENA_SIZE) {
    ball.y = ARENA_SIZE - ball.r;
    ball.vy = -Math.abs(ball.vy);
    burst(ball.x, ball.y, ball.color, 8);
    playSound("wall");
  }
}

function checkWinner() {
  const alive = balls.filter((ball) => ball.hp > 0);
  if (alive.length === 2) return;
  state = "ended";
  stopBtn.textContent = "중단";
  countdownEl.classList.remove("hidden");
  countdownEl.textContent = alive.length === 1 ? `${alive[0].name} 승리` : "무승부";
}

function renderScoreboard() {
  scoreboard.innerHTML = "";
  balls.forEach((ball, index) => {
    const card = document.createElement("article");
    card.className = "fighter-card";
    card.innerHTML = `
      <div>
        <h2 style="color:${ball.color}">${ball.name}</h2>
        <p class="shield-label">SHIELD <span id="shield-${index}">${Math.ceil(ball.shield)}</span></p>
        <div class="shield-bar"><span id="shield-fill-${index}"></span></div>
        <p>HP <span id="hp-${index}">${Math.round(ball.hp)}</span> / ${ball.maxHp}</p>
      </div>
      <meter id="meter-${index}" min="0" max="${ball.maxHp}" value="${ball.hp}"></meter>
      <p>ULT <span id="ult-${index}">${Math.round(ball.ultCharge)}</span>%</p>
      <meter class="ult-meter" id="ult-meter-${index}" min="0" max="${ULT_MAX}" value="${ball.ultCharge}"></meter>
      <div class="stats-line">
        <span class="tag">속도 ${ball.speed}px/s</span>
        <span class="tag">${ball.id === "kim" ? "액티브" : "패시브"}</span>
      </div>
    `;
    scoreboard.appendChild(card);
  });
}

function syncHud() {
  balls.forEach((ball, index) => {
    document.getElementById(`hp-${index}`).textContent = Math.ceil(ball.hp);
    document.getElementById(`meter-${index}`).value = ball.hp;
    document.getElementById(`shield-${index}`).textContent = Math.ceil(ball.shield);
    document.getElementById(`shield-fill-${index}`).style.width = `${Math.min(100, (ball.shield / ball.maxHp) * 100)}%`;
    document.getElementById(`ult-${index}`).textContent = Math.round(ball.ultCharge);
    document.getElementById(`ult-meter-${index}`).value = ball.ultCharge;
  });
}

function draw() {
  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake * 26 : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake * 26 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawArena();
  for (const ball of balls) {
    if (ball.id === "lee" && ball.ultActive) drawLeeUltimateField(ball);
  }
  for (const ball of balls) {
    if (ball.id === "lee" && !ball.ultActive) drawAura(ball);
  }
  for (const shockwave of shockwaves) drawShockwave(shockwave);
  for (const projectile of projectiles) drawProjectile(projectile);
  for (const particle of particles) drawParticle(particle);
  for (const ball of balls) drawBall(ball);
  for (const text of damageTexts) drawDamageText(text);
  ctx.restore();

  if (screenFlash > 0) {
    ctx.globalAlpha = Math.min(0.45, screenFlash);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
    ctx.globalAlpha = 1;
  }
}

function drawArena() {
  ctx.fillStyle = "#151922";
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let line = 60; line < ARENA_SIZE; line += 60) {
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, ARENA_SIZE);
    ctx.moveTo(0, line);
    ctx.lineTo(ARENA_SIZE, line);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, ARENA_SIZE - 6, ARENA_SIZE - 6);
}

function drawLeeUltimateField(ball) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ff2f2f";
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r + 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAura(ball) {
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = ball.color;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.auraRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.48;
  ctx.strokeStyle = ball.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.auraRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ball) {
  const kimUltimate = ball.id === "kim" && ball.ultPrimed;
  const kimSkill = ball.id === "kim" && (ball.empowered || ball.drinkFlash > 0);
  ctx.save();
  ctx.shadowColor = kimUltimate ? "#ff2f2f" : kimSkill ? "#b56cff" : ball.color;
  ctx.shadowBlur = kimUltimate ? 44 : kimSkill ? 34 : 20;
  ctx.fillStyle = kimUltimate ? "#ff2f2f" : kimSkill ? "#b56cff" : ball.color;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawBallImage(ball);

  drawSkillRing(ball);
  drawOrbitingLetters(ball);
  drawStatusLabels(ball);

  if (state === "countdown") drawNeedle(ball);
}

function drawStatusLabels(ball) {
  const labels = [];
  if (ball.status.stun) labels.push("기절!");
  if (ball.status.vulnerable) labels.push("취약!");
  if (ball.status.weakened) labels.push("약화!");
  if (ball.status.root) labels.push("속박!");
  if (ball.status.slow) labels.push("둔화!");
  if (ball.status.sleep) labels.push("수면!");
  if (!labels.length) return;

  ctx.save();
  ctx.font = "900 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  labels.forEach((label, index) => {
    const y = ball.y - ball.r - 24 - index * 20;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#101216";
    ctx.strokeText(label, ball.x, y);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(label, ball.x, y);
  });
  ctx.restore();
}

function drawOrbitingLetters(ball) {
  if (ball.id !== "lsj" || !ball.letters.length) return;
  ctx.save();
  ctx.font = "900 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ball.letters.forEach((letter, index) => {
    const angle = performance.now() / 450 + (Math.PI * 2 * index) / LSJ_LETTERS.length;
    const x = ball.x + Math.cos(angle) * (ball.r + 26);
    const y = ball.y + Math.sin(angle) * (ball.r + 26);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1e6aa0";
    ctx.lineWidth = 4;
    ctx.strokeText(letter, x, y);
    ctx.fillText(letter, x, y);
  });
  ctx.restore();
}

function drawBallImage(ball) {
  const image = fighterImages[ball.id];
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r - 3, 0, Math.PI * 2);
  ctx.clip();

  if (image && image.complete && image.naturalWidth > 0) {
    const side = (ball.r - 3) * 2;
    ctx.drawImage(image, ball.x - side / 2, ball.y - side / 2, side, side);
  } else {
    ctx.fillStyle = ball.color;
    ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
    ctx.fillStyle = "#101318";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ball.name, ball.x, ball.y);
  }

  if (ball.id === "kim" && ball.ultPrimed) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255, 47, 47, 0.58)";
    ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
  } else if (ball.id === "kim" && (ball.empowered || ball.drinkFlash > 0)) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(181, 108, 255, 0.48)";
    ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
  }

  ctx.restore();
}

function drawSkillRing(ball) {
  let progress = 1;
  if (ball.id === "kim") progress = ball.skillTimer / KIM_SKILL_COOLDOWN;
  if (ball.id === "bjd") progress = ball.skillTimer / BJD_SKILL_COOLDOWN;
  if (ball.id === "lsj") progress = ball.letters.length / LSJ_LETTERS.length;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r + 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    ball.r + 8,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * clamp(progress, 0, 1),
  );
  ctx.stroke();
}

function drawNeedle(ball) {
  const tipX = ball.x + Math.cos(ball.needleAngle) * (ball.r + 34);
  const tipY = ball.y + Math.sin(ball.needleAngle) * (ball.r + 34);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
  ctx.fill();
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    particle.r *= 0.97;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function addDamageText(target, amount, type) {
  const value = Math.max(1, Math.round(amount));
  let size = 20;
  if (value >= 20) size += 4;
  if (value >= 60) size += 3;
  if (value >= 100) size += 16;
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
  const speed = 42 + Math.random() * 24;
  damageTexts.push({
    x: target.x + (Math.random() - 0.5) * target.r * 0.9,
    y: target.y - target.r * 0.55 + (Math.random() - 0.5) * 12,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    value,
    type,
    life: 0.72,
    maxLife: 0.72,
    size,
  });

  if (damageTexts.length > 28) damageTexts.splice(0, damageTexts.length - 28);
}

function flushDamageTextQueues() {
  for (const ball of balls) {
    flushDamageText(ball, "damage");
    flushDamageText(ball, "heal");
  }
}

function flushDamageText(ball, type) {
  const value = ball.pendingDamageText[type];
  if (value < 1) return;
  const shown = Math.floor(value);
  ball.pendingDamageText[type] -= shown;
  addDamageText(ball, shown, type);
  playSound("damage");
}

function updateDamageTexts(dt) {
  for (const text of damageTexts) {
    text.x += text.vx * dt;
    text.y += text.vy * dt;
    text.vy += 42 * dt;
    text.life -= dt;
  }
  damageTexts = damageTexts.filter((text) => text.life > 0);
}

function drawDamageText(text) {
  const t = clamp(text.life / text.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 1.35);
  ctx.font = `900 ${text.size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = text.type === "heal" ? `+${text.value}` : `-${text.value}`;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(16, 18, 22, 0.9)";
  ctx.fillStyle = text.type === "heal" ? "#69de93" : "#fffbf2";
  ctx.strokeText(label, text.x, text.y);
  ctx.fillText(label, text.x, text.y);
  ctx.restore();
}

function updateShockwaves(dt) {
  for (const shockwave of shockwaves) {
    shockwave.age += dt;
  }
  shockwaves = shockwaves.filter((shockwave) => shockwave.age < shockwave.life);
}

function addShockwave(x, y, radius, color, life, width) {
  shockwaves.push({ x, y, radius, color, life, width, age: 0 });
}

function drawShockwave(shockwave) {
  const t = clamp(shockwave.age / shockwave.life, 0, 1);
  ctx.save();
  ctx.shadowColor = shockwave.color;
  ctx.shadowBlur = shockwave.width * 2.2;
  ctx.globalAlpha = (1 - t) * 0.85;
  ctx.strokeStyle = shockwave.color;
  ctx.lineWidth = shockwave.width * (1 - t * 0.4);
  ctx.beginPath();
  ctx.arc(shockwave.x, shockwave.y, shockwave.radius * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = (1 - t) * 0.18;
  ctx.fillStyle = shockwave.color;
  ctx.beginPath();
  ctx.arc(shockwave.x, shockwave.y, shockwave.radius * t, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawProjectile(projectile) {
  ctx.save();
  if (projectile.trail.length > 1) {
    ctx.lineCap = "round";
    for (let i = 1; i < projectile.trail.length; i += 1) {
      const a = projectile.trail[i - 1];
      const b = projectile.trail[i];
      ctx.globalAlpha = (i / projectile.trail.length) * (projectile.homing ? 0.65 : 0.85);
      ctx.strokeStyle = projectile.homing ? "#ff4d4d" : "#8bd3ff";
      ctx.lineWidth = projectile.homing ? 8 : 6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.font = `${projectile.homing ? 900 : 800} ${projectile.homing ? 28 : 22}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = projectile.homing ? 6 : 4;
  ctx.strokeStyle = projectile.homing ? "#ff2f2f" : "#12364c";
  ctx.fillStyle = projectile.color;
  ctx.shadowColor = projectile.color;
  ctx.shadowBlur = projectile.homing ? 22 : 10;
  ctx.strokeText(projectile.letter, projectile.x, projectile.y);
  ctx.fillText(projectile.letter, projectile.x, projectile.y);
  ctx.restore();
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) addParticle(x, y, color, 3 + Math.random() * 5);
}

function addParticle(x, y, color, r) {
  const angle = randomAngle();
  const speed = 70 + Math.random() * 210;
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r,
    color,
    life: 0.24 + Math.random() * 0.42,
  });
}

function drawParticle(particle) {
  ctx.globalAlpha = clamp(particle.life * 2.5, 0, 1);
  ctx.fillStyle = particle.color;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function nearestEnemy(ball) {
  let best = null;
  let bestDistance = Infinity;
  for (const target of balls) {
    if (target === ball || target.hp <= 0) continue;
    const d = distance(ball, target);
    if (d < bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  return best;
}

function setSimSpeed(speed) {
  simSpeed = speed;
  speedButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === speed);
  });
}

goSelectBtn.addEventListener("click", () => {
  renderCharacterSelect();
  showScreen("select");
});
backHomeBtn.addEventListener("click", () => showScreen("home"));
launchBtn.addEventListener("click", startMatch);
muteBtn.addEventListener("click", toggleMute);
stopBtn.addEventListener("click", stopMatch);
restartBtn.addEventListener("click", startMatch);
speedButtons.forEach((button) => {
  button.addEventListener("click", () => setSimSpeed(Number(button.dataset.speed)));
});
resetBtn.addEventListener("click", () => {
  stopAnimation();
  renderCharacterSelect();
  showScreen("select");
});

renderCharacterSelect();
showScreen("home");
