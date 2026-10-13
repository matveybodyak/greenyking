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
  sendHeartbeat(); // сразу обновляем флаг isAdmin в presence
  if (!active && document.body.dataset.page === 'analytics') {
    window.location.href = 'index.html';
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

/* ---------- Heartbeat онлайна (с флагом isAdmin) ---------- */
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

/* Админы НЕ считаются пользователями: ни в онлайне, ни в уникальных, ни в разрезе страниц */
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

function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50), { passive: true });
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
    const displayName = r.firstName || r.name || 'Аноним';
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
  let rating = 0;

  /* Имя редактируемо ВСЕМИ: браузер prefilled пустым, TG — prefilled, но НЕ readOnly */
  const nameInput = document.getElementById('review-name');
  if (tgUser && nameInput) {
    nameInput.value = tgUser.first_name || tgUser.username || '';
    nameInput.readOnly = false;
    nameInput.style.opacity = '1';
  }

  stars.forEach((star, i) => {
    star.addEventListener('click', () => {
      rating = i + 1;
      stars.forEach((s, j) => s.classList.toggle('active', j < rating));
    });
  });

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('review-text').value.trim();
    const name = document.getElementById('review-name').value.trim();
    if (!rating) { showToast('Поставьте оценку', 'error', 'star'); return; }
    if (!text) { showToast('Напишите пару слов', 'error', 'edit'); return; }
    const ok = await submitReview(rating, text, name);
    if (ok) {
      form.reset();
      rating = 0;
      stars.forEach((s) => s.classList.remove('active'));
      if (tgUser && nameInput) nameInput.value = tgUser.first_name || tgUser.username || '';
    }
  });

  if (list) listenToReviews((reviews) => renderReviews(reviews, list));
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

  setInterval(() => {
    seconds++;
    if (timerEl) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }
  }, 1000);

  listenToOnlinePresence(({ online, total, pages }) => {
    if (onlineEl) onlineEl.textContent = online;
    if (totalEl) totalEl.textContent = total;
    if (pagesEl) {
      const rows = Object.entries(pages).sort((a, b) => b[1] - a[1]);
      pagesEl.innerHTML = rows.length
        ? rows.map(([p, n]) => `<li><span>/${p}</span><b>${n}</b></li>`).join('')
        : '<li><span>Сейчас никого нет в воде</span><b>0</b></li>';
    }
  });
}

/* ---------- Init ---------- */
function init() {
  initTelegramApp();
  if (isAdmin()) document.body.classList.add('admin-mode');
  updateNavigation();

  const logo = document.querySelector('.nav-logo');
  if (logo) logo.addEventListener('click', handleLogoTap);

  initMobileNav();
  initNavScroll();
  initActiveNav();
  initScrollAnimations();
  initPhotoSystem();

  sendHeartbeat();
  setInterval(sendHeartbeat, 15000);
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  const page = document.body.dataset.page;
  if (page === 'reviews') initReviewsPage();
  if (page === 'analytics') initAnalyticsPage();
  if (page === 'menu') initMenuPage();
});
