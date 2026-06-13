// ================================================================
//  FIREBASE CONFIG
// ================================================================
const firebaseConfig = {
  apiKey:            "AIzaSyD1zavgv5_FNagPqbZvzNsi1ahyj7ayr7A",
  authDomain:        "watch2gether-60edc.firebaseapp.com",
  databaseURL:       "https://watch2gether-60edc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "watch2gether-60edc",
  storageBucket:     "watch2gether-60edc.firebasestorage.app",
  messagingSenderId: "515557891812",
  appId:             "1:515557891812:web:d806ef5467943e17a456f1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================================================================
//  STATE
// ================================================================
const CLIENT_ID = crypto.randomUUID();
let roomId = null, roomRef = null, isHost = false, isAdmin = false;
let username = '', currentAdminId = null, currentPresence = {};
let theaterMode = false, ignoreNextPlayerEvent = false;
let chatCount = 0, pendingJoinCode = null;
let screenShareActive = false;
let isYouTube = false;

let peerConnection = null, localStream = null;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' }
];
const pendingICE = [];

// ================================================================
//  DOM
// ================================================================
const $ = id => document.getElementById(id);

const $lobby = $('lobby'), $room = $('room');
const $btnCreate = $('btnCreate'), $btnJoin = $('btnJoin');
const $joinCode = $('joinCodeInput'), $usernameIn = $('usernameInput');
const $createPwdIn = $('createPasswordInput'), $displayId = $('displayRoomId');
const $btnCopyLink = $('btnCopyLink'), $btnLeave = $('btnLeave');
const $membersList = $('membersList');

const $videoUrlIn = $('videoUrlInput'), $btnLoadVideo = $('btnLoadVideo');
const $playerA = $('playerA'), $phA = $('phA');
const $videoWrapA = $('videoWrapA'), $videoWrapB = $('videoWrapB');
const $videoWrapYT = $('videoWrapYT');

const $btnStartShare = $('btnStartShare'), $btnStopShare = $('btnStopShare');
const $btnFullscreenShare = $('btnFullscreenShare');
const $playerB = $('playerB'), $phB = $('phB');

const $badgeRoom = $('badgeRoom'), $badgeRoomText = $('badgeRoomText');
const $badgePeer = $('badgePeer'), $badgePeerText = $('badgePeerText');
const $eventLog = null; // no longer used as DOM element

const $chatMessages = $('chatMessages'), $chatInput = $('chatInput');
const $btnSendChat = $('btnSendChat'), $chatCount = $('chatCount');
const $peopleCount = $('peopleCount');

// Sidebar tabs
const $sbTabPeople = $('sbTabPeople'), $sbTabChat = $('sbTabChat');
const $sbPanelPeople = $('sbPanelPeople'), $sbPanelChat = $('sbPanelChat');

const $adminModal = $('adminModal'), $adminMemberList = $('adminMemberList');
const $btnCancelAdmin = $('btnCancelAdmin');

const $passwordModal = $('passwordModal'), $joinPasswordInput = $('joinPasswordInput');
const $btnSubmitPassword = $('btnSubmitPassword'), $btnCancelPassword = $('btnCancelPassword');

const $qrModal = $('qrModal'), $qrCanvas = $('qrCanvas'), $qrLink = $('qrLink');
const $btnQrCode = $('btnQrCode'), $btnCloseQr = $('btnCloseQr');

const $themeModal = $('themeModal'), $btnTheme = $('btnTheme'), $btnCloseTheme = $('btnCloseTheme');
const $btnTheater = $('btnTheater'), $roomBody = $('roomBody');
const $btnSettings = $('btnSettings'), $settingsDropdown = $('settingsDropdown');

const $reactionsCanvas = $('reactionsCanvas');

// ================================================================
//  UTILS
// ================================================================
function genCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }
function toast(m) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = m; $('toasts').appendChild(e); setTimeout(() => e.remove(), 3500); }
function logEvent(m) {
  // Show notifications as system messages in the chat panel
  const empty = $('chatEmpty'); if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'chat-msg-system';
  el.textContent = m;
  $chatMessages.appendChild(el);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}
function setBadge(type, state, text) { const b = type === 'room' ? $badgeRoom : $badgePeer; const l = type === 'room' ? $badgeRoomText : $badgePeerText; b.className = `badge ${state}`; l.textContent = text; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtTime(s) { if (!s || isNaN(s)) return '0:00'; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; }

function resolveUsername() {
  const v = $usernameIn.value.trim();
  username = v || 'Guest_' + Math.floor(Math.random() * 9000 + 1000);
  if (!v) $usernameIn.value = username;
  localStorage.setItem('w2g_username', username);
  return username;
}
(function () { const s = localStorage.getItem('w2g_username'); if (s) $usernameIn.value = s; })();

// ================================================================
//  SIDEBAR TABS (People / Chat)
// ================================================================
$sbTabPeople.addEventListener('click', () => switchSbTab('people'));
$sbTabChat.addEventListener('click', () => switchSbTab('chat'));

function switchSbTab(tab) {
  $sbTabPeople.classList.toggle('active', tab === 'people');
  $sbTabChat.classList.toggle('active', tab === 'chat');
  $sbPanelPeople.classList.toggle('active', tab === 'people');
  $sbPanelChat.classList.toggle('active', tab === 'chat');
}

// ================================================================
//  ROOM
// ================================================================
function enterRoom(code, hosting) {
  roomId = code.toUpperCase(); isHost = hosting; username = resolveUsername();
  roomRef = db.ref(`rooms/${roomId}`);
  roomRef.child(`presence/${CLIENT_ID}`).set({ name: username, joined: Date.now(), host: isHost });
  roomRef.child(`presence/${CLIENT_ID}`).onDisconnect().remove();
  if (isHost) roomRef.child('admin').set(CLIENT_ID);

  $lobby.classList.add('hidden'); $room.classList.remove('hidden');
  $displayId.textContent = roomId;
  setBadge('room', 'connected', roomId);
  logEvent(isHost ? `Room created — welcome, ${username}!` : `${username} joined ${roomId}.`);
  toast(isHost ? `Room ${roomId} created!` : `Joined ${roomId}`);

  listenForPeers(); listenForAdmin(); listenForVideoState(); listenForVideoUrl();
  listenForWebRTCSignals(); listenForChat(); listenForReactions();
  sendSysMsg(isHost ? `${username} created the room` : `${username} joined`);
}

// ================================================================
//  PASSWORD
// ================================================================
function createWithPwd() {
  const code = genCode(); const pwd = $createPwdIn.value.trim();
  if (pwd) db.ref(`rooms/${code}/password`).set(pwd);
  enterRoom(code, true);
}

function attemptJoin(code) {
  db.ref(`rooms/${code.toUpperCase()}/password`).once('value', s => {
    if (s.val()) { pendingJoinCode = code; $joinPasswordInput.value = ''; $passwordModal.classList.remove('hidden'); $joinPasswordInput.focus(); }
    else enterRoom(code, false);
  });
}

$btnSubmitPassword.addEventListener('click', () => {
  const e = $joinPasswordInput.value.trim();
  if (!e) { toast('Enter the password.'); return; }
  db.ref(`rooms/${pendingJoinCode.toUpperCase()}/password`).once('value', s => {
    if (s.val() === e) { $passwordModal.classList.add('hidden'); enterRoom(pendingJoinCode, false); }
    else { toast('Wrong password!'); $joinPasswordInput.value = ''; $joinPasswordInput.focus(); }
  });
});
$btnCancelPassword.addEventListener('click', () => { $passwordModal.classList.add('hidden'); pendingJoinCode = null; });
$passwordModal.addEventListener('click', e => { if (e.target === $passwordModal) { $passwordModal.classList.add('hidden'); pendingJoinCode = null; } });
$joinPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') $btnSubmitPassword.click(); });

// ================================================================
//  ADMIN
// ================================================================
function listenForAdmin() {
  roomRef.child('admin').on('value', s => {
    currentAdminId = s.val(); isAdmin = currentAdminId === CLIENT_ID;
    if (Object.keys(currentPresence).length) renderMembers(currentPresence);
    if (isAdmin) { logEvent('You are admin 👑'); toast('You are admin 👑'); }
  });
}

function transferAdmin(id) {
  if (!roomRef || !isAdmin) return;
  const n = currentPresence[id]?.name || 'Someone';
  roomRef.child('admin').set(id);
  sendSysMsg(`${username} → admin to ${n}`); closeAdminModal();
}

function openAdminModal() {
  $adminMemberList.innerHTML = '';
  for (const [id, info] of Object.entries(currentPresence)) {
    if (id === CLIENT_ID) continue;
    const b = document.createElement('button'); b.className = 'modal-member-btn';
    b.innerHTML = `<span class="chip-dot"></span>${esc(info.name || 'Guest')}`;
    b.addEventListener('click', () => transferAdmin(id)); $adminMemberList.appendChild(b);
  }
  if (!$adminMemberList.children.length) $adminMemberList.innerHTML = '<p style="color:var(--text-dim);font-size:.8rem;text-align:center;">No other members.</p>';
  $adminModal.classList.remove('hidden');
}
function closeAdminModal() { $adminModal.classList.add('hidden'); }
$btnCancelAdmin.addEventListener('click', closeAdminModal);
$adminModal.addEventListener('click', e => { if (e.target === $adminModal) closeAdminModal(); });

// ================================================================
//  PEERS
// ================================================================
function listenForPeers() {
  let prev = new Set();
  roomRef.child('presence').on('value', s => {
    const d = s.val() || {}; currentPresence = d;
    const keys = Object.keys(d), cur = new Set(keys);
    if (prev.size) {
      for (const id of keys) if (!prev.has(id) && id !== CLIENT_ID) { logEvent(`${d[id].name || 'Someone'} joined 🎉`); toast(`${d[id].name} joined!`); }
      for (const id of prev) if (!cur.has(id) && id !== CLIENT_ID) logEvent('Someone left.');
    }
    prev = cur;
    setBadge('peer', keys.length > 1 ? 'connected' : 'waiting', keys.length > 1 ? `${keys.length} online` : 'Waiting…');
    $peopleCount.textContent = keys.length;
    renderMembers(d);
    if (currentAdminId && !cur.has(currentAdminId) && keys.length && keys[0] === CLIENT_ID) roomRef.child('admin').set(CLIENT_ID);
  });
}

function renderMembers(d) {
  $membersList.innerHTML = '';
  for (const [id, info] of Object.entries(d)) {
    const me = id === CLIENT_ID;
    const row = document.createElement('div'); row.className = 'member-row';
    row.innerHTML = `
      <span class="chip-dot"></span>
      <span class="member-name">${esc(info.name || 'Guest')}</span>
      ${me ? '<span class="member-you">you</span>' : ''}
      ${id === currentAdminId ? '<span class="member-admin">👑</span>' : ''}
    `;
    // Transfer button for admin
    if (isAdmin && !me) {
      const btn = document.createElement('button'); btn.className = 'member-transfer'; btn.textContent = 'Make Admin';
      btn.addEventListener('click', () => transferAdmin(id)); row.appendChild(btn);
    }
    $membersList.appendChild(row);
  }
}

// ================================================================
//  LEAVE
// ================================================================
function leaveRoom() {
  if (roomRef) {
    sendSysMsg(`${username} left`);
    roomRef.child(`presence/${CLIENT_ID}`).remove();
    roomRef.child('presence').once('value', s => { const r = s.val(); if (!r || !Object.keys(r).length) roomRef.remove(); });
    roomRef.off();
  }
  cleanupWebRTC(); roomId = null; roomRef = null; isHost = false; isAdmin = false;
  currentAdminId = null; currentPresence = {}; chatCount = 0; theaterMode = false; screenShareActive = false;
  // Cleanup YouTube
  if (isYouTube) { $('ytFrame').src = ''; }
  isYouTube = false;
  $room.classList.add('hidden'); $lobby.classList.remove('hidden'); $roomBody.classList.remove('theater');
  setBadge('room', '', '—'); setBadge('peer', '', 'Waiting…');
  $playerA.src = ''; $playerA.removeAttribute('src'); $phA.classList.remove('hidden');
  $videoWrapA.classList.remove('hidden'); $videoWrapB.classList.add('hidden'); $videoWrapYT.classList.add('hidden');
  $playerB.srcObject = null; $phB.classList.remove('hidden');
  $btnStartShare.classList.remove('hidden'); $btnStopShare.classList.add('hidden'); $btnFullscreenShare.classList.add('hidden');
  $membersList.innerHTML = '';
  $chatMessages.innerHTML = '<div class="chat-empty" id="chatEmpty"><span>💬</span><span>No messages yet</span></div>';
  $chatCount.textContent = '0'; $peopleCount.textContent = '0';
  toast('Left the room.');
}

// ================================================================
//  CHAT
// ================================================================
$btnSendChat.addEventListener('click', sendChat);
$chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

function sendChat() { const t = $chatInput.value.trim(); if (!t || !roomRef) return; roomRef.child('chat').push({ from: CLIENT_ID, name: username, text: t, ts: Date.now(), isSystem: false }); $chatInput.value = ''; $chatInput.focus(); }
function sendSysMsg(t) { if (roomRef) roomRef.child('chat').push({ from: 'system', name: 'System', text: t, ts: Date.now(), isSystem: true }); }

function listenForChat() {
  roomRef.child('chat').orderByChild('ts').startAt(Date.now() - 1000).on('child_added', s => { if (s.val()) addMsg(s.val()); });
  roomRef.child('chat').orderByChild('ts').limitToLast(50).once('value', s => {
    const d = s.val(); if (!d) return; $chatMessages.innerHTML = ''; chatCount = 0;
    Object.values(d).sort((a, b) => a.ts - b.ts).forEach(m => addMsg(m));
  });
}

function addMsg(m) {
  const empty = $('chatEmpty'); if (empty) empty.remove();
  if (m.isSystem) { const e = document.createElement('div'); e.className = 'chat-msg-system'; e.textContent = m.text; $chatMessages.appendChild(e); }
  else {
    const mine = m.from === CLIENT_ID; const t = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const e = document.createElement('div'); e.className = `chat-msg${mine ? ' is-mine' : ''}`;
    e.innerHTML = `<div class="chat-msg-header"><span class="chat-msg-name">${esc(m.name)}</span><span class="chat-msg-time">${t}</span></div><div class="chat-msg-body">${esc(m.text)}</div>`;
    $chatMessages.appendChild(e); chatCount++;
  }
  $chatCount.textContent = chatCount; $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

// ================================================================
//  EMOJI REACTIONS
// ================================================================
document.querySelectorAll('.reaction-btn').forEach(b => {
  b.addEventListener('click', () => { if (!roomRef) return; roomRef.child('reactions').push({ emoji: b.dataset.emoji, from: CLIENT_ID, ts: Date.now() }); spawnEmoji(b.dataset.emoji); });
});
function listenForReactions() { roomRef.child('reactions').orderByChild('ts').startAt(Date.now()).on('child_added', s => { const d = s.val(); if (d && d.from !== CLIENT_ID) spawnEmoji(d.emoji); }); }
function spawnEmoji(e) { const el = document.createElement('div'); el.className = 'floating-emoji'; el.textContent = e; el.style.left = (15 + Math.random() * 70) + '%'; el.style.bottom = '10%'; $reactionsCanvas.appendChild(el); setTimeout(() => el.remove(), 2600); }

// (Now Playing removed — notifications go to chat)

// ================================================================
//  THEATER / SETTINGS / QR / THEME
// ================================================================
$btnTheater.addEventListener('click', toggleTheater);
function toggleTheater() { theaterMode = !theaterMode; $roomBody.classList.toggle('theater', theaterMode); $btnTheater.textContent = theaterMode ? '◧ Normal' : '◧ Theater'; toast(theaterMode ? 'Theater mode' : 'Normal mode'); }

// Settings dropdown
$btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  $settingsDropdown.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!$settingsDropdown.classList.contains('hidden') && !$('settingsWrap').contains(e.target)) {
    $settingsDropdown.classList.add('hidden');
  }
});
function closeSettings() { $settingsDropdown.classList.add('hidden'); }

$btnQrCode.addEventListener('click', () => { closeSettings(); const l = `${location.origin}${location.pathname}?room=${roomId}`; $qrLink.textContent = l; if (typeof QRCode !== 'undefined') QRCode.toCanvas($qrCanvas, l, { width: 180, margin: 2, color: { dark: '#f1f5f9', light: '#141f35' } }); $qrModal.classList.remove('hidden'); });
$btnCloseQr.addEventListener('click', () => $qrModal.classList.add('hidden'));
$qrModal.addEventListener('click', e => { if (e.target === $qrModal) $qrModal.classList.add('hidden'); });

$btnTheme.addEventListener('click', () => { closeSettings(); $themeModal.classList.remove('hidden'); });
$btnCloseTheme.addEventListener('click', () => $themeModal.classList.add('hidden'));
$themeModal.addEventListener('click', e => { if (e.target === $themeModal) $themeModal.classList.add('hidden'); });
document.querySelectorAll('.theme-option').forEach(b => { b.addEventListener('click', () => { document.documentElement.setAttribute('data-theme', b.dataset.theme); localStorage.setItem('w2g_theme', b.dataset.theme); $themeModal.classList.add('hidden'); toast(`Theme: ${b.dataset.theme}`); }); });
(function () { const t = localStorage.getItem('w2g_theme'); if (t) document.documentElement.setAttribute('data-theme', t); })();

// ================================================================
//  KEYBOARD SHORTCUTS
// ================================================================
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || !roomRef) return;
  const active = screenShareActive ? $playerB : $playerA;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); if (!isYouTube) { active.paused ? active.play().catch(() => {}) : active.pause(); } break;
    case 'f': { const wrap = isYouTube ? $videoWrapYT : (screenShareActive ? $videoWrapB : $videoWrapA); goFullscreen(wrap); break; }
    case 'm': if (!isYouTube) { active.muted = !active.muted; toast(active.muted ? 'Muted' : 'Unmuted'); } break;
    case 'arrowleft': if (!screenShareActive && !isYouTube) $playerA.currentTime = Math.max(0, $playerA.currentTime - 10); break;
    case 'arrowright': if (!screenShareActive && !isYouTube) $playerA.currentTime = Math.min($playerA.duration || 0, $playerA.currentTime + 10); break;
    case 't': toggleTheater(); break;
  }
});

// Fullscreen with auto-rotate on mobile
function goFullscreen(el) {
  if (!el) return;
  const p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : Promise.resolve());
  Promise.resolve(p).then(() => {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }).catch(() => {});
}

// Unlock orientation when exiting fullscreen
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }
});

// ================================================================
//  VIDEO (Mode A) — YouTube + Direct URL support
// ================================================================

const $ytFrame = $('ytFrame');

// YouTube URL detector
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

$btnLoadVideo.addEventListener('click', () => {
  const u = $videoUrlIn.value.trim();
  if (!u) { toast('Paste a video URL.'); return; }
  loadVideo(u);
  if (roomRef) roomRef.child('videoUrl').set({ url: u, updatedBy: CLIENT_ID, updatedByName: username, ts: Date.now() });
});

function showVideoMode() {
  screenShareActive = false;
  $videoWrapB.classList.add('hidden');
  if (isYouTube) {
    $videoWrapA.classList.add('hidden');
    $videoWrapYT.classList.remove('hidden');
  } else {
    $videoWrapA.classList.remove('hidden');
    $videoWrapYT.classList.add('hidden');
  }
}

function showScreenMode() {
  screenShareActive = true;
  $videoWrapA.classList.add('hidden');
  $videoWrapYT.classList.add('hidden');
  $videoWrapB.classList.remove('hidden');
}

function loadVideo(u) {
  const ytId = extractYouTubeId(u);
  if (ytId) {
    isYouTube = true;
    showVideoMode();
    $ytFrame.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&fs=1`;
    logEvent('YouTube video loaded.');
  } else {
    isYouTube = false;
    showVideoMode();
    $playerA.src = u; $playerA.load(); $phA.classList.add('hidden');
    logEvent('Video loaded.');
  }
}

function listenForVideoUrl() {
  roomRef.child('videoUrl').on('value', s => {
    const d = s.val(); if (!d || d.updatedBy === CLIENT_ID) return;
    $videoUrlIn.value = d.url; loadVideo(d.url);
    logEvent(`${d.updatedByName} loaded a video.`); toast(`${d.updatedByName} loaded a video.`);
  });
}

// Direct video sync events (only for non-YouTube .mp4 etc.)
['play', 'pause', 'seeked'].forEach(ev => { $playerA.addEventListener(ev, () => { if (ignoreNextPlayerEvent) { ignoreNextPlayerEvent = false; return; } if (!roomRef || !$playerA.src || isYouTube) return; roomRef.child('videoState').set({ state: $playerA.paused ? 'paused' : 'playing', time: $playerA.currentTime, updatedBy: CLIENT_ID, updatedByName: username, ts: Date.now() }); }); });

function listenForVideoState() {
  roomRef.child('videoState').on('value', s => {
    const d = s.val(); if (!d || d.updatedBy === CLIENT_ID || isYouTube) return;
    ignoreNextPlayerEvent = true;
    if (Math.abs($playerA.currentTime - d.time) > 1.5) $playerA.currentTime = d.time;
    if (d.state === 'playing' && $playerA.paused) $playerA.play().catch(() => {});
    else if (d.state === 'paused' && !$playerA.paused) $playerA.pause();
  });
}

// ================================================================
//  SCREEN SHARE (Mode B)
// ================================================================
$btnStartShare.addEventListener('click', startShare);
$btnStopShare.addEventListener('click', stopShare);
$btnFullscreenShare.addEventListener('click', () => goFullscreen($videoWrapB));

async function startShare() {
  try { localStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true }); } catch (e) { toast('Screen share cancelled.'); return; }
  showScreenMode();
  $playerB.srcObject = localStream; $playerB.muted = true; $phB.classList.add('hidden');
  $btnStartShare.classList.add('hidden'); $btnStopShare.classList.remove('hidden'); $btnFullscreenShare.classList.remove('hidden');
  logEvent('Screen sharing started.');
  localStream.getVideoTracks()[0].addEventListener('ended', () => stopShare());
  await createPC('offer');
}

function stopShare() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  cleanupWebRTC(); screenShareActive = false;
  $videoWrapA.classList.remove('hidden'); $videoWrapB.classList.add('hidden');
  $playerB.srcObject = null; $phB.classList.remove('hidden');
  $btnStartShare.classList.remove('hidden'); $btnStopShare.classList.add('hidden'); $btnFullscreenShare.classList.add('hidden');
  logEvent('Screen share stopped.'); if (roomRef) roomRef.child('webrtc').remove();
}

async function createPC(role) {
  cleanupWebRTC(true); peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnection.onicecandidate = ({ candidate }) => { if (candidate && roomRef) roomRef.child(`webrtc/ice_${CLIENT_ID}`).push(candidate.toJSON()); };
  peerConnection.oniceconnectionstatechange = () => { const s = peerConnection.iceConnectionState; if (s === 'connected' || s === 'completed') setBadge('peer', 'connected', 'WebRTC ✓'); if (s === 'disconnected' || s === 'failed') setBadge('peer', 'waiting', 'Disconnected'); };
  peerConnection.ontrack = (ev) => {
    showScreenMode();
    $playerB.srcObject = ev.streams[0]; $playerB.muted = false; $playerB.play().catch(() => {});
    $phB.classList.add('hidden'); $btnFullscreenShare.classList.remove('hidden');
    toast('Screen share received!');
  };
  if (localStream) localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  if (role === 'offer') { const o = await peerConnection.createOffer(); await peerConnection.setLocalDescription(o); await roomRef.child('webrtc/offer').set({ sdp: o.sdp, type: o.type, from: CLIENT_ID }); }
}

function listenForWebRTCSignals() {
  roomRef.child('webrtc/offer').on('value', async s => { const d = s.val(); if (!d || d.from === CLIENT_ID) return; await createPC('answer'); await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: d.type, sdp: d.sdp })); const a = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(a); await roomRef.child('webrtc/answer').set({ sdp: a.sdp, type: a.type, from: CLIENT_ID }); drainICE(); });
  roomRef.child('webrtc/answer').on('value', async s => { const d = s.val(); if (!d || d.from === CLIENT_ID || !peerConnection || peerConnection.signalingState === 'stable') return; await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: d.type, sdp: d.sdp })); drainICE(); });
  roomRef.child('webrtc').on('child_added', s => { const k = s.key; if (!k.startsWith('ice_') || k === `ice_${CLIENT_ID}`) return; roomRef.child(`webrtc/${k}`).on('child_added', async is => { const c = is.val(); if (!c) return; try { if (peerConnection?.remoteDescription) await peerConnection.addIceCandidate(new RTCIceCandidate(c)); else pendingICE.push(c); } catch {} }); });
}

async function drainICE() { while (pendingICE.length) { try { await peerConnection.addIceCandidate(new RTCIceCandidate(pendingICE.shift())); } catch {} } }
function cleanupWebRTC(keep = false) { if (peerConnection) { peerConnection.ontrack = null; peerConnection.onicecandidate = null; peerConnection.oniceconnectionstatechange = null; peerConnection.close(); peerConnection = null; } if (!keep && localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } pendingICE.length = 0; }

// ================================================================
//  LOBBY HANDLERS
// ================================================================
$btnCreate.addEventListener('click', () => createWithPwd());
$btnJoin.addEventListener('click', () => { const c = $joinCode.value.trim().toUpperCase(); if (!c || c.length < 3) { toast('Enter a valid room code.'); return; } attemptJoin(c); });
$btnCopyLink.addEventListener('click', () => { closeSettings(); navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${roomId}`).then(() => toast('Link copied!')).catch(() => toast('Copy failed.')); });
$btnLeave.addEventListener('click', () => { closeSettings(); leaveRoom(); });

(function () { const c = new URLSearchParams(location.search).get('room'); if (c?.length >= 3) attemptJoin(c); })();

// ================================================================
//  MOBILE KEYBOARD DETECTION
// ================================================================
(function () {
  if (!window.visualViewport || window.innerWidth > 800) return;
  const fullH = window.innerHeight;
  function onResize() {
    const vh = window.visualViewport.height;
    document.documentElement.style.setProperty('--vh', vh + 'px');
    // If viewport shrunk by >150px, keyboard is likely open
    if (fullH - vh > 150) {
      $room.classList.add('keyboard-open');
    } else {
      $room.classList.remove('keyboard-open');
    }
  }
  window.visualViewport.addEventListener('resize', onResize);
  window.visualViewport.addEventListener('scroll', onResize);
})();
