/* Экран загрузки: держим его, пока не догрузятся иконки (Material Symbols) и шрифты заголовков.
   Показываем ТОЛЬКО на главной и только при первом заходе на сайт за сессию.
   На остальных страницах и при переходах между страницами экрана нет. */
(function () {
  var loader = document.getElementById('page-loader');
  if (!loader) return;

  var KEY = 'kk_loader_seen';
  function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

  // не главная страница или уже заходили на сайт в этой сессии — экран не нужен
  var page = document.body && document.body.getAttribute('data-page');
  if (page !== 'index' || seen()) {
    document.documentElement.classList.add('icons-ready');
    loader.parentNode.removeChild(loader);
    return;
  }

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    markSeen();
    document.documentElement.classList.add('icons-ready');
    loader.classList.add('hide');
    setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 450);
  }

  // страховка: если что-то пошло не так (нет сети, блокировщик) — сайт всё равно откроется
  setTimeout(finish, 10000);

  // 1) ждём, пока придёт CSS со шрифтом иконок (в нём описан @font-face)
  var link = document.querySelector('link[href*="Material+Symbols"]');
  var sheetReady = new Promise(function (resolve) {
    if (!link || link.sheet) return resolve();
    link.addEventListener('load', resolve);
    link.addEventListener('error', resolve);
  });

  function safe(p) { return p.then(function () {}, function () {}); }

  // 2) затем ждём сами файлы шрифтов
  sheetReady.then(function () {
    if (!document.fonts || !document.fonts.load) return;
    return Promise.all([
      safe(document.fonts.load('24px "Material Symbols Rounded"', 'home')),
      safe(document.fonts.load('900 1em Rubik')),
      safe(document.fonts.load('1em Lobster'))
    ]);
  }).then(function () {
    return document.fonts && document.fonts.ready ? safe(document.fonts.ready) : null;
  }).then(finish, finish);
})();
