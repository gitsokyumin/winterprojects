const socket = io();

const ROWS = 5, COLS = 6;
const forbidden = (r,c) => (r===4 && (c===4 || c===5));
const gridEl = document.getElementById('grid');

let roomCode = null;
let me = { id: null, name: null, group: null };
let phase = 'lobby';
let currentTurnOrder = [];
let currentTurnIndex = 0;
let myTurn = false;
let selectedSeatIndex = null; // A그룹: 그릴 좌석

// ------------- UI 엘리먼트 -------------
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');

document.getElementById('btnCreate').onclick = () => {
  const names = document.getElementById('names').value
    .split('\n').map(s=>s.trim()).filter(Boolean);
  socket.emit('createRoom', { names });
};
document.getElementById('btnJoin').onclick = () => {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const name = document.getElementById('myName').value.trim();
  const preferredGroup = document.getElementById('prefGroup').value || null;
  if (!code || !name) return alert('방 코드와 이름을 입력하세요.');
  roomCode = code; me.name = name;
  socket.emit('joinRoom', { code, name, preferredGroup });
  // 내 id는 연결된 소켓 id가 됨 → 서버 스냅샷에서 확인
  socket.emit('getState', { code });
};

document.getElementById('btnStartA').onclick = () => {
  socket.emit('hostStartA', { code: roomCode });
};

// 캔버스 모달
const modal = document.getElementById('modal');
const canvas = document.getElementById('draw');
const ctx = canvas.getContext('2d');
let drawing = false, last = null;

function openModal() { modal.style.display = 'flex'; }
function closeModal() { modal.style.display = 'none'; ctx.clearRect(0,0,canvas.width,canvas.height); }

canvas.addEventListener('pointerdown', e => { drawing = true; last = getPos(e); });
canvas.addEventListener('pointerup', ()=> drawing = false);
canvas.addEventListener('pointerleave', ()=> drawing = false);
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  const pos = getPos(e);
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  last = pos;
});
function getPos(e){
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
document.getElementById('clear').onclick = () => ctx.clearRect(0,0,300,300);
document.getElementById('cancel').onclick = closeModal;
document.getElementById('submit').onclick = () => {
  if (selectedSeatIndex == null) return;
  const dataURL = canvas.toDataURL('image/png');
  socket.emit('aSubmitSeat', { code: roomCode, seat: selectedSeatIndex, drawing: dataURL });
  closeModal();
};

// 보드 캡처(간단: HTML2Canvas 없이 <canvas>로 그린 이미지만 따로 저장했을 때 유용)
// 실제 전체 보드 캡처는 html2canvas 같은 라이브러리를 추가해 사용하세요.
document.getElementById('btnCapture').onclick = () => {
  alert('보드 캡처는 html2canvas를 추가해 구현하세요.\n(MVP에는 포함하지 않았습니다)');
};

// ------------- 좌석판 렌더 -------------
function buildGrid(seats = {}) {
  gridEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const div = document.createElement('div');
      div.className = 'seat';
      if (forbidden(r,c)) div.classList.add('forbidden');

      const seatData = seats[idx];
      if (seatData && seatData.taken) div.classList.add('taken');

      // 클릭 로직
      div.onclick = () => {
        if (forbidden(r,c)) return;
        if (seatData && seatData.taken) return;

        // A 단계: 내 차례일 때만, 허용 좌석이면 캔버스 모달
        if (phase === 'a-draw' && myTurn) {
          selectedSeatIndex = idx;
          openModal();
        }

        // B 단계: 내 차례면 즉시 선택
        if (phase === 'b-pick' && myTurn) {
          socket.emit('bPickSeat', { code: roomCode, seat: idx });
        }
      };

      // 썸네일/라벨
      if (seatData && seatData.drawing) {
        const img = new Image(); img.src = seatData.drawing;
        div.appendChild(img);
      }
      const label = document.createElement('div');
      label.className = 'label';
      if (seatData && seatData.taken) {
        label.textContent = seatData.group === 'A' ? '🎨 A' : `${seatData.name}`;
      } else {
        label.textContent = '';
      }
      div.appendChild(label);

      gridEl.appendChild(div);
    }
  }
}

// ------------- 소켓 수신 핸들러 -------------
socket.on('roomCreated', ({ code }) => {
  roomCode = code;
  document.getElementById('roomCode').textContent = code;
  document.getElementById('roomInfo').style.display = 'block';
  alert(`방이 생성되었습니다: ${code}`);
});

socket.on('preAssigned', ({ A, B }) => {
  // 단순 안내용(실제 배정은 join 시점에 다시 이루어짐)
  console.log('추천 그룹 분배', A, B);
});

socket.on('lobbyUpdate', ({ players, hostId }) => {
  const box = document.getElementById('playerList');
  box.innerHTML = `<b>참가자(${players.length})</b><br>` +
    players.map(p => `${p.name} <small>(${p.group})</small>`).join(' · ');
  // 내가 호스트인지 체크
  const startBtn = document.getElementById('btnStartA');
  if (socket.id === hostId) startBtn.style.display = 'inline-block';
  else startBtn.style.display = 'none';
});

socket.on('stateSnapshot', (snap) => {
  // 내가 합류하면 나의 그룹/이름 반영
  roomCode = snap.code;
  const meEntry = snap.players.find(p => p.id === socket.id);
  if (meEntry) {
    me.id = meEntry.id; me.name = meEntry.name; me.group = meEntry.group;
    document.getElementById('meName').textContent = me.name;
    document.getElementById('meGroup').textContent = me.group;
  }
  document.getElementById('codeLive').textContent = roomCode;

  // 화면 전환
  lobby.style.display = 'none';
  game.style.display = 'block';

  // 초기 렌더
  phase = snap.phase;
  document.getElementById('phase').textContent = phase;
  buildGrid(snap.seats);
});

socket.on('phaseChange', ({ phase: newPhase }) => {
  phase = newPhase;
  document.getElementById('phase').textContent = phase;
  if (phase === 'done') alert('자리 배정이 완료되었습니다!');
});

socket.on('turnUpdate', ({ group, order, turnIndex }) => {
  currentTurnOrder = order;
  currentTurnIndex = turnIndex;
  const list = document.getElementById('turnOrder');
  list.innerHTML = order.map((p,i)=>`<li ${i===turnIndex?'style="font-weight:700"':''}>${p.name}</li>`).join('');
  document.getElementById('turnNow').textContent = order[turnIndex]?.name || '-';

  myTurn = (order[turnIndex]?.id === socket.id);
  if (myTurn) {
    if (group === 'A') alert('A단계: 당신의 차례입니다. 빈 칸을 클릭해 그림을 남겨주세요.');
    else alert('B단계: 당신의 차례입니다. 남은 자리 중 하나를 선택하세요.');
  }
});

socket.on('seatUpdate', ({ seat, data }) => {
  // 좌석 하나만 갱신해도 되지만, 단순화를 위해 전체 재렌더
  socket.emit('getState', { code: roomCode });
});

socket.on('finalBoard', ({ seats }) => {
  buildGrid(seats);
});

socket.on('errorMsg', (msg) => alert(msg));

// 초기 화면에서 내가 방장으로 생성한 경우 로비 영역 표시
const roomInfo = document.getElementById('roomInfo');