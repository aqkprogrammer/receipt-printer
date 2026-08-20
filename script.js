/* ─────────────────────────────────────────────────────────────
   Receipt printer — checkout flow, card form, authorisation,
   paper feed and drag-to-tear-off. No dependencies.
   ───────────────────────────────────────────────────────────── */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const screenEl  = $('.screen');
const panes     = $$('.pane');
const stepEls   = $$('.steps li');
const summaryEl = $('[data-summary]');
const totalEl   = $('[data-total]');
const payTotalEl= $('[data-pay-total]');
const seatOut   = $('[data-seats-value]');
const seatPrice = $('[data-seat-price]');
const segmented = $('.segmented');
const promoForm = $('[data-promo-form]');
const promoInput= $('[data-promo-input]');
const promoError= $('[data-promo-error]');
const payForm   = $('[data-pay-form]');
const payBtn    = $('[data-pay-btn]');
const card      = $('[data-card]');
const cardInner = $('.card3d__inner');
const seal      = $('[data-seal]');
const checklist = $$('[data-checklist] li');
const approved  = $('[data-approved]');
const paper     = $('[data-paper]');
const paperWin  = $('.paper__window');
const receipt   = $('.receipt');
const barcodeEl = $('[data-barcode]');
const tearHint  = $('[data-tear-hint]');
const soundBtn  = $('[data-action="sound"]');
const soundLabel= $('[data-sound-label]');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FEED_MS = 2600;   // full receipt feed time
const STEP_PX = 3;      // stepper-motor quantisation
const TEAR_PX = 70;     // drag distance that rips the paper

/* ── model ───────────────────────────────────────────────────── */

const PRICE  = { monthly: 20, annual: 240 };   // list price per seat, per term
const SAVING = { monthly: 0,  annual: 0.20 };  // annual discount
const PROMOS = { LAUNCH10: 0.10 };
const VAT    = 0.20;

const state = {
  cycle: 'annual',
  seats: 1,
  promo: null,
  card: { number: '', exp: '', cvc: '', name: '', brand: null },
  order: null,
  orderNo: 2048,
};

const money = (n) => '£' + n.toFixed(2);

function quote() {
  const list = PRICE[state.cycle] * state.seats;
  const annual = list * SAVING[state.cycle];
  const promo = (list - annual) * (PROMOS[state.promo] ?? 0);
  const subtotal = list - annual - promo;
  const tax = subtotal * VAT;
  return { list, annual, promo, subtotal, tax, total: subtotal + tax };
}

/* rows shared by the on-screen summary and the printed receipt */
function rows(q) {
  const term = state.cycle === 'annual' ? '12 months' : '1 month';
  const out = [
    { k: `Pro plan × ${state.seats} · ${term}`, v: money(q.list), rk: 'Pro plan', rv: money(q.list) },
  ];
  if (q.annual) out.push({ k: 'Annual discount (−20%)', v: '−' + money(q.annual), credit: true, rk: 'Annual −20%', rv: '−' + money(q.annual) });
  if (q.promo)  out.push({ k: `Promo ${state.promo}`, v: '−' + money(q.promo), credit: true, rk: `Promo ${state.promo}`, rv: '−' + money(q.promo) });
  out.push({ k: 'Subtotal', v: money(q.subtotal), rk: 'Subtotal', rv: money(q.subtotal) });
  out.push({ k: `VAT ${VAT * 100}%`, v: money(q.tax), rk: 'Tax', rv: money(q.tax) });
  return out;
}

/* ── number tween (odometer-ish) ─────────────────────────────── */

const tweens = new WeakMap();

function tweenMoney(el, to) {
  const from = parseFloat((el.textContent || '').replace(/[^\d.]/g, '')) || 0;
  cancelAnimationFrame(tweens.get(el));
  if (reduced || Math.abs(to - from) < 0.005) { el.textContent = money(to); return; }

  const start = performance.now();
  const dur = 420;
  const frame = (now) => {
    const t = Math.min((now - start) / dur, 1);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = money(from + (to - from) * e);
    if (t < 1) tweens.set(el, requestAnimationFrame(frame));
  };
  tweens.set(el, requestAnimationFrame(frame));
}

/* ── plan step ───────────────────────────────────────────────── */

function renderPlan() {
  const q = quote();

  seatOut.textContent = state.seats;
  seatPrice.textContent = state.cycle === 'annual'
    ? `${money(PRICE.annual * (1 - SAVING.annual))} / seat / year`
    : `${money(PRICE.monthly)} / seat / month`;

  summaryEl.replaceChildren(...rows(q).map((r, i) => {
    const div = document.createElement('div');
    if (r.credit) div.className = 'is-credit';
    div.style.animationDelay = i * 35 + 'ms';
    div.innerHTML = `<span></span><b></b>`;
    div.firstChild.textContent = r.k;
    div.lastChild.textContent = r.v;
    return div;
  }));

  tweenMoney(totalEl, q.total);
  tweenMoney(payTotalEl, q.total);
  $$('.stepper button').forEach((b) => {
    b.disabled = b.dataset.seats === '-1' ? state.seats <= 1 : state.seats >= 25;
  });
  sizeScreen();
}

segmented.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cycle]');
  if (!btn || btn.dataset.cycle === state.cycle) return;
  state.cycle = btn.dataset.cycle;
  segmented.dataset.cycle = state.cycle;
  $$('[data-cycle]', segmented).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  audio.blip(state.cycle === 'annual' ? 660 : 520);
  renderPlan();
});

$$('.stepper button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.seats = Math.min(25, Math.max(1, state.seats + Number(btn.dataset.seats)));
    seatOut.animate(
      [{ transform: 'translateY(6px)', opacity: 0.3 }, { transform: 'none', opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    audio.blip(700);
    renderPlan();
  });
});

promoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = promoInput.value.trim().toUpperCase();
  if (PROMOS[code]) {
    state.promo = code;
    promoInput.value = code;
    promoForm.classList.add('is-applied');
    promoError.hidden = true;
    audio.chime();
  } else {
    state.promo = null;
    promoForm.classList.remove('is-applied');
    promoError.hidden = false;
    promoInput.classList.add('shake');
    setTimeout(() => promoInput.classList.remove('shake'), 420);
    audio.buzz();
  }
  renderPlan();
});

/* ── step navigation ─────────────────────────────────────────── */

const ORDER = ['plan', 'pay', 'done'];
let step = 'plan';

function sizeScreen() {
  const active = panes.find((p) => p.dataset.pane === step);
  if (active) screenEl.style.height = active.offsetHeight + 'px';
}

function goto(next) {
  step = next;
  screenEl.dataset.active = next;
  const idx = ORDER.indexOf(next);

  panes.forEach((p) => {
    const i = ORDER.indexOf(p.dataset.pane);
    p.classList.toggle('is-active', i === idx);
    p.classList.toggle('is-past', i < idx);
  });
  stepEls.forEach((li) => {
    const i = ORDER.indexOf(li.dataset.step);
    li.classList.toggle('is-active', i === idx);
    li.classList.toggle('is-done', i < idx);
  });

  sizeScreen();
  audio.swish();
}

$('[data-action="to-pay"]').addEventListener('click', () => {
  goto('pay');
  setTimeout(() => $('[data-input="number"]').focus({ preventScroll: true }), 420);
});

/* ── card form ───────────────────────────────────────────────── */

const BRANDS = [
  { id: 'VISA',   test: /^4/,                 groups: [4, 4, 4, 4], cvc: 3 },
  { id: 'MASTER', test: /^(5[1-5]|2[2-7])/,   groups: [4, 4, 4, 4], cvc: 3, label: 'Mastercard' },
  { id: 'AMEX',   test: /^3[47]/,             groups: [4, 6, 5],    cvc: 4 },
  { id: 'DISC',   test: /^6/,                 groups: [4, 4, 4, 4], cvc: 3, label: 'Discover' },
];

const brandOf = (digits) => BRANDS.find((b) => b.test.test(digits)) ?? null;
const groupsOf = (brand) => brand?.groups ?? [4, 4, 4, 4];

function groupDigits(digits, groups) {
  const parts = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  return parts.join(' ');
}

function luhn(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

const inputs = {
  number: $('[data-input="number"]'),
  exp:    $('[data-input="exp"]'),
  cvc:    $('[data-input="cvc"]'),
  name:   $('[data-input="name"]'),
};

function paintCard() {
  const digits = state.card.number;
  const brand = state.card.brand;
  const groups = groupsOf(brand);
  const len = groups.reduce((a, b) => a + b, 0);

  // typed digits, remaining positions as dots
  const filled = digits.padEnd(len, '•');
  $('[data-card-number]').textContent = groupDigits(filled, groups);
  $('[data-card-name]').textContent = state.card.name || 'Cardholder name';
  $('[data-card-exp]').textContent = state.card.exp || 'MM/YY';
  $('[data-card-cvc]').textContent = state.card.cvc.padEnd(brand?.cvc ?? 3, '•');

  const label = brand ? (brand.label ?? brand.id) : 'Card';
  const el = $('[data-brand]');
  if (el.textContent.toUpperCase() !== label.toUpperCase()) {
    el.classList.add('is-swap');
    setTimeout(() => { el.textContent = label.toUpperCase(); el.classList.remove('is-swap'); }, 180);
  }
}

inputs.number.addEventListener('input', () => {
  const brandBefore = state.card.brand?.id;
  let digits = inputs.number.value.replace(/\D/g, '');
  const brand = brandOf(digits);
  const groups = groupsOf(brand);
  digits = digits.slice(0, groups.reduce((a, b) => a + b, 0));

  state.card.number = digits;
  state.card.brand = brand;
  inputs.number.value = groupDigits(digits, groups);
  inputs.cvc.maxLength = brand?.cvc ?? 4;

  paintCard();
  audio.key();
  if (brand?.id !== brandBefore && brand) audio.blip(880);
  clearError('number');

  if (digits.length === groups.reduce((a, b) => a + b, 0) && luhn(digits)) inputs.exp.focus();
});

inputs.exp.addEventListener('input', () => {
  let v = inputs.exp.value.replace(/\D/g, '').slice(0, 4);
  if (v.length === 1 && +v > 1) v = '0' + v;                 // 3 → 03
  if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
  inputs.exp.value = v;
  state.card.exp = v;
  paintCard();
  audio.key();
  clearError('exp');
  if (v.length === 5) inputs.cvc.focus();
});

inputs.cvc.addEventListener('input', () => {
  state.card.cvc = inputs.cvc.value = inputs.cvc.value.replace(/\D/g, '').slice(0, state.card.brand?.cvc ?? 4);
  paintCard();
  audio.key();
  clearError('cvc');
});

inputs.name.addEventListener('input', () => {
  state.card.name = inputs.name.value;
  paintCard();
  audio.key();
  clearError('name');
});

inputs.cvc.addEventListener('focus', () => card.classList.add('is-flipped'));
inputs.cvc.addEventListener('blur',  () => card.classList.remove('is-flipped'));

/* pointer tilt */
$('[data-pane="pay"]').addEventListener('pointermove', (e) => {
  if (reduced) return;
  const r = card.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
  const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  cardInner.style.setProperty('--ty', (dx * 9).toFixed(2) + 'deg');
  cardInner.style.setProperty('--tx', (-dy * 7).toFixed(2) + 'deg');
});
$('[data-pane="pay"]').addEventListener('pointerleave', () => {
  cardInner.style.setProperty('--ty', '0deg');
  cardInner.style.setProperty('--tx', '0deg');
});

$('[data-action="testcard"]').addEventListener('click', () => {
  const demo = { number: '4242424242424242', exp: '12/29', cvc: '123', name: 'Demo Cardholder' };
  const fill = (key, value) => {
    inputs[key].focus({ preventScroll: true });
    return typeInto(inputs[key], value);
  };
  fill('number', demo.number)
    .then(() => fill('exp', demo.exp))
    .then(() => fill('cvc', demo.cvc))
    .then(() => fill('name', demo.name))
    .then(() => inputs.name.blur());
});

/* types a value character by character so the card fills in live */
function typeInto(el, value) {
  el.value = '';
  el.dispatchEvent(new Event('input'));
  if (reduced) { el.value = value; el.dispatchEvent(new Event('input')); return Promise.resolve(); }

  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      el.value += value[i++];
      el.dispatchEvent(new Event('input'));
      if (i < value.length) setTimeout(tick, 38);
      else resolve();
    };
    tick();
  });
}

function fieldOf(key) { return inputs[key].closest('.field'); }
function clearError(key) { fieldOf(key).classList.remove('is-bad'); inputs[key].classList.remove('is-bad'); }
function setError(key) {
  fieldOf(key).classList.add('is-bad');
  inputs[key].classList.add('is-bad');
  inputs[key].classList.add('shake');
  setTimeout(() => inputs[key].classList.remove('shake'), 420);
}

function validate() {
  const bad = [];
  const digits = state.card.number;
  const need = groupsOf(state.card.brand).reduce((a, b) => a + b, 0);
  if (digits.length !== need || !luhn(digits)) bad.push('number');

  const [mm, yy] = state.card.exp.split('/');
  const now = new Date();
  const expired = !mm || !yy || +mm < 1 || +mm > 12 ||
    new Date(2000 + +yy, +mm) <= new Date(now.getFullYear(), now.getMonth());
  if (expired) bad.push('exp');

  if (state.card.cvc.length !== (state.card.brand?.cvc ?? 3)) bad.push('cvc');
  if (state.card.name.trim().length < 3) bad.push('name');

  Object.keys(inputs).forEach(clearError);
  bad.forEach(setError);
  return bad;
}

payForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const bad = validate();
  if (bad.length) { audio.buzz(); inputs[bad[0]].focus(); return; }
  charge();
});

/* ── authorisation ───────────────────────────────────────────── */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function charge() {
  payBtn.classList.add('is-busy');
  audio.blip(520);
  await wait(reduced ? 100 : 550);

  goto('done');
  payBtn.classList.remove('is-busy');

  seal.className = 'seal is-working';
  approved.classList.remove('is-shown');
  checklist.forEach((li) => (li.className = ''));
  sizeScreen();

  for (const li of checklist) {
    li.classList.add('is-active');
    audio.key(1400);
    await wait(reduced ? 60 : 520 + Math.random() * 260);
    li.classList.remove('is-active');
    li.classList.add('is-done');
    audio.blip(760);
  }

  seal.className = 'seal is-done';
  audio.chime();

  const q = quote();
  const brand = state.card.brand;
  state.order = {
    id: 'ORD-' + state.orderNo++,
    auth: 'A' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    brandLabel: brand ? (brand.label ?? brand.id[0] + brand.id.slice(1).toLowerCase()) : 'Card',
    last4: state.card.number.slice(-4),
    date: new Date(),
    quote: q,
    rows: rows(q),
    seats: state.seats,
    cycle: state.cycle,
  };

  $('[data-auth-brand]').textContent = state.order.brandLabel;
  $('[data-auth-last4]').textContent = state.order.last4;
  $('[data-auth-code]').textContent = state.order.auth;
  renderReceipt(state.order);

  approved.classList.add('is-shown');
  sizeScreen();
}

/* ── receipt ─────────────────────────────────────────────────── */

function renderReceipt(order) {
  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(order.date);
  const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(order.date);

  $('[data-r-lead]').textContent = money(order.quote.list);
  $('[data-r-sub]').textContent =
    `${order.cycle === 'annual' ? 'Annual' : 'Monthly'} subscription · ${order.seats} seat${order.seats > 1 ? 's' : ''}`;

  $('[data-r-lines]').replaceChildren(...order.rows.slice(1).map((r) => {
    const div = document.createElement('div');
    div.className = 'line' + (r.credit ? ' line--credit' : '');
    div.innerHTML = '<span class="line__k"></span><span class="line__v"></span>';
    div.firstChild.textContent = r.rk;
    div.lastChild.textContent = r.rv;
    return div;
  }));

  $('[data-r-total]').textContent = money(order.quote.total);
  $('[data-r-order]').textContent = order.id;
  $('[data-r-card]').textContent = `${order.brandLabel} •••• ${order.last4}`;
  $('[data-r-auth]').textContent = order.auth;
  $('[data-r-date]').textContent = `${fmtDate} · ${fmtTime}`;
  $('[data-r-caption]').textContent = order.id;
  drawBarcode(order.id + order.auth);
}

function drawBarcode(codeSeed) {
  const width = barcodeEl.clientWidth || 260;
  const gap = 2;
  let seed = [...codeSeed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const frag = document.createDocumentFragment();
  for (let used = 0; used < width - 4; ) {
    const w = 1 + Math.floor(rand() * 3);
    const bar = document.createElement('i');
    bar.style.width = w + 'px';
    frag.appendChild(bar);
    used += w + gap;
  }
  barcodeEl.replaceChildren(frag);
}

/* ── paper feed ──────────────────────────────────────────────── */

const easeOut = (t) => 1 - Math.pow(1 - t, 2.2);
let printing = false;

function feed(height) {
  return new Promise((resolve) => {
    if (reduced) { paperWin.style.height = height + 'px'; return resolve(); }

    document.body.classList.add('is-printing');
    audio.startMotor();

    const start = performance.now();
    let lastStep = -1;

    const frame = (now) => {
      const t = Math.min((now - start) / FEED_MS, 1);
      const p = Math.min(easeOut(t) + Math.sin(t * 42) * 0.004, 1);
      const stepN = Math.round((p * height) / STEP_PX);
      const h = Math.min(stepN * STEP_PX, height);

      if (stepN !== lastStep) {
        paperWin.style.height = h + 'px';
        if (stepN % 4 === 0) audio.tick();
        lastStep = stepN;
      }

      const sway = Math.sin(t * 26) * 0.35 * (1 - t);
      paper.style.transform = `rotate(${sway.toFixed(3)}deg)`;

      if (t < 1) requestAnimationFrame(frame);
      else {
        paperWin.style.height = height + 'px';
        document.body.classList.remove('is-printing');
        audio.stopMotor();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

function settle() {
  if (reduced) return;
  const start = performance.now();
  const frame = (now) => {
    const t = (now - start) / 1000;
    const angle = 1.1 * Math.exp(-t * 4.2) * Math.sin(t * 15);
    paper.style.transform = `rotate(${angle.toFixed(3)}deg)`;
    if (t < 1.2) requestAnimationFrame(frame);
    else paper.style.transform = '';
  };
  requestAnimationFrame(frame);
}

const printBtn = $('[data-action="print"]');

printBtn.addEventListener('click', async () => {
  if (printing || !state.order) return;
  printing = true;
  printBtn.disabled = true;

  try {
    paper.classList.remove('is-torn', 'is-grabbable');
    paper.style.transition = '';
    paper.style.opacity = '';
    paperWin.style.height = '0px';
    drawBarcode(state.order.id + state.order.auth);

    await feed(receipt.offsetHeight);
    settle();
    paper.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });

    paper.classList.add('is-grabbable');
    tearHint.hidden = false;
  } finally {
    printBtn.disabled = false;
    printing = false;
  }
});

/* ── drag to tear off ────────────────────────────────────────── */

let drag = null;

paper.addEventListener('pointerdown', (e) => {
  if (printing || !paper.classList.contains('is-grabbable')) return;
  drag = { y: e.clientY, dy: 0 };
  try { paper.setPointerCapture(e.pointerId); } catch {}
  paper.classList.add('is-grabbing');
  paper.style.transition = 'none';
});

paper.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  const pull = Math.min(drag.dy, TEAR_PX * 1.6);
  paper.style.transform = `translateY(${pull}px) rotate(${(pull / TEAR_PX) * 0.8}deg)`;
  if (drag.dy > TEAR_PX && !drag.armed) { drag.armed = true; audio.key(300); }
});

paper.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const torn = drag.dy > TEAR_PX;
  drag = null;
  paper.classList.remove('is-grabbing');
  paper.releasePointerCapture?.(e.pointerId);
  torn ? tearOff() : springBack();
});
paper.addEventListener('pointercancel', () => { drag = null; springBack(); });

function springBack() {
  paper.style.transition = 'transform 0.6s cubic-bezier(.2,1.4,.4,1)';
  paper.style.transform = '';
}

async function tearOff() {
  paper.classList.add('is-torn');
  paper.classList.remove('is-grabbable');
  tearHint.hidden = true;
  audio.rip();

  paper.style.transition = 'transform 0.85s cubic-bezier(.4,0,.9,.5), opacity 0.85s ease-in';
  paper.style.transform = 'translateY(90vh) rotate(7deg)';
  paper.style.opacity = '0';

  await wait(reduced ? 60 : 900);
  resetPaper();
  restart();
}

function resetPaper() {
  paper.style.transition = 'none';
  paper.style.transform = '';
  paper.style.opacity = '';
  paperWin.style.height = '0px';
  paper.classList.remove('is-torn');
  requestAnimationFrame(() => (paper.style.transition = ''));
}

/* ── restart ─────────────────────────────────────────────────── */

function restart() {
  state.order = null;
  state.card = { number: '', exp: '', cvc: '', name: '', brand: null };
  printing = false;
  printBtn.disabled = false;
  payBtn.classList.remove('is-busy');
  Object.values(inputs).forEach((el) => { el.value = ''; });
  Object.keys(inputs).forEach(clearError);
  paintCard();

  seal.className = 'seal';
  checklist.forEach((li) => (li.className = ''));
  approved.classList.remove('is-shown');
  tearHint.hidden = true;
  resetPaper();
  paper.classList.remove('is-grabbable');

  goto('plan');
  renderPlan();
}

$('[data-action="restart"]').addEventListener('click', restart);

/* ── sound (WebAudio, no assets) ─────────────────────────────── */

const audio = {
  on: false, ctx: null, hum: null, gain: null, noise: null,

  enable() {
    this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume();
    this.on = true;
  },
  disable() { this.stopMotor(); this.on = false; },

  env(node, peak, attack, release) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    node.connect(g).connect(this.ctx.destination);
    return t + attack + release;
  },

  tone(freq, { type = 'sine', peak = 0.05, attack = 0.008, release = 0.12, at = 0 } = {}) {
    if (!this.on) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + attack + release + 0.02);
  },

  key(freq = 1200) { this.tone(freq, { type: 'square', peak: 0.012, release: 0.03 }); },
  blip(freq)       { this.tone(freq, { type: 'triangle', peak: 0.035, release: 0.09 }); },
  buzz()           { this.tone(150, { type: 'sawtooth', peak: 0.05, release: 0.18 }); },
  chime()          { this.tone(880, { peak: 0.05 }); this.tone(1320, { peak: 0.045, at: 0.09, release: 0.35 }); },

  noiseBuffer() {
    if (this.noise) return this.noise;
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return (this.noise = buf);
  },

  rip() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = this.noiseBuffer();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    filter.Q.value = 1.2;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.4);
  },

  swish() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = this.noiseBuffer();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.3);
  },

  startMotor() {
    if (!this.on || this.hum) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.08);
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.hum = osc;
    this.gain = gain;
  },

  stopMotor() {
    if (!this.hum) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.05);
    this.hum.stop(t + 0.3);
    this.hum = null;
    this.gain = null;
  },

  tick() {
    if (!this.on) return;
    this.tone(1100 + Math.random() * 500, { type: 'square', peak: 0.02, release: 0.03 });
  },
};

soundBtn.addEventListener('click', () => {
  const next = soundBtn.getAttribute('aria-pressed') !== 'true';
  soundBtn.setAttribute('aria-pressed', String(next));
  soundLabel.textContent = next ? 'Sound on' : 'Sound off';
  next ? audio.enable() : audio.disable();
});

/* ── boot ────────────────────────────────────────────────────── */

/* off-screen panes still count as scrollable overflow — focusing anything
   inside can nudge the clipped screen sideways, so pin it */
screenEl.addEventListener('scroll', () => {
  screenEl.scrollLeft = 0;
  screenEl.scrollTop = 0;
});

addEventListener('resize', () => {
  sizeScreen();
  if (state.order) drawBarcode(state.order.id + state.order.auth);
  if (!printing && paperWin.style.height !== '0px') paperWin.style.height = receipt.offsetHeight + 'px';
});

segmented.dataset.cycle = state.cycle;
goto('plan');
renderPlan();
paintCard();
requestAnimationFrame(() => screenEl.classList.add('is-ready'));
