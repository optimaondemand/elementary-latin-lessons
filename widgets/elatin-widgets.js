/* ================================================================
   ELEMENTARY LATIN — REUSABLE WIDGET LIBRARY  (elatin-widgets.js)
   Optima Academy Online · Elementary Latin (5007090)

   Self-contained. No external libraries, no framework.

   HOW IT WORKS
   ------------
   On DOMContentLoaded the library SCANS the page for declarative
   elements (.elw-match, .elw-memory, .elw-sort, .elw-guess,
   .elw-caesar), reads their data-* attributes (parsed with
   JSON.parse — attributes use SINGLE quotes on the outside, so the
   JSON inside can keep its DOUBLE quotes), and replaces each with a
   fully working, mouse+touch interactive widget. Each widget has a
   Reset button and is safe to place many-to-a-page.

   COEXISTENCE
   -----------
   Everything is namespaced with the .elw- prefix, so this library
   does NOT conflict with the lessons' existing inline widgets
   (.ow-select / .ow-reflect / .optima-widget).

   Unicode macrons (ā ē ī ō ū) are preserved verbatim throughout.
   ================================================================ */
(function () {
  "use strict";

  /* ==============================================================
     SECTION 1 — SHARED UTILITIES
     ============================================================== */

  // Fisher–Yates shuffle (returns a new array; never mutates input).
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Read a data-* attribute and JSON.parse it, with a safe fallback.
  function readJSON(el, name, fallback) {
    var raw = el.getAttribute(name);
    if (raw == null || raw === "") return fallback;
    try { return JSON.parse(raw); }
    catch (err) {
      console.warn("[elatin-widgets] Could not parse " + name + " on", el, err);
      return fallback;
    }
  }

  // Turn a title into a stable, filesystem-safe slug for localStorage keys.
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "untitled";
  }

  // Small DOM helper.
  function make(tag, className, html) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  // Format milliseconds as m:ss.
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* ==============================================================
     SECTION 2 — SHARED POINTER-DRAG HELPER  (mouse + touch)
     Creates one floating "ghost" clone that follows the pointer and
     reports which drop zone the pointer is over on release.
     ============================================================== */

  var ghost = null;
  function getGhost() {
    if (!ghost) {
      ghost = document.getElementById("elw-drag-ghost");
      if (!ghost) {
        ghost = document.createElement("div");
        ghost.id = "elw-drag-ghost";
        document.body.appendChild(ghost);
      }
    }
    return ghost;
  }

  // dropSelector: CSS selector for valid drop zones.
  // ghostClass:   optional extra class on the ghost (e.g. "elw-ghost-sort").
  // onDrop(zone, ev): called on release with the zone under the pointer (or null).
  function startPointerDrag(e, sourceEl, dropSelector, ghostClass, onDrop) {
    if (e.button && e.button !== 0) return; // primary pointer only
    e.preventDefault();

    var g = getGhost();
    try { sourceEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    sourceEl.classList.add("elw-dragging");

    g.className = ghostClass || "";
    g.textContent = sourceEl.dataset.label || sourceEl.textContent;
    g.style.display = "block";
    position(e);

    var currentZone = null;

    function position(ev) {
      g.style.left = (ev.clientX - g.offsetWidth / 2) + "px";
      g.style.top  = (ev.clientY - g.offsetHeight / 2) + "px";
    }
    function zoneUnder(ev) {
      // Hide ghost so elementFromPoint sees what is beneath it.
      g.style.display = "none";
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      g.style.display = "block";
      return el ? el.closest(dropSelector) : null;
    }
    function move(ev) {
      position(ev);
      var z = zoneUnder(ev);
      if (z !== currentZone) {
        if (currentZone) currentZone.classList.remove("elw-over");
        currentZone = z;
        if (currentZone) currentZone.classList.add("elw-over");
      }
    }
    function up(ev) {
      try { sourceEl.releasePointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      sourceEl.removeEventListener("pointermove", move);
      sourceEl.removeEventListener("pointerup", up);
      sourceEl.removeEventListener("pointercancel", up);
      g.style.display = "none";
      sourceEl.classList.remove("elw-dragging");
      if (currentZone) currentZone.classList.remove("elw-over");
      onDrop(currentZone, ev);
    }
    sourceEl.addEventListener("pointermove", move);
    sourceEl.addEventListener("pointerup", up);
    sourceEl.addEventListener("pointercancel", up);
  }

  /* ==============================================================
     SECTION 3 — WIDGET: DRAG & DROP MATCH  (.elw-match)
     data-title  : string
     data-pairs  : [["salvē","hello"],["valē","goodbye"], ...]
     data-timer  : "true" to show the OPTIONAL, never-graded
                   "beat your best time" toggle (default off).
     ============================================================== */

  function buildMatch(root, index) {
    var title  = root.getAttribute("data-title") || "Match the words";
    var pairs  = readJSON(root, "data-pairs", []).map(function (p) {
      return { la: p[0], en: p[1] };
    });
    var timerEnabled = String(root.getAttribute("data-timer")) === "true";
    var bestKey = "elw_match_best_" + slugify(title) + "_" + index;

    root.classList.add("elw-widget");
    root.innerHTML = "";

    root.appendChild(make("h3", "elw-title", title));
    root.appendChild(make("p", "elw-desc",
      "Drag each Latin word onto its English meaning. Correct matches lock in green; wrong drops bounce back."));

    var toggle = null;
    if (timerEnabled) {
      var tw = make("div", "elw-toggle-wrap");
      tw.innerHTML =
        '<label class="elw-switch"><input type="checkbox"><span class="elw-slider"></span></label>' +
        '<span>⏱ Beat your best time</span>';
      root.appendChild(tw);
      root.appendChild(make("div", "elw-subnote", "Optional & just for fun — the timer is never graded."));
      toggle = tw.querySelector("input");
    }

    var statusEl = make("div", "elw-status");
    root.appendChild(statusEl);

    var grid = make("div", "elw-match-grid");
    var leftCol = make("div"); leftCol.appendChild(make("div", "elw-col-label", "Latin"));
    var wordsEl = make("div"); leftCol.appendChild(wordsEl);
    var rightCol = make("div"); rightCol.appendChild(make("div", "elw-col-label", "Meaning"));
    var targetsEl = make("div"); rightCol.appendChild(targetsEl);
    grid.appendChild(leftCol); grid.appendChild(rightCol);
    root.appendChild(grid);

    var btnRow = make("div", "elw-btn-row");
    var resetBtn = make("button", "elw-btn-reset", "↺ Reset");
    btnRow.appendChild(resetBtn);
    root.appendChild(btnRow);

    var solved = 0, timerOn = false, startTime = 0, tick = null;

    function showBest() {
      if (!toggle) return;
      var b = localStorage.getItem(bestKey);
      if (toggle.checked && b) statusEl.textContent = "Your best: " + fmtTime(+b);
    }
    function startTimer() {
      if (!timerOn) return;
      startTime = Date.now();
      tick = setInterval(function () {
        if (solved < pairs.length) statusEl.textContent = "⏱ " + fmtTime(Date.now() - startTime);
      }, 250);
    }
    function finish() {
      if (tick) { clearInterval(tick); tick = null; }
      if (timerOn) {
        var elapsed = Date.now() - startTime;
        var prev = localStorage.getItem(bestKey);
        var msg = "🎉 All matched! Time: " + fmtTime(elapsed);
        if (!prev || elapsed < +prev) { localStorage.setItem(bestKey, elapsed); msg += " — new best!"; }
        else { msg += " (best: " + fmtTime(+prev) + ")"; }
        statusEl.textContent = msg;
      } else {
        statusEl.textContent = "🎉 All matched! Great work.";
      }
      statusEl.classList.add("elw-win");
    }

    function build() {
      solved = 0;
      wordsEl.innerHTML = ""; targetsEl.innerHTML = "";

      // Latin words (shuffled) — draggable chips
      shuffle(pairs).forEach(function (p) {
        var chip = make("div", "elw-chip");
        chip.textContent = p.la;
        chip.dataset.la = p.la;
        chip.dataset.label = p.la;
        chip.addEventListener("pointerdown", function (e) {
          if (chip.classList.contains("elw-locked")) return;
          startPointerDrag(e, chip, ".elw-drop", "", function (zone) {
            if (!zone || zone.classList.contains("elw-filled")) return;
            if (zone.dataset.la === chip.dataset.la) {
              chip.classList.add("elw-locked");
              zone.classList.add("elw-filled");
              zone.innerHTML = '<span class="elw-answer-word">' + chip.dataset.la + "</span> = " + zone.dataset.en;
              solved++;
              if (solved === pairs.length) finish();
            } else {
              chip.classList.add("elw-nudge");
              setTimeout(function () { chip.classList.remove("elw-nudge"); }, 400);
            }
          });
        });
        wordsEl.appendChild(chip);
      });

      // English meanings (shuffled) — drop targets
      shuffle(pairs).forEach(function (p) {
        var t = make("div", "elw-drop");
        t.textContent = p.en;
        t.dataset.en = p.en;
        t.dataset.la = p.la;
        targetsEl.appendChild(t);
      });
    }

    function reset() {
      if (tick) { clearInterval(tick); tick = null; }
      statusEl.className = "elw-status";
      statusEl.textContent = "";
      build();
      showBest();
      startTimer();
    }

    if (toggle) {
      toggle.addEventListener("change", function () { timerOn = toggle.checked; reset(); });
    }
    resetBtn.addEventListener("click", reset);

    build();
    showBest();
  }

  /* ==============================================================
     SECTION 4 — WIDGET: FLIP CARD MEMORY  (.elw-memory)
     data-title : string
     data-pairs : [["Neptūnus","🔱 sea"],["Iuppiter","⚡ sky"], ...]
                  each pair becomes two cards that match each other.
     ============================================================== */

  function buildMemory(root, index) {
    var title = root.getAttribute("data-title") || "Memory match";
    var pairs = readJSON(root, "data-pairs", []).map(function (p, i) {
      return { id: "p" + i, a: p[0], b: p[1] };
    });

    root.classList.add("elw-widget");
    root.innerHTML = "";
    root.appendChild(make("h3", "elw-title", title));
    root.appendChild(make("p", "elw-desc", "Flip two cards to find a matching pair. Matches stay face-up."));

    var status = make("div", "elw-status");
    status.innerHTML = 'Moves: <span class="elw-moves-badge">0</span> &nbsp;·&nbsp; <span class="elw-msg"></span>';
    root.appendChild(status);
    var movesEl = status.querySelector(".elw-moves-badge");
    var msgEl   = status.querySelector(".elw-msg");

    var grid = make("div", "elw-memory-grid");
    root.appendChild(grid);

    var btnRow = make("div", "elw-btn-row");
    var resetBtn = make("button", "elw-btn-reset", "↺ Reset & Shuffle");
    btnRow.appendChild(resetBtn);
    root.appendChild(btnRow);

    var first = null, lock = false, moves = 0, matched = 0;

    function flip(card) {
      if (lock) return;
      if (card.classList.contains("elw-flipped") || card.classList.contains("elw-matched")) return;
      card.classList.add("elw-flipped");
      if (!first) { first = card; return; }
      moves++; movesEl.textContent = moves;
      if (first.dataset.pid === card.dataset.pid) {
        first.classList.add("elw-matched"); card.classList.add("elw-matched");
        first = null; matched++;
        if (matched === pairs.length) {
          msgEl.innerHTML = '<span style="color:var(--elw-good);font-weight:800;">🎉 All pairs found!</span>';
        }
      } else {
        lock = true;
        var a = first, b = card;
        setTimeout(function () {
          a.classList.remove("elw-flipped"); b.classList.remove("elw-flipped");
          first = null; lock = false;
        }, 850);
      }
    }

    function build() {
      grid.innerHTML = ""; first = null; lock = false; moves = 0; matched = 0;
      movesEl.textContent = "0"; msgEl.textContent = "";
      var deck = [];
      pairs.forEach(function (p) {
        deck.push({ pid: p.id, text: p.a });
        deck.push({ pid: p.id, text: p.b });
      });
      shuffle(deck).forEach(function (c) {
        var card = make("div", "elw-mcard");
        card.dataset.pid = c.pid;
        card.innerHTML =
          '<div class="elw-mcard-inner">' +
            '<div class="elw-mface elw-back">?</div>' +
            '<div class="elw-mface elw-front"></div>' +
          "</div>";
        // Use textContent for the face so macrons/emoji stay literal & safe.
        card.querySelector(".elw-front").textContent = c.text;
        card.addEventListener("click", function () { flip(card); });
        grid.appendChild(card);
      });
    }

    resetBtn.addEventListener("click", build);
    build();
  }

  /* ==============================================================
     SECTION 5 — WIDGET: SORT INTO BINS  (.elw-sort)
     data-title : string
     data-bins  : ["Comes from Latin","Not from Latin", ...]  (any count)
     data-items : [["aquarium",0],["ninja",1], ...]  (each = [label, binIndex])
     ============================================================== */

  function buildSort(root, index) {
    var title = root.getAttribute("data-title") || "Sort the words";
    var bins  = readJSON(root, "data-bins", []);
    var items = readJSON(root, "data-items", []).map(function (it) {
      return { label: it[0], bin: it[1] };
    });

    root.classList.add("elw-widget");
    root.innerHTML = "";
    root.appendChild(make("h3", "elw-title", title));
    root.appendChild(make("p", "elw-desc", "Drag each word into the correct bin. Right answers lock in; wrong drops bounce back."));

    root.appendChild(make("div", "elw-col-label", "Words to sort"));
    var source = make("div", "elw-sort-source");
    root.appendChild(source);

    var binsRow = make("div", "elw-bins-row");
    binsRow.style.gridTemplateColumns = "repeat(" + Math.max(1, bins.length) + ",1fr)";
    var binEls = bins.map(function (label, i) {
      var bin = make("div", "elw-bin");
      bin.dataset.bin = String(i);
      bin.appendChild(make("h4", null, label));
      bin.appendChild(make("div", "elw-bin-items"));
      binsRow.appendChild(bin);
      return bin;
    });
    root.appendChild(binsRow);

    var statusEl = make("div", "elw-status");
    root.appendChild(statusEl);

    var btnRow = make("div", "elw-btn-row");
    var resetBtn = make("button", "elw-btn-reset", "↺ Reset");
    btnRow.appendChild(resetBtn);
    root.appendChild(btnRow);

    var placed = 0;

    function build() {
      source.innerHTML = ""; placed = 0;
      binEls.forEach(function (b) { b.querySelector(".elw-bin-items").innerHTML = ""; });
      statusEl.className = "elw-status"; statusEl.textContent = "";

      shuffle(items).forEach(function (item) {
        var chip = make("div", "elw-sort-chip");
        chip.textContent = item.label;
        chip.dataset.bin = String(item.bin);
        chip.dataset.label = item.label;
        chip.addEventListener("pointerdown", function (e) {
          if (chip.classList.contains("elw-correct")) return;
          startPointerDrag(e, chip, ".elw-bin", "elw-ghost-sort", function (zone) {
            if (!zone) return;
            if (zone.dataset.bin === chip.dataset.bin) {
              chip.classList.add("elw-correct");
              zone.querySelector(".elw-bin-items").appendChild(chip);
              placed++;
              if (placed === items.length) {
                statusEl.classList.add("elw-win");
                statusEl.textContent = "🎉 All sorted correctly!";
              }
            } else {
              chip.classList.add("elw-wrong");
              setTimeout(function () { chip.classList.remove("elw-wrong"); }, 400);
            }
          });
        });
        source.appendChild(chip);
      });
    }

    resetBtn.addEventListener("click", build);
    build();
  }

  /* ==============================================================
     SECTION 6 — WIDGET: GUESS / LIVING LATIN  (.elw-guess)
     data-title  : string
     data-rounds : [{ "icon":"🚀", "prompt":"…", "options":["a","b","c"],
                      "answer":0, "reveal":"✨ …" }, ...]
     Multiple-choice; picking any option reveals the ✨ explanation,
     then Next advances to the following round.
     ============================================================== */

  function buildGuess(root, index) {
    var title  = root.getAttribute("data-title") || "Where did it come from?";
    var rounds = readJSON(root, "data-rounds", []);

    root.classList.add("elw-widget");
    root.innerHTML = "";
    root.appendChild(make("h3", "elw-title", title));
    root.appendChild(make("p", "elw-desc", "Look at each modern thing and guess which ancient Latin word it grew from."));

    var stage = make("div", "elw-guess-stage");
    var emojiEl   = make("div", "elw-guess-emoji");
    var promptEl  = make("div", "elw-guess-prompt");
    var choicesEl = make("div", "elw-choice-row");
    var revealEl  = make("div", "elw-reveal");
    var dotsEl    = make("div", "elw-round-dots");
    stage.appendChild(emojiEl); stage.appendChild(promptEl);
    stage.appendChild(choicesEl); stage.appendChild(revealEl); stage.appendChild(dotsEl);
    root.appendChild(stage);

    var btnRow = make("div", "elw-btn-row");
    var nextBtn  = make("button", "elw-btn-primary", "Next ▶");
    nextBtn.style.display = "none";
    var resetBtn = make("button", "elw-btn-reset", "↺ Start Over");
    btnRow.appendChild(nextBtn); btnRow.appendChild(resetBtn);
    root.appendChild(btnRow);

    var idx = 0, answered = false;

    function renderDots() {
      dotsEl.innerHTML = "";
      rounds.forEach(function (_, i) {
        var s = document.createElement("span");
        if (i === idx) s.className = "elw-active";
        dotsEl.appendChild(s);
      });
    }

    function choose(i, btn) {
      if (answered) return;
      answered = true;
      var r = rounds[idx];
      var buttons = Array.prototype.slice.call(choicesEl.children);
      buttons.forEach(function (b) { b.disabled = true; });
      if (i === r.answer) {
        btn.classList.add("elw-correct");
      } else {
        btn.classList.add("elw-wrong");
        if (buttons[r.answer]) buttons[r.answer].classList.add("elw-correct");
      }
      revealEl.innerHTML = '<span class="elw-tada">✨ Ta-da!</span><br>' + (r.reveal || "");
      revealEl.classList.add("elw-show");
      nextBtn.style.display = (idx < rounds.length - 1) ? "inline-block" : "none";
      if (idx === rounds.length - 1) {
        var done = make("div", "elw-guess-done", "🎉 You explored all the Living Latin words!");
        revealEl.appendChild(done);
      }
    }

    function render() {
      var r = rounds[idx] || { icon: "", prompt: "", options: [] };
      answered = false;
      emojiEl.textContent = r.icon || "";
      promptEl.textContent = r.prompt || "";
      revealEl.className = "elw-reveal";
      revealEl.innerHTML = "";
      nextBtn.style.display = "none";
      choicesEl.innerHTML = "";
      (r.options || []).forEach(function (opt, i) {
        var b = make("button", "elw-choice-btn");
        b.textContent = opt;
        b.addEventListener("click", function () { choose(i, b); });
        choicesEl.appendChild(b);
      });
      renderDots();
    }

    nextBtn.addEventListener("click", function () {
      if (idx < rounds.length - 1) { idx++; render(); }
    });
    resetBtn.addEventListener("click", function () { idx = 0; render(); });

    render();
  }

  /* ==============================================================
     SECTION 7 — WIDGET: TALKING GUIDE / MAGISTER CAESAR (.elw-caesar)
     data-lines : ["Salvē, young scholar!","Today we meet…", ...]
     data-name  : optional guide name (default "Magister Caesar")
     ▶ Play reads the current line with window.speechSynthesis and
     cycles to the next line. Graceful fallback when speech is absent.
     ============================================================== */

  var CAESAR_SVG =
    '<svg class="elw-caesar-svg" width="130" height="150" viewBox="0 0 130 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Friendly Roman guide">' +
      '<path d="M18 150 Q20 108 40 100 L90 100 Q110 108 112 150 Z" fill="#ffffff" stroke="#d7dcec" stroke-width="2"/>' +
      '<path d="M40 100 L65 132 L90 100 Z" fill="#C7922C" opacity=".9"/>' +
      '<rect x="55" y="88" width="20" height="20" rx="6" fill="#e8b48a"/>' +
      '<circle cx="65" cy="62" r="34" fill="#f0c19a"/>' +
      '<circle cx="31" cy="63" r="6" fill="#f0c19a"/>' +
      '<circle cx="99" cy="63" r="6" fill="#f0c19a"/>' +
      '<path d="M33 52 Q40 26 65 26 Q90 26 97 52 Q86 40 65 40 Q44 40 33 52 Z" fill="#5a4632"/>' +
      '<g fill="#2e8b57">' +
        '<ellipse cx="34" cy="46" rx="5" ry="9" transform="rotate(-40 34 46)"/>' +
        '<ellipse cx="30" cy="56" rx="5" ry="9" transform="rotate(-15 30 56)"/>' +
        '<ellipse cx="96" cy="46" rx="5" ry="9" transform="rotate(40 96 46)"/>' +
        '<ellipse cx="100" cy="56" rx="5" ry="9" transform="rotate(15 100 56)"/>' +
        '<ellipse cx="42" cy="38" rx="5" ry="8" transform="rotate(-55 42 38)"/>' +
        '<ellipse cx="88" cy="38" rx="5" ry="8" transform="rotate(55 88 38)"/>' +
      '</g>' +
      '<circle cx="53" cy="60" r="4" fill="#1a2340"/>' +
      '<circle cx="77" cy="60" r="4" fill="#1a2340"/>' +
      '<path d="M47 52 Q53 49 59 52" stroke="#5a4632" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M71 52 Q77 49 83 52" stroke="#5a4632" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M52 74 Q65 84 78 74" stroke="#b5651d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="46" cy="70" r="4" fill="#f2a08a" opacity=".5"/>' +
      '<circle cx="84" cy="70" r="4" fill="#f2a08a" opacity=".5"/>' +
    '</svg>';

  function buildCaesar(root, index) {
    var name  = root.getAttribute("data-name") || "Magister Caesar";
    var lines = readJSON(root, "data-lines", []);
    if (!lines.length) lines = ["Salvē, young scholar!"];

    root.classList.add("elw-widget");
    root.innerHTML = "";

    var wrap = make("div", "elw-caesar-wrap");
    var figure = make("div", "elw-caesar-figure");
    var body = make("div", "elw-caesar-body", CAESAR_SVG);
    figure.appendChild(body);
    figure.appendChild(make("div", "elw-caesar-name", name));
    var speech = make("div", "elw-speech");
    speech.textContent = lines[0];
    wrap.appendChild(figure); wrap.appendChild(speech);
    root.appendChild(wrap);

    var btnRow = make("div", "elw-btn-row");
    var playBtn  = make("button", "elw-btn-primary", "▶ Play");
    var resetBtn = make("button", "elw-btn-reset", "↺ Reset");
    btnRow.appendChild(playBtn); btnRow.appendChild(resetBtn);
    root.appendChild(btnRow);

    root.appendChild(make("div", "elw-subnote",
      "Prototype voice uses the browser's built-in speech. In production, the guide uses recorded voiceover for warmth and correct Latin pronunciation."));

    var idx = 0;
    var supported = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);

    if (!supported) {
      playBtn.disabled = true;
      playBtn.style.opacity = ".6";
      playBtn.style.cursor = "not-allowed";
      playBtn.title = "Speech is not available in this browser — read the text above.";
      playBtn.textContent = "▶ Play (speech unavailable)";
    }

    playBtn.addEventListener("click", function () {
      if (!supported) return;
      var text = lines[idx];
      speech.textContent = text;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95; u.pitch = 1.0;
        speech.classList.add("elw-speaking");
        u.onend = function () { speech.classList.remove("elw-speaking"); };
        u.onerror = function () { speech.classList.remove("elw-speaking"); };
        window.speechSynthesis.speak(u);
      } catch (err) {
        speech.classList.remove("elw-speaking");
      }
      idx = (idx + 1) % lines.length; // cycle for next press
    });

    resetBtn.addEventListener("click", function () {
      if (supported) { try { window.speechSynthesis.cancel(); } catch (e) {} }
      speech.classList.remove("elw-speaking");
      idx = 0;
      speech.textContent = lines[0];
    });
  }

  /* ==============================================================
     SECTION 8 — SCANNER / BOOTSTRAP
     Finds every declarative element and hydrates it once. A
     data-elw-ready flag guards against double-initialization.
     ============================================================== */

  var TYPES = [
    { selector: ".elw-match",  build: buildMatch },
    { selector: ".elw-memory", build: buildMemory },
    { selector: ".elw-sort",   build: buildSort },
    { selector: ".elw-guess",  build: buildGuess },
    { selector: ".elw-caesar", build: buildCaesar }
  ];

  function scan() {
    var counter = 0;
    TYPES.forEach(function (type) {
      var nodes = document.querySelectorAll(type.selector);
      Array.prototype.forEach.call(nodes, function (node) {
        if (node.getAttribute("data-elw-ready") === "1") return; // already built
        node.setAttribute("data-elw-ready", "1");
        try {
          type.build(node, counter++);
        } catch (err) {
          console.error("[elatin-widgets] Failed to build", type.selector, node, err);
        }
      });
    });
  }

  // Expose a manual re-scan hook for dynamically inserted content.
  window.ElatinWidgets = { scan: scan };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
