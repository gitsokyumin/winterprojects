// server.js
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

/** ----- 좌석/지그재그 유틸 ----- **/
const ROWS = 5, COLS = 6;
// 금지 좌석: (5,5),(5,6) -> 0-index로 (4,4),(4,5)
const isForbidden = (r, c) => (r === 4 && (c === 4 || c === 5));
const seatIndex = (r, c) => r * COLS + c;

// 지그재그(serpentine) 좌석 순회(왼→오, 다음줄 오→왼 번갈아)
// 금지 좌석 제외
function serpentineOrder() {
  const order = [];
  for (let r = 0; r < ROWS; r++) {
    const cols = [...Array(COLS).keys()];
    const line = (r % 2 === 0) ? cols : cols.reverse();
    for (const c of line) {
      if (!isForbidden(r, c)) order.push(seatIndex(r, c));
    }
  }
  return order; // 길이 28
}
const ALLOWED_SEATS = new Set(serpentineOrder());

/** ----- 룸 상태 ----- **/
/*
room = {
  code,
  hostId,
  phase: 'lobby' | 'a-draw' | 'b-pick' | 'done',
  players: { socketId: { name, group: 'A'|'B' } },
  orderA: [socketId...],
  orderB: [socketId...],
  turnIndex: 0,
  seats: {
    [seatIndex]: {
      taken: true,
      by: socketId|null,
      name: string|null,
      group: 'A'|'B'|null,
      drawing: dataURL|null
    }
  }
}
*/
const rooms = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function shuffle(arr) {
  return arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
}

/** ----- 소켓 이벤트 ----- **/
io.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('createRoom', ({ names }) => {
    const code = makeRoomCode();
    const room = {
      code,
      hostId: socket.id,
      phase: 'lobby',
      players: {}, orderA: [], orderB: [], turnIndex: 0,
      seats: {}
    };
    for (let i = 0; i < ROWS * COLS; i++) {
      room.seats[i] = {
        taken: isForbidden(Math.floor(i / COLS), i % COLS),
        by: null, name: null, group: null, drawing: null
      };
    }
    rooms.set(code, room);
    socket.join(code);
    joinedRoom = code;
    io.to(socket.id).emit('roomCreated', { code });
    if (names && names.length) {
      // 초기 명단을 반쯤 A/B로 나눔
      const shuffled = shuffle(names);
      const mid = Math.floor(shuffled.length / 2);
      const A = new Set(shuffled.slice(0, mid));
      io.to(code).emit('preAssigned', { A: [...A], B: shuffled.slice(mid) });
    }
  });

  socket.on('joinRoom', ({ code, name, preferredGroup }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit('errorMsg', '방이 존재하지 않습니다.');
    socket.join(code);
    joinedRoom = code;

    // 그룹 자동 배정(들어오는 순서 기반 밸런싱) 혹은 희망 반영
    const counts = {
      A: Object.values(room.players).filter(p=>p.group==='A').length,
      B: Object.values(room.players).filter(p=>p.group==='B').length
    };
    let group = preferredGroup || (counts.A <= counts.B ? 'A' : 'B');

    room.players[socket.id] = { name, group };
    io.to(code).emit('lobbyUpdate', {
      players: Object.entries(room.players).map(([id,p])=>({id, ...p})),
      hostId: room.hostId
    });
  });

  socket.on('hostStartA', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    room.phase = 'a-draw';
    room.turnIndex = 0;
    // A만 추출 → 랜덤 순서
    const aIds = Object.entries(room.players).filter(([_,p])=>p.group==='A').map(([id])=>id);
    room.orderA = shuffle(aIds);
    io.to(code).emit('phaseChange', { phase: room.phase });
    io.to(code).emit('turnUpdate', {
      group: 'A', order: room.orderA.map(id=>({id, name:room.players[id]?.name})),
      turnIndex: room.turnIndex
    });
  });

  // A가 좌석을 클릭하면 캔버스 dataURL을 제출
  socket.on('aSubmitSeat', ({ code, seat, drawing }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'a-draw') return;
    const currentId = room.orderA[room.turnIndex];
    if (socket.id !== currentId) return; // 본인 차례만
    if (!ALLOWED_SEATS.has(seat)) return;
    const s = room.seats[seat];
    if (s.taken) return;

    const player = room.players[socket.id];
    s.taken = true;
    s.by = socket.id;
    s.name = player.name;
    s.group = 'A';
    s.drawing = drawing || null;

    io.to(code).emit('seatUpdate', { seat, data: s });

    // 다음 차례
    room.turnIndex++;
    if (room.turnIndex >= room.orderA.length) {
      // B 단계로 전환
      room.phase = 'b-pick';
      room.turnIndex = 0;
      const bIds = Object.entries(room.players).filter(([_,p])=>p.group==='B').map(([id])=>id);
      room.orderB = shuffle(bIds);
      io.to(code).emit('phaseChange', { phase: room.phase });
      io.to(code).emit('turnUpdate', {
        group: 'B', order: room.orderB.map(id=>({id, name:room.players[id]?.name})),
        turnIndex: room.turnIndex
      });
    } else {
      io.to(code).emit('turnUpdate', {
        group: 'A',
        order: room.orderA.map(id=>({id, name:room.players[id]?.name})),
        turnIndex: room.turnIndex
      });
    }
  });

  // B가 좌석 선택(그림 없음)
  socket.on('bPickSeat', ({ code, seat }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'b-pick') return;
    const currentId = room.orderB[room.turnIndex];
    if (socket.id !== currentId) return;
    const s = room.seats[seat];
    if (!s || s.taken) return;

    const player = room.players[socket.id];
    s.taken = true;
    s.by = socket.id;
    s.name = player.name;
    s.group = 'B';
    s.drawing = null;

    io.to(code).emit('seatUpdate', { seat, data: s });

    // 다음 차례
    room.turnIndex++;
    if (room.turnIndex >= room.orderB.length) {
      room.phase = 'done';
      io.to(code).emit('phaseChange', { phase: room.phase });
      io.to(code).emit('finalBoard', { seats: room.seats });
    } else {
      io.to(code).emit('turnUpdate', {
        group: 'B',
        order: room.orderB.map(id=>({id, name:room.players[id]?.name})),
        turnIndex: room.turnIndex
      });
    }
  });

  socket.on('getState', ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    io.to(socket.id).emit('stateSnapshot', {
      code: room.code, phase: room.phase, hostId: room.hostId,
      players: Object.entries(room.players).map(([id,p])=>({id, ...p})),
      seats: room.seats,
    });
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    delete room.players[socket.id];

    // 호스트가 나가면 방 유지(간단), 필요시 host 재지정 가능
    io.to(joinedRoom).emit('lobbyUpdate', {
      players: Object.entries(room.players).map(([id,p])=>({id, ...p})),
      hostId: room.hostId
    });
  });
});

httpServer.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));