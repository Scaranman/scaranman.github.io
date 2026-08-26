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
 *   card        — { eyebrow, summary, cover?, keywords? } for the homepage grid
 *   artifacts[] — entries with a `slot` are injected into that data-slot element
 */

let pending = null;

export function normalizeForSearch(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchBlob(project) {
  const card = project.card || {};
  return normalizeForSearch(
    [
      project.shortTitle,
      project.title,
      project.type,
      project.year,
      card.eyebrow,
      card.summary,
      ...(project.tags || []),
      ...(project.skills || []),
      ...(card.keywords || [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

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
      meta: [p.type, p.year].filter(Boolean).join(" · "),
      summary: card.summary || p.problem || "",
      coverSrc: cover.src || "",
      coverAlt: cover.alt || "",
      tags: (p.tags || []).join(" "),
      search: searchBlob(p)
    };
  });
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
          .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)),
        filters: Array.isArray(json.filters) ? json.filters : []
      }))
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
