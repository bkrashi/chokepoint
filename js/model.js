/* Chokepoint: game logic (no DOM). Reads the shape of data/game.json. */
(function (root) {
  'use strict';

  // Effective TTS / TTR / critical per node, given cards played and fixes bought.
  function evaluate(game, cardIds, fixIds) {
    var nodes = {};
    game.nodes.forEach(function (n) {
      nodes[n.id] = { id: n.id, label: n.label, tts: n.tts_weeks, ttr: 0, cut: 0, critical: !!n.critical, hit: false };
    });
    (fixIds || []).forEach(function (fid) {
      var fix = find(game.fixes, fid);
      if (!fix) return;
      fix.effects.forEach(function (e) {
        var n = nodes[e.node];
        if (!n) return;
        if (e.tts_add) n.tts += e.tts_add;
        if (e.ttr_cut) n.cut += e.ttr_cut;
        if (e.make_noncritical) n.critical = false;
      });
    });
    (cardIds || []).forEach(function (cid) {
      var card = find(game.cards, cid);
      if (!card) return;
      card.hits.forEach(function (h) {
        var n = nodes[h.node];
        if (!n) return;
        n.ttr += h.ttr_weeks;
        n.hit = true;
      });
    });
    var choked = [];
    var minSlack = Infinity;
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (n.hit) n.ttr = Math.max(0, n.ttr - n.cut);
      n.choked = n.hit && n.critical && n.ttr > n.tts;
      if (n.choked) choked.push(n);
      else if (n.hit && n.critical) minSlack = Math.min(minSlack, n.tts - n.ttr);
    });
    // Line stops at the earliest TTS among choked nodes.
    var stopWeek = choked.length ? Math.min.apply(null, choked.map(function (n) { return n.tts; })) : null;
    var darkWeeks = choked.length ? Math.max.apply(null, choked.map(function (n) { return n.ttr - n.tts; })) : 0;
    return { nodes: nodes, choked: choked, isChoked: choked.length > 0, stopWeek: stopWeek, darkWeeks: darkWeeks, minSlack: minSlack };
  }

  // Smallest card set that chokes the chip (brute force, 10 cards = 1023 subsets).
  function par(game, fixIds) {
    var ids = game.cards.map(function (c) { return c.id; });
    for (var size = 1; size <= ids.length; size++) {
      var hit = null;
      combos(ids, size, function (set) {
        if (!hit && evaluate(game, set, fixIds).isChoked) hit = set.slice();
      });
      if (hit) return { size: size, cards: hit };
    }
    return { size: null, cards: [] };
  }

  // Resilience = share of all 1- and 2-card attacks the chain survives.
  function resilience(game, fixIds) {
    var ids = game.cards.map(function (c) { return c.id; });
    var total = 0, survived = 0;
    [1, 2].forEach(function (k) {
      combos(ids, k, function (set) {
        total++;
        if (!evaluate(game, set, fixIds).isChoked) survived++;
      });
    });
    return { total: total, survived: survived, pct: total ? Math.round(100 * survived / total) : 0 };
  }

  function ethics(game, fixIds) {
    var score = game.meta.ethics_start;
    (fixIds || []).forEach(function (fid) {
      var f = find(game.fixes, fid);
      if (f) score += f.ethics;
    });
    return Math.max(0, Math.min(100, score));
  }

  function spent(game, fixIds) {
    return (fixIds || []).reduce(function (s, fid) {
      var f = find(game.fixes, fid);
      return s + (f ? f.cost_musd : 0);
    }, 0);
  }

  function combos(arr, k, cb, start, acc) {
    start = start || 0; acc = acc || [];
    if (acc.length === k) { cb(acc); return; }
    for (var i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      combos(arr, k, cb, i + 1, acc);
      acc.pop();
    }
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  root.Model = { evaluate: evaluate, par: par, resilience: resilience, ethics: ethics, spent: spent, find: find };
})(typeof window !== 'undefined' ? window : globalThis);
