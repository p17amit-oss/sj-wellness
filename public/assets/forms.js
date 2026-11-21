/* SJ Wellness – form engine and the two parent forms. Needs config.js and common.js. */
/* ================= form engine (shared by both forms) ================= */
function FormApp(def, root) {
  var F = { step: -1, data: def.fresh(), errors: {}, sending: false, done: false, restored: false, fromReview: false, ctx: null, submitError: '' };
  var api = { F: F, render: render, fmt: fmt, childFirst: childFirst, startOver: startOver, open: open };

  if (def.draftKey && store) {
    try {
      var s = JSON.parse(store.getItem(def.draftKey) || 'null');
      if (s && s.data && (s.data.childName || s.data.p1Name)) { F.step = Math.min(s.step, def.flow.length - 1); F.data = s.data; F.restored = true; }
    } catch (e) {}
  }
  function saveDraft() { if (def.draftKey && store) try { store.setItem(def.draftKey, JSON.stringify({ step: F.step, data: F.data })); } catch (e) {} }
  function clearDraft() { if (def.draftKey && store) try { store.removeItem(def.draftKey); } catch (e) {} }
  function childFirst() { return def.childFirst(F); }
  function fmt(s) {
    if (!s) return s;
    var n = childFirst();
    return s.replace(/\{Name\}/g, n || 'Your child').replace(/\{name\}/g, n || 'your child');
  }
  function visible(f) { return !f.showIf || f.showIf(F.data); }

  function render() {
    root.textContent = '';
    var pf = h('div', { class: 'pf' });
    pf.appendChild(h('header', { class: 'pf-head' },
      h('div', { class: 'mono', 'aria-hidden': 'true', text: 'SJ' }),
      h('div', null, h('p', { class: 'brand', text: 'SJ Wellness' }), h('p', { class: 'brand-sub', text: def.brandSub }))));
    root.appendChild(pf);
    if (F.done) { pf.appendChild(def.thanks(api)); return; }
    if (F.step < 0) { pf.appendChild(def.welcome(api)); root.appendChild(foot()); return; }

    var key = def.flow[F.step], st = def.steps[key];
    pf.appendChild(rope());
    pf.appendChild(h('h1', { class: 'step-title', text: fmt(st.title) }));
    if (st.lead) pf.appendChild(h('p', { class: 'step-lead', text: fmt(st.lead) }));
    if (F.restored) pf.appendChild(h('p', { class: 'draft' }, 'We kept what you filled in earlier. ', h('button', { type: 'button', class: 'linkbtn', onclick: startOver }, 'Start again')));
    if (key === 'review') pf.appendChild(review());
    else {
      var pair = null;
      st.fields.forEach(function (f) {
        if (!visible(f)) return;
        var node = renderField(f);
        if (f.pair) { if (!pair) { pair = h('div', { class: 'pair' }); pf.appendChild(pair); } pair.appendChild(node); }
        else { pair = null; pf.appendChild(node); }
      });
    }
    if (F.submitError) pf.appendChild(h('div', { class: 'submit-err', role: 'alert' }, icon('alert'), h('span', { text: F.submitError })));
    pf.appendChild(h('p', { class: 'privacy' }, icon('lock'), 'Your answers are seen only by Coach Sonal.'));
    root.appendChild(foot());
  }

  function rope() {
    var n = def.flow.length, i = F.step;
    var r = h('div', { class: 'rope', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(n), 'aria-valuenow': String(i + 1), 'aria-label': 'Form progress' },
      h('div', { class: 'rope-fill', style: 'width:' + (i / (n - 1) * 100) + '%' }));
    for (var s = 0; s < n; s++) r.appendChild(h('span', { class: 'float' + (s < i ? ' done' : s === i ? ' now' : ''), style: 'left:' + (s / (n - 1) * 100) + '%' }));
    return h('div', { class: 'rope-wrap' },
      h('div', { class: 'rope-meta' }, h('span', { text: 'Step ' + (i + 1) + ' of ' + n }), h('span', { class: 'rope-name', text: def.steps[def.flow[i]].name })), r);
  }

  function reqTag() { return h('span', { class: 'req', text: 'Required' }); }
  function errLine(k) { return F.errors[k] ? h('p', { class: 'err', role: 'alert', id: 'err_' + def.id + '_' + k }, icon('alert'), F.errors[k]) : null; }
  function fid(k) { return def.id + '_' + k; }

  function renderField(f) {
    if (f.sub) {
      var frag = h('div');
      frag.appendChild(h('h2', { class: 'sub' }, fmt(f.sub)));
      if (f.hint) frag.appendChild(h('p', { class: 'hint', text: fmt(f.hint) }));
      if (f.remove) frag.appendChild(h('button', { type: 'button', class: 'linkbtn', onclick: function () {
        f.remove.forEach(function (k) { delete F.data[k]; });
        F.data[f.flag] = false; saveDraft(); rerender();
      }}, 'Remove second contact'));
      return frag;
    }
    if (f.type === 'radio' || f.type === 'check') return choiceField(f);
    if (f.type === 'dob') return dobField(f);
    if (f.type === 'toggle' || f.type === 'agree') return toggleField(f);
    if (f.type === 'reveal') {
      if (F.data[f.k]) return h('span');
      return h('button', { type: 'button', class: 'reveal', onclick: function () { F.data[f.k] = true; saveDraft(); rerender(fid(f.focus)); } }, icon('plus'), f.text);
    }
    if (f.type === 'repeater') return repeater();
    return textField(f);
  }

  function textField(f) {
    var id = fid(f.k), err = F.errors[f.k];
    var box = h('div', { class: 'field' + (err ? ' has-err' : '') });
    box.appendChild(h('label', { class: 'lbl', for: id }, fmt(f.label), f.req && reqTag()));
    if (f.hint) box.appendChild(h('p', { class: 'hint', id: 'hint_' + id, text: fmt(f.hint) }));
    var inp = f.type === 'textarea' ? h('textarea', { id: id, rows: f.rows || 3 }) :
      h('input', { id: id, type: f.type, inputmode: f.type === 'tel' ? 'tel' : null, max: f.type === 'date' ? todayISO() : null });
    inp.setAttribute('autocomplete', f.ac || 'off');
    if (f.ph) inp.setAttribute('placeholder', f.ph);
    var desc = [f.hint ? 'hint_' + id : '', err ? 'err_' + id : ''].filter(Boolean).join(' ');
    if (desc) inp.setAttribute('aria-describedby', desc);
    if (err) inp.setAttribute('aria-invalid', 'true');
    inp.value = F.data[f.k] || '';
    box.appendChild(inp);
    var helper = null;
    if (f.type === 'date') { helper = h('p', { class: 'helper', 'aria-live': 'polite' }); box.appendChild(helper); setAge(helper, inp.value); }
    inp.addEventListener('input', function () {
      F.data[f.k] = inp.value; saveDraft();
      if (F.errors[f.k]) { delete F.errors[f.k]; box.classList.remove('has-err'); var e = box.querySelector('.err'); if (e) e.remove(); inp.removeAttribute('aria-invalid'); }
      if (helper) setAge(helper, inp.value);
      if (f.retitle) { var t = root.querySelector('.step-title'); if (t) t.textContent = fmt(def.steps[def.flow[F.step]].title); }
    });
    add(box, errLine(f.k));
    return box;
  }
  /* Date of birth as three dropdowns (Day, Month, Year): much easier on a phone than scrolling a calendar back several years. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dobParts = {};
  function partsOf(k) {
    if (!dobParts[k]) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(F.data[k] || ''); dobParts[k] = m ? { y: m[1], m: String(+m[2]), d: String(+m[3]) } : { y: '', m: '', d: '' }; }
    return dobParts[k];
  }
  function dobProblem(k) {
    var p = partsOf(k);
    if (!p.d && !p.m && !p.y) return 'empty';
    if (!p.d || !p.m || !p.y) return 'partial';
    return +p.d > new Date(+p.y, +p.m, 0).getDate() ? 'nodate' : '';
  }
  function dobField(f) {
    var id = fid(f.k), err = F.errors[f.k], p = partsOf(f.k), year = new Date().getFullYear();
    var fs = h('fieldset', { class: 'field' + (err ? ' has-err' : '') });
    fs.appendChild(h('legend', { class: 'lbl' }, fmt(f.label), f.req && reqTag()));
    var helper = h('p', { class: 'helper', 'aria-live': 'polite' });
    function sel(part, label, opts) {
      var s = h('select', { id: id + '_' + part, 'aria-label': label, autocomplete: 'off' });
      s.appendChild(h('option', { value: '', text: label }));
      opts.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1] })); });
      s.value = p[part];
      if (!s.value) s.classList.add('empty');
      s.addEventListener('change', function () {
        p[part] = s.value; s.classList.toggle('empty', !s.value);
        F.data[f.k] = dobProblem(f.k) ? '' : p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2);
        saveDraft();
        if (F.errors[f.k]) { delete F.errors[f.k]; fs.classList.remove('has-err'); var e = fs.querySelector('.err'); if (e) e.remove(); }
        showDob();
      });
      return s;
    }
    var days = [], months = MONTHS.map(function (m, i) { return [String(i + 1), m]; }), years = [];
    for (var d = 1; d <= 31; d++) days.push([String(d), String(d)]);
    for (var y = year; y >= year - 25; y--) years.push([String(y), String(y)]);
    fs.appendChild(h('div', { class: 'dob' }, sel('d', 'Day', days), sel('m', 'Month', months), sel('y', 'Year', years)));
    function showDob() {
      if (dobProblem(f.k) === 'nodate') { helper.textContent = MONTHS[+p.m - 1] + ' ' + p.y + ' has only ' + new Date(+p.y, +p.m, 0).getDate() + ' days. Please check the day.'; helper.className = 'helper warn'; return; }
      helper.className = 'helper'; setAge(helper, F.data[f.k]);
    }
    showDob();
    fs.appendChild(helper);
    add(fs, errLine(f.k));
    return fs;
  }
  function setAge(el, v) { var a = ageFromDob(v); el.textContent = a != null && a >= 0 && a < 30 ? (a === 1 ? 'Age: 1 year' : 'Age: ' + a + ' years') : ''; }

  function choiceField(f) {
    var multi = f.type === 'check', err = F.errors[f.k];
    var fs = h('fieldset', { class: 'field' + (err ? ' has-err' : '') });
    fs.appendChild(h('legend', { class: 'lbl' }, fmt(f.label), f.req && reqTag()));
    var val = F.data[f.k], arr = Array.isArray(val) ? val : [];
    if (f.hint) fs.appendChild(h('p', { class: 'hint', text: fmt(f.hint) + (f.max && arr.length ? ' (' + arr.length + ' chosen)' : '') }));
    var grid = h('div', { class: 'opts' + (f.cols ? ' cols-' + f.cols : '') });
    var atMax = multi && f.max && arr.length >= f.max;
    f.options.forEach(function (opt, i) {
      var id = fid(f.k) + '_' + i;
      var on = multi ? arr.indexOf(opt) >= 0 : val === opt;
      var dis = atMax && !on;
      var inp = h('input', { type: multi ? 'checkbox' : 'radio', name: fid(f.k), id: id, value: opt, class: 'sr', disabled: dis });
      inp.checked = on;
      inp.addEventListener('change', function () { onChoice(f, opt, inp.checked); rerender(id); });
      grid.appendChild(h('label', { class: 'opt' + (on ? ' on' : '') + (dis ? ' off' : ''), for: id },
        inp, h('span', { class: 'ind ' + (multi ? 'ind-check' : 'ind-radio') }, multi && icon('check')), h('span', { class: 'opt-text', text: opt })));
    });
    fs.appendChild(grid);
    if (f.other && (multi ? arr.indexOf('Other') >= 0 : val === 'Other')) {
      var o = h('input', { type: 'text', class: 'other', id: fid(f.other), placeholder: 'Please describe', 'aria-label': fmt(f.label) + ': other' });
      o.value = F.data[f.other] || '';
      o.addEventListener('input', function () { F.data[f.other] = o.value; saveDraft(); });
      fs.appendChild(o);
    }
    add(fs, errLine(f.k));
    return fs;
  }
  function onChoice(f, opt, checked) {
    if (f.type === 'check') {
      var arr = Array.isArray(F.data[f.k]) ? F.data[f.k].slice() : [];
      if (checked) {
        if (f.exclusive && opt === f.exclusive) arr = [opt];
        else { arr = arr.filter(function (x) { return x !== f.exclusive; }); if (arr.indexOf(opt) < 0) arr.push(opt); }
      } else arr = arr.filter(function (x) { return x !== opt; });
      F.data[f.k] = arr;
    } else F.data[f.k] = opt;
    delete F.errors[f.k]; saveDraft();
  }
  function toggleField(f) {
    var id = fid(f.k), err = F.errors[f.k];
    var on = f.type === 'toggle' ? F.data[f.k] !== false : F.data[f.k] === true;
    var inp = h('input', { type: 'checkbox', id: id, class: 'sr' }); inp.checked = on;
    inp.addEventListener('change', function () { F.data[f.k] = inp.checked; delete F.errors[f.k]; saveDraft(); rerender(id); });
    return h('div', { class: 'field' + (err ? ' has-err' : '') },
      h('label', { class: 'consent' + (on ? ' on' : ''), for: id }, inp, h('span', { class: 'ind ind-check' }, icon('check')), h('span', { text: fmt(f.text) })),
      errLine(f.k));
  }
  function anyRef() { return (F.data.refs || []).some(function (r) { return !isBlank(r.name) || !isBlank(r.mobile); }); }
  function repeater() {
    if (!Array.isArray(F.data.refs) || !F.data.refs.length) F.data.refs = [{ name: '', mobile: '' }];
    var box = h('div', { class: 'field' });
    F.data.refs.forEach(function (r, i) {
      var nm = h('input', { type: 'text', id: fid('ref_name_' + i), placeholder: 'Parent’s name', 'aria-label': 'Family ' + (i + 1) + ': parent’s name', autocomplete: 'off' });
      var mb = h('input', { type: 'tel', id: fid('ref_mob_' + i), inputmode: 'tel', placeholder: 'Mobile number', 'aria-label': 'Family ' + (i + 1) + ': mobile number', autocomplete: 'off' });
      nm.value = r.name || ''; mb.value = r.mobile || '';
      if (F.errors['ref' + i]) (F.errors['refBad' + i] === 'name' ? nm : mb).classList.add('bad');
      nm.addEventListener('input', function () { var was = anyRef(); r.name = nm.value; saveDraft(); if (was !== anyRef()) rerender(nm.id); });
      mb.addEventListener('input', function () { var was = anyRef(); r.mobile = mb.value; saveDraft(); if (was !== anyRef()) rerender(mb.id); });
      box.appendChild(h('div', { class: 'ref' },
        h('span', { class: 'ref-n', text: String(i + 1) }),
        h('div', { class: 'ref-f' }, nm, mb),
        F.data.refs.length > 1 ? h('button', { type: 'button', class: 'ref-x', 'aria-label': 'Remove family ' + (i + 1), onclick: function () {
          F.data.refs.splice(i, 1); F.errors = {}; saveDraft(); rerender();
        }}, icon('x')) : h('span')));
      add(box, errLine('ref' + i));
    });
    if (F.data.refs.length < 3) box.appendChild(h('button', { type: 'button', class: 'reveal addrow', onclick: function () {
      F.data.refs.push({ name: '', mobile: '' }); saveDraft(); rerender(fid('ref_name_' + (F.data.refs.length - 1)));
    }}, icon('plus'), 'Add another family'));
    return box;
  }
  function rerender(focusId) {
    var y = window.scrollY; render(); window.scrollTo(0, y);
    if (focusId) { var el = document.getElementById(focusId); if (el) try { el.focus({ preventScroll: true }); } catch (e) {} }
  }

  function validate(key) {
    var errs = {}, d = F.data;
    (def.steps[key].fields || []).forEach(function (f) {
      if (!f.k || !visible(f)) return;
      var v = d[f.k];
      if (f.type === 'repeater') {
        (d.refs || []).forEach(function (r, i) {
          var hn = !isBlank(r.name), hm = !isBlank(r.mobile);
          if (hm && !validPhone(r.mobile)) { errs['ref' + i] = 'Enter a 10-digit mobile number.'; errs['refBad' + i] = 'mobile'; }
          else if (hn && !hm) { errs['ref' + i] = 'Add their mobile number, or remove this family.'; errs['refBad' + i] = 'mobile'; }
          else if (hm && !hn) { errs['ref' + i] = 'Add the parent’s name.'; errs['refBad' + i] = 'name'; }
        });
        return;
      }
      if (f.type === 'agree') { if (v !== true) errs[f.k] = 'Tick this to confirm, or remove the families above.'; return; }
      if (f.type === 'dob') {
        var pr = dobProblem(f.k);
        if (pr === 'empty') { if (f.req) errs[f.k] = 'Choose the day, month and year of birth.'; return; }
        if (pr === 'partial') { errs[f.k] = 'Choose all three: day, month and year.'; return; }
        if (pr === 'nodate') { errs[f.k] = 'This date does not exist. Please check the day.'; return; }
        var ag = ageFromDob(v); if (ag == null || ag < 0) errs[f.k] = 'The date of birth cannot be in the future.';
        return;
      }
      if (f.req && isBlank(v)) {
        errs[f.k] = f.type === 'check' ? 'Choose at least one option.' : f.type === 'radio' ? 'Choose one option.' : f.type === 'date' ? 'Enter the date of birth.' : 'This is needed to continue.';
        return;
      }
      if (isBlank(v)) return;
      if (f.type === 'tel' && !validPhone(v)) errs[f.k] = 'Enter a 10-digit mobile number.';
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) errs[f.k] = 'Check the email address, for example name@gmail.com.';
      if (f.type === 'date') { var a = ageFromDob(v); if (a == null || a < 0 || a > 25) errs[f.k] = 'Check the date of birth.'; }
    });
    if (key === 'review') {
      if (d.consent !== true) errs.consent = 'Tick this box to give your permission.';
      if (isBlank(d.signature)) errs.signature = 'Type your full name to sign.';
    }
    return errs;
  }

  function next() {
    if (F.step < 0) { F.step = 0; F.errors = {}; saveDraft(); render(); window.scrollTo(0, 0); return; }
    var key = def.flow[F.step], errs = validate(key);
    if (Object.keys(errs).length) {
      F.errors = errs; rerender();
      var first = root.querySelector('.has-err, .err');
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var inp = first.querySelector('input:not([type=checkbox]):not([type=radio]),textarea');
        if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 400);
      }
      return;
    }
    F.errors = {};
    if (F.step === def.flow.length - 1) { submit(); return; }
    if (F.fromReview) { F.fromReview = false; F.step = def.flow.length - 1; } else F.step++;
    F.restored = false;
    if (def.flow[F.step] === 'review' && isBlank(F.data.signature)) F.data.signature = niceName(F.data.p1Name);
    saveDraft(); render(); window.scrollTo(0, 0);
  }
  function back() {
    F.errors = {};
    if (F.fromReview) { F.fromReview = false; F.step = def.flow.length - 1; } else F.step--;
    saveDraft(); render(); window.scrollTo(0, 0);
  }
  function startOver() {
    clearDraft(); dobParts = {}; F.step = -1; F.data = def.fresh(); F.errors = {}; F.done = false; F.restored = false; F.fromReview = false;
    render(); window.scrollTo(0, 0);
  }
  function open(ctx) { F.ctx = ctx; startOver(); }
  api.keepAndRestart = function (keys) {
    var keep = def.fresh();
    keys.forEach(function (k) { if (F.data[k] != null) keep[k] = F.data[k]; });
    F.data = keep; dobParts = {}; F.done = false; F.errors = {}; F.restored = false; F.fromReview = false; F.step = 0;
    saveDraft(); render(); window.scrollTo(0, 0);
  };

  function foot() {
    var inner = h('div', { class: 'pf-foot-in' });
    if (F.step < 0) inner.appendChild(h('button', { type: 'button', class: 'btn btn-main', onclick: next }, def.startLabel));
    else {
      var last = F.step === def.flow.length - 1;
      inner.appendChild(h('button', { type: 'button', class: 'btn btn-quiet', onclick: back }, icon('left'), 'Back'));
      inner.appendChild(h('button', { type: 'button', class: 'btn btn-main', onclick: next, disabled: F.sending },
        F.sending ? 'Sending…' : last ? def.submitLabel : F.fromReview ? 'Save and return to review' : 'Continue'));
    }
    return h('div', { class: 'pf-foot' }, inner);
  }

  function displayVal(f, d) {
    var v = d[f.k];
    if (f.type === 'check') return withOther(v, f.other ? d[f.other] : '').join(', ');
    if (f.type === 'radio' && v === 'Other' && f.other && d[f.other]) return d[f.other];
    if (f.type === 'date' || f.type === 'dob') { var a = ageFromDob(v); return v ? fmtDate(v + 'T00:00:00') + (a != null ? ' (age ' + a + ')' : '') : ''; }
    if (f.type === 'toggle') return v === false ? 'No' : 'Yes';
    return v;
  }
  function review() {
    var wrap = h('div', { class: 'review' });
    def.flow.forEach(function (key, i) {
      if (key === 'review') return;
      var st = def.steps[key], dl = h('dl'), n = 0;
      st.fields.forEach(function (f) {
        if (!f.k || !visible(f) || f.type === 'reveal') return;
        if (f.type === 'toggle' && F.data[f.k] !== false) return;
        var v = displayVal(f, F.data);
        if (isBlank(v)) return;
        dl.appendChild(h('dt', { text: f.short || fmt(f.label) })); dl.appendChild(h('dd', { text: v })); n++;
      });
      wrap.appendChild(h('section', { class: 'rv' },
        h('div', { class: 'rv-head' }, h('h2', { text: st.name }),
          h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Edit ' + st.name, onclick: function () { F.fromReview = true; F.step = i; F.errors = {}; render(); window.scrollTo(0, 0); } }, 'Edit')),
        n ? dl : h('p', { class: 'rv-none', text: 'Nothing added' })));
    });
    var cid = fid('consent'), con = F.data.consent === true;
    var cb = h('input', { type: 'checkbox', id: cid, class: 'sr' }); cb.checked = con;
    cb.addEventListener('change', function () { F.data.consent = cb.checked; delete F.errors.consent; saveDraft(); rerender(cid); });
    wrap.appendChild(h('div', { class: 'field' + (F.errors.consent ? ' has-err' : ''), style: 'margin-top:14px' },
      h('label', { class: 'consent' + (con ? ' on' : ''), for: cid }, cb, h('span', { class: 'ind ind-check' }, icon('check')),
        h('span', { text: fmt('I am {name}’s parent or legal guardian. I agree that SJ Wellness may keep this information securely and use it only for {name}’s swimming sessions.') })),
      errLine('consent')));
    var sig = textField({ k: 'signature', label: 'Type your full name to sign', type: 'text', req: true, ac: 'name' });
    sig.style.marginTop = '8px';
    sig.appendChild(h('p', { class: 'sigdate', text: 'Date: ' + fmtDate(new Date().toISOString()) }));
    wrap.appendChild(sig);
    return wrap;
  }

  function submit() {
    if (F.sending) return;
    F.sending = true; F.submitError = ''; rerender();
    var data = JSON.parse(JSON.stringify(F.data));
    if (data.refs) data.refs = data.refs.filter(function (r) { return !isBlank(r.name) || !isBlank(r.mobile); });
    Promise.resolve().then(function () { return def.onSubmit(data, F.ctx); }).then(function () {
      F.sending = false; F.done = true; clearDraft(); render(); window.scrollTo(0, 0);
    }, function (err) {
      F.sending = false;
      if (err && err.code === 'USED' && def.onUsed) { def.onUsed(api); return; }
      F.submitError = (err && err.message) || 'Could not send the form. Please check your internet and try again.';
      rerender();
      var box = root.querySelector('.submit-err'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  return api;
}

/* ================= form 1: onboarding (before the first session) ================= */
var REL = ['Mother', 'Father', 'Guardian', 'Other'];
function hasTherapy(d) { return (d.therapy || []).some(function (x) { return x !== 'No therapy now'; }); }
function p2On(d) { return d.showP2 === true; }
var ONBOARD = {
  id: 'ob', draftKey: 'sjw_onboard_draft_v1',
  brandSub: 'Swimming for special kids with Coach Sonal',
  fresh: function () { return { waSame: true }; },
  childFirst: function (F) { return firstName(F.data.nickname) || firstName(F.data.childName); },
  flow: ['child', 'health', 'comfort', 'goals', 'contact', 'review'],
  startLabel: 'Start the form', submitLabel: 'Submit form',
  steps: {
    child: { name: 'Your child', title: 'Who will be swimming with us?', lead: 'A few basics about your child to begin.', fields: [
      { k: 'childName', label: "Child's full name", short: 'Name', type: 'text', req: true, retitle: true },
      { k: 'nickname', label: 'Name your child likes to be called', short: 'Likes to be called', hint: 'Only if different, such as a pet name', type: 'text', retitle: true },
      { k: 'dob', label: 'Date of birth', short: 'Date of birth', type: 'dob', req: true },
      { k: 'gender', label: 'Gender', short: 'Gender', type: 'radio', cols: 3, options: ['Boy', 'Girl', 'Prefer not to say'] },
      { k: 'school', label: 'School', short: 'School', type: 'text', pair: true },
      { k: 'grade', label: 'Class', short: 'Class', type: 'text', pair: true }
    ]},
    health: { name: 'Health & safety', title: 'Keeping {name} safe in the water', lead: 'Coach Sonal reads this carefully before the first session. It stays confidential.', fields: [
      { k: 'conditions', label: 'Does {name} have any of these?', short: 'Health conditions', type: 'check', req: true, exclusive: 'None of these',
        options: ['Seizures or epilepsy', 'Heart condition', 'Asthma or breathing difficulty', 'Ear infections or ear tubes', 'Skin condition or allergy', 'Low muscle tone', 'None of these'] },
      { k: 'conditionsDetail', label: 'What should Coach Sonal know or do?', short: 'Details', type: 'textarea',
        ph: 'For example: when the last seizure was, and what to do if one happens',
        showIf: function (d) { return (d.conditions || []).some(function (x) { return x !== 'None of these'; }); } },
      { k: 'medicines', label: 'Does {name} take any regular medicines?', short: 'Regular medicines', type: 'radio', cols: 2, options: ['No', 'Yes'] },
      { k: 'medicinesDetail', label: 'Which medicines, and when?', short: 'Medicine details', type: 'text', showIf: function (d) { return d.medicines === 'Yes'; } },
      { k: 'diagnosis', label: 'Diagnosis, if any', short: 'Diagnosis', hint: 'Share only what you are comfortable with. It helps Coach Sonal adapt each session.', type: 'check', cols: 2, other: 'diagnosisOther',
        options: ['Autism (ASD)', 'ADHD', 'Down syndrome', 'Cerebral palsy', 'Developmental delay', 'Intellectual disability', 'Sensory processing', 'Speech delay', 'Other'] },
      { k: 'toilet', label: 'Toilet and changing', short: 'Toilet and changing', type: 'radio', cols: 2, options: ['Independent', 'Needs reminders', 'Needs help', 'Uses diapers'] }
    ]},
    comfort: { name: 'Comfort & communication', title: 'Getting to know {name}', lead: 'Every child connects differently. This helps Coach Sonal earn {name}’s trust from the first day.', fields: [
      { k: 'water', label: 'How does {name} feel about water today?', short: 'In the water', type: 'radio', req: true,
        options: ['Has never been in a pool', 'Nervous or scared', 'Enjoys it with support', 'Can float or swim a little', 'Swims independently'] },
      { k: 'communication', label: 'How does {name} usually communicate?', short: 'Communicates', type: 'radio',
        options: ['Talks in full sentences', 'Uses a few words', 'Uses gestures or signs', 'Uses pictures or a device', 'Mostly without words'] },
      { k: 'upsets', label: 'What can upset or overwhelm {name}?', short: 'Can be upset by', hint: 'Choose all that apply', type: 'check', cols: 2, other: 'upsetsOther',
        options: ['Loud noises or whistles', 'Splashing', 'Water on the face', 'Sudden touch', 'Crowded spaces', 'Waiting for a turn', 'Change in routine', 'Cold water', 'Other'] },
      { k: 'calms', label: 'What helps {name} calm down?', short: 'Calms down with', type: 'textarea', ph: 'For example: firm pressure on the shoulders, counting slowly, a favourite song' },
      { k: 'loves', label: 'What does {name} love?', short: 'Loves', hint: 'Songs, toys, characters or games. Coach Sonal uses these to motivate.', type: 'textarea' }
    ]},
    goals: { name: 'Goals & support', title: 'What you hope swimming gives {name}', lead: 'Your priorities shape how Coach Sonal plans the sessions.', fields: [
      { k: 'goals', label: 'Your main goals', short: 'Goals', hint: 'Choose up to five', type: 'check', cols: 2, max: 5,
        options: ['Safety in water', 'Confidence', 'Calmness', 'Better sleep', 'Strength and fitness', 'Social skills', 'Following instructions', 'Fun and play', 'Learning strokes'] },
      { k: 'goalsNote', label: 'Anything specific you are hoping for?', short: 'Specific hopes', type: 'textarea' },
      { sub: 'Therapy and support' },
      { k: 'therapy', label: 'Is {name} in any therapy?', short: 'Therapy', type: 'check', cols: 2, exclusive: 'No therapy now',
        options: ['Occupational therapy', 'Speech therapy', 'Behaviour therapy (ABA)', 'Special educator', 'Physiotherapy', 'No therapy now'] },
      { k: 'therapistName', label: "Therapist's name", short: 'Therapist', type: 'text', showIf: hasTherapy },
      { k: 'therapistContact', label: "Therapist's phone or centre", short: 'Therapist contact', type: 'text', showIf: hasTherapy },
      { k: 'therapistOk', label: 'May Coach Sonal speak with the therapist so their goals line up?', short: 'May speak with therapist', type: 'radio', cols: 2, options: ['Yes', 'Not now'], showIf: hasTherapy },
      { k: 'heardFrom', label: 'How did you hear about SJ Wellness?', short: 'Heard about us from', type: 'radio', cols: 2, other: 'heardOther',
        options: ['Therapist', 'Doctor', 'School', 'Another parent', 'Instagram or Facebook', 'Google', 'Other'] },
      { k: 'referrerName', label: 'Their name, so we can thank them', short: 'Referred by', type: 'text',
        showIf: function (d) { return ['Therapist', 'Doctor', 'School', 'Another parent'].indexOf(d.heardFrom) >= 0; } }
    ]},
    contact: { name: 'Contact details', title: 'How can Coach Sonal reach you?', lead: 'For session updates and anything she needs to ask.', fields: [
      { k: 'p1Name', label: 'Your full name', short: 'Name', type: 'text', req: true, ac: 'name' },
      { k: 'p1Relation', label: 'Your relationship to {name}', short: 'Relationship', type: 'radio', cols: 2, options: REL },
      { k: 'p1Mobile', label: 'Mobile number', short: 'Mobile', type: 'tel', req: true, ac: 'tel' },
      { k: 'waSame', type: 'toggle', text: 'I use WhatsApp on this number', short: 'WhatsApp on same number' },
      { k: 'whatsapp', label: 'WhatsApp number', short: 'WhatsApp', type: 'tel', showIf: function (d) { return d.waSame === false; } },
      { k: 'email', label: 'Email', short: 'Email', type: 'email', ac: 'email' },
      { k: 'p1Occupation', label: 'Occupation', short: 'Occupation', type: 'text' },
      { k: 'address', label: 'Home address', short: 'Address', type: 'textarea', rows: 2, ac: 'street-address' },
      { k: 'showP2', type: 'reveal', text: 'Add a second parent or emergency contact', focus: 'p2Name' },
      { sub: 'Second contact', showIf: p2On, remove: ['p2Name', 'p2Relation', 'p2Mobile', 'p2Occupation'], flag: 'showP2' },
      { k: 'p2Name', label: 'Full name', short: 'Second contact', type: 'text', showIf: p2On },
      { k: 'p2Relation', label: 'Relationship to {name}', short: 'Their relationship', type: 'radio', cols: 2, options: ['Mother', 'Father', 'Grandparent', 'Other'], showIf: p2On },
      { k: 'p2Mobile', label: 'Mobile number', short: 'Their mobile', type: 'tel', showIf: p2On },
      { k: 'p2Occupation', label: 'Occupation', short: 'Their occupation', type: 'text', showIf: p2On }
    ]},
    review: { name: 'Review', title: 'Check and submit', lead: 'Tap Edit to change anything.', fields: [] }
  },
  welcome: function () {
    return h('div', null,
      h('h1', { class: 'welcome-title', text: 'Before your child’s first swim' }),
      h('p', { class: 'welcome-lead', text: 'Every child takes to water in their own way. Your answers help Coach Sonal plan sessions that are safe, calm and enjoyable from the very first day.' }),
      h('ul', { class: 'facts' },
        h('li', null, icon('clock'), 'Takes about 6 minutes'),
        h('li', null, icon('save'), 'Kept on this phone if you stop halfway'),
        h('li', null, icon('lock'), 'Seen only by Coach Sonal')));
  },
  thanks: function (api) {
    var d = api.F.data, child = api.childFirst() || 'your child';
    return h('div', { class: 'finish' },
      h('div', { class: 'done-mark' }, icon('check')),
      h('h1', { class: 'step-title', text: 'Thank you, ' + (firstName(d.p1Name) || 'and welcome') }),
      h('p', { class: 'step-lead', text: 'Coach Sonal has received ' + child + '’s form and will read it before the first session. You can close this page now.' }),
      h('div', { style: 'margin-top:28px' },
        h('button', { type: 'button', class: 'btn btn-soft block', onclick: function () {
          api.keepAndRestart(['p1Name', 'p1Relation', 'p1Mobile', 'waSame', 'whatsapp', 'email', 'p1Occupation', 'address', 'showP2', 'p2Name', 'p2Relation', 'p2Mobile', 'p2Occupation', 'heardFrom', 'heardOther', 'referrerName']);
        }}, 'Fill in a form for another child')));
  },
  onSubmit: function (data) { return api('submitOnboarding', { data: data }); }
};

/* ================= form 2: feedback (after the last session, personal link) ================= */
function hasWords(d) { return !isBlank(d.story) || !isBlank(d.nowCan); }
var FEEDBACK = {
  id: 'fb', draftKey: null,
  brandSub: 'Swimming for special kids with Coach Sonal',
  fresh: function () { return { refs: [{ name: '', mobile: '' }] }; },
  childFirst: function (F) { return F.ctx ? F.ctx.first : ''; },
  flow: ['went', 'next'],
  startLabel: 'Start', submitLabel: 'Send feedback',
  steps: {
    went: { name: 'How it went', title: 'How did swimming go for {name}?', lead: 'Your honest view helps Coach Sonal improve.', fields: [
      { k: 'rating', label: 'Overall, how happy are you with {name}’s sessions?', type: 'radio', req: true, cols: 2, options: ['Very happy', 'Happy', 'It was okay', 'Not happy'] },
      { k: 'changes', label: 'What changes have you noticed in {name}?', hint: 'Choose all that apply', type: 'check', cols: 2, exclusive: 'Too early to tell',
        options: ['Calmer', 'Better focus', 'Sleeps better', 'Eats better', 'More confident', 'More social', 'Stronger body', 'Follows instructions', 'More words or speech', 'Too early to tell'] },
      { k: 'nowCan', label: 'What can {name} do now that they could not do before?', type: 'textarea', rows: 2, ph: 'For example: walks into the pool alone, floats with a noodle' },
      { k: 'story', label: 'In your own words, how has swimming helped {name}?', type: 'textarea', rows: 4 },
      { k: 'better', label: 'What could Coach Sonal do better?', hint: 'Only Coach Sonal will see this.', type: 'textarea' }
    ]},
    next: { name: 'Before you go', title: 'Before you go', lead: 'A few quick questions. All are optional.', fields: [
      { k: 'continueOn', label: 'Would you like {name} to keep swimming with Coach Sonal?', type: 'radio', options: ['Yes, please contact me', 'Maybe later', 'No, not for now'] },
      { k: 'shareWords', label: 'May Coach Sonal share what you wrote with other parents?', hint: '{name}’s name is never shared.', type: 'radio',
        options: ['Yes, with my first name', 'Yes, without my name', 'No, keep it private'], showIf: hasWords },
      { k: 'referenceOk', label: 'May Coach Sonal give your number to new parents who want to talk to someone?', hint: 'Only to families whose children are like yours.', type: 'radio', cols: 2, options: ['Yes, share my number', 'No, thank you'] },
      { sub: 'Know a family who might benefit?', hint: 'Add a family only if they have agreed to a call from Coach Sonal.' },
      { k: 'refs', type: 'repeater' },
      { k: 'refsAgreed', type: 'agree', text: 'These families have agreed that Coach Sonal may call them.',
        showIf: function (d) { return (d.refs || []).some(function (r) { return !isBlank(r.name) || !isBlank(r.mobile); }); } }
    ]}
  },
  welcome: function (api) {
    var c = api.F.ctx || {};
    return h('div', null,
      h('h1', { class: 'welcome-title', text: api.fmt('Your feedback on {name}’s swimming') }),
      h('p', { class: 'welcome-lead', text: api.fmt('Namaste ' + (c.parentFirst || '') + '. {name} has finished this round of sessions with Coach Sonal. Your thoughts help her plan what comes next.') }),
      h('ul', { class: 'facts' },
        h('li', null, icon('clock'), 'Takes about 2 minutes'),
        h('li', null, icon('lock'), 'You choose what can be shared')),
      null);
  },
  thanks: function (api) {
    var c = api.F.ctx || {}, d = api.F.data;
    return h('div', { class: 'finish' },
      h('div', { class: 'done-mark' }, icon('check')),
      h('h1', { class: 'step-title', text: 'Thank you, ' + (c.parentFirst || 'for your feedback') }),
      h('p', { class: 'step-lead', text: 'Your feedback has reached Coach Sonal.' + (d.rating === 'Not happy' ? ' She will call you to understand what could have been better.' : /^Yes/.test(d.continueOn || '') ? ' She will contact you about ' + c.first + '’s next sessions.' : '') }),
      h('section', { class: 'askreview' },
        h('h2', { text: 'One more way to help' }),
        h('p', { text: 'A Google review helps other parents find Coach Sonal. Please write about your experience in your own words.' }),
        h('a', { class: 'btn btn-soft block', href: (window.SJ_CONFIG || {}).REVIEW_URL || (window.SJ_CONFIG || {}).MAPS_URL, target: '_blank', rel: 'noopener' }, icon('star'), 'Write a Google review')),
      null);
  },
  onSubmit: function (data, ctx) { return api('submitFeedback', { token: ctx.token, data: data }); }
};
