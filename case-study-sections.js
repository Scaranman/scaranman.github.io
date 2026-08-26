/**
 * Renders a case study body from the `sections` array in data/projects.json.
 *
 * A case study is an ordered list of sections. Section chrome (padding, the
 * alternating white/grey background, the divider rule) is derived from the
 * section's position, so authoring only involves content.
 *
 * Section types:
 *   hero      { alt?, title, summary, meta: [{ label, value }] }
 *   overview  { heading, blocks: [{ heading, body }], aside: [asideBlock] }
 *   content   { heading?, intro?, blocks: [block] }
 *   outcome   { heading, statement, takeaways: [{ title, body }] }
 *
 * Aside blocks: callout { eyebrow, value, body }
 *               stats   { items: [{ label, value }] }
 *               list    { eyebrow, items: [string] }
 *
 * Content blocks: group        { gap, blocks: [block] }
 *                 cards        { columns, items: [{ eyebrow, title?, body?, items? }] }
 *                 figure       { slot, height, caption }
 *                 figure-grid  { columns, height, items: [{ slot, title, body } | { slot, caption }] }
 *                 split        { badge, heading, body, slot, height }
 *                 before-after { title, note, height, before, after }
 *                 media-row    { items: [{ slot, title, body, aria? }] }
 *                 link-card    { href, title, body, cta }
 *
 * Image containers are emitted as empty `data-slot` elements; project.html's
 * fillSlots() injects the artifact named by that slot in the registry.
 */

const S = {
  wrap: "max-width:1280px; margin:0 auto;",
  headingBlock: "display:flex; flex-direction:column; gap:12px; align-items:flex-start",
  heroHeading: "display:flex; flex-direction:column; gap:16px; align-items:flex-start",
  h1: "margin:0; font-size:60px; line-height:72px; font-weight:600; letter-spacing:-0.02em; color:#171717",
  h2: "margin:0; font-size:36px; line-height:44px; font-weight:600; letter-spacing:-0.02em; color:#171717",
  h3: "margin:0; font-size:24px; line-height:32px; font-weight:600; color:#171717",
  h3small: "margin:0; font-size:20px; line-height:28px; font-weight:600; color:#171717",
  heroSummary: "margin:0; max-width:900px; font-size:20px; line-height:30px; color:#404040; text-wrap:pretty",
  intro: "margin:0; max-width:900px; font-size:18px; line-height:28px; color:#404040; text-wrap:pretty",
  body: "margin:0; font-size:16px; line-height:26px; color:#404040; text-wrap:pretty",
  metaRow: "display:flex; justify-content:space-between; gap:40px; padding:24px 0; border-top:1px solid #e5e5e5; border-bottom:1px solid #e5e5e5",
  metaItem: "display:flex; flex-direction:column; gap:8px",
  metaLabel: "font-size:12px; font-weight:600; letter-spacing:.10em; color:#737373",
  metaValue: "font-size:16px; font-weight:500; color:#171717",
  heroImage: "width:100%; height:auto; object-fit:contain; border:1px solid #e5e5e5; border-radius:24px; background:#fafafa; display:block",
  callout: "display:flex; flex-direction:column; gap:12px; padding:32px; background:#69349c; border-radius:20px",
  calloutEyebrow: "font-size:12px; font-weight:600; letter-spacing:.10em; color:#e3d3f2",
  calloutValue: "font-size:48px; line-height:56px; font-weight:700; color:#fff",
  calloutBody: "margin:0; font-size:15px; line-height:24px; color:#e3d3f2",
  statRow: "display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:20px; background:#fff; border:1px solid #e5e5e5; border-radius:16px",
  statLabel: "font-size:15px; color:#404040",
  statValue: "font-size:16px; font-weight:600; color:#522979; white-space:nowrap",
  listCard: "display:flex; flex-direction:column; gap:16px; padding:32px; background:#fff; border:1px solid #e5e5e5; border-radius:20px",
  listEyebrow: "font-size:12px; font-weight:600; letter-spacing:.10em; color:#522979",
  listItem: "display:flex; gap:12px; align-items:flex-start",
  listDot: "flex:0 0 auto; margin-top:6px; width:8px; height:8px; border-radius:9999px; background:#69349c",
  listText: "font-size:16px; line-height:24px; color:#404040",
  cardEyebrow: "font-size:12px; font-weight:600; letter-spacing:.10em; color:#522979",
  cardTitle: "font-size:18px; line-height:26px; font-weight:600; color:#171717",
  cardBody: "margin:0; font-size:15px; line-height:24px; color:#404040",
  cardBullets: "margin:0; padding-left:18px; display:flex; flex-direction:column; gap:8px; font-size:15px; line-height:24px; color:#404040",
  figureCaption: "margin:0; font-size:13px; line-height:18px; color:#737373",
  captionTitle: "font-size:15px; font-weight:600; color:#171717",
  captionBody: "font-size:14px; line-height:20px; color:#404040",
  badge: "align-self:flex-start; padding:2px 8px; border:1px solid #e5e5e5; border-radius:9999px; background:#fafafa; font-size:12px; font-weight:500; color:#404040",
  beforeLabel: "font-size:13px; font-weight:600; color:#737373",
  afterLabel: "font-size:13px; font-weight:600; color:#522979",
  linkIcon: "display:flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:#171717; color:#fff",
  linkTitle: "font-size:20px; line-height:28px; font-weight:600; color:#171717",
  linkBody: "font-size:15px; line-height:24px; color:#404040",
  linkCta: "font-size:14px; font-weight:600; color:#69349c",
  outcomeText: "margin:0; font-size:20px; line-height:32px; font-weight:500; color:#171717; text-wrap:pretty",
  takeawayEyebrow: "font-size:12px; font-weight:600; letter-spacing:.10em; color:#171717",
  takeawayTitle: "font-size:16px; font-weight:600; color:#171717",
  takeawayBody: "margin:0; font-size:15px; line-height:24px; color:#404040"
};

const col = (gap) => `display:flex; flex-direction:column; gap:${gap}px`;
const grid = (columns, gap = 24) =>
  `display:grid; grid-template-columns:${columns === 2 ? "1fr 1fr" : `repeat(${columns}, 1fr)`}; gap:${gap}px`;

function el(tag, opts, ...children) {
  const node = document.createElement(tag);
  const { style, className, attrs, text } = opts || {};
  if (className) node.setAttribute("class", className);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (style) node.setAttribute("style", style);
  if (text != null) node.textContent = text;
  for (const child of children.flat(Infinity)) if (child) node.appendChild(child);
  return node;
}

function svg(width, height, ...paths) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("fill", "none");
  root.setAttribute("stroke", "currentColor");
  root.setAttribute("stroke-width", "2");
  root.setAttribute("stroke-linecap", "round");
  root.setAttribute("stroke-linejoin", "round");
  root.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    root.appendChild(path);
  }
  return root;
}

function slotBox(slot, style, extra) {
  return el("div", { style, attrs: { "data-slot": slot, ...(extra || {}) } });
}

function headingBlock(heading, intro) {
  if (!heading && !intro) return null;
  return el(
    "div",
    { style: S.headingBlock },
    heading ? el("h2", { style: S.h2, text: heading }) : null,
    intro ? el("p", { style: S.intro, text: intro }) : null
  );
}

// ---------------------------------------------------------------- aside blocks

function renderAside(block) {
  if (block.type === "callout") {
    return el(
      "div",
      { style: S.callout },
      el("span", { style: S.calloutEyebrow, text: block.eyebrow }),
      el("span", { style: S.calloutValue, text: block.value }),
      el("p", { style: S.calloutBody, text: block.body })
    );
  }
  if (block.type === "stats") {
    return el(
      "div",
      { style: col(16) },
      block.items.map((s) =>
        el(
          "div",
          { style: S.statRow },
          el("span", { style: S.statLabel, text: s.label }),
          el("span", { style: S.statValue, text: s.value })
        )
      )
    );
  }
  if (block.type === "list") {
    return el(
      "div",
      { style: S.listCard },
      el("span", { style: S.listEyebrow, text: block.eyebrow }),
      el(
        "div",
        { style: col(16) },
        block.items.map((item) =>
          el(
            "div",
            { style: S.listItem },
            el("span", { style: S.listDot }),
            el("span", { style: S.listText, text: item })
          )
        )
      )
    );
  }
  return null;
}

// -------------------------------------------------------------- content blocks

function renderBlock(block) {
  switch (block.type) {
    case "group":
      return el("div", { style: col(block.gap) }, block.blocks.map(renderBlock));

    case "cards": {
      // Bullet-list cards breathe a little more than title/body cards.
      const cardStyle = (item) =>
        `${col(item.items ? 16 : 12)}; padding:24px; background:#fafafa; border:1px solid #e5e5e5; border-radius:16px`;
      return el(
        "div",
        { style: grid(block.columns) },
        block.items.map((item) =>
          el(
            "div",
            { style: cardStyle(item) },
            el("span", { style: S.cardEyebrow, text: item.eyebrow }),
            item.title ? el("span", { style: S.cardTitle, text: item.title }) : null,
            item.body ? el("p", { style: S.cardBody, text: item.body }) : null,
            item.items
              ? el("ul", { style: S.cardBullets }, item.items.map((li) => el("li", { text: li })))
              : null
          )
        )
      );
    }

    case "figure":
      return el(
        "div",
        { style: col(16) },
        slotBox(block.slot, `width:100%; height:${block.height}px; border:1px solid #e5e5e5; border-radius:16px; background:#f5f5f5`),
        el("p", { style: S.figureCaption, text: block.caption })
      );

    case "figure-grid":
      return el(
        "div",
        { style: grid(block.columns) },
        block.items.map((item) => {
          // A plain caption reads as a standalone figure; a title/body pair is a
          // labelled step, which uses the tighter corner radius.
          const radius = item.caption ? 16 : 12;
          return el(
            "div",
            { style: col(16) },
            slotBox(item.slot, `width:100%; height:${block.height}px; border:1px solid #e5e5e5; border-radius:${radius}px; background:#f5f5f5`),
            item.caption
              ? el("p", { style: S.figureCaption, text: item.caption })
              : el(
                  "div",
                  { style: col(4) },
                  el("span", { style: S.captionTitle, text: item.title }),
                  el("span", { style: S.captionBody, text: item.body })
                )
          );
        })
      );

    case "split":
      return el(
        "div",
        { style: "display:flex; align-items:center; gap:80px" },
        el(
          "div",
          { style: `flex:1; ${col(24)}` },
          el("span", { style: S.badge, text: block.badge }),
          el("h3", { style: S.h3, text: block.heading }),
          el("p", { style: S.body, text: block.body })
        ),
        slotBox(block.slot, `flex:0 0 580px; height:${block.height}px; border:1px solid #e5e5e5; border-radius:16px; background:#f5f5f5`)
      );

    case "before-after": {
      const pane = (slot, border, label, labelStyle) =>
        el(
          "div",
          { style: col(12) },
          slotBox(slot, `width:100%; height:${block.height}px; border:1px solid ${border}; border-radius:12px; background:#f5f5f5`),
          el("span", { style: labelStyle, text: label })
        );
      return el(
        "div",
        { style: col(20) },
        el(
          "div",
          { style: "display:flex; align-items:baseline; gap:12px" },
          el("h3", { style: S.h3, text: block.title }),
          el("span", { style: "font-size:15px; color:#737373", text: block.note })
        ),
        el(
          "div",
          { style: grid(2) },
          pane(block.before, "#e5e5e5", "BEFORE", S.beforeLabel),
          pane(block.after, "#c5a8e2", "AFTER", S.afterLabel)
        )
      );
    }

    case "media-row":
      return el(
        "div",
        { className: "media-row" },
        block.items.map((item) =>
          el(
            "div",
            { className: "media-item" },
            slotBox(item.slot, null, { class: "media-slot", "data-slot-label": item.aria || null }),
            el(
              "div",
              { className: "media-caption" },
              el("span", { style: S.captionTitle, text: item.title }),
              el("span", { style: S.captionBody, text: item.body })
            )
          )
        )
      );

    case "link-card":
      return el(
        "a",
        {
          className: "link-card",
          style: `${col(16)}; width:100%; padding:32px; background:#fafafa; border:1px solid #e5e5e5; border-radius:16px; color:inherit`,
          attrs: { href: block.href, target: "_blank", rel: "noopener noreferrer" }
        },
        el("span", { style: S.linkIcon }, svg(22, 22, "m9 18-6-6 6-6", "m15 6 6 6-6 6")),
        el(
          "span",
          { style: col(6) },
          el("span", { style: S.linkTitle, text: block.title }),
          el("span", { style: S.linkBody, text: block.body })
        ),
        el("span", { style: S.linkCta, text: block.cta })
      );

    default:
      return null;
  }
}

// -------------------------------------------------------------------- sections

function renderSection(section, index, project) {
  const onWhite = index % 2 === 0;
  const chrome =
    (index === 0 ? "padding:80px" : "padding:96px 80px") +
    (onWhite ? "; background:#fff" : "") +
    (index === 0 ? "" : "; border-top:1px solid #e5e5e5");

  let inner;

  if (section.type === "hero") {
    const cover = (project.heroImage || {}).src || "";
    inner = el(
      "div",
      { style: `${S.wrap} ${col(48)}` },
      el(
        "div",
        { style: col(24) },
        el(
          "div",
          { style: S.heroHeading },
          el("h1", { style: S.h1, text: section.title }),
          el("p", { style: S.heroSummary, text: section.summary })
        ),
        el(
          "div",
          { style: S.metaRow },
          section.meta.map((m) =>
            el(
              "div",
              { style: S.metaItem },
              el("span", { style: S.metaLabel, text: m.label }),
              el("span", { style: S.metaValue, text: m.value })
            )
          )
        )
      ),
      el("img", { style: S.heroImage, attrs: { src: cover.replace(/^\.\//, ""), alt: section.alt || "" } })
    );
  } else if (section.type === "overview") {
    const aside = section.aside.map(renderAside);
    inner = el(
      "div",
      { style: `${S.wrap} display:grid; grid-template-columns:1fr 440px; gap:80px; align-items:start` },
      el(
        "div",
        { style: col(32) },
        headingBlock(section.heading),
        el(
          "div",
          { style: `${col(24)}; max-width:760px` },
          section.blocks.map((b) =>
            el(
              "div",
              { style: col(8) },
              el("h3", { style: S.h3small, text: b.heading }),
              el("p", { style: S.body, text: b.body })
            )
          )
        )
      ),
      aside.length === 1 ? aside[0] : el("div", { style: col(24) }, aside)
    );
  } else if (section.type === "outcome") {
    inner = el(
      "div",
      { style: `${S.wrap} display:grid; grid-template-columns:1fr 480px; gap:80px; align-items:start` },
      el(
        "div",
        { style: col(40) },
        headingBlock(section.heading),
        el(
          "div",
          { style: `${col(20)}; padding:32px; background:${onWhite ? "#fafafa" : "#fff"}; border:1px solid #e5e5e5; border-radius:16px` },
          el("p", { style: S.outcomeText, text: section.statement })
        )
      ),
      el(
        "div",
        { style: col(32) },
        el("span", { style: S.takeawayEyebrow, text: "KEY TAKEAWAYS" }),
        el(
          "div",
          { style: col(20) },
          section.takeaways.map((t) =>
            el(
              "div",
              { style: col(4) },
              el("span", { style: S.takeawayTitle, text: t.title }),
              el("p", { style: S.takeawayBody, text: t.body })
            )
          )
        )
      )
    );
  } else {
    inner = el(
      "div",
      { style: `${S.wrap} ${col(56)}` },
      headingBlock(section.heading, section.intro),
      (section.blocks || []).map(renderBlock)
    );
  }

  return el("section", { style: chrome }, inner);
}

/** Replaces the contents of `host` with the rendered body of `project`. */
export function renderCaseStudy(host, project) {
  host.textContent = "";
  const sections = (project && project.sections) || [];
  for (let i = 0; i < sections.length; i++) {
    host.appendChild(renderSection(sections[i], i, project));
  }
  return sections.length;
}

/** Flattens section copy into plain text for the chat assistant. */
export function sectionsToText(project) {
  const out = [];
  const push = (v) => { if (v) out.push(String(v)); };
  const walkBlock = (b) => {
    push(b.heading);
    push(b.title);
    push(b.body);
    push(b.caption);
    push(b.badge);
    push(b.note);
    (b.items || []).forEach((i) => (typeof i === "string" ? push(i) : (push(i.title), push(i.body), push(i.caption), push(i.eyebrow))));
    (b.blocks || []).forEach(walkBlock);
  };
  for (const s of project.sections || []) {
    push(s.heading);
    push(s.title);
    push(s.summary);
    push(s.intro);
    push(s.statement);
    (s.meta || []).forEach((m) => push(`${m.label}: ${m.value}`));
    (s.blocks || []).forEach(walkBlock);
    (s.aside || []).forEach(walkBlock);
    (s.takeaways || []).forEach((t) => (push(t.title), push(t.body)));
  }
  return out.join("\n");
}
