// ======= Playlists & Tracks =======
const PLAYLISTS = [
  {
    id: 'focus',
    name: 'Classics',
    tracks: [
      { title: 'Be My Baby', artist: 'The Ronettes', src: 'assets/audio/track1.mp3', cover: 'assets/covers/cover1.jpg' },
      { title: 'Love Grows', artist: 'Edison Lighthouse', src: 'assets/audio/track2.mp3', cover: 'assets/covers/cover2.jpg' },
      { title: 'No Surprises', artist: 'Radiohead', src: 'assets/audio/track3.mp3', cover: 'assets/covers/cover3.jpg' },
      { title: 'About You', artist: 'The 1975', src: 'assets/audio/track4.mp3', cover: 'assets/covers/cover4.jpg' },
    ]
  },
  {
    id: 'vibes',
    name: 'Chill Vibes',
    tracks: [
      { title: 'Always', artist: 'Daniel Caesar', src: 'assets/audio/track5.mp3', cover: 'assets/covers/cover5.jpg' },
      { title: 'In My Mind', artist: 'Lyn Lapid', src: 'assets/audio/track6.mp3', cover: 'assets/covers/cover6.jpg' },
      { title: 'Perfect', artist: 'Ed Sheeran', src: 'assets/audio/track7.mp3', cover: 'assets/covers/cover7.jpg' },
      { title: 'Attention', artist: 'Charlie Puth', src: 'assets/audio/track8.mp3', cover: 'assets/covers/cover8.jpg' },
    ]
  }
];

// ======= DOM =======
const playerEl = document.getElementById('player');
const audioEl  = document.getElementById('audio');
const coverEl  = document.getElementById('cover');
const titleEl  = document.getElementById('title');
const artistEl = document.getElementById('artist');
const playBtn  = document.getElementById('playBtn');
const prevBtn  = document.getElementById('prevBtn');
const nextBtn  = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const volumeEl = document.getElementById('volume');
const playlistSelect = document.getElementById('playlistSelect');
const trackListEl = document.getElementById('trackList');
const autoplayToggle = document.getElementById('autoplayToggle');
const visualizerCanvas = document.getElementById('visualizer');
const miniBtn = document.getElementById('miniBtn');

// ======= STATE =======
let currentPlaylistIndex = 0;
let currentTrackIndex = 0;
let isDragging = false;       // for mini-player drag
let dragOffset = {x:0,y:0};

// Web Audio refs
let audioCtx, analyser, source, rafId;

// ======= INIT =======
init();

function init(){
  // Fill playlist dropdown
  PLAYLISTS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = p.name;
    playlistSelect.appendChild(opt);
  });

  // Load persisted settings
  const savedPl = +localStorage.getItem('playlistIndex') || 0;
  const savedVol = +localStorage.getItem('volume') || 0.8;
  const savedAuto = localStorage.getItem('autoplay') === 'true';

  currentPlaylistIndex = Number.isNaN(savedPl) ? 0 : savedPl;
  playlistSelect.value = currentPlaylistIndex;
  volumeEl.value = savedVol;
  audioEl.volume = savedVol;
  autoplayToggle.checked = savedAuto;

  buildTrackList();
  loadTrack(currentTrackIndex, /*autoplay=*/false);
  setupVisualizer();
  setupMiniDrag();
}

// ======= Small helper to satisfy autoplay policies =======
async function ensureAudioReady(){
  try{
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  }catch(e){}
}

// ======= TRACK LIST =======
function buildTrackList(){
  trackListEl.innerHTML = '';
  const tracks = PLAYLISTS[currentPlaylistIndex].tracks;
  tracks.forEach((t, idx) => {
    const li = document.createElement('li');
    li.dataset.index = idx;
    li.innerHTML = `
      <div class="track-title">${escapeHtml(t.title)}</div>
      <div class="track-artist">${escapeHtml(t.artist)}</div>
      <div class="track-dur" data-dur="--:--">--:--</div>
    `;
    li.addEventListener('click', async () => {
      currentTrackIndex = idx; 
      loadTrack(idx, true);
      await ensureAudioReady();
    });
    trackListEl.appendChild(li);
  });
  highlightActiveTrack();
  preloadDurations(); // preload durations once metadata is ready
}

function highlightActiveTrack(){
  [...trackListEl.children].forEach((li, i) => {
    li.classList.toggle('active', i === currentTrackIndex);
  });
}

// ======= LOAD TRACK =======
function loadTrack(index, autoplay=false){
  const tr = PLAYLISTS[currentPlaylistIndex].tracks[index];
  if(!tr) return;

  audioEl.src = tr.src;
  coverEl.src = tr.cover;
  titleEl.textContent = tr.title;
  artistEl.textContent = tr.artist;
  currentTrackIndex = index;
  highlightActiveTrack();
  // reset icon to play; 'play'/'pause' events will set correctly
  playBtn.textContent = '▶';

  audioEl.addEventListener('loadedmetadata', onMetadata, { once:true });
  if (autoplay) { 
    audioEl.play().catch(()=>{}); 
  }

  coverEl.onload = () => applyDominantBackground(coverEl);
}

// show total duration when metadata ready
function onMetadata(){
  durationEl.textContent = formatTime(audioEl.duration);
}

// ======= CONTROLS =======
playBtn.addEventListener('click', async () => {
  await ensureAudioReady();
  if (audioEl.paused) {
    audioEl.play().catch(()=>{});
  } else {
    audioEl.pause();
  }
});

prevBtn.addEventListener('click', async () => {
  await ensureAudioReady();
  prevTrack();
});

nextBtn.addEventListener('click', async () => {
  await ensureAudioReady();
  nextTrack();
});

function prevTrack(){
  const len = PLAYLISTS[currentPlaylistIndex].tracks.length;
  currentTrackIndex = (currentTrackIndex - 1 + len) % len;
  loadTrack(currentTrackIndex, true);
}
function nextTrack(){
  const len = PLAYLISTS[currentPlaylistIndex].tracks.length;
  currentTrackIndex = (currentTrackIndex + 1) % len;
  loadTrack(currentTrackIndex, true);
}

// keep play button icon in sync with real state
audioEl.addEventListener('play',  () => { playBtn.textContent = '⏸'; });
audioEl.addEventListener('pause', () => { playBtn.textContent = '▶'; });

// autoplay next on end
audioEl.addEventListener('ended', () => {
  if (autoplayToggle.checked) nextTrack();
  else playBtn.textContent = '▶';
});

// ======= PROGRESS / SEEK =======
audioEl.addEventListener('timeupdate', () => {
  const pct = (audioEl.currentTime / (audioEl.duration || 1)) * 100;
  progress.style.width = `${pct}%`;
  currentTimeEl.textContent = formatTime(audioEl.currentTime);
  if (isFinite(audioEl.duration)) durationEl.textContent = formatTime(audioEl.duration);
});

progressBar.addEventListener('click', (e) => {
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * (audioEl.duration || 0);
});

// ======= VOLUME =======
volumeEl.addEventListener('input', () => {
  audioEl.volume = +volumeEl.value;
  localStorage.setItem('volume', audioEl.volume);
});

// ======= PLAYLIST SELECT =======
playlistSelect.addEventListener('change', async () => {
  currentPlaylistIndex = +playlistSelect.value;
  localStorage.setItem('playlistIndex', currentPlaylistIndex);
  currentTrackIndex = 0;
  buildTrackList();
  loadTrack(0, true);
  await ensureAudioReady();
});

// ======= AUTOPLAY PERSIST =======
autoplayToggle.addEventListener('change', () => {
  localStorage.setItem('autoplay', autoplayToggle.checked);
});

// ======= VISUALIZER (Web Audio API) =======
function setupVisualizer(){
  const canvas = visualizerCanvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  source = audioCtx.createMediaElementSource(audioEl);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  function draw(){
    rafId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0,0,W,H);

    const barWidth = (W / bufferLength) * 1.6;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255;
      const barHeight = v * H;
      ctx.fillStyle = `hsla(${200 + i/2}, 90%, ${40 + v*30}%, 0.9)`;
      ctx.fillRect(x, H - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }
  draw();

  // resume context on first click anywhere (fallback)
  document.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }, { once:true });
}

// ======= DOMINANT COLOR FROM COVER =======
function applyDominantBackground(imgEl){
  // draw to temp canvas & average pixels
  try{
    const c = document.createElement('canvas');
    const w = c.width = 40, h = c.height = 40;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let r=0,g=0,b=0,count=0;
    for(let i=0;i<data.length;i+=4){
      const rr=data[i], gg=data[i+1], bb=data[i+2], a=data[i+3];
      if(a<200) continue;
      r+=rr; g+=gg; b+=bb; count++;
    }
    if(count===0) return;
    r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);

    const bg = `radial-gradient(1200px 600px at 10% -10%, rgba(${r},${g},${b},0.35), rgba(0,0,0,0.0)), 
                linear-gradient(180deg, rgba(${r},${g},${b},0.20), rgba(0,0,0,0.65))`;
    document.body.classList.add('dynamic-bg');
    document.body.style.background = bg;
  }catch(e){
  }
}

// ======= MINI-PLAYER (toggle + drag) =======
miniBtn.addEventListener('click', () => {
  playerEl.classList.toggle('mini');
});

// drag within viewport
function setupMiniDrag(){
  playerEl.addEventListener('mousedown', (e)=>{
    if(!playerEl.classList.contains('mini')) return;
    isDragging = true;
    playerEl.style.cursor='grabbing';
    const rect = playerEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
  });

  window.addEventListener('mousemove', (e)=>{
    if(!isDragging) return;
    const x = Math.min(window.innerWidth - playerEl.offsetWidth, Math.max(0, e.clientX - dragOffset.x));
    const y = Math.min(window.innerHeight - playerEl.offsetHeight, Math.max(0, e.clientY - dragOffset.y));
    playerEl.style.left = x + 'px';
    playerEl.style.top  = y + 'px';
    playerEl.style.right = 'auto';
    playerEl.style.bottom = 'auto';
    playerEl.style.position = 'fixed';
  });

  window.addEventListener('mouseup', ()=>{
    isDragging = false;
    playerEl.style.cursor='grab';
  });
}

// ======= UTIL =======
function formatTime(sec){
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// Preload & display durations in track list
function preloadDurations(){
  const tracks = PLAYLISTS[currentPlaylistIndex].tracks;
  tracks.forEach((t, i) => {
    const temp = new Audio();
    temp.src = t.src;
    temp.addEventListener('loadedmetadata', () => {
      const li = trackListEl.children[i];
      const span = li ? li.querySelector('.track-dur') : null;
      if (span) span.textContent = formatTime(temp.duration);
    });
  });
}
