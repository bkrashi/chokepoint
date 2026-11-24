/* Chokepoint: UI. All numbers come from data/game.json; real companies from data/sayari/index.json. */
(function () {
  'use strict';
  var M = window.Model;
  var game = null, sayari = {};
  var state = load() || { step: 1, played: [], fixes: [], replayed: false, stampShown: false };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };

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
  function save() { try { sessionStorage.setItem('chokepoint', JSON.stringify(state)); } catch (e) {} }
  function load() { try { return JSON.parse(sessionStorage.getItem('chokepoint')); } catch (e) { return null; } }
  function sourceLink(f) {
    if (!f || !f.source_url) return '';
    return '<a href="' + esc(f.source_url) + '" target="_blank" rel="noopener">' + esc(f.source_name || 'source') + '</a>';
  }

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

    document.querySelectorAll('.step').forEach(function (b) {
      b.addEventListener('click', function () { go(+b.dataset.step); });
    });
    $('#reset').addEventListener('click', reset);
    $('#replay').addEventListener('click', function () { state.replayed = true; save(); render(); flashReplay(); });
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
  }

  function go(step) {
    state.step = step; save(); render();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function reset() {
    state = { step: 1, played: [], fixes: [], replayed: false, stampShown: false };
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
      btn.innerHTML = containerSVG(n, i) +
        '<span class="node-label">' + esc(n.label) + '</span>' +
        '<span class="node-place">' + esc(n.place) + '</span>' +
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

  /* ---------- event cards ---------- */
  function buildCards() {
    var wrap = $('#cards');
    game.cards.forEach(function (c) {
      var b = el('button', 'form');
      b.dataset.card = c.id;
      var hits = c.hits.map(function (h) {
        return '<li><span>' + esc(nodeLabel(h.node)) + '</span><b>' + h.ttr_weeks + ' wk</b></li>';
      }).join('');
      var f = fact((c.fact_ids || [])[0]);
      b.innerHTML =
        '<span class="form-top"><span>Customs form</span><span>No. ' + esc(c.form_no) + '</span></span>' +
        '<span class="form-title">' + esc(c.title) + '</span>' +
        '<span class="form-blurb">' + esc(c.blurb) + '</span>' +
        '<span class="form-field">Nodes hit · time to recover</span>' +
        '<ul class="form-hits">' + hits + '</ul>' +
        '<span class="form-barcode" aria-hidden="true">' + esc(c.form_no) + '</span>' +
        '<span class="form-stamp" aria-hidden="true">Played</span>';
      b.addEventListener('click', function () { toggleCard(c.id); });
      var holder = el('div', 'form-wrap');
      holder.appendChild(b);
      if (f) {
        holder.appendChild(el('p', 'form-src', 'Real-world precedent: ' + sourceLink(f) +
          (f.published ? ' · ' + esc(f.published) : '') + ' · re-check ' + esc(f.recheck_by)));
      }
      wrap.appendChild(holder);
    });
  }

  function toggleCard(id) {
    var wasChoked = M.evaluate(game, state.played, []).isChoked;
    var i = state.played.indexOf(id);
    if (i >= 0) state.played.splice(i, 1); else state.played.push(id);
    state.replayed = false;
    var nowChoked = M.evaluate(game, state.played, []).isChoked;
    save(); render();
    if (nowChoked && !wasChoked) showStamp();
  }

  /* ---------- fixes ---------- */
  function buildFixes() {
    var wrap = $('#fixes');
    game.fixes.forEach(function (f) {
      var b = el('button', 'po');
      b.dataset.fix = f.id;
      var eff = f.effects.map(function (e) {
        var what = e.tts_add ? '+' + e.tts_add + ' wk survive' : e.ttr_cut ? '−' + e.ttr_cut + ' wk recover' : 'not critical any more';
        return '<li><span>' + esc(nodeLabel(e.node)) + '</span><b>' + what + '</b></li>';
      }).join('');
      var eth = f.ethics > 0 ? '+' + f.ethics : String(f.ethics);
      b.innerHTML =
        '<span class="po-top"><span>Purchase order</span><span class="po-cost">$' + f.cost_musd + 'M</span></span>' +
        '<span class="po-title">' + esc(f.label) + '</span>' +
        '<ul class="form-hits">' + eff + '</ul>' +
        '<span class="po-eth ' + (f.ethics < 0 ? 'neg' : f.ethics > 0 ? 'pos' : '') + '">Ethics ' + eth + ': ' + esc(f.ethics_note) + '</span>' +
        '<span class="form-stamp ok" aria-hidden="true">Bought</span>';
      b.addEventListener('click', function () { toggleFix(f.id); });
      wrap.appendChild(b);
    });
  }

  function toggleFix(id) {
    var i = state.fixes.indexOf(id);
    if (i >= 0) state.fixes.splice(i, 1);
    else {
      var f = M.find(game.fixes, id);
      if (M.spent(game, state.fixes) + f.cost_musd > game.meta.budget_musd) return;
      state.fixes.push(id);
    }
    state.replayed = false;
    save(); render();
  }

  function attackSet() {
    if (state.played.length) return state.played.slice();
    return M.par(game, []).cards;
  }

  /* ---------- render ---------- */
  function render() {
    if (!game) return;
    document.body.dataset.step = state.step;
    document.querySelectorAll('.step').forEach(function (b) {
      var on = +b.dataset.step === state.step;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'step' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = +p.dataset.panel !== state.step; });

    // Which world are we showing?
    var cards = state.step === 1 ? state.played : (state.replayed ? attackSet() : []);
    var fixes = state.step === 1 ? [] : state.fixes;
    var r = M.evaluate(game, cards, fixes);
    renderChain(r, fixes);

    if (state.step === 1) renderBreak(r);
    if (state.step === 2) renderFix(r);
    if (state.step === 3) renderJudge();
  }

  function renderChain(r, fixes) {
    var fixedNodes = {};
    fixes.forEach(function (fid) {
      var f = M.find(game.fixes, fid);
      f.effects.forEach(function (e) { fixedNodes[e.node] = true; });
    });
    game.nodes.forEach(function (n) {
      var li = document.querySelector('.node[data-node="' + n.id + '"]');
      var s = r.nodes[n.id];
      li.classList.toggle('hit', s.hit && !s.choked);
      li.classList.toggle('choked', s.choked);
      li.classList.toggle('fixed', !!fixedNodes[n.id]);
      li.classList.toggle('noncrit', !s.critical);
      li.querySelector('.tts b').textContent = s.tts;
      li.querySelector('.ttr b').textContent = s.hit ? s.ttr : 0;
      var tag = li.querySelector('.node-tag');
      tag.textContent = s.choked ? 'Detained' : (!s.critical ? 'Redesigned out' : (s.hit ? 'Holding' : (fixedNodes[n.id] ? 'Fixed' : '')));
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
      foot.textContent = r.choked.map(function (n) { return n.label; }).join(' + ') + ' dark for ' + r.darkWeeks + ' more weeks after that.';
    } else {
      cd.classList.remove('red');
      cd.textContent = '∞';
      foot.textContent = state.played.length
        ? 'Line holds. Closest call: ' + r.minSlack + ' week' + (r.minSlack === 1 ? '' : 's') + ' of slack.'
        : 'Line running. Play a card.';
    }
    document.querySelectorAll('.form').forEach(function (b) {
      var on = state.played.indexOf(b.dataset.card) >= 0;
      b.classList.toggle('played', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  function renderFix(r) {
    var left = game.meta.budget_musd - M.spent(game, state.fixes);
    $('#budget').textContent = '$' + left + 'M';
    document.querySelectorAll('.po').forEach(function (b) {
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
        ? 'Your attack: ' + set.length + ' card' + (set.length === 1 ? '' : 's') + '. Buy fixes, then press Replay.'
        : 'No attack from step 1, so the replay uses the par attack.';
      return;
    }
    res.textContent = r.isChoked ? 'Still choked' : 'Survived';
    res.className = 'stat-num ' + (r.isChoked ? 'red' : 'blue');
    foot.textContent = r.isChoked
      ? 'Line stops in week ' + r.stopWeek + ': ' + r.choked.map(function (n) { return n.label; }).join(' + ') + '.'
      : 'All ' + set.length + ' card' + (set.length === 1 ? '' : 's') + ' absorbed.';
    // Card-by-card
    set.forEach(function (cid) {
      var c = M.find(game.cards, cid);
      var one = M.evaluate(game, [cid], state.fixes);
      var row = el('div', 'replay-row ' + (one.isChoked ? 'bad' : 'good'),
        '<span class="rr-form">' + esc(c.form_no) + '</span><span class="rr-title">' + esc(c.title) + '</span>' +
        '<span class="rr-verdict">' + (one.isChoked ? 'Still chokes' : 'Absorbed') + '</span>');
      list.appendChild(row);
    });
  }

  function flashReplay() {
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
    $('#stampDetail').textContent = 'Line stops in week ' + r.stopWeek + '. ' +
      r.choked.map(function (n) { return n.label; }).join(' + ') + ' cannot recover in time. ' +
      state.played.length + ' card' + (state.played.length === 1 ? '' : 's') + ' played.';
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
      if (d.sayari_status && d.sayari_status !== 'ok') html += '<p class="mf-none">' + esc(d.status_note || 'Sayari returned only partial results.') + '</p>';
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
      t += '<tr><td>' + esc(f.topic) + '</td><td>' + esc(f.text) + (f.verified === false ? ' <b class="unv">(unverified)</b>' : '') +
        '</td><td>' + sourceLink(f) + '</td><td>' + esc(f.recheck_by) + '</td></tr>';
    });
    box.innerHTML = t + '</tbody></table>' +
      '<p class="method">Method: Time-to-Survive / Time-to-Recover after Simchi-Levi et al. TTS/TTR week numbers are illustrative.</p>';
  }
})();
