# scaranman.github.io

Portfolio site. Static HTML rendered client-side by `support.js`.

```
npm install
npm run dev
```

## Adding a case study

`data/projects.json` is the single registry, and it is the only file you edit.
An entry there gives you the homepage card, its position in the grid, the
prev/next pager on `project.html`, the breadcrumb and chat context labels, the
chat assistant's knowledge of the project, and the case study page itself.
`case-studies.js` derives the site chrome from the registry and
`case-study-sections.js` renders the page body, so no HTML needs editing.

1. Add an object to `projects` in `data/projects.json`:

   ```jsonc
   {
     "id": "my-case-study",          // also the ?id= in the URL
     "title": "My Case Study",
     "shortTitle": "My Case Study",  // optional; cards/pager/breadcrumb when shorter than title
     "order": 4,                     // grid and pager position
     "type": "Case study",
     "year": 2026,
     "heroImage": { "src": "./assets/projects/Mine.png", "alt": "…" },
     "card": {
       "eyebrow": "Enterprise UX · Redesign",
       "summary": "One paragraph shown on the homepage card.",
       "keywords": ["extra search terms not already in the fields below"]
     },
     "role": ["…"], "team": "…", "problem": "…",
     "constraints": [], "process": [], "impact": [],
     "skills": [], "tags": ["enterprise"],
     "sections": [ /* the page body — see below */ ],
     "artifacts": [
       { "label": "Before: Home", "slot": "mine-home", "kind": "image", "src": "./assets/projects/Mine/home.png", "alt": "…" }
     ]
   }
   ```

   Card search text is built from the title, summary, type, year, tags, and
   skills, so `keywords` only needs terms none of those already cover.
   Homepage cards use `heroImage` unless you add an optional `card.cover`.
   The assistant reads every string in `sections`, plus the short
   `role` / `team` / `problem` / `constraints` / `process` / `impact` fields
   for structured answers.

2. Drop the images in `assets/projects/<Name>/` and list them under `artifacts`.
   Any artifact with a `slot` can be placed in the body by naming that slot.

## The `sections` schema

A case study body is an ordered list of sections. Padding, the alternating
white/grey background, and the divider rules are derived from each section's
position, so you only write content. Rendering lives in
`case-study-sections.js`.

| Section | Fields |
| --- | --- |
| `hero` | `title`, `summary`, `alt`, `meta: [{ label, value }]` — the image comes from `heroImage` |
| `overview` | `heading`, `blocks: [{ heading, body }]`, `aside: [callout \| stats \| list]` |
| `content` | `heading?`, `intro?`, `blocks: [...]` |
| `outcome` | `heading`, `statement`, `takeaways: [{ title, body }]` |

Aside blocks are `{ "type": "callout", eyebrow, value, body }` (the purple
panel), `{ "type": "stats", items: [{ label, value }] }`, or
`{ "type": "list", eyebrow, items: [string] }`.

Content blocks:

- `figure` — one full-width image with a grey caption: `slot`, `height`, `caption`
- `figure-grid` — `columns`, `height`, `items`. An item with `title` + `body`
  renders a labelled step; an item with `caption` renders as a plain figure.
- `split` — text beside a tall image: `badge`, `heading`, `body`, `slot`, `height`
- `before-after` — `title`, `note`, `height`, `before`, `after` (two slot names)
- `cards` — `columns`, `items`. Each item has an `eyebrow` plus either
  `title` + `body` or a bulleted `items` array.
- `media-row` — side-by-side videos: `items: [{ slot, title, body, aria }]`
- `link-card` — outbound link: `href`, `title`, `body`, `cta`
- `group` — `gap` plus nested `blocks`, when a set of blocks needs its own spacing

Every `slot` must match a `slot` on one of the project's `artifacts`; that
artifact is injected into the placeholder and becomes zoomable in the lightbox.

The tags offered as homepage filter chips are listed in `filters` at the top of
`data/projects.json`. The `projectId` enum in the `data-props` attribute of
`project.html`'s logic script only feeds the visual editor's dropdown.
