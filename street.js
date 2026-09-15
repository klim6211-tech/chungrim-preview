/* chungrim.me — 픽셀 거리. 스크롤하면 캐릭터가 거리를 걷고, 각 섹션의 가게 앞에 선다. */
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const hint = document.getElementById('hint');
  const stops = [...document.querySelectorAll('[data-stop]')];

  // 정류장(가게) 정의 — 섹션 순서와 같다
  const STOPS = [
    { kind: 'shop', sign: '뱃꼬동', tag: '해물포차 구월점', photo: 'assets/sea.jpg', wall: '#22405f', wall2: '#1a3350', aw1: '#e8e2d2', aw2: '#2d5c8a' },
    { kind: 'shop', sign: '뱃꼬동', tag: '해물포차 부평점', photo: 'assets/bupyeong.jpg', wall: '#1e4a58', wall2: '#173b46', aw1: '#e8e2d2', aw2: '#2a7a8c' },
    { kind: 'shop', sign: '뱃꼬동', tag: '숙성집 구월점', photo: 'assets/shop.jpg', wall: '#5a3a2e', wall2: '#472d24', aw1: '#efe6d6', aw2: '#7a3d2c' },
    { kind: 'shop', sign: '뱃꼬동', tag: '숙성집 전주점', photo: null, wall: '#4f3a34', wall2: '#3e2c28', aw1: '#efe6d6', aw2: '#8a4a34' },
    { kind: 'shop', sign: '철계직화장', tag: '구월점', photo: 'assets/chicken.jpg', wall: '#2b2b2f', wall2: '#202024', aw1: '#3a3a40', aw2: '#d8703a' },
    { kind: 'studio', sign: 'WESTORE', tag: '작업실', photo: 'assets/drawing.jpg', wall: '#1b2b44', wall2: '#14213a', aw1: '#5B8DEF', aw2: '#3e6fd6' },
    { kind: 'end', sign: '@cxnrim', tag: '다음 걸음' },
  ];

  const K = 0.55;          // 스크롤 1px 당 걷는 거리(월드 px)
  let W = 0, H = 0, P = 2, dpr = 1; // 월드 크기, 픽셀 배율
  let cam = 0, target = 0, facing = 1, walked = 0, moving = false;
  let stopX = [];           // 각 정류장의 월드 x
  let fontsReady = false;

  // ---------- 에셋 ----------
  const sprite = new Image(); sprite.src = 'assets/walk.png';
  const photos = {};
  STOPS.forEach(s => { if (s.photo) { const im = new Image(); im.src = s.photo; photos[s.photo] = im; im.onload = () => { s.pix = null; }; } });
  let frames = null, standFrame = 2, CH = 48; // 캐릭터 키(월드 px)

  function buildFrames() {
    if (!sprite.complete || !sprite.naturalWidth) return;
    const n = 8, fw = sprite.naturalWidth / n, fh = sprite.naturalHeight;
    const cw = Math.round(fw / fh * CH);
    frames = [];
    let minW = 1e9;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = cw; c.height = CH;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(sprite, i * fw, 0, fw, fh, 0, 0, cw, CH);
      // 반투명 픽셀 정리(도트 느낌)
      const d = x.getImageData(0, 0, cw, CH); const a = d.data;
      let l = cw, r = 0;
      for (let p = 0; p < a.length; p += 4) { if (a[p + 3] < 110) a[p + 3] = 0; else { a[p + 3] = 255; const px = (p / 4) % cw; if (px < l) l = px; if (px > r) r = px; } }
      x.putImageData(d, 0, 0);
      frames.push(c);
      if (r - l < minW) { minW = r - l; standFrame = i; }
    }
  }
  sprite.onload = buildFrames;

  function pixelate(im, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    x.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    // 살짝 어둡게 + 색 단순화
    const d = x.getImageData(0, 0, w, h), a = d.data;
    for (let p = 0; p < a.length; p += 4) { a[p] = Math.round(a[p] * .92 / 24) * 24; a[p + 1] = Math.round(a[p + 1] * .92 / 24) * 24; a[p + 2] = Math.round(a[p + 2] * .9 / 24) * 24; }
    x.putImageData(d, 0, 0);
    return c;
  }

  // ---------- 크기 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = stage.clientWidth, ch = stage.clientHeight;
    P = Math.max(2, Math.min(6, Math.floor(Math.min(cw / 190, ch / 120))));
    W = Math.ceil(cw / P); H = Math.ceil(ch / P);
    canvas.width = Math.round(W * P * dpr); canvas.height = Math.round(H * P * dpr);
    layout();
  }
  function layout() {
    const stageH = stage.clientHeight;
    stopX = stops.map(el => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const reach = Math.max(0, top - stageH - 24);
      return W / 2 + reach * K;
    });
  }

  // ---------- 그리기 도우미 ----------
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function text(str, x, y, size, color, align = 'center', fam = 'Galmuri11') {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${size * P}px ${fam}, monospace`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x * P), Math.round(y * P)); ctx.restore();
  }
  const hash = (i, s = 0) => { let x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- 장면 ----------
  function drawSky() {
    const bands = ['#07171a', '#0a1e20', '#0d2626', '#102e2c', '#143733', '#183f3a', '#1d4a42', '#22544a'];
    const bh = Math.ceil(H / bands.length);
    bands.forEach((c, i) => R(0, i * bh, W, bh + 1, c));
    // 별
    for (let i = 0; i < 60; i++) {
      const sx = (hash(i) * 900 - cam * 0.03) % 900; const x = ((sx % W) + W) % W;
      const y = hash(i, 1) * H * 0.55; const tw = 0.55 + 0.45 * Math.sin(Date.now() / 700 + i);
      R(x, y, 1, 1, `rgba(220,240,235,${(0.35 + hash(i, 2) * 0.5) * tw})`);
    }
    // 달
    const mx = W - 34, my = 18;
    R(mx, my + 2, 10, 6, '#e6efe3'); R(mx + 2, my, 6, 10, '#e6efe3'); R(mx + 1, my + 1, 8, 8, '#e6efe3');
    R(mx + 4, my + 2, 6, 6, '#143733'); R(mx + 6, my + 1, 3, 8, '#143733');
  }
  function drawFar(ground) {
    // 먼 스카이라인
    const par = 0.18, span = 70;
    const start = Math.floor((cam * par) / span) - 1;
    for (let i = start; i < start + W / span + 3; i++) {
      const h = 24 + hash(i, 3) * 34, w = 40 + hash(i, 4) * 40;
      const x = i * span - cam * par;
      R(x, ground - 14 - h, w, h + 14, '#0b2321');
      for (let wy = 0; wy < h - 6; wy += 6) for (let wx = 4; wx < w - 4; wx += 6) if (hash(i * 31 + wx * 7 + wy, 5) > 0.86) R(x + wx, ground - 14 - h + 3 + wy, 2, 2, '#245049');
    }
    // 중간 건물
    const par2 = 0.45, span2 = 96;
    const s2 = Math.floor((cam * par2) / span2) - 1;
    for (let i = s2; i < s2 + W / span2 + 3; i++) {
      const h = 46 + hash(i, 6) * 30, w = 56 + hash(i, 7) * 34;
      const x = i * span2 - cam * par2 + hash(i, 8) * 20;
      R(x, ground - 8 - h, w, h + 8, '#0f2b29'); R(x, ground - 8 - h, w, 2, '#173e3a');
      if (hash(i, 9) > 0.5) { R(x + w - 14, ground - 8 - h - 8, 8, 8, '#0f2b29'); R(x + w - 13, ground - 8 - h - 9, 6, 1, '#173e3a'); }
      for (let wy = 6; wy < h - 4; wy += 9) for (let wx = 5; wx < w - 6; wx += 9) {
        const on = hash(i * 17 + wx * 3 + wy, 10);
        R(x + wx, ground - 8 - h + wy, 4, 5, on > 0.8 ? '#b58a48' : on > 0.7 ? '#4f4c36' : '#0a1f1e');
      }
    }
  }
  function drawGround(ground) {
    R(0, ground, W, 12, '#2d3a3a');                       // 보도
    for (let x = -((cam) % 8); x < W; x += 8) R(x, ground, 1, 12, '#26312f');
    R(0, ground + 6, W, 1, '#26312f');
    R(0, ground + 12, W, 3, '#3b4646'); R(0, ground + 12, W, 1, '#4a5757'); // 연석
    R(0, ground + 15, W, H - ground - 15, '#161c1e');       // 도로
    for (let x = -((cam) % 24); x < W; x += 24) R(x, ground + 24, 12, 1, '#3a4243');
  }
  function lamp(x, ground, lit = true) {
    R(x, ground - 46, 2, 46, '#1b2626'); R(x - 1, ground - 1, 4, 1, '#1b2626');
    R(x - 3, ground - 50, 8, 4, '#1b2626'); R(x - 2, ground - 49, 6, 2, lit ? '#f1e2b0' : '#4a4a3a');
    if (lit) { ctx.fillStyle = 'rgba(241,226,176,0.06)'; ctx.beginPath(); ctx.moveTo(x - 2, ground - 47); ctx.lineTo(x + 4, ground - 47); ctx.lineTo(x + 18, ground + 12); ctx.lineTo(x - 16, ground + 12); ctx.fill(); }
  }
  function planter(x, ground) { R(x, ground - 7, 14, 7, '#3a2f28'); R(x + 1, ground - 8, 12, 1, '#4a3c33'); R(x + 2, ground - 14, 10, 7, '#2f6b4a'); R(x + 4, ground - 17, 6, 4, '#3b8258'); R(x + 1, ground - 12, 3, 3, '#3b8258'); }
  function bench(x, ground) { R(x, ground - 6, 18, 2, '#5a4a3a'); R(x, ground - 3, 18, 2, '#5a4a3a'); R(x + 1, ground - 9, 16, 2, '#5a4a3a'); R(x + 2, ground - 4, 2, 4, '#2b2b2b'); R(x + 14, ground - 4, 2, 4, '#2b2b2b'); }
  function cat(x, ground) { R(x, ground - 4, 6, 4, '#1b1b1b'); R(x + 5, ground - 7, 4, 4, '#1b1b1b'); R(x + 5, ground - 8, 1, 1, '#1b1b1b'); R(x + 8, ground - 8, 1, 1, '#1b1b1b'); R(x + 6, ground - 6, 1, 1, '#9fe0c8'); R(x + 8, ground - 6, 1, 1, '#9fe0c8'); R(x - 3, ground - 2, 3, 1, '#1b1b1b'); }
  function vending(x, ground) { R(x, ground - 24, 12, 24, '#243b52'); R(x + 1, ground - 23, 10, 12, '#9ad7e8'); R(x + 2, ground - 21, 2, 3, '#e05a4a'); R(x + 5, ground - 21, 2, 3, '#f2c94c'); R(x + 8, ground - 21, 2, 3, '#7ac86a'); R(x + 2, ground - 16, 2, 3, '#e05a4a'); R(x + 5, ground - 16, 2, 3, '#5B8DEF'); R(x + 2, ground - 8, 8, 4, '#101a24'); }

  function shopfront(s, i, x, ground, active) {
    const w = s.kind === 'studio' ? 96 : 84, h = 72, top = ground - h;
    // 벽
    R(x, top, w, h, s.wall);
    for (let y = top + 3; y < ground; y += 4) R(x, y, w, 1, s.wall2);
    R(x - 2, top - 2, w + 4, 3, s.wall2); R(x - 2, top - 3, w + 4, 1, '#000a');
    // 간판
    const sb = { x: x + 6, y: top + 5, w: w - 12, h: 15 };
    R(sb.x, sb.y, sb.w, sb.h, active ? '#101614' : '#0e1412'); R(sb.x, sb.y, sb.w, 1, '#ffffff22');
    if (active) { ctx.fillStyle = 'rgba(255,238,190,0.12)'; ctx.fillRect(sb.x - 3, sb.y - 3, sb.w + 6, sb.h + 6); }
    if (fontsReady) text(s.sign, x + w / 2, sb.y + 12, 11, active ? '#ffe9a8' : '#c9b98f');
    // 차양
    const ay = top + 24;
    for (let ax = 0; ax < w + 4; ax += 6) R(x - 2 + ax, ay, Math.min(6, w + 4 - ax), 6, (ax / 6) % 2 ? s.aw1 : s.aw2);
    for (let ax = 0; ax < w + 4; ax += 6) R(x - 2 + ax + 1, ay + 6, 4, 1, (ax / 6) % 2 ? s.aw1 : s.aw2);
    R(x - 2, ay + 7, w + 4, 1, '#0006');
    // 창
    R(x, top + 32, w, 10, s.wall2); R(x, top + 32, w, 1, '#0004');
    const win = { x: x + 7, y: top + 43, w: w - 36, h: 22 };
    R(win.x - 1, win.y - 1, win.w + 2, win.h + 2, active ? '#d8d0b0' : '#7d7a68');
    const im = s.photo && photos[s.photo];
    if (im && im.complete && im.naturalWidth) {
      if (!s.pix) s.pix = pixelate(im, win.w, win.h);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(s.pix, Math.round(win.x), Math.round(win.y));
      if (!active) { ctx.fillStyle = 'rgba(8,20,22,0.45)'; ctx.fillRect(win.x, win.y, win.w, win.h); }
    } else {
      R(win.x, win.y, win.w, win.h, active ? '#f0cf8a' : '#8a7a52');
      R(win.x + 4, win.y + 12, 10, 4, '#3a2c22'); R(win.x + 20, win.y + 12, 10, 4, '#3a2c22'); R(win.x + 36, win.y + 12, 10, 4, '#3a2c22');
      R(win.x + 6, win.y + 3, 2, 6, '#5a4a30'); R(win.x + 26, win.y + 3, 2, 6, '#5a4a30');
    }
    if (active) { ctx.fillStyle = 'rgba(255,225,160,0.10)'; ctx.beginPath(); ctx.moveTo(win.x, win.y + win.h); ctx.lineTo(win.x + win.w, win.y + win.h); ctx.lineTo(win.x + win.w + 10, ground + 12); ctx.lineTo(win.x - 10, ground + 12); ctx.fill(); }
    // 문
    const dx = x + w - 24;
    R(dx, ground - 27, 16, 27, '#141a1a'); R(dx + 1, ground - 26, 14, 25, active ? '#3e3a2c' : '#2a2a24');
    R(dx + 3, ground - 24, 10, 10, active ? '#f0cf8a' : '#5c5638'); R(dx + 12, ground - 13, 1, 3, '#d8d0b0');
    R(dx - 1, ground - 1, 18, 1, '#0a0e0e');
    // 작은 걸림판(상호 뒷줄)
    if (fontsReady) text(s.tag, x + 7, top + 40, 7, active ? '#ffe9a8' : '#b8b09a', 'left', 'Galmuri7');
    // 입간판
    R(x + w - 34, ground - 10, 7, 10, '#e9e4d3'); R(x + w - 33, ground - 8, 5, 5, '#3b3b3b'); R(x + w - 33, ground - 6, 5, 1, '#e05a4a');
    if (s.kind === 'studio') {
      // 창에 모니터 불빛
      R(win.x + win.w - 6, win.y + 2, 1, 4, '#9cc3ff'); R(win.x + 2, win.y + 2, 4, 1, '#9cc3ff');
    }
  }
  function endpost(s, x, ground, active) {
    lamp(x + 30, ground, true);
    bench(x + 4, ground);
    // 표지판
    R(x - 26, ground - 34, 2, 34, '#2b3535');
    R(x - 44, ground - 34, 40, 10, active ? '#f0cf8a' : '#6a6a58'); R(x - 6, ground - 31, 4, 4, active ? '#f0cf8a' : '#6a6a58');
    if (fontsReady) text(s.sign, x - 24, ground - 27, 7, '#1a1a1a', 'center', 'Galmuri7');
    R(x - 44, ground - 22, 40, 8, '#3d4a4a');
    if (fontsReady) text('다음 걸음', x - 24, ground - 16, 7, '#cfe6de', 'center', 'Galmuri7');
    cat(x + 44, ground);
  }

  function drawStreet(ground) {
    // 시작점 안내판
    const sx0 = 22 - cam;
    R(sx0, ground - 30, 2, 30, '#2b3535'); R(sx0 - 14, ground - 34, 30, 9, '#1e3f3b'); R(sx0 - 14, ground - 34, 30, 1, '#7fd3c1');
    if (fontsReady) text('chungrim.me', sx0 + 1, ground - 27, 7, '#7fd3c1', 'center', 'Galmuri7');
    lamp(W / 2 + 40 - cam, ground);
    planter(W / 2 + 56 - cam, ground);

    stopX.forEach((wx, i) => {
      const s = STOPS[i]; const x = wx - cam - (s.kind === 'studio' ? 48 : 42);
      if (x > W + 60 || x < -160) return;
      const active = Math.abs(cam - (wx - W / 2)) < 30;
      if (s.kind === 'end') endpost(s, wx - cam, ground, active);
      else shopfront(s, i, x, ground, active);
      // 가게 사이 소품
      if (s.kind !== 'end') {
        const gx = x + 110;
        const kind = i % 4;
        if (kind === 0) { lamp(gx, ground); planter(gx + 14, ground); }
        else if (kind === 1) { vending(gx, ground); lamp(gx + 40, ground); }
        else if (kind === 2) { bench(gx, ground); cat(gx + 24, ground); lamp(gx + 50, ground); }
        else { planter(gx, ground); lamp(gx + 30, ground); planter(gx + 44, ground); }
      }
    });
  }

  function drawChar(ground) {
    if (!frames) return;
    const f = moving ? frames[Math.floor(walked / 5) % 8] : frames[standFrame];
    const x = Math.round(W / 2 - f.width / 2), y = ground + 1 - f.height;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2, ground, f.width - 4, 2);
    ctx.imageSmoothingEnabled = false;
    if (facing < 0) { ctx.save(); ctx.translate(x + f.width, y); ctx.scale(-1, 1); ctx.drawImage(f, 0, 0); ctx.restore(); }
    else ctx.drawImage(f, x, y);
  }

  function frame() {
    const d = target - cam;
    if (Math.abs(d) > 0.4) { const step = d * 0.16; cam += step; walked += Math.abs(step); moving = true; facing = d > 0 ? 1 : -1; }
    else { cam = target; moving = false; }
    ctx.setTransform(P * dpr, 0, 0, P * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const ground = H - 30;
    drawSky(); drawFar(ground); drawGround(ground); drawStreet(ground); drawChar(ground);
    requestAnimationFrame(frame);
  }

  addEventListener('scroll', () => { target = window.scrollY * K; if (window.scrollY > 40) hint.classList.add('off'); }, { passive: true });
  addEventListener('resize', resize);
  new ResizeObserver(layout).observe(document.getElementById('page'));
  document.fonts.load('11px Galmuri11').then(() => { fontsReady = true; });
  document.fonts.load('7px Galmuri7').catch(() => {});
  resize(); target = window.scrollY * K; cam = target;
  requestAnimationFrame(frame);
})();
