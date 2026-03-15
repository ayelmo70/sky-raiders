# ✈ Sky Raiders — Multiplayer Aerial Combat Game

A real-time multiplayer browser game built with **Node.js**, **Socket.io**, and **HTML5 Canvas**.

---

## Quick Start

### 1. Install dependencies
```bash
cd sky-raiders
npm install
```

### 2. Start the server
```bash
npm start
```

### 3. Open in browser
```
http://localhost:3000
```

To play multiplayer, share your local IP (e.g. `http://192.168.1.x:3000`) with others on the same network, or deploy to a cloud server.

---

## Controls

| Key | Action |
|-----|--------|
| W | Accelerate forward |
| S | Brake / reverse |
| A | Strafe left |
| D | Strafe right |
| Shift | Speed boost |
| Mouse | Aim |
| Left Click | Shoot |

---

## Features

- **Real-time multiplayer** via Socket.io (60Hz server tick)
- **Full 4000×4000 map** with camera tracking
- **Floating islands** as decorative obstacles
- **Drifting clouds** that partially conceal players
- **3 power-ups**: Speed Boost, Double Damage, Shield
- **Weapon cooldown** system (6 shots/second)
- **Health system** with respawn after 3 seconds
- **Particle explosions** with fire, smoke, and sparks
- **Contrail effects** behind planes
- **Screen shake** on explosions
- **Minimap** with island layout and player dots
- **Live leaderboard** (top 10 by kills)
- **Chat log** for kill announcements
- **Active buff indicators** (HUD)
- **Colorful planes** with cockpit, wings, tail fins

---

## File Structure

```
sky-raiders/
├── server.js          # Node.js + Socket.io server (game logic)
├── package.json
└── public/
    └── index.html     # Client: lobby + Canvas renderer + input handling
```

---

## Deployment (e.g. Railway, Render, Fly.io)

Set the `PORT` environment variable — the server reads `process.env.PORT || 3000`.

The static `public/` folder is served by Express automatically.
