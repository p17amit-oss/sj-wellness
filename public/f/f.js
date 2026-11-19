/* Feedback form page: /f/<code>. The code ties this page to one child; nothing else about the child is sent here. */
(function () {
  var root = document.getElementById('app');
  var m = location.pathname.match(/\/f\/([A-Za-z0-9]+)/);
  var token = (m ? m[1] : (new URLSearchParams(location.search).get('t') || '')).toLowerCase();

  function page(title, text, opts) {
    opts = opts || {};
    root.textContent = '';
    root.appendChild(h('div', { class: 'center-page' },
      h('div', { class: 'mono', 'aria-hidden': 'true', text: 'SJ' }),
      h('h1', { text: title }),
      text && h('p', { text: text }),
      opts.spinner && h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }),
      opts.retry && h('button', { type: 'button', class: 'btn btn-main', style: 'margin-top:24px', onclick: load }, 'Try again')));
  }
  function used(first) { page('Thank you!', 'We already have your feedback' + (first ? ' for ' + first : '') + '. You can close this page.'); }

  function load() {
    if (!token) { page('This link is not complete', 'Please open the full link that Coach Sonal sent you on WhatsApp.'); return; }
    page('One moment…', 'Opening your feedback form.', { spinner: true });
    api('feedbackContext', { token: token }).then(function (ctx) {
      if (ctx.status === 'open') {
        FEEDBACK.onUsed = function () { used(ctx.childFirst); };
        document.title = 'Feedback for ' + ctx.childFirst + ' · SJ Wellness';
        FormApp(FEEDBACK, root).open({ token: token, first: ctx.childFirst, parentFirst: ctx.parentFirst });
      } else if (ctx.status === 'used') used(ctx.childFirst);
      else if (ctx.status === 'expired') page('This link has expired', 'Please ask Coach Sonal on WhatsApp for a new link.');
      else page('This link is not valid', 'Please check that you opened the full link, or ask Coach Sonal for a new one.');
    }, function (err) {
      page('Could not open the form', err.message, { retry: true });
    });
  }
  load();
})();
