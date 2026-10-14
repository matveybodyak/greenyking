/* Экран загрузки: держим его, пока не догрузятся иконки (Material Symbols) и шрифты заголовков.
   Показываем ТОЛЬКО на главной и при КАЖДОМ новом открытии сайта (вход по ссылке, из Telegram,
   обновление страницы). Если человек просто перешёл на главную с другой страницы сайта — экрана нет. */
(function () {
  var loader = document.getElementById('page-loader');
  if (!loader) return;

  var page = document.body && document.body.getAttribute('data-page');

  // как мы сюда попали: новый заход, обновление или переход внутри сайта
  var navType = 'navigate';
  try {
    var entry = performance.getEntriesByType('navigation')[0];
    if (entry && entry.type) navType = entry.type;
  } catch (e) {}

  var fromOwnSite = false;
  try {
    fromOwnSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch (e) {}

  var skip = page !== 'index' || navType === 'back_forward' || (navType === 'navigate' && fromOwnSite);

  if (skip) {
    document.documentElement.classList.add('icons-ready');
    loader.parentNode.removeChild(loader);
    return;
  }

  var done = false;
  function finish() {
    if (done) return;
    done = true;
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
