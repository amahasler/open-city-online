'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const players = new Map();
const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/client.html' : req.url.split('?')[0];
  const file = path.resolve(ROOT, '.' + url);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 2048 });
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : 0));
function snapshot() {
  const list = [...players.values()].map(p => ({ id:p.id, name:p.name, pos:p.pos, yaw:p.yaw, inCar:p.inCar, health:p.health, wanted:p.wanted }));
  const data = JSON.stringify({ type:'snapshot', players:list });
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}
wss.on('connection', (ws) => {
  if (players.size >= 32) { ws.close(1013, 'Server full (32 players)'); return; }
  const id = Math.random().toString(36).slice(2, 10);
  const p = { id, name:'Игрок', pos:[0,0,0], yaw:0, inCar:false, health:100, wanted:0, ws };
  players.set(id, p);
  ws.send(JSON.stringify({ type:'welcome', id, maxPlayers:32 }));
  snapshot();
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'join') { p.name = String(m.name || 'Игрок').replace(/[<>\x00-\x1f]/g,'').slice(0,20) || 'Игрок'; return; }
    if (m.type !== 'state' || !Array.isArray(m.pos) || m.pos.length !== 3) return;
    p.pos = m.pos.map(v => clamp(Number(v), -100, 100));
    p.yaw = clamp(Number(m.yaw), -1000, 1000);
    p.inCar = !!m.inCar;
    p.health = clamp(Number(m.health), 0, 100);
    p.wanted = clamp(Number(m.wanted), 0, 5);
  });
  ws.on('close', () => { players.delete(id); snapshot(); });
  ws.on('error', () => { players.delete(id); snapshot(); });
});
setInterval(snapshot, 100); // 10 snapshots/sec; client sends state at 20/sec
server.listen(PORT, '0.0.0.0', () => console.log(`Open City public server listening on http://0.0.0.0:${PORT} (32 slots)`));
