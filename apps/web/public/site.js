(function () {
  var STORAGE_KEY = 'kxc_site_lang';
  var params = new URLSearchParams(window.location.search);
  var queryLang = params.get('lang');

  function detectLang() {
    if (queryLang === 'zh' || queryLang === 'zh-CN') return 'zh-CN';
    if (queryLang === 'en') return 'en';
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'zh-CN' || saved === 'en') return saved;
    } catch (_) {}
    var nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh-CN' : 'en';
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    var titleEl = document.querySelector(
      'meta[name="kxc-title-' + (lang === 'zh-CN' ? 'zh' : 'en') + '"]'
    );
    if (titleEl && titleEl.content) {
      document.title = titleEl.content;
    }
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.setAttribute(
        'aria-pressed',
        btn.getAttribute('data-set-lang') === lang ? 'true' : 'false'
      );
    }
  }

  applyLang(detectLang());

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(document.documentElement.lang || 'en');
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        var next = e.currentTarget.getAttribute('data-set-lang');
        if (next !== 'zh-CN' && next !== 'en') return;
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch (_) {}
        applyLang(next);
      });
    }

    var elFlagged = document.getElementById('stat-flagged');
    var elVotes = document.getElementById('stat-votes');
    if (elFlagged && elVotes) {
      fetch('https://api.keepxclean.com/v1/stats', { credentials: 'omit' })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (d) {
          if (!d || !d.ok) return;
          elFlagged.textContent = Number(d.totalFlaggedAccounts || 0).toLocaleString();
          elVotes.textContent = Number(d.totalVotes || 0).toLocaleString();
        })
        .catch(function () {});
    }
  });
})();
