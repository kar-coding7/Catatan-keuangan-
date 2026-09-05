'use strict';
/* ======================================================================
   MUSIC PLAYER MODULE — "Buku Kas"
   Modul terpisah & mandiri. TIDAK mengubah/menyentuh sistem keuangan
   (saldo, transaksi, Target Tabungan, History, Statistik, kategori,
   dompet, PIN, atau Backup keuangan di script.js).
   File audio disimpan lokal di perangkat via IndexedDB (bukan base64
   di localStorage). Hanya metadata pemutar yang disimpan di localStorage.
   ====================================================================== */
(function(){

  const DB_NAME = 'bukukas_music_db';
  const DB_VERSION = 1;
  const STORE_META = 'songs_meta';
  const STORE_DATA = 'songs_data';
  const LS_MUSIC = 'kp_music_settings_v1';
  const ALLOWED_EXT = ['mp3','wav','ogg','m4a'];

  let db = null;
  const audio = new Audio();
  audio.preload = 'metadata';
  let currentObjectUrl = null;
  let playlist = []; // metadata only: {id, displayName, originalName, mimeType, addedAt}
  let settings = { order: [], currentId: null, mode: 'all', volume: 0.7, musicEnabled: true };
  let isSeeking = false;
  let currentErrored = false;

  /* ---------------- IndexedDB helpers ---------------- */
  function openDB(){
    return new Promise((resolve, reject)=>{
      if(!('indexedDB' in window)){ reject(new Error('IndexedDB tidak didukung')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e)=>{
        const d = e.target.result;
        if(!d.objectStoreNames.contains(STORE_META)) d.createObjectStore(STORE_META, {keyPath:'id'});
        if(!d.objectStoreNames.contains(STORE_DATA)) d.createObjectStore(STORE_DATA, {keyPath:'id'});
      };
      req.onsuccess = ()=>{ db = req.result; resolve(db); };
      req.onerror = ()=> reject(req.error);
    });
  }
  function idbPut(store, record){
    return new Promise((resolve, reject)=>{
      try{
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(record);
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> reject(tx.error);
      }catch(err){ reject(err); }
    });
  }
  function idbGet(store, id){
    return new Promise((resolve, reject)=>{
      try{
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(id);
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> reject(req.error);
      }catch(err){ reject(err); }
    });
  }
  function idbGetAll(store){
    return new Promise((resolve, reject)=>{
      try{
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = ()=> resolve(req.result || []);
        req.onerror = ()=> reject(req.error);
      }catch(err){ reject(err); }
    });
  }
  function idbDelete(store, id){
    return new Promise((resolve, reject)=>{
      try{
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> reject(tx.error);
      }catch(err){ reject(err); }
    });
  }

  /* ---------------- Settings persistence (metadata only) ---------------- */
  function loadSettings(){
    try{
      const raw = JSON.parse(localStorage.getItem(LS_MUSIC));
      if(raw && typeof raw === 'object') settings = Object.assign(settings, raw);
    }catch(e){ /* pakai default */ }
  }
  function saveSettings(){
    try{ localStorage.setItem(LS_MUSIC, JSON.stringify(settings)); }catch(e){ /* abaikan */ }
  }

  function genId(){
    return 'song_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function safeToast(msg){
    if(typeof window.toast === 'function') window.toast(msg);
  }

  /* ---------------- File validation ---------------- */
  function isSupportedFile(file){
    const name = (file.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if(ALLOWED_EXT.includes(ext)) return true;
    if(file.type && file.type.startsWith('audio/')) return true;
    return false;
  }

  /* ---------------- DOM refs ---------------- */
  const el = {
    nowIcon: document.getElementById('mpNowIcon'),
    nowName: document.getElementById('mpNowName'),
    nowSub: document.getElementById('mpNowSub'),
    timeCurrent: document.getElementById('mpTimeCurrent'),
    timeTotal: document.getElementById('mpTimeTotal'),
    seek: document.getElementById('mpSeek'),
    prevBtn: document.getElementById('mpPrevBtn'),
    playBtn: document.getElementById('mpPlayBtn'),
    nextBtn: document.getElementById('mpNextBtn'),
    volume: document.getElementById('mpVolume'),
    volumePct: document.getElementById('mpVolumePct'),
    modeChips: document.getElementById('mpModeChips'),
    addSongBtn: document.getElementById('mpAddSongBtn'),
    fileInput: document.getElementById('mpFileInput'),
    playlistEl: document.getElementById('mpPlaylist'),
    playlistEmpty: document.getElementById('mpPlaylistEmpty'),
    musicToggle: document.getElementById('mpMusicToggle'),
    soundToggle: document.getElementById('mpSoundEffectToggle'),
    miniPlayer: document.getElementById('miniPlayer'),
    miniInfo: document.getElementById('miniPlayerInfo'),
    miniName: document.getElementById('miniPlayerName'),
    miniFill: document.getElementById('miniPlayerProgressFill'),
    miniPlayBtn: document.getElementById('miniPlayerPlayBtn'),
    pageMusik: document.getElementById('page-musik'),
    bottomNav: document.querySelector('.bottom-nav'),
    appEl: document.getElementById('app'),
  };

  // Jika markup musik belum ada di halaman ini, jangan jalankan modul.
  if(!el.nowName || !el.playlistEl){ return; }

  /* ---------------- Formatting ---------------- */
  function formatTime(sec){
    if(!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str == null ? '' : str;
    return d.innerHTML;
  }

  /* ---------------- Playlist helpers ---------------- */
  function currentIndex(){ return playlist.findIndex(s=>s.id===settings.currentId); }
  function findSong(id){ return playlist.find(s=>s.id===id); }

  function sequentialNext(){
    if(playlist.length===0) return null;
    let idx = currentIndex();
    idx = idx===-1 ? 0 : idx+1;
    if(idx>=playlist.length) idx = 0;
    return playlist[idx];
  }
  function sequentialPrev(){
    if(playlist.length===0) return null;
    let idx = currentIndex();
    idx = idx===-1 ? 0 : idx-1;
    if(idx<0) idx = playlist.length-1;
    return playlist[idx];
  }
  function randomOther(){
    if(playlist.length===0) return null;
    if(playlist.length===1) return playlist[0];
    const curIdx = currentIndex();
    let idx;
    do{ idx = Math.floor(Math.random()*playlist.length); }while(idx===curIdx);
    return playlist[idx];
  }

  /* ---------------- Core playback ---------------- */
  async function loadSongIntoPlayer(id, autoPlay){
    const song = findSong(id);
    if(!song){ return; }
    currentErrored = false;
    try{
      const dataRec = await idbGet(STORE_DATA, id);
      if(!dataRec || !dataRec.blob){
        currentErrored = true;
        settings.currentId = id;
        saveSettings();
        updateNowPlayingUI(song);
        renderPlaylist();
        safeToast('⚠️ File tidak ditemukan.');
        return;
      }
      if(currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      currentObjectUrl = URL.createObjectURL(dataRec.blob);
      audio.src = currentObjectUrl;
      audio.load();
      settings.currentId = id;
      saveSettings();
      updateNowPlayingUI(song);
      renderPlaylist();
      updateMiniPlayer();
      if(autoPlay && settings.musicEnabled){
        attemptPlay();
      }
    }catch(err){
      currentErrored = true;
      safeToast('⚠️ Tidak dapat memutar lagu ini.');
    }
  }

  function attemptPlay(){
    if(!settings.musicEnabled){
      safeToast('Aktifkan Musik dulu di Pengaturan Musik');
      return;
    }
    if(!audio.src){
      if(playlist.length>0){ loadSongIntoPlayer(playlist[0].id, true); }
      else{ safeToast('Tambahkan lagu terlebih dahulu'); }
      return;
    }
    const p = audio.play();
    if(p && typeof p.catch === 'function'){
      p.catch(()=>{
        // Browser/Android memblokir autoplay tanpa interaksi pengguna — tidak apa-apa, diamkan saja.
      });
    }
  }

  function togglePlayPause(){
    if(!settings.musicEnabled){
      safeToast('Aktifkan Musik dulu di Pengaturan Musik');
      return;
    }
    if(!settings.currentId){
      if(playlist.length===0){ safeToast('Tambahkan lagu terlebih dahulu'); return; }
      loadSongIntoPlayer(playlist[0].id, true);
      return;
    }
    if(currentErrored){
      safeToast('⚠️ Tidak dapat memutar lagu ini.');
      return;
    }
    if(audio.paused){ attemptPlay(); } else { audio.pause(); }
  }

  function goNext(){
    if(playlist.length===0) return;
    const nxt = settings.mode==='shuffle' ? randomOther() : sequentialNext();
    if(nxt) loadSongIntoPlayer(nxt.id, !audio.paused || settings.currentId==null ? true : false);
  }
  function goPrev(){
    if(playlist.length===0) return;
    const prv = settings.mode==='shuffle' ? randomOther() : sequentialPrev();
    if(prv) loadSongIntoPlayer(prv.id, !audio.paused || settings.currentId==null ? true : false);
  }

  audio.addEventListener('ended', ()=>{
    if(playlist.length===0) return;
    if(settings.mode==='one'){
      audio.currentTime = 0;
      attemptPlay();
      return;
    }
    const nxt = settings.mode==='shuffle' ? randomOther() : sequentialNext();
    if(nxt) loadSongIntoPlayer(nxt.id, true);
  });
  audio.addEventListener('error', ()=>{
    if(!audio.src) return;
    currentErrored = true;
    updateNowPlayingUI(findSong(settings.currentId));
    safeToast('⚠️ Tidak dapat memutar lagu ini.');
  });
  audio.addEventListener('play', ()=>{ updatePlayIcons(true); });
  audio.addEventListener('pause', ()=>{ updatePlayIcons(false); });
  audio.addEventListener('loadedmetadata', ()=>{
    el.seek.max = isFinite(audio.duration) ? audio.duration : 0;
    el.seek.disabled = false;
    el.timeTotal.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', ()=>{
    if(isSeeking) return;
    el.seek.value = audio.currentTime || 0;
    el.timeCurrent.textContent = formatTime(audio.currentTime);
    updateMiniProgress();
  });

  /* ---------------- UI updates ---------------- */
  function updatePlayIcons(playing){
    el.playBtn.textContent = playing ? '⏸️' : '▶️';
    el.miniPlayBtn.textContent = playing ? '⏸️' : '▶️';
    el.nowIcon.classList.toggle('spin', playing);
  }
  function updateNowPlayingUI(song){
    const hasSongs = playlist.length>0;
    el.prevBtn.disabled = !hasSongs;
    el.nextBtn.disabled = !hasSongs;
    el.playBtn.disabled = !hasSongs;
    if(!song){
      el.nowName.textContent = 'Belum ada lagu diputar';
      el.nowSub.textContent = hasSongs ? 'Ketuk ▶️ untuk memulai' : 'Tambahkan lagu untuk mulai memutar';
      el.nowSub.classList.remove('mp-error');
      el.seek.value = 0;
      el.seek.disabled = true;
      el.timeCurrent.textContent = '00:00';
      el.timeTotal.textContent = '00:00';
      updatePlayIcons(false);
      return;
    }
    el.nowName.textContent = song.displayName;
    if(currentErrored){
      el.nowSub.textContent = '⚠️ File tidak ditemukan di perangkat ini.';
      el.nowSub.classList.add('mp-error');
    } else {
      el.nowSub.textContent = 'Sedang Diputar';
      el.nowSub.classList.remove('mp-error');
    }
  }
  function updateMiniProgress(){
    if(!isFinite(audio.duration) || audio.duration===0){ el.miniFill.style.width = '0%'; return; }
    const pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
    el.miniFill.style.width = pct + '%';
  }
  function updateMiniPlayer(){
    const song = findSong(settings.currentId);
    if(!song){
      el.miniPlayer.classList.add('hidden');
      return;
    }
    el.miniName.textContent = song.displayName;
    const onMusicPage = el.pageMusik && !el.pageMusik.classList.contains('hidden');
    el.miniPlayer.classList.toggle('hidden', !!onMusicPage);
    positionMiniPlayer();
  }
  function positionMiniPlayer(){
    if(!el.bottomNav) return;
    const h = el.bottomNav.offsetHeight || 64;
    el.miniPlayer.style.bottom = h + 'px';
    if(!el.miniPlayer.classList.contains('hidden')){
      el.appEl && el.appEl.style.setProperty('--mp-mini-space', (h + 54) + 'px');
    } else {
      el.appEl && el.appEl.style.setProperty('--mp-mini-space', '86px');
    }
  }
  function updateModeUI(){
    el.modeChips.querySelectorAll('.mp-mode-chip').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.mode === settings.mode);
    });
  }
  function updateVolumeUI(){
    el.volume.value = settings.volume;
    el.volumePct.textContent = Math.round(settings.volume*100) + '%';
  }
  function updateToggleUI(){
    el.musicToggle.checked = !!settings.musicEnabled;
    let soundOn = true;
    try{ const s = JSON.parse(localStorage.getItem('kp_sound_v1')); soundOn = (s===null||s===undefined) ? true : !!s; }catch(e){ soundOn = true; }
    el.soundToggle.checked = soundOn;
    const realToggle = document.getElementById('soundToggle');
    if(realToggle) el.soundToggle.checked = realToggle.checked;
  }

  function renderPlaylist(){
    el.playlistEl.innerHTML = '';
    el.playlistEmpty.classList.toggle('hidden', playlist.length>0);
    playlist.forEach(song=>{
      const isPlaying = song.id === settings.currentId;
      const row = document.createElement('div');
      row.className = 'mp-song-item' + (isPlaying ? ' playing' : '');
      row.innerHTML = `
        <div class="mp-song-play-indicator">${isPlaying ? (audio.paused ? '⏸️' : '▶️') : '🎵'}</div>
        <div class="mp-song-mid">
          <div class="mp-song-name">${escapeHtml(song.displayName)}</div>
        </div>
        <div class="mp-song-actions">
          <button class="mp-song-action-btn" data-act="edit" title="Edit Nama">✏️</button>
          <button class="mp-song-action-btn" data-act="delete" title="Hapus">🗑️</button>
        </div>
      `;
      row.querySelector('.mp-song-mid').addEventListener('click', ()=> loadSongIntoPlayer(song.id, true));
      row.querySelector('[data-act="edit"]').addEventListener('click', (e)=>{ e.stopPropagation(); openRenamePrompt(song); });
      row.querySelector('[data-act="delete"]').addEventListener('click', (e)=>{ e.stopPropagation(); openDeletePrompt(song); });
      el.playlistEl.appendChild(row);
    });
  }

  function openRenamePrompt(song){
    if(typeof window.showPrompt !== 'function') return;
    window.showPrompt('✏️ Edit Nama Lagu', `
      <div class="field"><label>Nama Tampilan</label><input type="text" id="mpRenameInput" value="${escapeHtml(song.displayName)}" maxlength="120"></div>
      <button class="btn-primary" id="mpRenameSaveBtn">Simpan</button>
    `);
    const input = document.getElementById('mpRenameInput');
    const saveBtn = document.getElementById('mpRenameSaveBtn');
    if(input) setTimeout(()=> input.focus(), 50);
    if(saveBtn) saveBtn.addEventListener('click', async ()=>{
      const val = (input.value || '').trim();
      if(!val){ return; }
      song.displayName = val;
      try{
        const metaRec = await idbGet(STORE_META, song.id);
        if(metaRec){ metaRec.displayName = val; await idbPut(STORE_META, metaRec); }
      }catch(e){ /* metadata di memori tetap terupdate meski gagal simpan */ }
      renderPlaylist();
      if(song.id === settings.currentId) el.nowName.textContent = val;
      updateMiniPlayer();
      window.closePrompt && window.closePrompt();
      safeToast('Nama lagu diperbarui');
    });
  }

  function openDeletePrompt(song){
    if(typeof window.showPrompt !== 'function') return;
    window.showPrompt('Hapus Lagu', `
      <p>Hapus "${escapeHtml(song.displayName)}" dari playlist?</p>
      <button class="btn-primary danger" id="mpDeleteConfirmBtn">Hapus</button>
      <button class="btn-secondary" id="mpDeleteCancelBtn">Batal</button>
    `);
    const confirmBtn = document.getElementById('mpDeleteConfirmBtn');
    const cancelBtn = document.getElementById('mpDeleteCancelBtn');
    if(confirmBtn) confirmBtn.addEventListener('click', async ()=>{
      await deleteSong(song.id);
      window.closePrompt && window.closePrompt();
    });
    if(cancelBtn) cancelBtn.addEventListener('click', ()=> window.closePrompt && window.closePrompt());
  }

  async function deleteSong(id){
    const idx = playlist.findIndex(s=>s.id===id);
    if(idx===-1) return;
    const wasCurrent = settings.currentId === id;
    playlist.splice(idx,1);
    settings.order = playlist.map(s=>s.id);
    try{ await idbDelete(STORE_META, id); }catch(e){}
    try{ await idbDelete(STORE_DATA, id); }catch(e){}
    if(wasCurrent){
      audio.pause();
      if(currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      audio.removeAttribute('src');
      audio.load();
      settings.currentId = null;
      currentErrored = false;
      if(playlist.length>0){
        const nextIdx = Math.min(idx, playlist.length-1);
        await loadSongIntoPlayer(playlist[nextIdx].id, false);
      } else {
        updateNowPlayingUI(null);
        updateMiniPlayer();
      }
    } else {
      renderPlaylist();
    }
    saveSettings();
    renderPlaylist();
    safeToast('Lagu dihapus dari playlist');
  }

  /* ---------------- Adding songs ---------------- */
  async function addFiles(fileList){
    const files = Array.from(fileList || []);
    if(files.length===0) return;
    let added = 0, skipped = 0;
    for(const file of files){
      if(!isSupportedFile(file)){ skipped++; continue; }
      const id = genId();
      const meta = { id, displayName: file.name, originalName: file.name, mimeType: file.type || '', addedAt: Date.now() };
      try{
        await idbPut(STORE_META, meta);
        await idbPut(STORE_DATA, { id, blob: file });
        playlist.push(meta);
        added++;
      }catch(e){ skipped++; }
    }
    settings.order = playlist.map(s=>s.id);
    saveSettings();
    renderPlaylist();
    updateNowPlayingUI(findSong(settings.currentId));
    if(added>0 && skipped===0) safeToast(`${added} lagu ditambahkan ke playlist`);
    else if(added>0 && skipped>0) safeToast(`${added} lagu ditambahkan, ${skipped} format tidak didukung`);
    else safeToast('⚠️ Format audio tidak didukung.');
  }

  /* ---------------- Seek bar ---------------- */
  function beginSeek(){ isSeeking = true; }
  function endSeek(){
    isSeeking = false;
    if(audio.src && isFinite(audio.duration)){
      audio.currentTime = Number(el.seek.value) || 0;
    }
  }
  el.seek.addEventListener('pointerdown', beginSeek);
  el.seek.addEventListener('touchstart', beginSeek, {passive:true});
  el.seek.addEventListener('input', ()=>{
    el.timeCurrent.textContent = formatTime(Number(el.seek.value) || 0);
  });
  el.seek.addEventListener('pointerup', endSeek);
  el.seek.addEventListener('touchend', endSeek);
  el.seek.addEventListener('change', endSeek);

  /* ---------------- Event bindings ---------------- */
  el.playBtn.addEventListener('click', togglePlayPause);
  el.prevBtn.addEventListener('click', goPrev);
  el.nextBtn.addEventListener('click', goNext);
  el.miniPlayBtn.addEventListener('click', (e)=>{ e.stopPropagation(); togglePlayPause(); });
  el.miniInfo.addEventListener('click', ()=>{
    if(typeof window.showPage === 'function') window.showPage('musik');
    updateMiniPlayer();
  });

  el.volume.addEventListener('input', ()=>{
    const v = Number(el.volume.value);
    audio.volume = v;
    el.volumePct.textContent = Math.round(v*100) + '%';
  });
  el.volume.addEventListener('change', ()=>{
    settings.volume = Number(el.volume.value);
    saveSettings();
  });

  el.modeChips.addEventListener('click', (e)=>{
    const btn = e.target.closest('.mp-mode-chip');
    if(!btn) return;
    settings.mode = btn.dataset.mode;
    saveSettings();
    updateModeUI();
  });

  el.addSongBtn.addEventListener('click', ()=> el.fileInput.click());
  el.fileInput.addEventListener('change', (e)=>{
    addFiles(e.target.files);
    e.target.value = '';
  });

  el.musicToggle.addEventListener('change', ()=>{
    settings.musicEnabled = el.musicToggle.checked;
    saveSettings();
    if(!settings.musicEnabled){ audio.pause(); }
  });

  el.soundToggle.addEventListener('change', ()=>{
    const realToggle = document.getElementById('soundToggle');
    if(realToggle){
      realToggle.checked = el.soundToggle.checked;
      realToggle.dispatchEvent(new Event('change'));
    }
  });
  const realSoundToggle = document.getElementById('soundToggle');
  if(realSoundToggle){
    realSoundToggle.addEventListener('change', ()=>{
      el.soundToggle.checked = realSoundToggle.checked;
    });
  }

  // Reposisi mini player & sembunyikan saat berada di halaman Musik.
  if(el.bottomNav){
    el.bottomNav.querySelectorAll('.nav-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{ updateMiniPlayer(); });
    });
  }
  window.addEventListener('resize', positionMiniPlayer);
  window.addEventListener('beforeunload', ()=>{
    if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  });

  // Hook kecil supaya tombol navigasi lain (mis. dari halaman Pengaturan) bisa
  // memicu sinkronisasi tampil/sembunyi Mini Player, tanpa mengubah logic internal player.
  window.mpRefreshMiniPlayer = updateMiniPlayer;

  /* ---------------- Init ---------------- */
  async function init(){
    loadSettings();
    updateVolumeUI();
    updateModeUI();
    updateToggleUI();
    audio.volume = settings.volume;
    try{
      await openDB();
      const allMeta = await idbGetAll(STORE_META);
      const byId = Object.fromEntries(allMeta.map(m=>[m.id, m]));
      playlist = (settings.order || []).map(id=> byId[id]).filter(Boolean);
      allMeta.forEach(m=>{ if(!playlist.find(p=>p.id===m.id)) playlist.push(m); });
      settings.order = playlist.map(s=>s.id);
      renderPlaylist();
      if(settings.currentId && findSong(settings.currentId)){
        await loadSongIntoPlayer(settings.currentId, false);
      } else {
        settings.currentId = null;
        updateNowPlayingUI(null);
      }
      saveSettings();
    }catch(err){
      renderPlaylist();
      updateNowPlayingUI(null);
      safeToast('⚠️ Penyimpanan musik tidak tersedia di perangkat ini.');
    }
    updateMiniPlayer();
    positionMiniPlayer();
  }

  init();

})();
