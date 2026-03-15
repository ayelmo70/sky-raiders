/**
 * SKY RAIDERS - Server
 * Node.js + Socket.io multiplayer server
 * Handles: player sync, collisions, bullets, power-ups, health, scoring
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

// ─── Game Constants ───────────────────────────────────────────────────────────
const MAP_W = 4000;
const MAP_H = 4000;
const TICK_RATE = 60;          // Server updates per second
const BULLET_SPEED = 12;
const BULLET_RADIUS = 6;
const PLANE_RADIUS = 24;
const BASE_SPEED = 4;
const BOOST_SPEED = 7.5;
const MAX_HEALTH = 100;
const BULLET_DAMAGE = 10;
const RESPAWN_DELAY = 3000;    // ms
const POWERUP_COUNT = 12;
const POWERUP_SPAWN_INTERVAL = 8000; // ms
const POWERUP_RADIUS = 20;

// ─── World State ─────────────────────────────────────────────────────────────
const players = {};   // socket.id → player object
const bullets = [];   // active bullets
const powerups = [];  // active power-ups on map
const islands = generateIslands();
const clouds = generateClouds();

let bulletIdCounter = 0;
let powerupIdCounter = 0;

// ─── Island Generation ────────────────────────────────────────────────────────
function generateIslands() {
  const list = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    list.push({
      x: 300 + Math.random() * (MAP_W - 600),
      y: 300 + Math.random() * (MAP_H - 600),
      rx: 60 + Math.random() * 100,
      ry: 30 + Math.random() * 60,
      color: `hsl(${100 + Math.random() * 60}, ${50 + Math.random() * 30}%, ${30 + Math.random() * 20}%)`
    });
  }
  return list;
}

// ─── Cloud Generation ─────────────────────────────────────────────────────────
function generateClouds() {
  const list = [];
  for (let i = 0; i < 40; i++) {
    list.push({
      x: Math.random() * MAP_W,
      y: Math.random() * MAP_H,
      w: 120 + Math.random() * 200,
      h: 60 + Math.random() * 80,
      speed: 0.15 + Math.random() * 0.25,
      alpha: 0.5 + Math.random() * 0.4
    });
  }
  return list;
}

// ─── Power-up Spawning ────────────────────────────────────────────────────────
const POWERUP_TYPES = ['speed', 'double_damage', 'shield'];

function spawnPowerup() {
  if (powerups.length >= POWERUP_COUNT) return;
  powerups.push({
    id: powerupIdCounter++,
    type: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)],
    x: 200 + Math.random() * (MAP_W - 400),
    y: 200 + Math.random() * (MAP_H - 400),
  });
}

// Spawn initial power-ups
for (let i = 0; i < 8; i++) spawnPowerup();

// Keep spawning over time
setInterval(spawnPowerup, POWERUP_SPAWN_INTERVAL);

// ─── Player Factory ───────────────────────────────────────────────────────────
function createPlayer(id, nickname) {
  return {
    id,
    nickname,
    x: 400 + Math.random() * (MAP_W - 800),
    y: 400 + Math.random() * (MAP_H - 800),
    angle: Math.random() * Math.PI * 2,
    vx: 0,
    vy: 0,
    health: MAX_HEALTH,
    alive: true,
    kills: 0,
    deaths: 0,
    color: randomColor(),
    // Input state sent from client
    input: { up: false, down: false, left: false, right: false, boost: false, mouseAngle: 0 },
    // Active power-up buffs
    buffs: {
      speed: 0,         // remaining ms
      double_damage: 0,
      shield: 0,
    },
    shootCooldown: 0,   // ticks remaining
    respawnTimer: 0,
  };
}

function randomColor() {
  const colors = ['#FF4757','#2ED573','#1E90FF','#FFA502','#FF6B81','#7BED9F','#70A1FF','#ECCC68','#FF6348','#5352ED'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ─── Socket.io Connection ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Client sends their nickname on join
  socket.on('join', (nickname) => {
    const player = createPlayer(socket.id, nickname || 'Pilot');
    players[socket.id] = player;

    // Send this player the current world state
    socket.emit('init', {
      selfId: socket.id,
      islands,
      clouds,
      mapW: MAP_W,
      mapH: MAP_H,
    });

    console.log(`${player.nickname} joined`);
    io.emit('chat', `✈ ${player.nickname} joined the battle!`);
  });

  // Receive client input each frame
  socket.on('input', (input) => {
    if (players[socket.id]) {
      players[socket.id].input = input;
    }
  });

  // Client fires a bullet
  socket.on('shoot', (angle) => {
    const p = players[socket.id];
    if (!p || !p.alive || p.shootCooldown > 0) return;

    const damage = p.buffs.double_damage > 0 ? BULLET_DAMAGE * 2 : BULLET_DAMAGE;
    bullets.push({
      id: bulletIdCounter++,
      ownerId: socket.id,
      x: p.x + Math.cos(angle) * 30,
      y: p.y + Math.sin(angle) * 30,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      damage,
      life: 120, // ticks before despawn
    });

    // Weapon cooldown: 10 ticks (~6 shots/sec at 60Hz)
    p.shootCooldown = 10;
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p) {
      io.emit('chat', `✈ ${p.nickname} left`);
      delete players[socket.id];
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// ─── Server Game Loop ─────────────────────────────────────────────────────────
const DT = 1000 / TICK_RATE;

setInterval(() => {
  const now = Date.now();

  // ── Update Players ──
  for (const id in players) {
    const p = players[id];

    // Respawn logic
    if (!p.alive) {
      p.respawnTimer -= DT;
      if (p.respawnTimer <= 0) {
        p.alive = true;
        p.health = MAX_HEALTH;
        p.x = 400 + Math.random() * (MAP_W - 800);
        p.y = 400 + Math.random() * (MAP_H - 800);
        p.buffs = { speed: 0, double_damage: 0, shield: 0 };
      }
      continue;
    }

    const { input } = p;
    const speed = (p.buffs.speed > 0 || input.boost) ? BOOST_SPEED : BASE_SPEED;

    // Movement using WASD relative to plane angle (mouse-aimed)
    const angle = input.mouseAngle;
    if (input.up) {
      p.vx += Math.cos(angle) * 0.4;
      p.vy += Math.sin(angle) * 0.4;
    }
    if (input.down) {
      p.vx -= Math.cos(angle) * 0.25;
      p.vy -= Math.sin(angle) * 0.25;
    }
    if (input.left) {
      p.vx += Math.cos(angle - Math.PI / 2) * 0.3;
      p.vy += Math.sin(angle - Math.PI / 2) * 0.3;
    }
    if (input.right) {
      p.vx += Math.cos(angle + Math.PI / 2) * 0.3;
      p.vy += Math.sin(angle + Math.PI / 2) * 0.3;
    }

    // Cap speed
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > speed) {
      p.vx = (p.vx / spd) * speed;
      p.vy = (p.vy / spd) * speed;
    }

    // Dampen
    p.vx *= 0.88;
    p.vy *= 0.88;

    // Apply
    p.x += p.vx;
    p.y += p.vy;

    // Clamp to map
    p.x = Math.max(PLANE_RADIUS, Math.min(MAP_W - PLANE_RADIUS, p.x));
    p.y = Math.max(PLANE_RADIUS, Math.min(MAP_H - PLANE_RADIUS, p.y));

    // Update angle to face mouse direction
    if (spd > 0.1) {
      p.angle = Math.atan2(p.vy, p.vx);
    }

    // Countdown buffs
    for (const b in p.buffs) {
      if (p.buffs[b] > 0) p.buffs[b] -= DT;
    }

    // Cooldown
    if (p.shootCooldown > 0) p.shootCooldown--;
  }

  // ── Update Bullets ──
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    // Out of bounds or expired
    if (b.life <= 0 || b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) {
      bullets.splice(i, 1);
      continue;
    }

    // Check collision with players
    let hit = false;
    for (const id in players) {
      if (id === b.ownerId) continue;
      const p = players[id];
      if (!p.alive) continue;

      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PLANE_RADIUS + BULLET_RADIUS) {
        // Shield absorbs damage
        if (p.buffs.shield > 0) {
          // Shield blocks hit
          io.emit('shieldHit', { x: p.x, y: p.y });
        } else {
          p.health -= b.damage;
          io.emit('bulletHit', { x: p.x, y: p.y, damage: b.damage });

          if (p.health <= 0) {
            // Player destroyed
            p.alive = false;
            p.health = 0;
            p.deaths++;
            p.respawnTimer = RESPAWN_DELAY;

            // Award kill to shooter
            const shooter = players[b.ownerId];
            if (shooter) {
              shooter.kills++;
              io.emit('chat', `💥 ${shooter.nickname} downed ${p.nickname}!`);
            }

            io.emit('explosion', { x: p.x, y: p.y });
          }
        }

        hit = true;
        break;
      }
    }

    if (hit) bullets.splice(i, 1);
  }

  // ── Update Clouds (drift) ──
  for (const c of clouds) {
    c.x += c.speed;
    if (c.x > MAP_W + c.w) c.x = -c.w;
  }

  // ── Power-up Collection ──
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      const dx = p.x - pu.x;
      const dy = p.y - pu.y;
      if (Math.sqrt(dx * dx + dy * dy) < PLANE_RADIUS + POWERUP_RADIUS) {
        // Apply buff
        const BUFF_DURATION = 8000; // 8 seconds
        if (pu.type === 'speed') p.buffs.speed = BUFF_DURATION;
        if (pu.type === 'double_damage') p.buffs.double_damage = BUFF_DURATION;
        if (pu.type === 'shield') p.buffs.shield = BUFF_DURATION;

        io.emit('powerupCollected', { id: pu.id, playerId: id, type: pu.type });
        io.emit('chat', `⚡ ${p.nickname} picked up ${pu.type.replace('_', ' ')}!`);
        powerups.splice(i, 1);
        break;
      }
    }
  }

  // ── Broadcast State ──
  // Build leaderboard
  const leaderboard = Object.values(players)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10)
    .map(p => ({ nickname: p.nickname, kills: p.kills, deaths: p.deaths, color: p.color }));

  io.emit('state', {
    players: Object.values(players).map(p => ({
      id: p.id,
      nickname: p.nickname,
      x: p.x,
      y: p.y,
      angle: p.angle,
      health: p.health,
      alive: p.alive,
      color: p.color,
      kills: p.kills,
      buffs: p.buffs,
      respawnTimer: p.respawnTimer,
    })),
    bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, ownerId: b.ownerId })),
    powerups: powerups.map(pu => ({ id: pu.id, type: pu.type, x: pu.x, y: pu.y })),
    clouds: clouds.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, alpha: c.alpha })),
    leaderboard,
  });

}, DT);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🛩  Sky Raiders server running on http://localhost:${PORT}`);
});
