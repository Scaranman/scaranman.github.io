/** Mobile nav toggle for Design Component pages. */
(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function scrollToHashTarget(behavior) {
    const raw = window.location.hash;
    if (!raw || raw === "#top") return false;
    const el = document.querySelector(raw);
    if (!el) return false;
    const header = document.querySelector("header");
    const offset = (header && header.offsetHeight) || 72;
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: behavior || "smooth" });
    return true;
  }

  function initHashScroll() {
    if (!window.location.hash || window.location.hash === "#top") return;
    let tries = 0;
    const tick = () => {
      if (scrollToHashTarget(tries++ ? "smooth" : "auto") || tries > 60) return;
      setTimeout(tick, 100);
    };
    tick();
  }

  function tagTimeline() {
    const timeline =
      document.querySelector(".timeline") ||
      document.querySelector('#experience [style*="width:1000"], #experience [style*="width: 1000"]');
    if (!timeline) return false;
    timeline.classList.add("timeline");

    const rows = Array.from(timeline.children).filter((el) => el.tagName === "DIV" && !el.hasAttribute("aria-hidden"));
    rows.forEach((row) => {
      row.classList.add("timeline-row");
      Array.from(row.children).forEach((col) => {
        if (col.classList.contains("timeline-marker") || col.classList.contains("timeline-card") || col.classList.contains("timeline-meta")) {
          return;
        }
        const style = col.getAttribute("style") || "";
        const isMarker =
          /flex:\s*0\s*0\s*20px/.test(style) ||
          (col.children.length === 1 &&
            col.querySelector('[style*="border-radius:9999px"], [style*="border-radius: 9999px"]'));
        const isCard =
          /padding:\s*24px/.test(style) &&
          (/background:\s*#fff\b/.test(style) ||
            /background:\s*rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/.test(style) ||
            /border:\s*1px\s+solid/.test(style));
        if (isMarker) col.classList.add("timeline-marker");
        else if (isCard) col.classList.add("timeline-card");
        else col.classList.add("timeline-meta");
      });
    });
    return rows.length > 0 && rows.every((row) => row.querySelector(".timeline-meta") && row.querySelector(".timeline-card"));
  }

  function enhance() {
    // Tag timeline first so a nav failure cannot block mobile stacking.
    try {
      tagTimeline();
    } catch (err) {
      console.warn("timeline tagging failed", err);
    }

    const headerInner = document.querySelector("header > div");
    const nav = document.querySelector("header nav");

    if (headerInner && nav && !headerInner.querySelector(".nav-toggle")) {
      try {
        nav.classList.add("site-nav");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", "site-nav");
        btn.setAttribute("aria-label", "Open menu");
        btn.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';

        nav.id = "site-nav";
        headerInner.insertBefore(btn, nav);

        const sync = (open) => {
          document.body.classList.toggle("nav-open", open);
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
          btn.innerHTML = open
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
        };

        btn.addEventListener("click", () => {
          sync(!document.body.classList.contains("nav-open"));
        });

        nav.addEventListener("click", (e) => {
          if (e.target.closest("a")) sync(false);
        });
      } catch (err) {
        console.warn("nav enhance failed", err);
      }
    }

    // Tag structural hooks the stylesheet relies on
    const root = document.querySelector('[style*="min-width"]');
    if (root) {
      root.style.minWidth = "0";
      root.style.width = "100%";
    }

    const filterInput = document.getElementById("projectFilter");
    if (filterInput) {
      const search = filterInput.closest("div");
      const row = search && search.parentElement;
      if (search) search.classList.add("project-search");
      if (row) {
        row.classList.add("project-filters");
        const chips = row.querySelector("div:last-child");
        if (chips && chips !== search) chips.classList.add("project-chips");
      }
    }

    const crumb = document.querySelector("header + div");
    if (crumb && crumb.textContent.includes("Projects")) crumb.classList.add("crumb-bar");

    document.querySelectorAll("nav").forEach((n) => {
      if (n.querySelector('a[href*="Previous"], a[href*="prev"]') || /Previous:|Next:/.test(n.textContent)) {
        n.classList.add("pager");
      }
    });
    document.querySelectorAll("body nav").forEach((n) => {
      if (n.classList.contains("site-nav")) return;
      if (/All case studies/.test(n.textContent || "")) n.classList.add("pager");
    });
  }

  ready(() => {
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href === "#" || href === "#top") return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      history.pushState(null, "", href);
      scrollToHashTarget("smooth");
    });

    // DC runtime boots async (React UMD). Retry until header + timeline are ready.
    let tries = 0;
    const tick = () => {
      enhance();
      initHashScroll();
      const navReady = !!document.querySelector(".nav-toggle");
      const timelineReady = !document.querySelector("#experience") || !!document.querySelector(".timeline-row");
      if ((!navReady || !timelineReady) && tries++ < 80) {
        setTimeout(tick, 100);
      }
    };
    tick();

    // Re-tag if the Design Component remounts experience rows.
    const observe = () => {
      const host = document.querySelector("#dc-root") || document.body;
      if (!host || host.dataset.timelineObserved) return;
      host.dataset.timelineObserved = "1";
      let queued = false;
      const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          tagTimeline();
        });
      });
      observer.observe(host, { childList: true, subtree: true });
    };
    observe();
    setTimeout(observe, 500);
  });
})();
