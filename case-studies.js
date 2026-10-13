/**
 * Single source of truth for case study metadata.
 *
 * `data/projects.json` holds every case study. The homepage grid, the pager and
 * artifact slots on project.html, and the chat assistant all read from here, so
 * adding a case study means editing that one file.
 *
 * Per project the fields consumed by the site chrome are:
 *   order       — position in the grid and in the prev/next pager
 *   shortTitle  — label used on cards, breadcrumbs, and the pager
 *   card        — { eyebrow, summary, cover? } for the homepage grid
 *   artifacts[] — entries with a `slot` are injected into that data-slot element
 *
 * The homepage experience timeline is rendered from `data/experience.json`
 * (see toTimeline); an entry links to case studies by listing their ids in
 * `caseStudies`.
 */

let pending = null;
let pendingExperience = null;

export function projectHref(id) {
  return "project.html?id=" + encodeURIComponent(id);
}

/** Homepage grid cards, in registry order. */
export function toCards(projects) {
  return (projects || []).map((p) => {
    const card = p.card || {};
    const cover = card.cover || p.heroImage || {};
    return {
      id: p.id,
      href: projectHref(p.id),
      title: p.shortTitle || p.title || "",
      eyebrow: card.eyebrow || p.type || "",
      meta: p.year ? String(p.year) : "",
      summary: card.summary || p.problem || "",
      coverSrc: cover.src || "",
      coverAlt: cover.alt || ""
    };
  });
}

/**
 * Experience timeline rows, in `data/experience.json` order. Cards alternate
 * sides starting on the right. Each entry's `caseStudies` ids become link
 * cards built from the homepage card data; unknown ids are skipped.
 */
export function toTimeline(entries, projects) {
  const cards = new Map(toCards(projects).map((c) => [c.id, c]));
  return (entries || []).map((e, i) => ({
    id: e.id || String(i),
    company: e.company || "",
    roleTitle: e.roleTitle || "",
    dates: e.dates || "",
    location: e.location || "",
    summary: e.summary || "",
    logoSrc: e.logoSrc || "",
    logoWidth: e.logoWidth || 36,
    // DOM order is meta, marker, card; odd rows reverse it to put the card left.
    direction: i % 2 ? "row-reverse" : "row",
    metaAlign: i % 2 ? "flex-start" : "flex-end",
    metaTextAlign: i % 2 ? "left" : "right",
    links: (e.caseStudies || []).map((id) => cards.get(id)).filter(Boolean)
  }));
}

/** Prev/next pager entries, in registry order. */
export function toPagerOrder(projects) {
  return (projects || []).map((p) => ({ id: p.id, label: p.shortTitle || p.title || "" }));
}

/** Maps a `data-slot` name on project.html to the artifact source it renders. */
export function toArtifactSlots(projects) {
  const slots = {};
  for (const p of projects || []) {
    for (const a of p.artifacts || []) {
      if (a && a.slot && a.src) slots[a.slot] = a.src;
    }
  }
  return slots;
}

/** Resolves once per page load; every consumer shares the same request. */
export function loadCaseStudies() {
  if (!pending) {
    pending = fetch("./data/projects.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load projects.json (${res.status})`);
        return res.json();
      })
      .then((json) => ({
        projects: (Array.isArray(json.projects) ? json.projects : [])
          .slice()
          .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
      }))
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Resolves once per page load to `data/experience.json`. */
export function loadExperience() {
  if (!pendingExperience) {
    pendingExperience = fetch("./data/experience.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load experience.json (${res.status})`);
        return res.json();
      })
      .catch((err) => {
        pendingExperience = null;
        throw err;
      });
  }
  return pendingExperience;
}
