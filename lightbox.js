/** Expand-and-zoom viewer for case study artifact images. */
(function () {
  "use strict";

  var ITEM_SELECTOR = '[data-slot] img[data-zoomable]';
  var MIN_SCALE = 1;
  var STEP = 1.6;
  var PAN_KEY_STEP = 60;

  var reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ui = null;
  var items = [];
  var index = 0;
  var scale = 1;
  var tx = 0;
  var ty = 0;
  var maxScale = 4;
  var pointers = new Map();
  var pinch = null;
  var pan = null;
  var lastFocus = null;
  var scrollState = null;

  function icon(paths) {
    return (
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths +
      "</svg>"
    );
  }

  function textOf(el) {
    if (!el) return "";
    var raw = el.innerText || el.textContent || "";
    return raw
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  function captionFor(img) {
    var slot = img.closest("[data-slot]");
    if (!slot) return { title: "", text: "" };

    var text = textOf(slot.nextElementSibling);
    if (text.length > 320) text = "";

    var title = "";
    var headings = document.querySelectorAll("h2, h3");
    for (var i = 0; i < headings.length; i++) {
      var precedes =
        headings[i].compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (precedes) title = textOf(headings[i]);
    }

    return { title: title, text: text };
  }

  function labelFor(caption) {
    var parts = [caption.title, caption.text].filter(Boolean);
    return parts.length ? "Expand image: " + parts.join(" — ") : "Expand image";
  }

  function enhance() {
    var slots = document.querySelectorAll("[data-slot]");
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var img = slot.querySelector("img");
      if (!img) {
        slot.classList.remove("has-zoom");
        continue;
      }
      slot.classList.add("has-zoom");
      if (img.hasAttribute("data-zoomable")) continue;
      img.setAttribute("data-zoomable", "");
      img.setAttribute("role", "button");
      img.setAttribute("tabindex", "0");
      img.setAttribute("aria-label", labelFor(captionFor(img)));
    }
  }

  /* ---------- view transform ---------- */

  function metrics() {
    var stage = ui.stage;
    return {
      w: ui.image.offsetWidth,
      h: ui.image.offsetHeight,
      vw: stage.clientWidth,
      vh: stage.clientHeight
    };
  }

  function center() {
    var rect = ui.stage.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function apply(animate) {
    var m = metrics();
    var maxX = Math.max(0, (m.w * scale - m.vw) / 2);
    var maxY = Math.max(0, (m.h * scale - m.vh) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));

    ui.image.style.transition =
      animate && !reduceMotion ? "transform .2s cubic-bezier(.22,1,.36,1)" : "none";
    ui.image.style.transform =
      "translate3d(" + tx + "px," + ty + "px,0) scale(" + scale + ")";

    ui.level.textContent = Math.round(scale * 100) + "%";
    ui.zoomOut.disabled = scale <= MIN_SCALE + 0.001;
    ui.zoomIn.disabled = scale >= maxScale - 0.001;
    ui.reset.disabled = scale <= MIN_SCALE + 0.001 && !tx && !ty;
    ui.root.classList.toggle("is-zoomed", scale > MIN_SCALE + 0.001);
  }

  function zoomTo(next, clientX, clientY, animate) {
    next = Math.min(maxScale, Math.max(MIN_SCALE, next));
    var c = center();
    var dx = (clientX == null ? c.x : clientX) - c.x;
    var dy = (clientY == null ? c.y : clientY) - c.y;
    var ratio = next / scale;
    tx = dx - ratio * (dx - tx);
    ty = dy - ratio * (dy - ty);
    scale = next;
    apply(animate);
  }

  function resetView(animate) {
    scale = MIN_SCALE;
    tx = 0;
    ty = 0;
    apply(animate);
  }

  function measureMaxScale() {
    var natural = ui.image.naturalWidth || 0;
    var fitted = ui.image.offsetWidth || 1;
    maxScale = Math.min(8, Math.max(3, (natural / fitted) * 1.5));
  }

  /* ---------- gallery ---------- */

  function collect() {
    items = [];
    var imgs = document.querySelectorAll(ITEM_SELECTOR);
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].currentSrc || imgs[i].getAttribute("src");
      if (!src) continue;
      items.push({ el: imgs[i], src: src, caption: captionFor(imgs[i]) });
    }
  }

  function show(i, animate) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    var item = items[index];
    var caption = item.caption;

    ui.root.classList.add("is-loading");
    ui.image.src = item.src;
    ui.image.alt = [caption.title, caption.text].filter(Boolean).join(" — ");

    ui.caption.innerHTML = "";
    if (caption.title) {
      var title = document.createElement("span");
      title.className = "lb-caption-title";
      title.textContent = caption.title;
      ui.caption.appendChild(title);
    }
    if (caption.text) {
      var text = document.createElement("span");
      text.className = "lb-caption-text";
      text.textContent = caption.text;
      ui.caption.appendChild(text);
    }
    ui.caption.hidden = !caption.title && !caption.text;

    ui.counter.textContent = items.length > 1 ? index + 1 + " / " + items.length : "";
    ui.prev.hidden = items.length < 2;
    ui.next.hidden = items.length < 2;

    maxScale = 4;
    resetView(animate === true);

    if (ui.image.complete && ui.image.naturalWidth) onImageReady();
  }

  function onImageReady() {
    ui.root.classList.remove("is-loading");
    measureMaxScale();
    apply(false);
  }

  /* ---------- open / close ---------- */

  function lockScroll() {
    var doc = document.documentElement;
    var gap = window.innerWidth - doc.clientWidth;
    scrollState = {
      html: doc.style.overflow,
      body: document.body.style.paddingRight
    };
    doc.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = gap + "px";
  }

  function setBackgroundInert(on) {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === ui.root) continue;
      if (on) kids[i].setAttribute("inert", "");
      else kids[i].removeAttribute("inert");
    }
  }

  function unlockScroll() {
    if (!scrollState) return;
    document.documentElement.style.overflow = scrollState.html;
    document.body.style.paddingRight = scrollState.body;
    scrollState = null;
  }

  function open(img) {
    if (!ui) build();
    collect();
    var start = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].el === img) {
        start = i;
        break;
      }
    }
    if (!items.length) return;

    lastFocus = document.activeElement;
    lockScroll();
    ui.root.hidden = false;
    setBackgroundInert(true);
    show(start, false);
    ui.close.focus();
  }

  function close() {
    if (ui.root.hidden) return;
    setBackgroundInert(false);
    ui.root.hidden = true;
    ui.image.removeAttribute("src");
    pointers.clear();
    pinch = null;
    pan = null;
    unlockScroll();
    var target = items[index] && items[index].el;
    if (target && document.contains(target)) target.focus();
    else if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function toggleZoom(clientX, clientY) {
    if (scale > MIN_SCALE + 0.001) resetView(true);
    else zoomTo(Math.min(maxScale, 2.5), clientX, clientY, true);
  }

  /* ---------- pointer interaction ---------- */

  function pinchState() {
    var pts = Array.from(pointers.values());
    var dx = pts[1].x - pts[0].x;
    var dy = pts[1].y - pts[0].y;
    return {
      dist: Math.hypot(dx, dy) || 1,
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
      scale: scale
    };
  }

  function onPointerDown(e) {
    if (e.button) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinch = pinchState();
      pan = null;
    } else if (pointers.size === 1) {
      ui.stage.setPointerCapture(e.pointerId);
      pan = {
        x: e.clientX,
        y: e.clientY,
        tx: tx,
        ty: ty,
        moved: false,
        onImage: e.target === ui.image
      };
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinch) {
      var now = pinchState();
      zoomTo(pinch.scale * (now.dist / pinch.dist), now.x, now.y, false);
      return;
    }
    if (!pan) return;

    var dx = e.clientX - pan.x;
    var dy = e.clientY - pan.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) pan.moved = true;
    if (scale > MIN_SCALE + 0.001) {
      tx = pan.tx + dx;
      ty = pan.ty + dy;
      apply(false);
    }
  }

  function onPointerUp(e) {
    var ended = pan;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size) return;

    pan = null;
    if (ended && !ended.moved) {
      if (ended.onImage) toggleZoom(e.clientX, e.clientY);
      else close();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    var delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoomTo(scale * Math.exp(-delta * 0.0018), e.clientX, e.clientY, false);
  }

  /* ---------- keyboard ---------- */

  function focusable() {
    return Array.prototype.filter.call(
      ui.root.querySelectorAll("button"),
      function (el) {
        return !el.disabled && !el.hidden && el.offsetParent !== null;
      }
    );
  }

  function trapTab(e) {
    var list = focusable();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    var outside = !ui.root.contains(active);
    if (e.shiftKey && (active === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKeyDown(e) {
    if (!ui || ui.root.hidden) return;
    var zoomed = scale > MIN_SCALE + 0.001;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        trapTab(e);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (zoomed) {
          tx += PAN_KEY_STEP;
          apply(true);
        } else show(index - 1, true);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (zoomed) {
          tx -= PAN_KEY_STEP;
          apply(true);
        } else show(index + 1, true);
        break;
      case "ArrowUp":
        if (!zoomed) return;
        e.preventDefault();
        ty += PAN_KEY_STEP;
        apply(true);
        break;
      case "ArrowDown":
        if (!zoomed) return;
        e.preventDefault();
        ty -= PAN_KEY_STEP;
        apply(true);
        break;
      case "+":
      case "=":
        e.preventDefault();
        zoomTo(scale * STEP, null, null, true);
        break;
      case "-":
      case "_":
        e.preventDefault();
        zoomTo(scale / STEP, null, null, true);
        break;
      case "0":
        e.preventDefault();
        resetView(true);
        break;
    }
  }

  /* ---------- wiring ---------- */

  function build() {
    var root = document.createElement("div");
    root.className = "lb";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Image viewer");
    root.hidden = true;
    root.innerHTML =
      '<div class="lb-toolbar">' +
      '<span class="lb-counter" data-lb="counter"></span>' +
      '<div class="lb-zoom">' +
      '<button type="button" class="lb-btn" data-lb="out" aria-label="Zoom out">' +
      icon('<path d="M5 12h14"/>') +
      "</button>" +
      '<span class="lb-level" data-lb="level">100%</span>' +
      '<button type="button" class="lb-btn" data-lb="in" aria-label="Zoom in">' +
      icon('<path d="M5 12h14"/><path d="M12 5v14"/>') +
      "</button>" +
      '<button type="button" class="lb-btn" data-lb="reset" aria-label="Reset zoom">' +
      icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>') +
      "</button>" +
      "</div>" +
      '<div class="lb-toolbar-end">' +
      '<button type="button" class="lb-btn lb-close" data-lb="close" aria-label="Close image viewer">' +
      icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>') +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div class="lb-stage" data-lb="stage">' +
      '<img class="lb-image" data-lb="image" alt="" draggable="false">' +
      "</div>" +
      '<button type="button" class="lb-btn lb-nav lb-prev" data-lb="prev" aria-label="Previous image">' +
      icon('<path d="m15 18-6-6 6-6"/>') +
      "</button>" +
      '<button type="button" class="lb-btn lb-nav lb-next" data-lb="next" aria-label="Next image">' +
      icon('<path d="m9 18 6-6-6-6"/>') +
      "</button>" +
      '<p class="lb-caption" data-lb="caption"></p>';

    document.body.appendChild(root);

    var pick = function (name) {
      return root.querySelector('[data-lb="' + name + '"]');
    };

    ui = {
      root: root,
      stage: pick("stage"),
      image: pick("image"),
      caption: pick("caption"),
      counter: pick("counter"),
      level: pick("level"),
      zoomIn: pick("in"),
      zoomOut: pick("out"),
      reset: pick("reset"),
      close: pick("close"),
      prev: pick("prev"),
      next: pick("next")
    };

    ui.close.addEventListener("click", close);
    ui.zoomIn.addEventListener("click", function () {
      zoomTo(scale * STEP, null, null, true);
    });
    ui.zoomOut.addEventListener("click", function () {
      zoomTo(scale / STEP, null, null, true);
    });
    ui.reset.addEventListener("click", function () {
      resetView(true);
    });
    ui.prev.addEventListener("click", function () {
      show(index - 1, true);
    });
    ui.next.addEventListener("click", function () {
      show(index + 1, true);
    });

    ui.image.addEventListener("load", onImageReady);
    ui.image.addEventListener("error", function () {
      ui.root.classList.remove("is-loading");
    });
    ui.image.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });

    ui.stage.addEventListener("pointerdown", onPointerDown);
    ui.stage.addEventListener("pointermove", onPointerMove);
    ui.stage.addEventListener("pointerup", onPointerUp);
    ui.stage.addEventListener("pointercancel", onPointerUp);
    ui.stage.addEventListener("wheel", onWheel, { passive: false });
    ui.stage.addEventListener("dblclick", function (e) {
      e.preventDefault();
    });

    window.addEventListener("resize", function () {
      if (!ui.root.hidden) apply(false);
    });
    document.addEventListener("keydown", onKeyDown);
  }

  function onDocumentClick(e) {
    var img = e.target.closest && e.target.closest(ITEM_SELECTOR);
    if (!img) return;
    e.preventDefault();
    open(img);
  }

  function onDocumentKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var img = e.target.closest && e.target.closest(ITEM_SELECTOR);
    if (!img) return;
    e.preventDefault();
    open(img);
  }

  function start() {
    enhance();

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKey);

    var queued = false;
    var observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        enhance();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
