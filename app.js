import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDxfB3j5EKR_paeZgFJSglU307hM3wjhMo",
  authDomain: "krasti-krab.firebaseapp.com",
  projectId: "krasti-krab",
  storageBucket: "krasti-krab.firebasestorage.app",
  messagingSenderId: "728081183437",
  appId: "1:728081183437:web:c3836b60d5b1eafaff6f84"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------- Telegram WebApp ---------- */
const tg = window.Telegram?.WebApp;
let tgUser = null;

function initTelegramApp() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tgUser = tg.initDataUnsafe?.user || null;
  document.documentElement.classList.add('tg-mode');
}

/* ---------- Уникальный клиент ---------- */
function getClientId() {
  let id = localStorage.getItem('krab_client_id');
  if (!id) {
    id = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('krab_client_id', id);
  }
  return id;
}
const clientId = getClientId();

/* ---------- Админ-система ---------- */
const ADMIN_PASSWORD = "6769";
const ADMIN_KEY = "krab_admin";
let tapCount = 0;
let tapTimer = null;

function isAdmin() { return localStorage.getItem(ADMIN_KEY) === 'true'; }

function setAdminMode(active) {
  if (active) {
    localStorage.setItem(ADMIN_KEY, 'true');
    document.body.classList.add('admin-mode');
    showToast('Вы теперь админ', 'success', 'workspace_premium');
  } else {
    localStorage.removeItem(ADMIN_KEY);
    document.body.classList.remove('admin-mode');
    showToast('Вы больше не админ', 'error', 'lock_open');
  }
  updateNavigation();
  sendHeartbeat();
  if (!active && document.body.dataset.page === 'analytics') {
    goTo('index.html');
  }
  if (document.body.dataset.page === 'reviews') {
    window.__rerenderReviews && window.__rerenderReviews();
  }
}

function handleLogoTap() {
  tapCount++;
  if (tapTimer) clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 2000);

  if (tapCount >= 5) {
    tapCount = 0;
    clearTimeout(tapTimer);
    if (isAdmin()) setAdminMode(false);
    else showPasswordModal();
  }
}

function showPasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h3 class="modal-title"><span class="mi">lock</span>Служебный вход</h3>
    <input type="password" class="modal-input" id="admin-pass" placeholder="••••" inputmode="numeric" autocomplete="off">
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-confirm">Войти</button>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = modal.querySelector('#admin-pass');
  input.focus();

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 280);
  };
  const confirm = () => {
    if (input.value === ADMIN_PASSWORD) {
      setAdminMode(true);
      close();
    } else {
      input.classList.add('error');
      input.value = '';
      setTimeout(() => input.classList.remove('error'), 500);
    }
  };

  modal.querySelector('#modal-cancel').addEventListener('click', close);
  modal.querySelector('#modal-confirm').addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function updateNavigation() {
  document.querySelectorAll('[data-nav="analytics"]').forEach((link) => {
    if (isAdmin()) {
      link.removeAttribute('hidden');
      link.style.display = '';
    } else {
      link.setAttribute('hidden', '');
      link.style.display = 'none';
    }
  });
}

/* ---------- Тосты ---------- */
function showToast(message, type = 'success', icon = 'check_circle') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="mi">${icon}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 450);
  }, 3000);
}

/* ---------- Heartbeat онлайна ---------- */
async function sendHeartbeat() {
  try {
    await setDoc(doc(db, 'online_presence', clientId), {
      clientId,
      timestamp: serverTimestamp(),
      page: document.body.dataset.page || 'unknown',
      isTelegram: !!tgUser,
      isAdmin: isAdmin(),
      username: tgUser?.username || null,
      firstName: tgUser?.first_name || null
    });
  } catch (e) { /* тихо */ }
}

/* Админы не считаются пользователями */
function listenToOnlinePresence(callback) {
  return onSnapshot(collection(db, 'online_presence'), (snapshot) => {
    const cutoff = Date.now() - 30000;
    let online = 0;
    let total = 0;
    const pages = {};
    snapshot.forEach((d) => {
      const v = d.data();
      if (v.isAdmin) return;
      total++;
      const t = v.timestamp?.toDate?.();
      if (t && t.getTime() > cutoff) {
        online++;
        pages[v.page || 'unknown'] = (pages[v.page || 'unknown'] || 0) + 1;
      }
    });
    callback({ online, total, pages });
  }, () => {});
}

/* ---------- Отзывы ---------- */
function submitReview(rating, text, name) {
  return addDoc(collection(db, 'reviews'), {
    rating, text,
    name: name || 'Аноним',
    username: tgUser?.username || null,
    firstName: tgUser?.first_name || null,
    source: tgUser ? 'telegram' : 'browser',
    timestamp: serverTimestamp(),
    clientId
  }).then(() => {
    showToast('Отзыв отправлен', 'success', 'rate_review');
    return true;
  }).catch(() => {
    showToast('Ошибка отправки', 'error', 'error');
    return false;
  });
}

function deleteReview(id) {
  return deleteDoc(doc(db, 'reviews', id)).then(() => {
    showToast('Отзыв удалён', 'success', 'delete');
    return true;
  }).catch(() => {
    showToast('Ошибка удаления', 'error', 'error');
    return false;
  });
}

function listenToReviews(callback) {
  const q = query(collection(db, 'reviews'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    callback(list);
  }, () => {});
}

/* ---------- Утилиты ---------- */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function formatDate(ts) {
  if (!ts || !ts.toDate) return 'только что';
  const date = ts.toDate();
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/* ---------- Фотосистема ---------- */
function smartFocus(img) {
  const r = img.naturalWidth / img.naturalHeight;
  if (r < 0.85) img.style.objectPosition = '50% 32%';
  else if (r > 1.7) img.style.objectPosition = '50% 62%';
  else img.style.objectPosition = '50% 50%';
}

function initPhotoSystem() {
  document.querySelectorAll('img.photo').forEach((img) => {
    const frame = img.closest('.photo-frame');
    const original = img.getAttribute('src') || '';
    const base = original.replace(/\.(webp|png|jpe?g)$/i, '');
    const candidates = [original, base + '.jpg', base + '.jpeg', base + '.png', base + '.webp']
      .filter((v, i, arr) => v && arr.indexOf(v) === i);
    let idx = 0;

    const succeed = () => {
      if (frame) frame.classList.remove('photo-missing');
      img.classList.toggle('photo-lowres', img.naturalWidth > 0 && img.naturalWidth < 800);
      smartFocus(img);
    };

    const tryNext = () => {
      idx++;
      if (idx < candidates.length) {
        img.src = candidates[idx];
      } else if (frame) {
        frame.classList.add('photo-missing');
      }
    };

    img.addEventListener('load', succeed);
    img.addEventListener('error', tryNext);
    if (img.complete) {
      if (img.naturalWidth > 0) succeed();
      else tryNext();
    }
  });
}

/* ---------- Анимации скролла ---------- */
function initScrollAnimations() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add('visible'); });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-in').forEach((el) => io.observe(el));
}

/* ---------- Навигация ---------- */
function initMobileNav() {
  const burger = document.querySelector('.nav-burger');
  const menu = document.querySelector('.mobile-menu');
  if (!burger || !menu) return;
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    menu.classList.toggle('open');
    document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
  });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    burger.classList.remove('open');
    menu.classList.remove('open');
    document.body.style.overflow = '';
  }));
}

function updateNavScrollState() {
  const nav = document.querySelector('.nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
}

function initNavScroll() {
  window.addEventListener('scroll', updateNavScrollState, { passive: true });
}

function initActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}

/* ---------- Страница: меню ---------- */
function initMenuPage() {
  const btns = document.querySelectorAll('.filter-btn');
  const items = document.querySelectorAll('.menu-item');
  btns.forEach((btn) => btn.addEventListener('click', () => {
    btns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    items.forEach((item) => {
      const show = f === 'all' || item.dataset.category === f;
      item.style.display = show ? '' : 'none';
      if (show) {
        item.style.opacity = '0';
        item.style.transform = 'translateY(18px)';
        requestAnimationFrame(() => {
          item.style.transition = 'opacity .45s cubic-bezier(.4,0,.2,1), transform .45s cubic-bezier(.4,0,.2,1)';
          item.style.opacity = '1';
          item.style.transform = 'translateY(0)';
        });
      }
    });
  }));
}

/* ---------- Очистка страницы при переходе (для PJAX) ---------- */
const pageCleanups = [];
function runPageCleanups() {
  while (pageCleanups.length) {
    try { const fn = pageCleanups.pop(); if (typeof fn === 'function') fn(); } catch (e) { /* тихо */ }
  }
  window.__rerenderReviews = null;
}

/* ---------- Страница: отзывы ---------- */
let currentReviews = [];

function renderReviews(reviews, container) {
  currentReviews = reviews;
  if (!reviews.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="mi">rate_review</span>
        <p>Пока тишина, как в «Чам Баккет». Оставьте первый отзыв!</p>
      </div>`;
    return;
  }
  container.innerHTML = reviews.map((r) => {
    const stars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
    /* ПРИОРИТЕТ ИМЕНИ: то, что написал человек, а не автоимя из Telegram */
    const displayName = r.name || r.firstName || 'Аноним';
    const initial = displayName.trim().charAt(0).toUpperCase() || 'A';
    const admin = isAdmin();
    const badge = admin
      ? `<span class="review-source-badge"><span class="mi">${r.source === 'telegram' ? 'send' : 'language'}</span>${r.source === 'telegram' ? 'TG: @' + escapeHtml(r.username || 'unknown') : 'Источник: Браузер'}</span>`
      : '';
    const del = admin
      ? `<button class="btn btn-danger review-delete-btn" data-del="${r.id}" aria-label="Удалить отзыв"><span class="mi">delete</span></button>`
      : '';
    return `
      <article class="review-card">
        ${del}
        <div class="review-header">
          <div class="review-author">
            <div class="review-avatar">${escapeHtml(initial)}</div>
            <div>
              <div class="review-name">${escapeHtml(displayName)}</div>
              <div class="review-date">${formatDate(r.timestamp)}</div>
            </div>
          </div>
          <div class="review-stars" aria-label="Оценка ${r.rating} из 5">${stars}</div>
        </div>
        <p class="review-text">${escapeHtml(r.text)}</p>
        ${badge}
      </article>`;
  }).join('');

  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('Удалить этот отзыв безвозвратно?')) deleteReview(btn.dataset.del);
    });
  });
}

function initReviewsPage() {
  const form = document.getElementById('review-form');
  const stars = document.querySelectorAll('.star-rating .star');
  const list = document.getElementById('reviews-list');
  const textArea = document.getElementById('review-text');
  const nameInput = document.getElementById('review-name');
  let rating = 0;

  /* Префилл имени: сначала сохранённое самим пользователем, потом TG, иначе пусто.
     Поле редактируемо для ВСЕХ — никакого readOnly. */
  if (nameInput) {
    const savedName = localStorage.getItem('krab_review_name');
    if (savedName) nameInput.value = savedName;
    else if (tgUser) nameInput.value = tgUser.first_name || tgUser.username || '';
  }

  stars.forEach((star, i) => {
    star.addEventListener('click', () => {
      rating = i + 1;
      stars.forEach((s, j) => s.classList.toggle('active', j < rating));
    });
  });

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (textArea ? textArea.value : '').trim();
    const name = (nameInput ? nameInput.value : '').trim();
    if (!rating) { showToast('Поставьте оценку', 'error', 'star'); return; }
    if (!text) { showToast('Напишите пару слов', 'error', 'edit'); return; }

    const ok = await submitReview(rating, text, name);
    if (ok) {
      /* Имя НЕ сбрасываем и НЕ перезаписываем: остаётся то, что выбрал человек.
         Дополнительно запоминаем его между визитами. */
      if (name) localStorage.setItem('krab_review_name', name);
      if (textArea) textArea.value = '';
      rating = 0;
      stars.forEach((s) => s.classList.remove('active'));
      if (nameInput) nameInput.value = name;
    }
  });

  if (list) pageCleanups.push(listenToReviews((reviews) => renderReviews(reviews, list)));
  window.__rerenderReviews = () => { if (list) renderReviews(currentReviews, list); };
}

/* ---------- Страница: аналитика ---------- */
function initAnalyticsPage() {
  if (!isAdmin()) { window.location.replace('index.html'); return; }

  const onlineEl = document.getElementById('online-count');
  const totalEl = document.getElementById('total-count');
  const timerEl = document.getElementById('activity-timer');
  const pagesEl = document.getElementById('pages-list');
  let seconds = 0;

  const timerId = setInterval(() => {
    seconds++;
    if (timerEl) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }
  }, 1000);

  pageCleanups.push(() => clearInterval(timerId));
  pageCleanups.push(listenToOnlinePresence(({ online, total, pages }) => {
    if (onlineEl) onlineEl.textContent = online;
    if (totalEl) totalEl.textContent = total;
    if (pagesEl) {
      const rows = Object.entries(pages).sort((a, b) => b[1] - a[1]);
      pagesEl.innerHTML = rows.length
        ? rows.map(([p, n]) => `<li><span>/${p}</span><b>${n}</b></li>`).join('')
        : '<li><span>Сейчас никого нет в воде</span><b>0</b></li>';
    }
  }));
}

/* =====================================================
   МУЗЫКА + ПЕРЕХОДЫ БЕЗ ПЕРЕЗАГРУЗКИ
   Страницы подгружаются через fetch и подменяются внутри
   текущего документа, поэтому <audio> живёт непрерывно.
   ===================================================== */
const MUSIC_SRC = 'music/theme.mp3';   // <-- путь к твоему файлу
const MUSIC_VOLUME = 0.8;              // 0..1 (1 = максимум)
const MUSIC_PREF_KEY = 'krab_music';   // 'on' | 'off'
const MUSIC_TIME_KEY = 'krab_music_t'; // позиция (на случай полной перезагрузки)

let bgAudio = null;
let musicBtn = null;
let musicUnavailable = false;

function musicWanted() { return localStorage.getItem(MUSIC_PREF_KEY) !== 'off'; }

function updateMusicBtn() {
  if (!musicBtn) return;
  const playing = bgAudio && !bgAudio.paused;
  musicBtn.classList.toggle('is-on', !!playing);
  musicBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  musicBtn.setAttribute('aria-label', playing ? 'Выключить музыку' : 'Включить музыку');
  musicBtn.querySelector('.mi').textContent = playing ? 'volume_up' : 'volume_off';
}

async function tryPlayMusic() {
  if (!bgAudio || musicUnavailable) return false;
  try {
    await bgAudio.play();
    updateMusicBtn();
    return true;
  } catch (e) {
    updateMusicBtn();   // автоплей заблокирован — ждём первого жеста
    return false;
  }
}

function armFirstGesture() {
  const events = ['pointerup', 'touchend', 'click', 'keydown'];
  const handler = async () => {
    if (!musicWanted()) return;
    if (await tryPlayMusic()) events.forEach((ev) => document.removeEventListener(ev, handler, true));
  };
  events.forEach((ev) => document.addEventListener(ev, handler, true));
}

function initMusic() {
  const css = document.createElement('style');
  css.textContent = `
    .music-toggle{position:fixed;right:1rem;bottom:calc(1rem + env(safe-area-inset-bottom));z-index:99998;
      width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      background:var(--paper,#fffaea);color:var(--ink,#3b1f0e);border:var(--line,3px solid #3b1f0e);
      box-shadow:var(--pop-sm,0 4px 0 #3b1f0e);cursor:pointer;padding:0;
      transition:transform .15s,box-shadow .15s,background .2s}
    .music-toggle:active{transform:translateY(3px);box-shadow:0 1px 0 var(--ink,#3b1f0e)}
    .music-toggle .mi{font-size:1.6rem}
    .music-toggle.is-on{background:var(--yellow,#ffcf33)}
    .music-toggle[hidden]{display:none}`;
  document.head.appendChild(css);

  bgAudio = new Audio(MUSIC_SRC);
  bgAudio.loop = true;
  bgAudio.volume = MUSIC_VOLUME;
  bgAudio.preload = 'auto';
  bgAudio.addEventListener('error', () => { musicUnavailable = true; if (musicBtn) musicBtn.hidden = true; });
  bgAudio.addEventListener('play', updateMusicBtn);
  bgAudio.addEventListener('pause', updateMusicBtn);

  /* Если это полная перезагрузка — продолжаем с того же места */
  const savedT = parseFloat(localStorage.getItem(MUSIC_TIME_KEY));
  if (savedT > 0) {
    bgAudio.addEventListener('loadedmetadata', () => {
      if (bgAudio.duration && savedT < bgAudio.duration) bgAudio.currentTime = savedT;
    }, { once: true });
  }
  let lastSave = 0;
  bgAudio.addEventListener('timeupdate', () => {
    if (Date.now() - lastSave > 1000) { lastSave = Date.now(); localStorage.setItem(MUSIC_TIME_KEY, bgAudio.currentTime); }
  });
  window.addEventListener('pagehide', () => localStorage.setItem(MUSIC_TIME_KEY, bgAudio.currentTime));

  /* Кнопка живёт вне подменяемого содержимого */
  musicBtn = document.createElement('button');
  musicBtn.type = 'button';
  musicBtn.className = 'music-toggle';
  musicBtn.setAttribute('data-persist', '');
  musicBtn.innerHTML = '<span class="mi">volume_off</span>';
  musicBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (bgAudio.paused) { localStorage.setItem(MUSIC_PREF_KEY, 'on'); await tryPlayMusic(); }
    else { localStorage.setItem(MUSIC_PREF_KEY, 'off'); bgAudio.pause(); }
    updateMusicBtn();
  });
  document.body.appendChild(musicBtn);
  updateMusicBtn();

  /* Пауза, когда вкладка скрыта / Telegram свёрнут */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bgAudio.pause();
    else if (musicWanted()) tryPlayMusic();
  });

  if (musicWanted()) {
    tryPlayMusic().then((ok) => { if (!ok) armFirstGesture(); });
  }
}

/* ---------- PJAX ---------- */
let navToken = 0;
const pjaxSupported = !!(window.fetch && window.history && history.pushState && window.DOMParser);

function goTo(url) {
  if (pjaxSupported) pjaxGo(url, true); else window.location.href = url;
}

function isPjaxLink(a, e) {
  if (!a || !a.href) return false;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download')) return false;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin) return false;
  if (!/\.html?$|\/$/.test(u.pathname)) return false;
  if (u.pathname === location.pathname && u.search === location.search) return false; // тот же URL / якорь
  return true;
}

async function pjaxGo(url, push, restoreY) {
  const token = ++navToken;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) throw new Error('bad response');
    const html = await res.text();
    if (token !== navToken) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.body || !doc.body.dataset.page) throw new Error('not a site page');
    swapPage(doc, url, push, restoreY);
  } catch (err) {
    window.location.href = url;   // любой сбой — обычный переход (музыка тогда возобновится с сохранённой позиции)
  }
}

function swapPage(doc, url, push, restoreY) {
  runPageCleanups();

  if (push) {
    history.replaceState({ ...(history.state || {}), y: window.scrollY }, '');
    history.pushState({ pjax: true }, '', url);
  }
  document.title = doc.title;

  doc.body.querySelectorAll('script').forEach((s) => s.remove());
  [...document.body.children].forEach((el) => { if (!el.hasAttribute('data-persist')) el.remove(); });
  document.body.dataset.page = doc.body.dataset.page;
  document.body.style.overflow = '';
  const frag = document.createDocumentFragment();
  [...doc.body.childNodes].forEach((n) => frag.appendChild(document.adoptNode(n)));
  document.body.insertBefore(frag, document.body.firstChild);

  initPage();
  sendHeartbeat();

  const hash = new URL(url, location.href).hash;
  const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
  if (target) target.scrollIntoView();
  else window.scrollTo(0, restoreY || 0);
  updateNavScrollState();
}

function initPjax() {
  if (!pjaxSupported) return;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ ...(history.state || {}), pjax: true }, '');

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!isPjaxLink(a, e)) return;
    e.preventDefault();
    pjaxGo(a.href, true);
  });
  window.addEventListener('popstate', (e) => {
    pjaxGo(location.href, false, (e.state && e.state.y) || 0);
  });
}

/* ---------- Init ---------- */
/* Один раз за всё время жизни вкладки */
function init() {
  initTelegramApp();
  initNavScroll();
  initMusic();
  initPjax();
  sendHeartbeat();
  setInterval(sendHeartbeat, 15000);
}

/* При каждой смене страницы */
function initPage() {
  if (isAdmin()) document.body.classList.add('admin-mode');
  updateNavigation();

  const logo = document.querySelector('.nav-logo');
  if (logo) logo.addEventListener('click', handleLogoTap);

  initMobileNav();
  initActiveNav();
  initScrollAnimations();
  initPhotoSystem();

  const page = document.body.dataset.page;
  if (page === 'reviews') initReviewsPage();
  if (page === 'analytics') initAnalyticsPage();
  if (page === 'menu') initMenuPage();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  initPage();
});
