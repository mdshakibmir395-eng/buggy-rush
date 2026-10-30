const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;

const srv = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(d);
  });
});
const wss = new WebSocketServer({ server: srv });

const P = new Map();
let nid = 1, host = null, state = 'lobby', map = 0;
const send = (w, m) => w.readyState === 1 && w.send(JSON.stringify(m));
const all = m => P.forEach(p => send(p.ws, m));
const lobby = () => all({
  t: 'lobby', host, map, state,
  players: [...P.values()].map(p => ({ id: p.id, name: p.name, ch: p.ch }))
});

wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      if (me) return;
      if (state !== 'lobby' || P.size >= 6) {
        send(ws, { t: 'err', msg: state !== 'lobby' ? 'Race in progress. Try again after it ends.' : 'Room is full (6 players).' });
        return;
      }
      me = { id: nid++, ws, name: String(m.name || 'Racer').slice(0, 12), ch: (m.ch | 0) % 4, s: null };
      P.set(me.id, me);
      if (!host) host = me.id;
      send(ws, { t: 'welcome', id: me.id });
      lobby();
      return;
    }
    if (!me) return;
    if (m.t === 'ch') { me.ch = (m.ch | 0) % 4; lobby(); }
    else if (m.t === 'map' && me.id === host && state === 'lobby') { map = Math.max(0, Math.min(1, m.map | 0)); lobby(); }
    else if (m.t === 'start' && me.id === host && state === 'lobby') {
      state = 'race';
      P.forEach(p => p.s = null);
      lobby();
      all({ t: 'go', map, order: [...P.keys()] });
    }
    else if (m.t === 'reset' && me.id === host) { state = 'lobby'; lobby(); }
    else if (m.t === 's' && m.s) me.s = m.s;
  });
  ws.on('close', () => {
    if (!me) return;
    P.delete(me.id);
    if (host === me.id) host = P.size ? P.keys().next().value : null;
    if (!P.size) state = 'lobby';
    lobby();
  });
});

setInterval(() => {
  if (state === 'race') all({ t: 'snap', s: [...P.values()].filter(p => p.s).map(p => ({ id: p.id, ...p.s })) });
}, 50);

srv.listen(PORT, () => console.log('Buggy Rush running: http://localhost:' + PORT));
