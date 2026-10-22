(() => {
'use strict';
const D = window.DATA;
const A = D.assets;

/* ---------- routes ---------- */
const ROUTES = {
  'type-helvetica': '813', 'type-freesentation': '957',
  'spacing-helvetica': '591', 'spacing-freesentation': '700',
  'scale-helvetica': '1648', 'scale-freesentation': '1114',
  'shape-color': '1748', 'image': '2066',
};
const ROUTE_OF = Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [v, k]));
// prototype: menu → pages slide out to the right; these three cut instantly
const INSTANT = new Set(['', 'shape-color', 'image']);

// animated component instances placed on each long page: [set, startVariant, x, y, w, h]
const INST = {
  '813': [['0:100','0:101',1118,6737,652,922],['0:154','0:155',150,5600,383,383],['0:154','0:163',563,5600,383,383],
          ['0:154','0:167',975,5600,383,383],['0:154','0:171',1388,5600,383,383],['0:187','0:190',341,4727,1239,368],
          ['0:192','0:193',-31,231,1972,504]],
  '957': [['0:249','0:258',111,1816,401,281],['0:260','0:285',262,349,1402,300],['0:287','0:296',552,1795,401,281],
          ['0:298','0:315',125,5607,433,383],['0:298','0:299',537,5607,433,383],['0:298','0:346',949,5608,433,383],
          ['0:298','0:330',1362,5607,433,383]],
  '591': [['0:17','0:20',92,5302,513,306],['0:22','0:23',304,1401,471,506],['0:32','0:33',299,290,1322,665]],
  '700': [['0:53','0:56',92,5367,513,306],['0:58','0:59',304,1388,471,506],['0:63','0:64',471,243,1008,583]],
  '1114': [['0:363','0:364',67,3162,4809,200],['0:374','0:375',0,3,1920,1080]],
  '1648': [['0:383','0:384',148,400,1524,280],['0:363','0:364',130,3173,4809,200]],
  '1748': [['0:393','0:394',1224,540,564,580],['0:402','0:403',193,126,1019,1005],['0:411','0:412',-5,136,597,529],
           ['0:416','0:417',1259,105,494,493],['0:411','0:412',30,729,325,288]],
  '2066': [['0:425','0:438',122,779,1615,160],['0:450','0:459',132,499,893,180]],
};
const BURGER = { '1748': [1754, 33, 94, 86] }; // others: [1759, 45, 62, 62]
const TOP_Y = { '1748': 978, '2066': 978 };     // others: 937

/* ---------- smart-animate engine ---------- */
const EASE = {
  LINEAR: 'linear', EASE_IN: 'cubic-bezier(.42,0,1,1)', EASE_OUT: 'cubic-bezier(0,0,.58,1)',
  EASE_IN_AND_OUT: 'cubic-bezier(.42,0,.58,1)', GENTLE: 'cubic-bezier(.3,1.3,.55,1)',
};
const ease = e => !e ? 'linear' : Array.isArray(e) ? `cubic-bezier(${e.join(',')})` : (EASE[e] || 'ease');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

class Scene {
  constructor(id, startVariant, { auto = true } = {}) {
    this.S = D.scenes[id];
    this.vidx = {};
    this.S.V.forEach((v, i) => { this.vidx[v[0]] = i; });
    this.cur = startVariant != null ? this.vidx[startVariant] : 0;
    const v0 = this.S.V[this.cur];
    this.w = v0[1]; this.h = v0[2];
    this.auto = auto; this.timers = []; this.children = []; this.running = false; this.hoverFrom = null;

    const el = this.el = document.createElement('div');
    el.className = 'scene';
    el.style.width = this.w + 'px'; el.style.height = this.h + 'px';
    el.style.overflow = v0[3] ? 'hidden' : 'visible';

    this.nodes = this.S.N.map(([kind, parent, states]) => {
      const n = { kind, states, present: false, el: document.createElement('div'), assets: {} };
      n.el.className = 'n';
      if (kind === 0) {
        for (const st of states) {
          const aid = st && st[9];
          if (!aid || aid === -1 || n.assets[aid] !== undefined || !A[aid]) continue;
          const [ox, oy, rw, rh] = A[aid];
          const wrap = document.createElement('div');
          wrap.className = 'n-asset';
          const img = new Image();
          img.decoding = 'async'; img.alt = '';
          img.src = `assets/a/${aid}.webp`;
          Object.assign(img.style, { left: ox + 'px', top: oy + 'px', width: rw + 'px', height: rh + 'px' });
          wrap.appendChild(img);
          n.el.appendChild(wrap);
          n.assets[aid] = wrap;
        }
      } else if (kind === 2) {
        const first = states.find(Boolean);
        const [set, v] = first[9].split('|');
        n.child = new Scene(set, v);
        this.children.push(n.child);
        n.el.appendChild(n.child.el);
      }
      return n;
    });
    this.S.N.forEach(([, parent], i) => (parent < 0 ? el : this.nodes[parent].el).appendChild(this.nodes[i].el));

    if (this.S.V.some(v => v[4].some(r => r[0] === 'ON_HOVER'))) {
      el.addEventListener('mouseenter', () => this.hover(true));
      el.addEventListener('mouseleave', () => this.hover(false));
    }
    this.apply(this.cur, 0);
  }

  apply(vi, dur, ez = 'linear') {
    const T = dur > 0 && !REDUCED ? `transform ${dur}s ${ez}, opacity ${dur}s ${ez}, width ${dur}s ${ez}, height ${dur}s ${ez}` : 'none';
    // nodes appearing in this variant start at their destination and fade in
    let snapped = false;
    for (const n of this.nodes) {
      const st = n.states[vi];
      if (st && !n.present && T !== 'none') {
        n.el.style.transition = 'none';
        this.place(n, st, 'none');
        n.el.style.opacity = 0;
        snapped = true;
      }
    }
    if (snapped) void this.el.offsetWidth;
    for (const n of this.nodes) {
      const st = n.states[vi];
      n.el.style.transition = T;
      if (!st) { n.el.style.opacity = 0; n.present = false; continue; }
      this.place(n, st, T);
      n.el.style.opacity = st[8];
      n.present = true;
    }
  }

  place(n, st, T) {
    const [a, b, c, d, e, f, w, h, , x] = st;
    const m = `matrix(${a},${b},${c},${d},${e},${f})`;
    if (n.kind === 1) {
      n.el.style.transform = m;
      n.el.style.width = w + 'px'; n.el.style.height = h + 'px';
      n.el.style.overflow = x ? 'hidden' : 'visible';
    } else if (n.kind === 2) {
      n.el.style.transform = `${m} scale(${w / n.child.w},${h / n.child.h})`;
    } else {
      n.el.style.transform = m;
      for (const aid in n.assets) {
        const [, , , , W, H] = A[aid];
        const wrap = n.assets[aid];
        wrap.style.transition = T;
        wrap.style.transform = `scale(${W ? w / W : 1},${H ? h / H : 1})`;
        wrap.style.opacity = aid === x ? 1 : 0;
      }
    }
  }

  go(vi, dur, ez) {
    this.clear();
    this.apply(vi, dur, ez);
    this.cur = vi;
    if (this.running) this.schedule(dur);
  }

  schedule(after = 0) {
    for (const r of this.S.V[this.cur][4]) {
      if (r[0] !== 'AFTER_TIMEOUT' || !this.auto || this.vidx[r[2]] == null) continue;
      const to = this.vidx[r[2]];
      this.timers.push(setTimeout(() => this.go(to, r[5] ? r[3] : 0, ease(r[4])), (after + r[1]) * 1000 + 16));
    }
  }

  hover(on) {
    if (on) {
      const r = this.S.V[this.cur][4].find(r => r[0] === 'ON_HOVER');
      if (!r) return;
      this.hoverFrom = this.cur;
      this.go(this.vidx[r[2]], 0.25, 'cubic-bezier(.2,.7,.2,1)');
    } else if (this.hoverFrom != null) {
      const back = this.hoverFrom; this.hoverFrom = null;
      this.go(back, 0.25, 'cubic-bezier(.2,.7,.2,1)');
    }
  }

  clear() { this.timers.forEach(clearTimeout); this.timers = []; }
  start() { if (this.running) return; this.running = true; this.schedule(0); this.children.forEach(c => c.start()); }
  stop() { this.running = false; this.clear(); this.children.forEach(c => c.stop()); }
}

/* ---------- layout scale ---------- */
function rescale() {
  const vw = innerWidth, vh = innerHeight;
  const s = vw / 1920;
  document.documentElement.style.setProperty('--s', s);
  document.documentElement.style.setProperty('--si', Math.min(vw / 1920, vh / 1080));
  document.querySelectorAll('.page-wrap').forEach(w => { w.style.height = (+w.dataset.h * s) + 'px'; });
  menuInner.style.transform = `scale(${Math.min(s, vh / 1080)})`;
  menuPanel.style.width = 531 * Math.min(s, vh / 1080) + 'px';
}

function hot(parent, [x, y, w, h], label, fn) {
  const b = document.createElement('div');
  b.className = 'hot'; b.setAttribute('role', 'button'); b.tabIndex = 0;
  b.setAttribute('aria-label', label);
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  b.addEventListener('click', fn);
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  parent.appendChild(b);
  return b;
}

/* ---------- intro (Frame 82 → Desktop 30 → 31 ⇄ 29 ⇄ 32) ---------- */
function buildIntro() {
  const screen = document.createElement('section');
  screen.className = 'screen intro';
  const stage = document.createElement('div');
  stage.className = 'stage';
  const sc = new Scene('intro', '0:2279', { auto: false });
  stage.appendChild(sc.el);
  screen.appendChild(stage);
  const hint = document.createElement('div');
  hint.className = 'hint';
  screen.appendChild(hint);

  const BEZ = 'cubic-bezier(.88,.01,.17,.99)';
  let state = 0, busy = false, moved = false;
  const to = i => {
    if (busy || i < 2 || i > 4 || i === state) return;
    busy = true; state = i; sc.go(i, 1.5, BEZ);
    if (!moved) { moved = true; hint.classList.remove('on'); }
    setTimeout(() => { busy = false; }, 1550);
  };
  const logo = hot(stage, [756, 412, 408, 257], 'Visual Communication 시작', () => {
    if (state !== 0) return;
    logo.remove();
    state = 1; sc.go(1, 0);
    busy = true;
    setTimeout(() => {
      state = 2; sc.go(2, 1.5, BEZ);
      setTimeout(() => { busy = false; if (!moved) hint.classList.add('on'); }, 1550);
    }, 200);
  });
  hot(stage, [1759, 45, 62, 62], '메뉴 열기', () => { if (state >= 2) openMenu(); });

  const step = dir => { if (state >= 2) to(state + dir); };
  // one step per wheel gesture: trackpad inertia keeps resetting the quiet timer
  let lastWheel = 0;
  screen.addEventListener('wheel', e => {
    const now = performance.now(), fresh = now - lastWheel > 250;
    lastWheel = now;
    if (fresh && e.deltaY) step(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  let ty = null;
  screen.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
  screen.addEventListener('touchend', e => {
    if (ty == null) return;
    const dy = ty - e.changedTouches[0].clientY; ty = null;
    if (Math.abs(dy) > 40) step(dy > 0 ? 1 : -1);
  });
  let my = null;
  screen.addEventListener('mousedown', e => { my = e.clientY; });
  screen.addEventListener('mouseup', e => {
    if (my == null) return;
    const dy = my - e.clientY; my = null;
    if (Math.abs(dy) > 60) step(dy > 0 ? 1 : -1);
  });
  screen.onKey = e => {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) step(1);
    else if (['ArrowUp', 'PageUp'].includes(e.key)) step(-1);
    else if (e.key === 'Enter' && state === 0) logo.click();
  };
  sc.start();
  screen.scene = sc;
  return screen;
}

/* ---------- long pages ---------- */
function buildPage(pid) {
  const [H, tiles] = D.pages[pid];
  const screen = document.createElement('section');
  screen.className = 'screen';
  const scroller = document.createElement('div');
  scroller.className = 'scroller';
  const wrap = document.createElement('div');
  wrap.className = 'page-wrap'; wrap.dataset.h = H;
  wrap.style.height = H * innerWidth / 1920 + 'px';
  const page = document.createElement('div');
  page.className = 'page'; page.style.height = H + 'px';
  for (let i = 0; i < tiles; i++) {
    const img = new Image();
    img.className = 'tile'; img.alt = ''; img.decoding = 'async';
    if (i > 1) img.loading = 'lazy';
    img.src = `assets/p/${pid}_${i}.webp`;
    page.appendChild(img);
  }
  const scenes = [];
  const io = new IntersectionObserver(es => es.forEach(e => {
    const s = e.target.scene;
    e.isIntersecting ? s.start() : s.stop();
  }), { root: scroller, rootMargin: '200px 0px' });
  for (const [set, v, x, y, w, h] of INST[pid]) {
    const sc = new Scene(set, v);
    const box = document.createElement('div');
    box.className = 'inst';
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    sc.el.style.transform = `scale(${w / sc.w},${h / sc.h})`;
    box.appendChild(sc.el); box.scene = sc;
    page.appendChild(box);
    scenes.push(sc); io.observe(box);
  }
  hot(page, BURGER[pid] || [1759, 45, 62, 62], '메뉴 열기', openMenu);
  wrap.appendChild(page); scroller.appendChild(wrap); screen.appendChild(scroller);

  const top = document.createElement('div');
  top.className = 'totop'; top.setAttribute('role', 'button'); top.tabIndex = 0;
  top.setAttribute('aria-label', '맨 위로');
  if (TOP_Y[pid]) top.style.bottom = `calc(${1080 - TOP_Y[pid] - 50}px * var(--s))`;
  const ts = new Scene('top');
  top.appendChild(ts.el);
  top.addEventListener('click', () => scroller.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }));
  screen.appendChild(top);

  screen.onKey = e => { if (e.key === 'Home') scroller.scrollTo({ top: 0 }); };
  screen.cleanup = () => { io.disconnect(); scenes.forEach(s => s.stop()); };
  return screen;
}

/* ---------- menu overlay (Frame 57 …) ---------- */
const menu = document.getElementById('menu');
const menuPanel = menu.querySelector('.menu-panel');
const menuInner = menu.querySelector('.menu-inner');
const menuScene = new Scene('menu');
menuInner.appendChild(menuScene.el);
const MENU_ITEMS = [
  // [hotspot, route, label, highlighted node index]
  [[72, 234, 93, 34], 'type-helvetica', '서체꼴 이야기 — Helvetica', 7],
  [[72, 278, 171, 34], 'type-freesentation', '서체꼴 이야기 — Freesentation', 10],
  [[72, 417, 93, 34], 'spacing-helvetica', '자간행간 사이사이 — Helvetica', 8],
  [[72, 461, 171, 34], 'spacing-freesentation', '자간행간 사이사이 — Freesentation', 9],
  [[72, 600, 93, 34], 'scale-helvetica', '크기 무게 질감 — Helvetica', 11],
  [[72, 644, 171, 34], 'scale-freesentation', '크기 무게 질감 — Freesentation', 12],
  [[72, 760, 109, 43], 'shape-color', '형태와 컬러', 13],
  [[72, 853, 178, 43], 'image', '이미지 실사의 위력', 14],
];
for (const [rect, route, label, ni] of MENU_ITEMS) {
  const b = hot(menuInner, rect, label, () => { closeMenu(); go(route); });
  const node = menuScene.nodes[ni].el;
  b.addEventListener('mouseenter', () => node.classList.add('hl'));
  b.addEventListener('mouseleave', () => { if (current !== route) node.classList.remove('hl'); });
  b.dataset.route = route; b.node = node;
}
hot(menuInner, [27, 22, 223, 140], 'Visual Communication 처음으로', () => { closeMenu(); go(''); });
hot(menuInner, [357, 41, 89, 73], '메뉴 닫기', closeMenu);
menu.querySelector('.menu-backdrop').addEventListener('click', closeMenu);

function openMenu() {
  menuInner.querySelectorAll('.hot[data-route]').forEach(b => b.node.classList.toggle('hl', b.dataset.route === current));
  menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false');
}
function closeMenu() { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); }

/* ---------- navigation ---------- */
const app = document.getElementById('app');
let current = null, screenEl = null;

function render(route, animate) {
  if (route === current) return;
  const pid = ROUTES[route];
  const next = pid ? buildPage(pid) : buildIntro();
  const prev = screenEl;
  current = route; screenEl = next;
  document.title = pid ? `${menuLabel(route)} — Visual Communication Archive` : 'Visual Communication Archive';
  if (prev && animate && !REDUCED) {
    app.insertBefore(next, prev);
    prev.classList.add('leaving');
    const anim = prev.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
      { duration: 800, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    anim.onfinish = () => dispose(prev);
  } else {
    app.appendChild(next);
    if (prev) dispose(prev);
  }
}
function dispose(el) {
  el.cleanup && el.cleanup();
  el.scene && el.scene.stop();
  el.remove();
}
const menuLabel = r => (MENU_ITEMS.find(m => m[1] === r) || [, , ''])[2];

function go(route) {
  const h = route ? `#/${route}` : '#/';
  if (location.hash === h) return;
  location.hash = h;
}
function fromHash(animate) {
  let r = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (r && !ROUTES[r]) r = '';
  render(r, animate && !INSTANT.has(r));
}
addEventListener('hashchange', () => fromHash(true));
addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeMenu();
  if (menu.classList.contains('open')) return;
  screenEl && screenEl.onKey && screenEl.onKey(e);
});
addEventListener('resize', rescale);
rescale();
fromHash(false);
})();
