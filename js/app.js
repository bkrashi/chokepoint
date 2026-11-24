/* Chokepoint: UI. All numbers come from data/game.json; real companies from data/sayari/index.json. */
(function () {
  'use strict';
  var M = window.Model;
  var game = null, sayari = {};
  var state = load() || fresh();
  var replayCount = null;          // transient: how many cards of the replay are shown (null = all)
  var replayTimer = null;
  var preview = null;              // { kind: 'card'|'fix', id }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  Promise.all([
    fetch('data/game.json').then(function (r) { return r.json(); }),
    fetch('data/sayari/index.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
  ]).then(function (res) {
    game = res[0];
    sayari = (res[1] && res[1].nodes) || {};
    init();
  }).catch(function (err) {
    document.querySelector('main').innerHTML =
      '<p class="load-error">Could not load data/game.json. Open this page through a web server (see README).</p>';
    if (window.console) console.warn(err);
  });

  /* ---------- helpers ---------- */
  function fresh() { return { step: 1, played: [], fixes: [], replayed: false }; }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fact(id) { return (game.facts || []).filter(function (f) { return f.id === id; })[0]; }
  function nodeLabel(id) { var n = M.find(game.nodes, id); return n ? n.label : id; }
  function nodeEl(id) { return document.querySelector('.node[data-node="' + id + '"]'); }
  function save() { try { sessionStorage.setItem('chokepoint', JSON.stringify(state)); } catch (e) {} }
  function load() { try { return JSON.parse(sessionStorage.getItem('chokepoint')); } catch (e) { return null; } }
  function sourceLink(f) {
    if (!f || !f.source_url) return '';
    return '<a href="' + esc(f.source_url) + '" target="_blank" rel="noopener">' + esc(f.source_name || 'source') + '</a>';
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- init ---------- */
  function init() {
    $('#disclaimer').innerHTML = '<span>' + esc(game.meta.disclaimer) + '</span>';
    $('#budgetTotal').textContent = game.meta.budget_musd;
    ['break', 'fix', 'judge'].forEach(function (k, i) {
      var ol = $('#script-' + (i + 1));
      (game.scripts[k] || []).forEach(function (line) { ol.appendChild(el('li', null, esc(line))); });
    });
    buildChain();
    buildCards();
    buildFixes();
    buildSources();

    $$('.step').forEach(function (b) { b.addEventListener('click', function () { go(+b.dataset.step); }); });
    $('#reset').addEventListener('click', reset);
    $('#replay').addEventListener('click', startReplay);
    $('#stampClose').addEventListener('click', hideStamp);
    $('#stampOverlay').addEventListener('click', function (e) { if (e.target.id === 'stampOverlay') hideStamp(); });
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ($('#nodeDialog').open) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') go(+e.key);
      else if (e.key === 'r' || e.key === 'R') reset();
      else if (e.key === 'Escape') hideStamp();
    });
    render();
    window.addEventListener('resize', function () { if (state.step === 1) render(); });
  }

  function go(step) {
    stopReplay();
    state.step = step; save(); render();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function reset() {
    stopReplay();
    state = fresh(); preview = null;
    save(); hideStamp(); render();
  }

  /* ---------- chain (containers) ---------- */
  function containerSVG(n, i) {
    var code = 'CHKU ' + String(410000 + i * 137).slice(0, 6);
    var ribs = '';
    for (var x = 18; x < 196; x += 11) ribs += '<line x1="' + x + '" y1="14" x2="' + x + '" y2="86"/>';
    return '<svg viewBox="0 0 210 100" class="box" aria-hidden="true">' +
      '<rect class="body" x="4" y="6" width="202" height="88" rx="2"/>' +
      '<g class="ribs">' + ribs + '</g>' +
      '<rect class="rail" x="4" y="6" width="202" height="8"/><rect class="rail" x="4" y="86" width="202" height="8"/>' +
      '<rect class="plate" x="12" y="20" width="96" height="20"/>' +
      '<text class="code" x="16" y="35">' + code + '</text>' +
      '<text class="iso" x="190" y="78" text-anchor="end">' + esc(n.country) + '</text>' +
      '<g class="hazard-x"><line x1="30" y1="22" x2="180" y2="80"/><line x1="180" y1="22" x2="30" y2="80"/></g>' +
      '</svg>';
  }

  function buildChain() {
    var ol = $('#chain');
    game.nodes.forEach(function (n, i) {
      var li = el('li', 'node');
      li.dataset.node = n.id;
      var btn = el('button', 'node-btn');
      btn.setAttribute('aria-label', n.label + ', ' + n.place + '. Show companies');
      btn.innerHTML = '<span class="box-wrap">' + containerSVG(n, i) + '<span class="pv"></span></span>' +
        '<span class="node-label">' + esc(n.label) + '</span>' +
        '<span class="node-place">' + esc(n.place) + '</span>' +
        '<span class="gauge" aria-hidden="true"><i></i></span>' +
        '<span class="node-nums"><span class="tts">TTS <b>' + n.tts_weeks + '</b>w</span><span class="ttr">TTR <b>0</b>w</span></span>' +
        '<span class="node-tag"></span>';
      btn.addEventListener('click', function () { openNode(n.id, btn); });
      li.appendChild(btn);
      if (i < game.nodes.length - 1) {
        var link = el('span', 'link');
        link.setAttribute('aria-hidden', 'true');
        link.innerHTML = '<i></i><i></i><i></i>';
        li.appendChild(link);
      }
      ol.appendChild(li);
    });
  }

  /* ---------- the hand of event cards ---------- */
  function buildCards() {
    var hand = $('#cards');
    game.cards.forEach(function (c) {
      var b = el('button', 'form');
      b.dataset.card = c.id;
      var hits = c.hits.map(function (h) {
        return '<li><span>' + esc(nodeLabel(h.node)) + '</span><b>+' + h.ttr_weeks + 'w</b></li>';
      }).join('');
      b.innerHTML =
        '<span class="form-top"><span>Customs form</span><span>' + esc(c.form_no) + '</span></span>' +
        '<span class="form-title">' + esc(c.title) + '</span>' +
        '<span class="form-blurb">' + esc(c.blurb) + '</span>' +
        '<span class="form-field">Hits · time to recover</span>' +
        '<ul class="form-hits">' + hits + '</ul>' +
        '<span class="form-barcode" aria-hidden="true">' + esc(c.form_no) + '</span>';
      b.setAttribute('aria-label', 'Play card: ' + c.title);
      b.addEventListener('mouseenter', function () { setPreview({ kind: 'card', id: c.id }); });
      b.addEventListener('mouseleave', function () { setPreview(null); });
      b.addEventListener('focus', function () { setPreview({ kind: 'card', id: c.id }); });
      b.addEventListener('blur', function () { setPreview(null); });
      enableDrag(b, c.id);
      hand.appendChild(b);
    });
  }

  // Drag a card onto the chain (pointer events: mouse, pen and touch). A plain click also plays it.
  function enableDrag(card, id) {
    var start = null, ghost = null, dragging = false, suppressClick = false;

    card.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      dragging = false;
    });
    card.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) > 8) {
        dragging = true;
        try { card.setPointerCapture(e.pointerId); } catch (err) {}
        var r = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.className = 'form ghost';
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        ghost.style.left = r.left + 'px';
        ghost.style.top = r.top + 'px';
        ghost.dataset.ox = r.left; ghost.dataset.oy = r.top;
        document.body.appendChild(ghost);
        card.classList.add('lifted-away');
        document.body.classList.add('dragging');
        setPreview({ kind: 'card', id: id });
      }
      if (dragging) {
        ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + Math.max(-12, Math.min(12, dx / 25)) + 'deg)';
        $('.world').classList.toggle('drop-hot', overChain(e.clientX, e.clientY));
      }
    });
    function end(e) {
      if (!start) return;
      var wasDragging = dragging;
      start = null; dragging = false;
      document.body.classList.remove('dragging');
      $('.world').classList.remove('drop-hot');
      if (!wasDragging) return;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      card.classList.remove('lifted-away');
      var g = ghost; ghost = null;
      if (e.type === 'pointerup' && overChain(e.clientX, e.clientY)) {
        playCard(id, g);
      } else {
        // fly back to the hand
        if (reduceMotion || !g.animate) { g.remove(); return; }
        g.animate([{ transform: g.style.transform }, { transform: 'translate(0,0) rotate(0)' }],
          { duration: 220, easing: 'ease-out' }).onfinish = function () { g.remove(); };
        setPreview(null);
      }
    }
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    card.addEventListener('click', function () {
      if (suppressClick) return;
      playCard(id, null);
    });
  }

  function overChain(x, y) {
    var r = $('.world').getBoundingClientRect();
    var dock = $('#dock').getBoundingClientRect();
    // Anywhere above the dock counts as "on the chain" on big screens.
    return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) || (dock.height && y < dock.top - 20);
  }

  function playCard(id, ghost) {
    if (state.step !== 1 || state.played.indexOf(id) >= 0) { if (ghost) ghost.remove(); return; }
    var card = M.find(game.cards, id);
    var src = ghost || document.querySelector('.form[data-card="' + id + '"]');
    var target = nodeEl(card.hits[0].node);
    var wasChoked = M.evaluate(game, state.played, []).isChoked;
    setPreview(null);
    fly(src, target, !!ghost, function () {
      state.played.push(id);
      save(); render();
      card.hits.forEach(function (h, i) {
        setTimeout(function () { impact(h.node, '+' + h.ttr_weeks + 'w', 'bad'); }, i * 120);
      });
      var nowChoked = M.evaluate(game, state.played, []).isChoked;
      if (nowChoked && !wasChoked) setTimeout(showStamp, reduceMotion ? 0 : 650);
    });
  }

  function unplayCard(id) {
    var i = state.played.indexOf(id);
    if (i < 0) return;
    state.played.splice(i, 1);
    state.replayed = false;
    save(); render();
  }

  // Animate a card from its spot to a container, then call done().
  function fly(fromEl, toEl, isGhost, done) {
    if (reduceMotion || !fromEl || !toEl || !fromEl.animate) {
      if (isGhost && fromEl) fromEl.remove();
      done(); return;
    }
    var a = fromEl.getBoundingClientRect(), b = toEl.querySelector('.box').getBoundingClientRect();
    var f = isGhost ? fromEl : fromEl.cloneNode(true);
    if (!isGhost) {
      f.className = 'form ghost';
      f.style.width = a.width + 'px'; f.style.height = a.height + 'px';
      f.style.left = a.left + 'px'; f.style.top = a.top + 'px';
      document.body.appendChild(f);
    }
    var gx = parseFloat(f.style.left), gy = parseFloat(f.style.top);
    var dx = b.left + b.width / 2 - (gx + a.width / 2);
    var dy = b.top + b.height / 2 - (gy + a.height / 2);
    var from = isGhost ? f.style.transform || 'none' : 'translate(0,0)';
    f.animate([
      { transform: from, opacity: 1 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(-18deg) scale(.22)', opacity: .85 }
    ], { duration: 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = function () {
      f.remove(); done();
    };
  }

  // Shake a container and float a label off it.
  function impact(nodeId, text, kind) {
    var li = nodeEl(nodeId);
    if (!li) return;
    li.classList.remove('impact', 'boost'); void li.offsetWidth;
    li.classList.add(kind === 'good' ? 'boost' : 'impact');
    setTimeout(function () { li.classList.remove('impact', 'boost'); }, 700);
    if (reduceMotion) return;
    var f = el('span', 'float ' + kind, esc(text));
    li.appendChild(f);
    setTimeout(function () { f.remove(); }, 1300);
  }

  /* ---------- fixes ---------- */
  function effectText(e, short) {
    if (e.tts_add) return '+' + e.tts_add + (short ? 'w' : ' wk survive');
    if (e.ttr_cut) return '−' + e.ttr_cut + (short ? 'w' : ' wk recover');
    return short ? 'out' : 'not critical any more';
  }

  function buildFixes() {
    var wrap = $('#fixes');
    game.fixes.forEach(function (f) {
      var b = el('button', 'po');
      b.dataset.fix = f.id;
      var eff = f.effects.map(function (e) {
        return '<li><span>' + esc(nodeLabel(e.node)) + '</span><b>' + effectText(e) + '</b></li>';
      }).join('');
      var eth = f.ethics > 0 ? '+' + f.ethics : String(f.ethics);
      b.innerHTML =
        '<span class="po-top"><span>Purchase order</span><span class="po-cost">$' + f.cost_musd + 'M</span></span>' +
        '<span class="po-title">' + esc(f.label) + '</span>' +
        '<ul class="form-hits">' + eff + '</ul>' +
        '<span class="po-eth ' + (f.ethics < 0 ? 'neg' : f.ethics > 0 ? 'pos' : '') + '">Ethics ' + eth + ': ' + esc(f.ethics_note) + '</span>' +
        '<span class="form-stamp ok" aria-hidden="true">Bought</span>';
      b.addEventListener('click', function () { toggleFix(f.id); });
      b.addEventListener('mouseenter', function () { setPreview({ kind: 'fix', id: f.id }); });
      b.addEventListener('mouseleave', function () { setPreview(null); });
      b.addEventListener('focus', function () { setPreview({ kind: 'fix', id: f.id }); });
      b.addEventListener('blur', function () { setPreview(null); });
      wrap.appendChild(b);
    });
  }

  function toggleFix(id) {
    stopReplay();
    var f = M.find(game.fixes, id);
    var i = state.fixes.indexOf(id);
    if (i >= 0) state.fixes.splice(i, 1);
    else {
      if (M.spent(game, state.fixes) + f.cost_musd > game.meta.budget_musd) { refuse(id); return; }
      state.fixes.push(id);
    }
    state.replayed = false;
    save(); render();
    if (i < 0) f.effects.forEach(function (e, k) {
      setTimeout(function () { impact(e.node, effectText(e, true), 'good'); }, k * 120);
    });
  }

  function refuse(id) {
    var b = document.querySelector('.po[data-fix="' + id + '"]');
    b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
  }

  function attackSet() {
    if (state.played.length) return state.played.slice();
    return M.par(game, []).cards;
  }

  /* ---------- replay (step 2), one card at a time ---------- */
  function startReplay() {
    stopReplay();
    state.replayed = true; save();
    var set = attackSet();
    if (reduceMotion) { replayCount = null; render(); flashVerdict(); return; }
    replayCount = 0; render();
    replayTimer = setInterval(function () {
      replayCount++;
      render();
      var c = M.find(game.cards, set[replayCount - 1]);
      if (c) c.hits.forEach(function (h, i) {
        setTimeout(function () { impact(h.node, '+' + h.ttr_weeks + 'w', 'bad'); }, i * 100);
      });
      if (replayCount >= set.length) {
        clearInterval(replayTimer); replayTimer = null;
        setTimeout(function () { replayCount = null; render(); flashVerdict(); }, 650);
      }
    }, 750);
  }
  function stopReplay() {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null; replayCount = null;
  }

  /* ---------- preview (hover a card or a fix) ---------- */
  function setPreview(p) {
    preview = p;
    $$('.node').forEach(function (li) { li.classList.remove('preview', 'preview-good'); li.querySelector('.pv').textContent = ''; });
    if (!p) return;
    if (p.kind === 'card' && state.step === 1) {
      var c = M.find(game.cards, p.id);
      c.hits.forEach(function (h) {
        var li = nodeEl(h.node);
        li.classList.add('preview');
        li.querySelector('.pv').textContent = '+' + h.ttr_weeks + 'w';
      });
    }
    if (p.kind === 'fix' && state.step === 2) {
      var f = M.find(game.fixes, p.id);
      f.effects.forEach(function (e) {
        var li = nodeEl(e.node);
        li.classList.add('preview-good');
        li.querySelector('.pv').textContent = effectText(e, true);
      });
    }
  }

  /* ---------- render ---------- */
  function render() {
    if (!game) return;
    document.body.dataset.step = state.step;
    $$('.step').forEach(function (b) {
      var on = +b.dataset.step === state.step;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'step' : 'false');
    });
    $$('[data-panel]').forEach(function (p) { p.hidden = +p.dataset.panel !== state.step; });

    var cards, fixes = state.step === 1 ? [] : state.fixes;
    if (state.step === 1) cards = state.played;
    else if (state.step === 2 && state.replayed) cards = replayCount == null ? attackSet() : attackSet().slice(0, replayCount);
    else cards = [];
    var r = M.evaluate(game, cards, fixes);
    renderChain(r, fixes);

    if (state.step === 1) renderBreak(r);
    if (state.step === 2) renderFix(r);
    if (state.step === 3) renderJudge();
  }

  function renderChain(r, fixes) {
    var fixedNodes = {};
    fixes.forEach(function (fid) {
      M.find(game.fixes, fid).effects.forEach(function (e) { fixedNodes[e.node] = true; });
    });
    game.nodes.forEach(function (n) {
      var li = nodeEl(n.id);
      var s = r.nodes[n.id];
      var ratio = s.hit && s.tts ? s.ttr / s.tts : 0;
      li.classList.toggle('hit', s.hit && !s.choked);
      li.classList.toggle('hot', s.hit && !s.choked && ratio >= 0.6);
      li.classList.toggle('choked', s.choked);
      li.classList.toggle('fixed', !!fixedNodes[n.id]);
      li.classList.toggle('noncrit', !s.critical);
      li.querySelector('.gauge i').style.width = Math.min(100, Math.round(ratio * 100)) + '%';
      li.querySelector('.tts b').textContent = s.tts;
      li.querySelector('.ttr b').textContent = s.hit ? s.ttr : 0;
      li.querySelector('.node-tag').textContent = s.choked ? 'Detained'
        : (!s.critical ? 'Redesigned out' : (s.hit ? (s.tts - s.ttr) + 'w slack' : (fixedNodes[n.id] ? 'Fixed' : '')));
    });
  }

  function renderBreak(r) {
    $('#cardCount').textContent = state.played.length;
    var p = M.par(game, []);
    $('#par').textContent = r.isChoked ? p.size : '?';
    var cd = $('#countdown'), foot = $('#countdownFoot');
    if (r.isChoked) {
      cd.textContent = r.stopWeek;
      cd.classList.add('red');
      foot.textContent = r.choked.map(function (n) { return n.label; }).join(' + ') + ' dark ' + plural(r.darkWeeks, 'more week') + '.';
    } else {
      cd.classList.remove('red');
      cd.textContent = '∞';
      foot.textContent = state.played.length
        ? 'Holding. Closest call: ' + plural(r.minSlack, 'week') + ' of slack.'
        : 'Line running. Play a card.';
    }
    // Hand: fan the unplayed cards.
    var left = game.cards.filter(function (c) { return state.played.indexOf(c.id) < 0; });
    var n = left.length;
    var hand = $('#cards');
    if (hand.clientWidth) {
      var gap = n > 1 ? Math.max(44, Math.min(150, (hand.clientWidth - 280) / (n - 1))) : 0;
      hand.style.setProperty('--gap', gap + 'px');
    }
    $$('.hand .form').forEach(function (b) {
      var k = -1;
      left.forEach(function (c, j) { if (c.id === b.dataset.card) k = j; });
      b.classList.toggle('gone', k < 0);
      if (k >= 0) {
        var d = k - (n - 1) / 2;
        b.style.setProperty('--d', d);
        b.style.setProperty('--ad', Math.abs(d));
        b.style.zIndex = 10 + k;
      }
    });
    // Customs log.
    var log = $('#log');
    log.innerHTML = '';
    $('#logEmpty').hidden = state.played.length > 0;
    state.played.forEach(function (cid, i) {
      var c = M.find(game.cards, cid);
      var f = fact((c.fact_ids || [])[0]);
      var li = el('li', 'log-item',
        '<span class="log-no">' + (i + 1) + '</span>' +
        '<span class="log-main"><span class="log-form">' + esc(c.form_no) + '</span>' +
        '<span class="log-title">' + esc(c.title) + '</span>' +
        (f ? '<span class="log-src">Real-world precedent: ' + esc(f.text) + ' ' + sourceLink(f) + '</span>' : '') +
        '</span>' +
        '<span class="log-stamp">Filed</span>');
      var undo = el('button', 'log-undo', 'Take back');
      undo.addEventListener('click', function () { unplayCard(cid); });
      li.appendChild(undo);
      log.appendChild(li);
    });
  }

  function renderFix(r) {
    var left = game.meta.budget_musd - M.spent(game, state.fixes);
    $('#budget').textContent = '$' + left + 'M';
    $$('.po').forEach(function (b) {
      var f = M.find(game.fixes, b.dataset.fix);
      var on = state.fixes.indexOf(f.id) >= 0;
      b.classList.toggle('bought', on);
      b.setAttribute('aria-pressed', on);
      var cant = !on && f.cost_musd > left;
      b.classList.toggle('cant', cant);
      b.setAttribute('aria-disabled', cant);
    });
    var set = attackSet();
    var res = $('#replayResult'), foot = $('#replayFoot'), list = $('#replayList');
    list.innerHTML = '';
    if (!state.replayed) {
      res.textContent = '—'; res.className = 'stat-num';
      foot.textContent = state.played.length
        ? 'Your attack: ' + plural(set.length, 'card') + '. Buy fixes, then press Replay.'
        : 'No attack from step 1, so the replay uses the par attack.';
      return;
    }
    var shown = replayCount == null ? set : set.slice(0, replayCount);
    if (replayCount != null) {
      res.textContent = 'Replaying'; res.className = 'stat-num';
      foot.textContent = 'Card ' + shown.length + ' of ' + set.length + '…';
    } else {
      res.textContent = r.isChoked ? 'Still choked' : 'Survived';
      res.className = 'stat-num ' + (r.isChoked ? 'red' : 'blue');
      foot.textContent = r.isChoked
        ? 'Line stops in week ' + r.stopWeek + ': ' + r.choked.map(function (n) { return n.label; }).join(' + ') + '.'
        : 'All ' + plural(set.length, 'card') + ' absorbed.';
    }
    shown.forEach(function (cid) {
      var c = M.find(game.cards, cid);
      var one = M.evaluate(game, [cid], state.fixes);
      list.appendChild(el('div', 'replay-row ' + (one.isChoked ? 'bad' : 'good'),
        '<span class="rr-form">' + esc(c.form_no) + '</span><span class="rr-title">' + esc(c.title) + '</span>' +
        '<span class="rr-verdict">' + (one.isChoked ? 'Still chokes' : 'Absorbed') + '</span>'));
    });
  }

  function flashVerdict() {
    if (reduceMotion) return;
    var res = $('#replayResult');
    res.classList.remove('slam'); void res.offsetWidth; res.classList.add('slam');
    if (M.evaluate(game, attackSet(), state.fixes).isChoked) shake();
  }

  function renderJudge() {
    var base = M.resilience(game, []);
    var res = M.resilience(game, state.fixes);
    var eth = M.ethics(game, state.fixes);
    $('#resNum').textContent = res.pct + '%';
    $('#ethNum').textContent = eth;
    setFill('#resFill', res.pct);
    setFill('#ethFill', eth);
    $('#resFoot').textContent = 'Survives ' + res.survived + ' of ' + res.total + ' one- and two-card attacks (was ' + base.survived + ' before fixes).';
    $('#ethFoot').textContent = 'Started at ' + game.meta.ethics_start + '. Every fix moves it up or down.';
    var ul = $('#receipts');
    ul.innerHTML = '';
    if (!state.fixes.length) {
      ul.appendChild(el('li', 'receipt empty', 'No fixes bought. Go back to step 2 (press <kbd>2</kbd>).'));
    }
    state.fixes.forEach(function (fid) {
      var f = M.find(game.fixes, fid);
      var cls = f.ethics < 0 ? 'neg' : f.ethics > 0 ? 'pos' : '';
      ul.appendChild(el('li', 'receipt ' + cls,
        '<span class="rc-title">' + esc(f.label) + '</span>' +
        '<span class="rc-cost">$' + f.cost_musd + 'M</span>' +
        '<span class="rc-eth">Ethics ' + (f.ethics > 0 ? '+' : '') + f.ethics + '</span>' +
        '<span class="rc-who">Who pays: ' + esc(f.who_pays) + '</span>'));
    });
  }

  function setFill(sel, pct) {
    var e = $(sel);
    e.style.width = '0%';
    void e.offsetWidth;
    setTimeout(function () { e.style.width = pct + '%'; }, 60);
  }

  /* ---------- stamp ---------- */
  function showStamp() {
    var r = M.evaluate(game, state.played, []);
    if (!r.isChoked) return;
    $('#stampDetail').textContent = 'Line stops in week ' + r.stopWeek + '. ' +
      r.choked.map(function (n) { return n.label; }).join(' + ') + ' cannot recover in time. ' +
      plural(state.played.length, 'card') + ' played.';
    var ov = $('#stampOverlay');
    ov.hidden = false;
    var s = $('#stamp');
    s.classList.remove('slam'); void s.offsetWidth; s.classList.add('slam');
    shake();
    $('#stampClose').focus();
  }
  function hideStamp() { $('#stampOverlay').hidden = true; }
  function shake() {
    if (reduceMotion) return;
    document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
  }

  /* ---------- container dialog (Sayari) ---------- */
  function openNode(id, btn) {
    var n = M.find(game.nodes, id);
    var d = sayari[id];
    var facts = (n.fact_ids || []).map(fact).filter(Boolean);
    var html = '<div class="mf-head"><span class="mf-code">Container manifest · ' + esc(n.country) + '</span>' +
      '<h3>' + esc(n.label) + '</h3><p class="mf-place">' + esc(n.place) + '</p>' +
      '<p class="mf-why">' + esc(n.why) + '</p>' +
      '<p class="mf-nums">TTS <b>' + n.tts_weeks + ' weeks</b> of inventory <span class="mf-ill">(illustrative)</span></p>' +
      facts.map(function (f) {
        return '<p class="mf-fact">' + esc(f.text) + ' <span class="mf-src">' + sourceLink(f) + ' · re-check ' + esc(f.recheck_by) + '</span></p>';
      }).join('') + '</div>';

    html += '<h4 class="mf-sub">Real companies in this role</h4>';
    if (!d) {
      html += '<p class="mf-none">No Sayari data loaded for this node.</p>';
    } else {
      if (d.status_note) html += '<p class="mf-none">' + esc(d.status_note) + '</p>';
      html += '<div class="cos">' + (d.companies || []).map(companyCard).join('') + '</div>';
      if (d.fallback) {
        html += '<div class="co fictional"><span class="co-name">' + esc(d.fallback.name) + '</span>' +
          '<span class="co-flag">Fictional example</span><p>' + esc(d.fallback.notes || '') + '</p></div>';
      }
      html += '<p class="mf-foot">Source: ' + esc(d.source) + ' · retrieved ' + esc(d.retrieved_at) +
        '. "Flagged" / "linked to" describe list matches or network links in Sayari\'s graph, not findings of wrongdoing.</p>';
    }
    $('#manifestInner').innerHTML = html;
    var dlg = $('#nodeDialog');
    dlg.classList.remove('flip'); void dlg.offsetWidth;
    if (!reduceMotion) dlg.classList.add('flip');
    dlg.showModal();
    dlg.addEventListener('close', function once() { dlg.removeEventListener('close', once); if (btn) btn.focus(); });
  }

  function companyCard(c) {
    var flags = (c.flags || []);
    var shown = flags.slice(0, 4);
    var flagHtml = flags.length
      ? shown.map(function (f) {
          var linked = f.tier !== 'flagged';
          return '<span class="co-flag ' + esc(f.type) + (linked ? ' linked' : '') + '">' + (linked ? 'Linked to: ' : 'Flagged: ') + esc(f.label) + '</span>';
        }).join('') + (flags.length > 4 ? '<span class="co-flag more">+' + (flags.length - 4) + ' more links</span>' : '')
      : '<span class="co-flag none">No list flags found</span>';
    var cps = (c.top_counterparties || []).slice(0, 3).map(function (p) {
      return '<li>' + (p.direction === 'buys_from' ? 'Buys from ' : 'Sells to ') + esc(p.name) + (p.country ? ' (' + esc(p.country) + ')' : '') + '</li>';
    }).join('');
    return '<div class="co">' +
      '<span class="co-name">' + esc(c.name) + '</span>' +
      '<span class="co-meta">' + esc(c.country) + ' · ' + (c.state_owned === 'y' ? 'State-owned' : c.state_owned === 'n' ? 'Not state-owned' : 'Ownership unclear') +
      (c.match === 'possible match' ? ' · <b class="possible">Possible match</b>' : '') + '</span>' +
      '<div class="co-flags">' + flagHtml + '</div>' +
      (cps ? '<ul class="co-cps">' + cps + '</ul>' : '<p class="co-nocp">No shipment counterparties in Sayari.</p>') +
      (c.ultimate_owner ? '<p class="co-ubo">Ultimate owner (Sayari): ' + esc(c.ultimate_owner) + '</p>' : '') +
      '<span class="co-id">Sayari ID ' + esc(c.sayari_entity_id) + '</span>' +
      '</div>';
  }

  /* ---------- sources ---------- */
  function buildSources() {
    var box = $('#sourceList');
    var facts = game.facts || [];
    if (!facts.length) { box.innerHTML = '<p>No facts loaded.</p>'; return; }
    var t = '<table class="src"><thead><tr><th>Topic</th><th>Fact</th><th>Source</th><th>Re-check by</th></tr></thead><tbody>';
    facts.forEach(function (f) {
      t += '<tr><td>' + esc(f.topic) + '</td><td>' + esc(f.text) + '</td><td>' + sourceLink(f) + '</td><td>' + esc(f.recheck_by) + '</td></tr>';
    });
    box.innerHTML = t + '</tbody></table>' +
      '<p class="method">' + esc(game.meta.method || 'Method: Time-to-Survive / Time-to-Recover after Simchi-Levi et al.') +
      ' TTS/TTR week numbers are illustrative.</p>';
  }
})();
