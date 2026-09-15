/* chungrim.me — 위에서 내려다본 픽셀 거리.
   첫 화면은 링크 목록, 스크롤을 내리면 캐릭터가 길을 따라 아래로 걷고 양옆에 가게가 나온다. */
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const world = document.getElementById('world');
  const hero = document.getElementById('hero');
  const hint = document.getElementById('hint');
  const cards = [...document.querySelectorAll('[data-stop]')];

  // 정류장(가게). side: 'l' 왼쪽 'r' 오른쪽
  const STOPS = [
    { kind: 'shop', side: 'l', sign: '뱃꼬동', tag: '해물포차', photo: 'assets/sea.jpg',      wall: '#22405f', wall2: '#1a3350', roof: '#1c3046', aw1: '#e8e2d2', aw2: '#2d5c8a' },
    { kind: 'shop', side: 'r', sign: '뱃꼬동', tag: '해물포차', photo: 'assets/bupyeong.jpg', wall: '#1e4a58', wall2: '#173b46', roof: '#183a44', aw1: '#e8e2d2', aw2: '#2a7a8c' },
    { kind: 'shop', side: 'l', sign: '뱃꼬동', tag: '숙성집',   photo: 'assets/shop.jpg',     wall: '#5a3a2e', wall2: '#472d24', roof: '#3d2a24', aw1: '#efe6d6', aw2: '#7a3d2c' },
    { kind: 'shop', side: 'r', sign: '뱃꼬동', tag: '숙성집',   photo: null,                  wall: '#4f3a34', wall2: '#3e2c28', roof: '#362823', aw1: '#efe6d6', aw2: '#8a4a34' },
    { kind: 'shop', side: 'l', sign: '철계직화장', tag: '구월점', photo: 'assets/chicken.jpg', wall: '#2b2b2f', wall2: '#202024', roof: '#1e1e22', aw1: '#3a3a40', aw2: '#d8703a' },
    { kind: 'studio', side: 'r', sign: 'WESTORE', tag: '작업실', photo: 'assets/drawing.jpg', wall: '#1b2b44', wall2: '#14213a', roof: '#152238', aw1: '#5B8DEF', aw2: '#3e6fd6' },
    { kind: 'end', sign: '@cxnrim' },
  ];

  const ROAD_W = 64, WALK = 8, GAP = 250, BW = 52, ROOF_H = 20, FACADE_H = 46, BH = ROOF_H + FACADE_H;
  let W = 0, H = 0, P = 2, dpr = 1;
  let roadX = 0, heroH = 0, roadTop = 0, endY = 0, worldLen = 0;
  let cam = 0, walked = 0, moving = false, lastMoveT = 0, dir = 1, prevCy = 0;
  let fontsReady = false;

  // ---------- 에셋 ----------
  const sprite = new Image(); sprite.src = 'assets/front.png';
  const photos = {};
  STOPS.forEach(s => { if (s.photo) { const im = new Image(); im.src = s.photo; photos[s.photo] = im; im.onload = () => { s.pix = null; }; } });
  let frames = null, standFrame = 0; const CH = 40;

  function buildFrames() {
    if (!sprite.complete || !sprite.naturalWidth) return;
    const n = 8, fw = sprite.naturalWidth / n, fh = sprite.naturalHeight;
    const cw = Math.round(fw / fh * CH);
    frames = []; let minSpan = 1e9;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = cw; c.height = CH;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(sprite, i * fw, 0, fw, fh, 0, 0, cw, CH);
      const d = x.getImageData(0, 0, cw, CH); const a = d.data;
      let l = cw, r = 0;
      for (let p = 0; p < a.length; p += 4) {
        if (a[p + 3] < 110) a[p + 3] = 0;
        else { a[p + 3] = 255; const px = (p / 4) % cw, py = Math.floor(p / 4 / cw); if (py > CH * 0.86) { if (px < l) l = px; if (px > r) r = px; } }
      }
      x.putImageData(d, 0, 0); frames.push(c);
      if (r - l < minSpan) { minSpan = r - l; standFrame = i; } // 발 폭이 가장 좁은 프레임 = 서 있는 자세
    }
  }
  sprite.onload = buildFrames;

  function pixelate(im, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    x.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const d = x.getImageData(0, 0, w, h), a = d.data;
    for (let p = 0; p < a.length; p += 4) { a[p] = Math.round(a[p] * .92 / 24) * 24; a[p + 1] = Math.round(a[p + 1] * .92 / 24) * 24; a[p + 2] = Math.round(a[p + 2] * .9 / 24) * 24; }
    x.putImageData(d, 0, 0);
    return c;
  }

  // ---------- 크기와 배치 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
    P = Math.max(2, Math.min(5, Math.floor(Math.min(cw / 180, ch / 200))));
    W = Math.ceil(cw / P); H = Math.ceil(ch / P);
    canvas.width = Math.round(W * P * dpr); canvas.height = Math.round(H * P * dpr);
    roadX = Math.round((W - ROAD_W) / 2);
    layout();
  }
  function layout() {
    heroH = Math.max(H, Math.ceil(hero.offsetHeight / P) + 80);
    roadTop = heroH - 4;
    STOPS.forEach((s, i) => { s.y = heroH + 70 + i * GAP; });
    endY = STOPS[6].y;
    worldLen = endY + Math.max(H, 260);
    world.style.height = Math.round(worldLen * P) + 'px';
    hint.style.top = Math.round((heroH - 74) * P) + 'px';
    cards.forEach((el, i) => {
      const s = STOPS[i];
      el.style.top = Math.round((s.kind === 'end' ? s.y + 44 : s.y + BH + 6) * P) + 'px';
    });
  }
  function bx(s) { return s.side === 'l' ? roadX - WALK - BW : roadX + ROAD_W + WALK; }

  // ---------- 그리기 도우미 ----------
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function text(str, x, y, size, color, align = 'center', fam = 'Galmuri11') {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${size * P}px ${fam}, monospace`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x * P), Math.round(y * P)); ctx.restore();
  }
  const hash = (i, s = 0) => { let x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  function glow(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

  // ---------- 바닥 ----------
  function drawGround() {
    R(0, 0, W, H, '#0e2624');                               // 기본 땅(짙은 틸)
    // 광장 타일 (첫 화면과 마지막)
    const tile = (y0, y1) => {
      const a = Math.max(0, y0 - cam), b = Math.min(H, y1 - cam); if (b <= a) return;
      R(0, a, W, b - a, '#14302d');
      for (let y = Math.floor((y0 - cam) / 12) * 12; y < b; y += 12) for (let x = 0; x < W; x += 12) {
        const i = Math.round((y + cam) / 12) * 131 + x / 12;
        R(x, y, 11, 11, hash(i, 1) > .5 ? '#163431' : '#153230'); if (hash(i, 2) > .93) R(x + 3, y + 3, 4, 4, '#1a3b37');
      }
    };
    tile(0, roadTop + 6); tile(endY - 10, worldLen);
    // 인도
    const rt = Math.max(0, roadTop - cam), rb = Math.min(H, endY + 2 - cam);
    if (rb > rt) {
      R(roadX - WALK, rt, WALK, rb - rt, '#2b3a3a'); R(roadX + ROAD_W, rt, WALK, rb - rt, '#2b3a3a');
      for (let y = Math.floor((roadTop - cam) / 8) * 8; y < rb; y += 8) { R(roadX - WALK, y, WALK, 1, '#243130'); R(roadX + ROAD_W, y, WALK, 1, '#243130'); }
      R(roadX - 1, rt, 1, rb - rt, '#465353'); R(roadX + ROAD_W, rt, 1, rb - rt, '#465353'); // 연석
      // 차도
      R(roadX, rt, ROAD_W, rb - rt, '#171d1f');
      for (let y = Math.floor((roadTop - cam) / 20) * 20; y < rb; y += 20) if (y + 10 > rt) R(roadX + ROAD_W / 2 - 1, Math.max(y, rt), 2, Math.min(10, rb - Math.max(y, rt)), '#5a5c46');
      // 횡단보도 (시작과 끝)
      [roadTop + 34, endY - 24].forEach(cy => { const y = cy - cam; if (y > -20 && y < H + 20) for (let x = roadX + 4; x < roadX + ROAD_W - 4; x += 8) R(x, y, 5, 14, '#c9c7b3'); });
      // 맨홀
      [1, 3, 5].forEach(k => { const y = heroH + 70 + k * GAP - 90 - cam; if (y > -10 && y < H + 10) { R(roadX + 14, y, 8, 6, '#2a3032'); R(roadX + 15, y + 1, 6, 4, '#20272a'); } });
    }
  }

  // ---------- 소품 ----------
  function lamp(x, y, litSide) { // 가로등: 기둥 위에서 본 모습 + 바닥 빛
    glow(x + 1, y + 1, 16, 10, 'rgba(241,226,176,0.05)'); glow(x + 1, y + 1, 8, 5, 'rgba(241,226,176,0.06)');
    R(x - 1, y - 1, 4, 4, '#1b2626'); R(x, y, 2, 2, '#f1e2b0');
  }
  function tree(x, y, i) { const r = 9 + hash(i, 4) * 4; R(x - 1, y - 1, 3, 3, '#1a1410'); glow(x + 1, y + 1, r + 1, r + 1, '#0b1a17'); glow(x, y, r, r, '#1f5a3c'); glow(x - 2, y - 2, r * .55, r * .55, '#2c7a4e'); R(x - 3, y - 4, 2, 2, '#3f9a62'); }
  function planter(x, y) { R(x, y, 14, 7, '#3a2f28'); R(x + 1, y + 1, 12, 5, '#2f6b4a'); R(x + 3, y + 2, 3, 2, '#3b8258'); R(x + 8, y + 1, 3, 2, '#3b8258'); }
  function bench(x, y) { R(x, y, 18, 6, '#5a4a3a'); R(x, y + 2, 18, 1, '#3d3228'); R(x, y + 5, 18, 1, '#2b2b2b'); }
  function cat(x, y) { R(x, y, 7, 4, '#1b1b1b'); R(x + 6, y - 1, 3, 3, '#1b1b1b'); R(x + 6, y - 2, 1, 1, '#1b1b1b'); R(x + 8, y - 2, 1, 1, '#1b1b1b'); R(x + 7, y, 1, 1, '#9fe0c8'); R(x - 3, y + 1, 3, 1, '#1b1b1b'); }
  function car(x, y, c) { R(x, y, 14, 26, '#0a0e0e'); R(x + 1, y + 1, 12, 24, c); R(x + 2, y + 5, 10, 6, '#0d1a24'); R(x + 2, y + 16, 10, 5, '#0d1a24'); R(x + 1, y + 1, 2, 2, '#fff2c0'); R(x + 11, y + 1, 2, 2, '#fff2c0'); R(x + 1, y + 23, 2, 2, '#e0433a'); R(x + 11, y + 23, 2, 2, '#e0433a'); }
  function filler(side, y, i) { // 가게 사이를 채우는 다른 건물 (지붕만 보인다)
    const w = 30 + hash(i, 6) * 22, h = 34 + hash(i, 7) * 26;
    const x = side === 'l' ? roadX - WALK - w - hash(i, 8) * 6 : roadX + ROAD_W + WALK + hash(i, 8) * 6;
    R(x, y, w, h, '#0c1f1e'); R(x + 1, y + 1, w - 2, h - 2, '#112b29'); R(x + 1, y + 1, w - 2, 1, '#1a3d39');
    for (let yy = 6; yy < h - 6; yy += 8) for (let xx = 5; xx < w - 5; xx += 8) { const on = hash(i * 13 + xx * 3 + yy, 9); R(x + xx, y + yy, 3, 3, on > .85 ? '#b58a48' : on > .75 ? '#4f4c36' : '#0d2523'); }
    if (hash(i, 10) > .5) R(x + w - 10, y + h - 10, 6, 6, '#0c1f1e');
  }

  function shopfront(s, active) {
    const x = bx(s), y = s.y - cam, w = BW;
    const facade = y + ROOF_H;
    // 지붕
    R(x - 2, y - 2, w + 4, ROOF_H + 2, '#07100f'); R(x, y, w, ROOF_H, s.roof); R(x, y, w, 1, '#ffffff22');
    for (let yy = 3; yy < ROOF_H; yy += 4) R(x + 2, y + yy, w - 4, 1, '#00000030');
    R(x + w - 12, y + 4, 6, 6, '#0b1615'); R(x + w - 11, y + 5, 4, 4, s.wall2); // 실외기
    // 벽
    R(x, facade, w, FACADE_H, s.wall);
    for (let yy = facade + 3; yy < facade + FACADE_H; yy += 4) R(x, yy, w, 1, s.wall2);
    // 간판
    const sb = { x: x + 4, y: facade + 3, w: w - 8, h: 12 };
    if (active) { ctx.fillStyle = 'rgba(255,238,190,0.16)'; ctx.fillRect(sb.x - 3, sb.y - 3, sb.w + 6, sb.h + 6); }
    R(sb.x, sb.y, sb.w, sb.h, active ? '#101614' : '#0e1412'); R(sb.x, sb.y, sb.w, 1, '#ffffff22');
    if (fontsReady) text(s.sign, x + w / 2, sb.y + 10, s.sign.length > 4 ? 7 : 9, active ? '#ffe9a8' : '#c9b98f', 'center', s.sign.length > 4 ? 'Galmuri7' : 'Galmuri11');
    // 차양
    const ay = facade + 17;
    for (let ax = 0; ax < w + 4; ax += 6) R(x - 2 + ax, ay, Math.min(6, w + 4 - ax), 5, (ax / 6) % 2 ? s.aw1 : s.aw2);
    R(x - 2, ay + 5, w + 4, 1, '#0008');
    // 창 (매장 사진)
    const win = { x: x + 4, y: facade + 25, w: w - 22, h: 15 };
    R(win.x - 1, win.y - 1, win.w + 2, win.h + 2, active ? '#d8d0b0' : '#7d7a68');
    const im = s.photo && photos[s.photo];
    if (im && im.complete && im.naturalWidth) {
      if (!s.pix) s.pix = pixelate(im, win.w, win.h);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(s.pix, Math.round(win.x), Math.round(win.y));
      if (!active) { ctx.fillStyle = 'rgba(8,20,22,0.45)'; ctx.fillRect(win.x, win.y, win.w, win.h); }
    } else {
      R(win.x, win.y, win.w, win.h, active ? '#f0cf8a' : '#8a7a52');
      R(win.x + 3, win.y + 8, 8, 3, '#3a2c22'); R(win.x + 16, win.y + 8, 8, 3, '#3a2c22'); R(win.x + 5, win.y + 3, 2, 4, '#5a4a30'); R(win.x + 19, win.y + 3, 2, 4, '#5a4a30');
    }
    // 문 (도로 쪽)
    const dx = s.side === 'l' ? x + w - 14 : x + 4;
    R(dx, facade + FACADE_H - 20, 12, 20, '#141a1a'); R(dx + 1, facade + FACADE_H - 19, 10, 18, active ? '#3e3a2c' : '#2a2a24');
    R(dx + 2, facade + FACADE_H - 17, 8, 8, active ? '#f0cf8a' : '#5c5638'); R(dx + 9, facade + FACADE_H - 9, 1, 3, '#d8d0b0');
    if (active) { ctx.fillStyle = 'rgba(255,225,160,0.10)'; ctx.fillRect(x - 2, facade + FACADE_H, w + 4, 10); }
    // 입간판 + 지점 글자
    const bxs = s.side === 'l' ? x + w + 1 : x - 8;
    R(bxs, facade + FACADE_H - 10, 7, 10, '#e9e4d3'); R(bxs + 1, facade + FACADE_H - 8, 5, 5, '#3b3b3b'); R(bxs + 1, facade + FACADE_H - 6, 5, 1, '#e05a4a');
    if (s.kind === 'studio') { R(win.x + 2, win.y + 2, 4, 1, '#9cc3ff'); R(win.x + win.w - 5, win.y + 2, 1, 4, '#9cc3ff'); }
  }

  function endPlaza(active) {
    const y = endY - cam, cx = W / 2;
    if (y > H + 40 || y < -300) return;
    lamp(roadX - 4, y + 30); lamp(roadX + ROAD_W + 3, y + 30);
    bench(cx - 46, y + 18); bench(cx + 28, y + 18);
    tree(cx - 62, y + 34, 91); tree(cx + 62, y + 34, 92);
    cat(cx + 30, y + 30);
    // 표지판
    R(cx - 24, y + 6, 48, 14, active ? '#f0cf8a' : '#6a6a58'); R(cx - 24, y + 20, 48, 6, '#3d4a4a'); R(cx - 1, y + 26, 2, 4, '#2b3535');
    if (fontsReady) { text('@cxnrim', cx, y + 16, 8, '#1a1a1a', 'center', 'Galmuri7'); text('다음 걸음', cx, y + 25, 5, '#cfe6de', 'center', 'Galmuri7'); }
  }

  function drawStreet(cy) {
    // 시작 광장 소품
    const hy = heroH - cam;
    if (hy > -80 && hy < H + 80) {
      planter(roadX - 30, hy - 30); planter(roadX + ROAD_W + 16, hy - 30);
      lamp(roadX - 4, hy - 12); lamp(roadX + ROAD_W + 3, hy - 12);
      tree(roadX - 24, hy - 62, 81); tree(roadX + ROAD_W + 24, hy - 62, 82);
      R(roadX + ROAD_W + 34, hy - 50, 2, 14, '#2b3535'); R(roadX + ROAD_W + 22, hy - 56, 26, 8, '#1e3f3b'); R(roadX + ROAD_W + 22, hy - 56, 26, 1, '#7fd3c1');
      if (fontsReady) text('chungrim.me', roadX + ROAD_W + 35, hy - 50, 5, '#7fd3c1', 'center', 'Galmuri7');
    }
    // 가게 사이 채움 건물
    for (let y = roadTop + 10; y < endY - 30; y += 74) {
      ['l', 'r'].forEach((side, k) => {
        const i = Math.round(y / 74) * 2 + k;
        const near = STOPS.some(s => s.side === side && y + 62 > s.y - 8 && y < s.y + BH + 30);
        if (!near && y - cam > -70 && y - cam < H + 10) filler(side, y - cam, i);
      });
    }
    // 가게
    STOPS.forEach(s => {
      if (s.kind === 'end') return;
      const y = s.y - cam; if (y > H + 20 || y < -BH - 20) return;
      const active = Math.abs(cy - (s.y + BH * 0.7)) < 48;
      shopfront(s, active);
    });
    // 인도 소품과 차
    for (let y = roadTop + 40; y < endY - 40; y += 90) {
      const sy = y - cam; if (sy < -40 || sy > H + 40) continue;
      const i = Math.round(y / 90);
      if (i % 2) { lamp(roadX - 4, sy); if (hash(i, 11) > .5) tree(roadX + ROAD_W + 11, sy + 30, i); }
      else { lamp(roadX + ROAD_W + 3, sy); if (hash(i, 12) > .5) tree(roadX - 11, sy + 30, i); }
      if (hash(i, 13) > .74) car(hash(i, 14) > .5 ? roadX + 3 : roadX + ROAD_W - 17, sy + 20, ['#5a3f7a', '#8a3a3a', '#3a6a8a', '#c9c7b3'][i % 4]);
      if (i === 3) cat(roadX + ROAD_W + 9, sy + 50);
    }
    endPlaza(Math.abs(cy - (endY + 30)) < 60);
  }

  function drawChar(cy) {
    if (!frames) return;
    const f = moving ? frames[Math.floor(walked / 4) % 8] : frames[standFrame];
    const x = Math.round(W / 2 - f.width / 2), y = Math.round(cy - cam - f.height);
    glow(W / 2, cy - cam + 1, f.width / 2 - 1, 2, 'rgba(0,0,0,0.35)');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f, x, y);
  }

  // 캐릭터의 월드 y: 첫 화면에선 링크 목록 아래 서 있다가, 내려갈수록 화면 중앙으로 온다
  function charY(c) {
    const t = Math.min(1, c / Math.max(1, heroH)); const e = t * t * (3 - 2 * t);
    return (heroH - 16) * (1 - e) + (c + H * 0.5) * e;
  }

  function frame(now) {
    cam = window.scrollY / P;
    const cy = charY(cam);
    const d = cy - prevCy;
    if (Math.abs(d) > 0.05) { walked += Math.abs(d); dir = d > 0 ? 1 : -1; lastMoveT = now; }
    prevCy = cy;
    moving = now - lastMoveT < 140;
    ctx.setTransform(P * dpr, 0, 0, P * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawGround(); drawStreet(cy); drawChar(cy);
    // 표지판 점등
    cards.forEach((el, i) => { const s = STOPS[i]; const on = s.kind === 'end' ? Math.abs(cy - (endY + 30)) < 60 : Math.abs(cy - (s.y + BH * 0.7)) < 48; el.classList.toggle('on', on); });
    if (window.scrollY > 60) hint.classList.add('off'); else hint.classList.remove('off');
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  new ResizeObserver(() => layout()).observe(hero);
  document.fonts.load('11px Galmuri11').then(() => { fontsReady = true; });
  document.fonts.load('7px Galmuri7').catch(() => {});
  resize(); prevCy = charY(window.scrollY / P);
  requestAnimationFrame(frame);
})();
