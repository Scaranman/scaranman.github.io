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

  function enhance() {    const headerInner = document.querySelector("header > div");
    const nav = document.querySelector("header nav");
    if (!headerInner || !nav || headerInner.querySelector(".nav-toggle")) return;

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

    // Tag structural hooks the stylesheet relies on
    const root = document.querySelector('[style*="min-width"]');
    if (root) {
      root.style.minWidth = "0";
      root.style.width = "100%";
    }

    const timeline = document.querySelector('#experience [style*="width:1000"], #experience [style*="width: 1000"]');
    if (timeline) timeline.classList.add("timeline");

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

    const crumb = document.querySelector('header + div');
    if (crumb && crumb.textContent.includes("Projects")) crumb.classList.add("crumb-bar");

    document.querySelectorAll('nav').forEach((n) => {
      if (n.querySelector('a[href*="Previous"], a[href*="prev"]') || /Previous:|Next:/.test(n.textContent)) {
        n.classList.add("pager");
      }
    });
    // Case study pager: "Previous:" / "Next:" / "All case studies"
    document.querySelectorAll("body nav").forEach((n) => {
      if (n !== nav && /All case studies/.test(n.textContent || "")) n.classList.add("pager");
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

    // DC runtime boots async (React UMD). Retry until header exists.
    let tries = 0;
    const tick = () => {
      enhance();
      initHashScroll();
      if (!document.querySelector(".nav-toggle") && tries++ < 40) {
        setTimeout(tick, 100);
      }
    };
    tick();
  });
})();
