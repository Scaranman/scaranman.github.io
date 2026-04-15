export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalize(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function includesAny(haystack, needles) {
  const h = normalize(haystack);
  return (needles || []).some((n) => h.includes(normalize(n)));
}

export async function loadProjects() {
  const res = await fetch("./data/projects.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load projects.json (${res.status})`);
  const json = await res.json();
  return Array.isArray(json.projects) ? json.projects : [];
}

export async function loadExperience() {
  const res = await fetch("./data/experience.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load experience.json (${res.status})`);
  return await res.json();
}

const RESUME_PLAIN_TEXT_MAX_CHARS = 14000;

/** Plain-text resume for the chatbot (optional). PDFs are not parsed in the browser—keep this in sync with your PDF. */
export async function loadResumePlainText() {
  try {
    const res = await fetch("./data/resume.txt", { cache: "force-cache" });
    if (!res.ok) return "";
    const t = (await res.text()).replace(/\r\n/g, "\n").trim();
    if (!t) return "";
    return t.length <= RESUME_PLAIN_TEXT_MAX_CHARS ? t : `${t.slice(0, RESUME_PLAIN_TEXT_MAX_CHARS)}…`;
  } catch {
    return "";
  }
}

/** Flatten case study JSON into plain text for AI context (no HTML). */
function flattenCaseStudyText(caseStudy, { maxLen = 8000 } = {}) {
  if (!Array.isArray(caseStudy) || caseStudy.length === 0) return "";
  const lines = [];
  const walk = (node, indent = "") => {
    if (!node) return;
    if (node.title) lines.push(`${indent}${node.title}`);
    for (const p of node.paragraphs || []) {
      if (typeof p === "string" && p.trim()) lines.push(`${indent}${p.trim()}`);
    }
    for (const b of node.bullets || []) {
      const t = String(b || "").trim();
      if (t) lines.push(`${indent}- ${t}`);
    }
    for (const sub of node.subsections || []) walk(sub, `${indent}  `);
  };
  for (const s of caseStudy) walk(s);
  const out = lines.join("\n").replace(/\s+\n/g, "\n").trim();
  if (out.length <= maxLen) return out;
  return `${out.slice(0, maxLen)}…`;
}

/** Relative paths to static HTML in this repo (legacy exports + main pages). */
const SITE_HTML_PATHS = [
  "./index.html",
  "./project.html",
  "./guestpass.html",
  "./jrcs.html",
  "./laundy.html",
  "./mtg.html",
  "./vcg.html",
  "./site.html"
];

function pickProjectByQuery(projects, q) {
  const nq = normalize(q);
  if (!nq) return null;
  return (
    projects.find((p) => normalize(p.title) === nq) ||
    projects.find((p) => normalize(p.title).includes(nq)) ||
    projects.find((p) => includesAny([p.title, p.problem, (p.tags || []).join(" ")].join(" "), nq.split(" ")))
  );
}

function pickProjectsByQuery(projects, q, { limit = 3 } = {}) {
  const nq = normalize(q);
  if (!nq) return [];

  const tokens = nq
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .filter((t) => t.length >= 3);

  const scoreProject = (p) => {
    let score = 0;
    const title = normalize(p.title || "");
    const problem = normalize(p.problem || "");
    const tags = normalize((p.tags || []).join(" "));
    const skills = normalize((p.skills || []).join(" "));
    const blob = `${title} ${problem} ${tags} ${skills}`;

    for (const t of tokens) {
      if (!t) continue;
      if (title.includes(t)) score += 6;
      if (tags.includes(t)) score += 4;
      if (skills.includes(t)) score += 3;
      if (problem.includes(t)) score += 2;
      if (blob.includes(t)) score += 1;
    }

    // boost for obvious multi-match intents
    if (nq.includes("projects") || nq.includes("show me") || nq.includes("examples") || nq.includes("list")) score += 1;
    return score;
  };

  const ranked = projects
    .map((p) => ({ p, score: scoreProject(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // if prompt is very specific (e.g. exact title), prefer a single result
  const exact = projects.find((p) => normalize(p.title) === nq);
  if (exact) return [exact];

  const topScore = ranked[0]?.score ?? 0;
  if (topScore <= 0) return [];

  // keep only reasonably relevant matches
  const cutoff = Math.max(3, Math.floor(topScore * 0.55));
  const filtered = ranked.filter((x) => x.score >= cutoff).slice(0, limit).map((x) => x.p);
  return filtered;
}

function formatProjectSummary(p) {
  const lines = [];
  lines.push(`**${p.title}** (${p.type} • ${p.year})`);
  if (p.role?.length) lines.push(`Role: ${p.role.join(", ")}`);
  if (p.team) lines.push(`Team: ${p.team}`);
  if (p.problem) lines.push(p.problem);
  return lines.join("\n");
}

export function createChatController({ projects, initialContextProjectId }) {
  const contextProject = initialContextProjectId ? projects.find((p) => p.id === initialContextProjectId) : null;
  /** @type {{ id: string, title: string }[] | null} */
  let lastSuggested = null;
  /** @type {{ id: string, title: string } | null} */
  let lastFocused = null;

  const tokenize = (s) => {
    const raw = normalize(s).replace(/[^a-z0-9\s]/g, " ");
    const parts = raw.split(/\s+/g).filter(Boolean);
    const stop = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "but",
      "by",
      "can",
      "did",
      "do",
      "for",
      "from",
      "had",
      "how",
      "i",
      "in",
      "is",
      "it",
      "of",
      "on",
      "or",
      "our",
      "should",
      "so",
      "that",
      "the",
      "their",
      "they",
      "this",
      "to",
      "was",
      "we",
      "were",
      "what",
      "when",
      "where",
      "who",
      "why",
      "with",
      "you",
      "your"
    ]);
    return parts.filter((t) => t.length >= 3 && !stop.has(t));
  };

  const scoreText = (qTokens, text) => {
    const hay = normalize(text);
    if (!hay) return 0;
    let score = 0;
    for (const t of qTokens) {
      // slight boost if it matches as a "word" (better for terms like "elements")
      if (hay.includes(t)) score += 1;
      if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(text)) score += 1;
    }
    return score;
  };

  const buildDetailSnippets = (p) => {
    /** @type {{ title: string; text: string; answer: string }[]} */
    const snippets = [];

    const push = (title, text, answer) => {
      const t = String(text == null ? "" : text).trim();
      const a = String(answer == null ? "" : answer).trim();
      if (!t || !a) return;
      snippets.push({ title, text: t, answer: a });
    };

    push("Role", (p.role || []).join(" "), `Role: ${(p.role || []).join(", ") || "—"}`);
    push("Team", p.team || "", `Team: ${p.team || "—"}`);
    push("Summary", p.problem || "", p.problem || "");
    push("Skills", (p.skills || []).join(" "), `Skills:\n- ${(p.skills || []).join("\n- ") || "—"}`);
    push("Tags", (p.tags || []).join(" "), `Tags: ${(p.tags || []).join(", ") || "—"}`);
    push("Constraints", (p.constraints || []).join(" "), `Constraints:\n- ${(p.constraints || []).join("\n- ") || "—"}`);
    push("Process", (p.process || []).join(" "), `Process:\n- ${(p.process || []).join("\n- ") || "—"}`);
    push("Impact", (p.impact || []).join(" "), `Impact:\n- ${(p.impact || []).join("\n- ") || "—"}`);

    const urlArtifacts = (p.artifacts || []).filter((a) => a && a.kind === "url" && a.href);
    if (urlArtifacts.length) {
      const blob = urlArtifacts.map((a) => [a.label, a.href].filter(Boolean).join(" ")).join(" ");
      const answer =
        "Links:\n- " +
        urlArtifacts
          .map((a) => {
            const label = a.label || a.href;
            return `[${label}](${a.href})`;
          })
          .join("\n- ");
      push("Links", blob, answer);
    }

    const cs = Array.isArray(p.caseStudy) ? p.caseStudy : [];
    for (const section of cs) {
      if (!section) continue;
      const sectionTitle = String(section.title || "Case study").trim();
      const paras = Array.isArray(section.paragraphs) ? section.paragraphs.filter((x) => typeof x === "string") : [];
      const bullets = Array.isArray(section.bullets) ? section.bullets.map((x) => String(x)) : [];

      if (paras.length) {
        const paraText = paras.join("\n");
        push(sectionTitle, paraText, `**${sectionTitle}**\n\n${paraText}`);
      }
      if (bullets.length) {
        const bulletText = bullets.join("\n");
        push(sectionTitle, bulletText, `**${sectionTitle}**\n\n- ${bullets.join("\n- ")}`);
      }

      const subs = Array.isArray(section.subsections) ? section.subsections : [];
      for (const sub of subs) {
        if (!sub) continue;
        const subTitle = String(sub.title || "").trim();
        const title = subTitle ? `${sectionTitle} — ${subTitle}` : sectionTitle;
        const subParas = Array.isArray(sub.paragraphs) ? sub.paragraphs.filter((x) => typeof x === "string") : [];
        const subBullets = Array.isArray(sub.bullets) ? sub.bullets.map((x) => String(x)) : [];
        if (subParas.length) {
          const subText = subParas.join("\n");
          push(title, subText, `**${title}**\n\n${subText}`);
        }
        if (subBullets.length) {
          push(title, subBullets.join("\n"), `**${title}**\n\n- ${subBullets.join("\n- ")}`);
        }
      }
    }

    return snippets;
  };

  const answerFromDetails = (p, q) => {
    const qTokens = tokenize(q);
    if (qTokens.length === 0) return "";

    const snippets = buildDetailSnippets(p);
    let best = null;
    let bestScore = 0;

    for (const s of snippets) {
      const sc = scoreText(qTokens, `${s.title} ${s.text}`);
      // tie-break toward longer snippets (more likely to be an explanation/definition)
      const len = (s.text || "").length;
      const bestLen = best ? (best.text || "").length : 0;
      if (sc > bestScore || (sc === bestScore && len > bestLen)) {
        bestScore = sc;
        best = s;
      }
    }

    // For single-term questions like "what is elements", allow a single strong hit.
    const minScore = qTokens.length <= 1 ? 2 : 3;
    if (!best || bestScore < minScore) return "";
    return best.answer;
  };

  function answerForProject(p, q) {
    const nq = normalize(q);
    if (!nq) return "Ask about role, constraints, process, impact, or artifacts.";

    const wantsRole = nq.includes("role") || nq.includes("responsibilit") || nq.includes("what did you do") || nq.includes("your part");
    if (wantsRole) return `Role: ${(p.role || []).join(", ") || "—"}`;

    const wantsTeam = nq.includes("team") || nq.includes("collaborat") || nq.includes("who did you work with") || nq.includes("stakeholder");
    if (wantsTeam) return `Team: ${p.team || "—"}`;

    const wantsConstraints = nq.includes("constraint") || nq.includes("limitation") || nq.includes("trade-off") || nq.includes("requirement");
    if (wantsConstraints) return `Constraints:\n- ${(p.constraints || []).join("\n- ") || "—"}`;

    const wantsProcess =
      nq.includes("process") ||
      nq.includes("approach") ||
      nq.includes("how did you") ||
      nq.includes("what was the approach") ||
      nq.includes("steps") ||
      nq.includes("method");
    if (wantsProcess) return `Process:\n- ${(p.process || []).join("\n- ") || "—"}`;

    const wantsImpact = nq.includes("impact") || nq.includes("result") || nq.includes("outcome") || nq.includes("metric") || nq.includes("measure");
    if (wantsImpact) return `Impact:\n- ${(p.impact || []).join("\n- ") || "—"}`;

    const wantsTags = nq.includes("tag") || nq.includes("category") || nq.includes("keywords");
    if (wantsTags) return `Tags: ${(p.tags || []).join(", ") || "—"}`;

    const wantsSkills = nq.includes("skill") || nq.includes("tools") || nq.includes("tooling") || nq.includes("stack") || nq.includes("tech");
    if (wantsSkills) return `Skills:\n- ${(p.skills || []).join("\n- ") || "—"}`;

    const wantsProblem =
      nq.includes("problem") ||
      nq.includes("challenge") ||
      nq.includes("pain point") ||
      nq.includes("why") ||
      nq.includes("what were you solving") ||
      nq.includes("what did you solve");
    if (wantsProblem) return p.problem ? `Problem:\n${p.problem}` : "Problem: —";

    const wantsSummary =
      nq.includes("overview") ||
      nq.includes("summary") ||
      nq.includes("what is this") ||
      nq === "tell me about it";
    if (wantsSummary) return formatProjectSummary(p);

    if (nq.includes("artifact") || nq.includes("screenshot") || nq.includes("video") || nq.includes("demo") || nq.includes("link")) {
      const count = (p.artifacts || []).length;
      const urls = (p.artifacts || []).filter((a) => a && a.kind === "url" && a.href);
      const urlLines = urls.length
        ? `\n\nLinks:\n- ${urls
            .map((a) => {
              const label = a.label || a.href;
              return `[${label}](${a.href})`;
            })
            .join("\n- ")}`
        : "";
      return `This project has ${count} artifact${count === 1 ? "" : "s"} on the page. Open the artifact section below to view them.${urlLines}`;
    }

    const fromDetails = answerFromDetails(p, q);
    if (fromDetails) return fromDetails;

    return `What specifically would you like to know about **${p.title}**?\n\nTry: role, constraints, process, impact, skills/tools, or links.`;
  }

  return {
    __projects: projects,
    __contextProjectId: initialContextProjectId || null,
    async send(prompt) {
      if (contextProject) return { role: "bot", text: answerForProject(contextProject, prompt) };

      const np = normalize(prompt);

      // Hero chip prompts: offline bot scored poorly (e.g. "UX" is 2 chars). Handle explicitly.
      if (np.includes("strongest") || (np.includes("best") && np.includes("case study"))) {
        const p = projects.find((x) => x.id === "guest-pass") || projects.slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0];
        if (p) {
          lastSuggested = null;
          lastFocused = { id: p.id, title: p.title };
          const href = `project.html?id=${encodeURIComponent(p.id)}`;
          return { role: "bot", text: `${formatProjectSummary(p)}\n\n[View the full case study](${href})` };
        }
      }
      if (np.includes("measurable") && np.includes("impact")) {
        const ranked = projects
          .filter((p) => (p.impact || []).some((i) => /\d|released|production|q\d|differentiator|adoption/i.test(String(i).toLowerCase())))
          .sort((a, b) => (b.year || 0) - (a.year || 0));
        const p = ranked[0] || projects.find((x) => x.id === "guest-pass") || projects[0];
        if (p) {
          lastFocused = { id: p.id, title: p.title };
          const href = `project.html?id=${encodeURIComponent(p.id)}`;
          return {
            role: "bot",
            text: `${formatProjectSummary(p)}\n\n**Impact**\n- ${(p.impact || []).join("\n- ")}\n\n[View the full case study](${href})`
          };
        }
      }

      const projectLabel = (p) => `**${p.title}** (${p.type} • ${p.year})`;

      const findByTitleLoose = (title) => {
        const nt = normalize(title);
        if (!nt) return null;
        return (
          projects.find((p) => normalize(p.title) === nt) ||
          projects.find((p) => normalize(p.title).includes(nt)) ||
          projects.find((p) => nt.includes(normalize(p.title)))
        );
      };

      const acronymForTitle = (title) =>
        String(title || "")
          .split(/[\s-]+/g)
          .filter(Boolean)
          .map((w) => w[0])
          .join("")
          .toLowerCase();

      const matchesProjectMention = (p) => {
        const nPrompt = normalize(prompt);
        const nTitle = normalize(p.title);
        if (nTitle && nPrompt.includes(nTitle)) return true;
        const nId = normalize(String(p.id || "").replace(/[-_]/g, " "));
        if (nId && nPrompt.includes(nId)) return true;
        const ac = acronymForTitle(p.title);
        if (ac && new RegExp(`\\b${ac}\\b`, "i").test(prompt)) return true;
        return false;
      };

      const resolveCompareTargets = () => {
        // Prefer explicit "compare X and Y" where X/Y are project titles.
        // Also support "compare the first two" based on the last suggested list.
        if (!np.includes("compare")) return null;

        const list = Array.isArray(lastSuggested) ? lastSuggested : null;

        if (list && (np.includes("them") || np.includes("those") || np.includes("these") || np.includes("both"))) {
          const p1 = projects.find((p) => p.id === list[0]?.id);
          const p2 = projects.find((p) => p.id === list[1]?.id);
          if (p1 && p2) return [p1, p2];
        }

        if (list && (np.includes("first two") || np.includes("first 2"))) {
          const p1 = projects.find((p) => p.id === list[0]?.id);
          const p2 = projects.find((p) => p.id === list[1]?.id);
          if (p1 && p2) return [p1, p2];
        }
        if (list && (np.includes("top two") || np.includes("top 2"))) {
          const p1 = projects.find((p) => p.id === list[0]?.id);
          const p2 = projects.find((p) => p.id === list[1]?.id);
          if (p1 && p2) return [p1, p2];
        }

        // Attempt to match any of the last suggested titles mentioned in the prompt.
        if (list) {
          const matched = list
            .map((s) => projects.find((p) => p.id === s.id))
            .filter(Boolean)
            .filter((p) => matchesProjectMention(p));
          if (matched.length >= 2) return [matched[0], matched[1]];
        }

        // Fallback: parse "compare A and B" / "compare A vs B"
        const m = prompt.match(/compare\s+(.+?)\s+(?:vs\.?|versus|and)\s+(.+)$/i);
        if (m) {
          const a = findByTitleLoose(m[1]);
          const b = findByTitleLoose(m[2]);
          if (a && b && a.id !== b.id) return [a, b];
        }

        return null;
      };

      const resolveFollowupProject = () => {
        const list = Array.isArray(lastSuggested) ? lastSuggested : null;
        const focused = lastFocused ? projects.find((p) => p.id === lastFocused.id) : null;

        const byOrdinal = (idx) => {
          if (!list || !list[idx]) return null;
          return projects.find((p) => p.id === list[idx].id) || null;
        };

        // If the user says "first/second/third", pick from the last suggestion list.
        if (np.includes("first")) return byOrdinal(0);
        if (np.includes("second")) return byOrdinal(1);
        if (np.includes("third")) return byOrdinal(2);
        if (np.includes("fourth")) return byOrdinal(3);

        // If they say "that one/this one/it", use the last focused project (single result or explicit pick).
        if (focused && (np.includes("that") || np.includes("this") || np === "it" || np.includes("go deeper") || np.includes("tell me more"))) return focused;

        // If they mention a title from the last list, use that.
        if (list) {
          for (const s of list) {
            if (normalize(prompt).includes(normalize(s.title))) {
              const p = projects.find((p) => p.id === s.id);
              if (p) return p;
            }
          }
        }

        return null;
      };

      // Make suggested follow-ups work: "go deeper on one" / "tell me more"
      const followupProject = resolveFollowupProject();
      const asksAngle =
        np.includes("role") ||
        np.includes("team") ||
        np.includes("constraint") ||
        np.includes("process") ||
        np.includes("approach") ||
        np.includes("impact") ||
        np.includes("result") ||
        np.includes("outcome") ||
        np.includes("skill") ||
        np.includes("tool") ||
        np.includes("artifact") ||
        np.includes("link") ||
        np.includes("problem") ||
        np.includes("challenge");
      if (followupProject && (asksAngle || np.includes("go deeper") || np.includes("tell me more") || np.includes("more detail"))) {
        lastFocused = { id: followupProject.id, title: followupProject.title };
        return { role: "bot", text: answerForProject(followupProject, prompt) };
      }

      const compareProjects = (a, b) => {
        const lines = [];
        lines.push(`Comparison: ${a.title} vs ${b.title}`);
        lines.push("");
        lines.push(`- ${projectLabel(a)}`);
        lines.push(`  - Role: ${(a.role || []).join(", ") || "—"}`);
        lines.push(`  - Team: ${a.team || "—"}`);
        lines.push(`  - Skills: ${(a.skills || []).join(", ") || "—"}`);
        lines.push(`  - Constraints: ${(a.constraints || []).join("; ") || "—"}`);
        lines.push(`  - Process: ${(a.process || []).join("; ") || "—"}`);
        lines.push(`  - Impact: ${(a.impact || []).join("; ") || "—"}`);
        lines.push(`  - [Open case study](project.html?id=${encodeURIComponent(a.id)})`);
        lines.push("");
        lines.push(`- ${projectLabel(b)}`);
        lines.push(`  - Role: ${(b.role || []).join(", ") || "—"}`);
        lines.push(`  - Team: ${b.team || "—"}`);
        lines.push(`  - Skills: ${(b.skills || []).join(", ") || "—"}`);
        lines.push(`  - Constraints: ${(b.constraints || []).join("; ") || "—"}`);
        lines.push(`  - Process: ${(b.process || []).join("; ") || "—"}`);
        lines.push(`  - Impact: ${(b.impact || []).join("; ") || "—"}`);
        lines.push(`  - [Open case study](project.html?id=${encodeURIComponent(b.id)})`);
        lines.push("");
        lines.push("Want me to compare a specific angle (scope, research, IA, interaction patterns, outcomes)?");
        return lines.join("\n");
      };

      const compareTargets = resolveCompareTargets();
      if (compareTargets) {
        const [a, b] = compareTargets;
        lastFocused = null;
        return { role: "bot", text: compareProjects(a, b) };
      }

      const matches = pickProjectsByQuery(projects, prompt, { limit: 4 });
      if (matches.length === 1) {
        const p = matches[0];
        const href = `project.html?id=${encodeURIComponent(p.id)}`;
        lastSuggested = null;
        lastFocused = { id: p.id, title: p.title };
        return { role: "bot", text: `${formatProjectSummary(p)}\n\n[View the full case study](${href})` };
      }
      if (matches.length > 1) {
        lastSuggested = matches.map((p) => ({ id: p.id, title: p.title }));
        lastFocused = null;
        const lines = [];
        lines.push(`Here are a few projects that match:`);
        for (const p of matches) {
          const href = `project.html?id=${encodeURIComponent(p.id)}`;
          const impact = p.impact && p.impact[0] ? ` — Impact: ${p.impact[0]}` : "";
          lines.push(`- **${p.title}** (${p.type} • ${p.year})${impact}\n  - [Open case study](${href})`);
        }
        lines.push(`\nWant me to compare two of these, or go deeper on one (role, constraints, process, impact)?`);
        return { role: "bot", text: lines.join("\n") };
      }

      lastSuggested = null;
      lastFocused = null;
      return {
        role: "bot",
        text:
          "Try asking about **Guest Pass**, **Vendor Client Gateway**, or **JRCS** — or ask for a tag like “security”, “enterprise”, or “workflows”."
      };
    },
    reset() {
      return { role: "bot", text: "Reset. What would you like to explore?" };
    }
  };
}

function renderMarkdownish(text) {
  // minimal renderer: **bold**, newlines, and bullet lines
  const esc = escapeHtml(text);

  const sanitizeHref = (rawHref) => {
    const href = String(rawHref || "").trim();
    if (!href) return "";
    const lower = href.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) return "";
    return href;
  };

  const renderLinks = (htmlEscapedText) => {
    // markdown-style links: [label](href)
    let out = htmlEscapedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const safeHref = sanitizeHref(href);
      if (!safeHref) return `${label} (${href})`;
      const isExternal = /^(https?:)?\/\//i.test(safeHref) || /^www\./i.test(safeHref) || /^mailto:/i.test(safeHref);
      const normalizedHref = /^www\./i.test(safeHref) ? `https://${safeHref}` : safeHref;
      const extra = isExternal ? ` target="_blank" rel="noreferrer"` : "";
      return `<a href="${normalizedHref}"${extra}>${label}</a>`;
    });

    // bare URLs (http/https and www.), but never linkify inside an existing <a>
    const parts = out.split(/(<a\b[\s\S]*?<\/a>)/i);
    out = parts
      .map((part) => {
        if (/^<a\b/i.test(part)) return part;
        return part.replace(/\b(https?:\/\/[^\s<]+|www\.[^\s<]+)\b/g, (_m, url) => {
          const safeHref = sanitizeHref(url);
          if (!safeHref) return url;
          const href = /^www\./i.test(safeHref) ? `https://${safeHref}` : safeHref;
          return `<a href="${href}" target="_blank" rel="noreferrer">${url}</a>`;
        });
      })
      .join("");

    return out;
  };

  const withBold = esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const withLinks = renderLinks(withBold);
  const lines = withLinks.split("\n");
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(.*)$/);
    if (m) {
      if (!inList) {
        inList = true;
        out.push("<ul>");
      }
      out.push(`<li>${m[1]}</li>`);
      continue;
    }
    if (inList) {
      inList = false;
      out.push("</ul>");
    }
    if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

/** @typedef {{ label: string; href: string }} SocialLink */

/**
 * Snapshot of homepage-ish content from any Document (live page or fetched index.html).
 * @param {Document} doc
 */
function collectHomeContextFromDoc(doc) {
  const getText = (sel) => {
    const el = doc.querySelector(sel);
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  };
  const getTexts = (sel) =>
    Array.from(doc.querySelectorAll(sel))
      .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

  const getHref = (sel) => {
    const el = doc.querySelector(sel);
    if (!(el instanceof HTMLAnchorElement)) return "";
    return String(el.getAttribute("href") || "").trim();
  };

  const skillCards = doc.querySelectorAll("#skills .two-col .card.pad");
  const tagTexts = (card) =>
    card
      ? Array.from(card.querySelectorAll(".tag"))
          .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      : [];
  const skillsCore = tagTexts(skillCards[0]);
  const skillsTools = tagTexts(skillCards[1]);

  /** @type {SocialLink[]} */
  const socialLinks = Array.from(doc.querySelectorAll("#contact .social-link[href], #contact .social-links a[href]"))
    .map((a) => {
      const href = String(a.getAttribute("href") || "").trim();
      const label = String((a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim());
      return href ? { label: label || href, href } : null;
    })
    .filter(Boolean);

  const aboutTitle = getText("#about h2") || "About";

  return {
    name: getText(".brand-name"),
    tagline: getText(".brand-tag"),
    heroHeadline: getText("main .hero h1"),
    about: { title: aboutTitle, text: getTexts("#about .card p").join("\n") },
    experience: {
      roles: getTexts("#resume .timeline-role"),
      timeline: getTexts("#resume .timeline-company"),
      highlights: getTexts("#resume .timeline-bullets li")
    },
    contact: {
      email: getText('a.contact-link[href^="mailto:"]') || getText('#contact a[href^="mailto:"]'),
      resumeHref: getHref('#resume a.link-btn[href$=".pdf"]')
    },
    skillsCore,
    skillsTools,
    socialLinks
  };
}

/**
 * Prefer non-empty fields from `a`, fall back to `b` (e.g. live page vs fetched index.html).
 * @param {ReturnType<typeof collectHomeContextFromDoc>} a
 * @param {ReturnType<typeof collectHomeContextFromDoc>} b
 */
function mergeHomeContext(a, b) {
  const pick = (x, y) => {
    const sx = x == null ? "" : String(x).trim();
    if (sx) return x;
    const sy = y == null ? "" : String(y).trim();
    return sy ? y : x ?? y ?? "";
  };
  const pickArr = (x, y) => (x && x.length ? x : y && y.length ? y : x || y || []);
  return {
    name: pick(a.name, b.name),
    tagline: pick(a.tagline, b.tagline),
    heroHeadline: pick(a.heroHeadline, b.heroHeadline),
    about: {
      title: pick(a.about?.title, b.about?.title),
      text: pick(a.about?.text, b.about?.text)
    },
    experience: {
      roles: pickArr(a.experience?.roles, b.experience?.roles),
      timeline: pickArr(a.experience?.timeline, b.experience?.timeline),
      highlights: pickArr(a.experience?.highlights, b.experience?.highlights)
    },
    contact: {
      email: pick(a.contact?.email, b.contact?.email),
      resumeHref: pick(a.contact?.resumeHref, b.contact?.resumeHref)
    },
    skillsCore: pickArr(a.skillsCore, b.skillsCore),
    skillsTools: pickArr(a.skillsTools, b.skillsTools),
    socialLinks: pickArr(a.socialLinks, b.socialLinks)
  };
}

export function wireChatUI({ controller }) {
  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatPrompt = document.getElementById("chatPrompt");
  const resetChatBtn = document.getElementById("resetChatBtn");

  if (!(chatLog && chatForm && chatPrompt)) return;

  /** @type {{ path: string; pageTitle: string; text: string }[] | null} */
  let sitePagesCorpusCache = null;

  const loadSitePagesCorpus = async () => {
    if (sitePagesCorpusCache) return sitePagesCorpusCache;
    const perPageMax = 12000;
    const parts = await Promise.all(
      SITE_HTML_PATHS.map(async (path) => {
        try {
          const res = await fetch(path, { cache: "force-cache" });
          if (!res.ok) return null;
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const contentRoot =
            doc.querySelector("main") ||
            doc.querySelector(".article-style") ||
            doc.querySelector("article .article-style") ||
            doc.querySelector("article.article, article.article-project") ||
            doc.querySelector(".page-body article") ||
            doc.querySelector("article");
          const root = contentRoot || doc.body;
          let text = root ? String(root.innerText || "").replace(/\s+/g, " ").trim() : "";

          // innerText drops URLs that only exist in attributes (e.g. icon links).
          // Include a compact link/media list so the assistant can answer “what’s your LinkedIn URL?” etc.
          if (root) {
            /** @type {string[]} */
            const linkLines = [];
            for (const a of Array.from(root.querySelectorAll("a[href]"))) {
              const href = String(a.getAttribute("href") || "").trim();
              if (!href) continue;
              // skip purely internal anchors; keep relative pages and external links
              if (href.startsWith("#")) continue;
              const label = String((a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim());
              linkLines.push(label ? `${label} — ${href}` : href);
              if (linkLines.length >= 60) break;
            }

            /** @type {string[]} */
            const mediaLines = [];
            for (const el of Array.from(root.querySelectorAll("img[src], video[src], source[src]"))) {
              const src = String(el.getAttribute("src") || "").trim();
              if (!src) continue;
              const alt = String((el.getAttribute("alt") || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim());
              mediaLines.push(alt ? `${alt} — ${src}` : src);
              if (mediaLines.length >= 60) break;
            }

            const extras = [
              linkLines.length ? `Links: ${linkLines.join(" | ")}` : "",
              mediaLines.length ? `Media: ${mediaLines.join(" | ")}` : ""
            ]
              .filter(Boolean)
              .join("\n");
            if (extras) text = `${text}\n\n${extras}`.trim();
          }
          if (text.length > perPageMax) text = `${text.slice(0, perPageMax)}…`;
          const pageTitle = (doc.querySelector("title") && doc.querySelector("title").textContent.trim()) || path;
          if (!text) return null;
          return { path, pageTitle, text };
        } catch {
          return null;
        }
      })
    );
    const ok = /** @type {{ path: string; pageTitle: string; text: string }[]} */ (parts.filter(Boolean));
    sitePagesCorpusCache = ok;
    return sitePagesCorpusCache;
  };

  const pickRelevantSitePages = (sitePages, prompt, { limit = 4, maxChars = 52000 } = {}) => {
    const q = normalize(prompt);
    if (!q) return sitePages.slice(0, Math.min(limit, sitePages.length));

    const tokens = q
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/g)
      .filter(Boolean)
      .filter((t) => t.length >= 3);

    const scorePage = (p) => {
      const title = normalize(p.pageTitle || "");
      const path = normalize(p.path || "");
      const text = normalize(p.text || "");
      const blob = `${title} ${path} ${text}`;
      let score = 0;
      for (const t of tokens) {
        if (!t) continue;
        if (title.includes(t)) score += 8;
        if (path.includes(t)) score += 6;
        if (text.includes(t)) score += 2;
        if (blob.includes(t)) score += 1;
      }
      // Small bias toward non-generic legacy dumps when they match
      if (path.endsWith("site.html")) score -= 2;
      return score;
    };

    const ranked = sitePages
      .map((p) => ({ p, score: scorePage(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

    const picked = (ranked.length ? ranked : sitePages).slice(0, Math.min(limit, sitePages.length));
    /** @type {{ path: string; pageTitle: string; text: string }[]} */
    const out = [];
    let used = 0;
    for (const p of picked) {
      if (used + p.text.length > maxChars) {
        const rest = maxChars - used;
        if (rest > 500) out.push({ ...p, text: `${p.text.slice(0, rest)}…` });
        break;
      }
      out.push(p);
      used += p.text.length;
    }
    return out;
  };

  const DEFAULT_AI_ENDPOINT = "https://portfolio-openai-proxy.jacobscarani.workers.dev/v1/responses";
  const redactSecrets = (s) =>
    String(s == null ? "" : s)
      // redact common OpenAI key formats (best-effort)
      .replace(/\bsk-[a-z0-9_-]{10,}\b/gi, "sk-***")
      .replace(/\bsk-proj-[a-z0-9_-]{10,}\b/gi, "sk-proj-***");

  const callOpenAI = async ({ prompt, projects, contextProjectId }) => {
    const contextProject = contextProjectId ? projects.find((p) => p.id === contextProjectId) : null;

    const allProjectsCompact = projects.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      year: p.year,
      role: p.role,
      team: p.team,
      problem: p.problem,
      constraints: p.constraints,
      process: p.process,
      impact: p.impact,
      skills: p.skills,
      tags: p.tags,
      caseStudyText: flattenCaseStudyText(p.caseStudy, { maxLen: 8000 }),
      artifacts: (p.artifacts || []).filter((a) => a && a.kind === "url" && a.href).map((a) => ({ label: a.label, href: a.href }))
    }));

    const isProjectScopedChat = Boolean(contextProject);

    /** @type {{ path: string; pageTitle: string; text: string }[]} */
    let sitePages = [];
    if (!isProjectScopedChat) {
      const sitePagesAll = await loadSitePagesCorpus();
      sitePages = pickRelevantSitePages(sitePagesAll, prompt, { limit: 5, maxChars: 52000 });
    }

    let homeContext = collectHomeContextFromDoc(document);
    if (!isProjectScopedChat) {
      const needsIndexFallback =
        !String(homeContext.about?.text || "").trim() ||
        (!(homeContext.skillsCore || []).length && !(homeContext.skillsTools || []).length) ||
        !(homeContext.socialLinks || []).length;
      if (needsIndexFallback) {
        try {
          const res = await fetch("./index.html", { cache: "force-cache" });
          if (res.ok) {
            const idxDoc = new DOMParser().parseFromString(await res.text(), "text/html");
            homeContext = mergeHomeContext(homeContext, collectHomeContextFromDoc(idxDoc));
          }
        } catch {
          /* ignore */
        }
      }

      try {
        const expData = await loadExperience();
        const entries = Array.isArray(expData?.entries) ? expData.entries : [];
        if (entries.length) {
          homeContext.experience = {
            roles: entries.map((e) => `${String(e.roleTitle || "").trim()} — ${String(e.company || "").trim()}`),
            timeline: entries.map((e) => String(e.datesAndLocation || "").trim()),
            highlights: entries.flatMap((e) => (Array.isArray(e.bullets) ? e.bullets : []).map((b) => String(b).trim()))
          };
          if (expData.resumeDownloadHref) {
            homeContext.contact = homeContext.contact || { email: "", resumeHref: "" };
            homeContext.contact.resumeHref = expData.resumeDownloadHref;
          }
        }
      } catch {
        /* keep DOM / index.html experience snapshot */
      }

      try {
        const resumePlainText = await loadResumePlainText();
        if (resumePlainText) homeContext.resumePlainText = resumePlainText;
      } catch {
        /* optional */
      }
    } else {
      homeContext = {};
    }

    const systemPortfolio = [
      "You are a helpful portfolio assistant for Jacob Scarani (homepage / portfolio chat).",
      "Answer using ONLY the provided JSON: homepage (including skillsCore, skillsTools, socialLinks, experience, resumePlainText when present), projects, and sitePages excerpts.",
      "You may answer any question supported by that data (contact, LinkedIn, skills, work history, comparisons, case studies, legacy article pages, etc.).",
      "If the answer is not in the provided JSON, say you do not have that information on this site and suggest a related question.",
      "Prefer concise plain English. Use markdown links like [Open case study](project.html?id=...). Legacy pages may use filenames like guestpass.html when relevant.",
      "If multiple projects match a broad query, summarize up to 4 and ask a short clarifying question."
    ].join("\n");

    const systemProject = [
      "You are a helpful assistant for Jacob Scarani's portfolio (project / case study page).",
      "Answer ONLY using the provided contextProject object: title, role, team, problem/summary, constraints, process, impact, skills, tags, caseStudyText, and artifacts.",
      "Treat vague questions (e.g. \"what was the process?\", \"constraints?\", \"impact?\", \"what did you do?\", \"tell me about it\") as referring to THIS project unless the user explicitly asks about something else (another project name, LinkedIn, the whole site, etc.).",
      "Do not use other projects, homepage fields, or sitePages — they are intentionally omitted on this page. If asked for something outside this project, briefly say that this chat is scoped to the open case study and suggest they use the portfolio chat on the home page, or ask a question about this project.",
      "If a detail is not in contextProject, say you don't have it in this case study and suggest what they can ask instead.",
      "Be concise. Use markdown links only for URLs present in contextProject (e.g. artifact links)."
    ].join("\n");

    const system = isProjectScopedChat ? systemProject : systemPortfolio;

    const data = {
      mode: contextProject ? "project" : "portfolio",
      homepage: homeContext,
      sitePages,
      contextProjectId: contextProject?.id || null,
      contextProjectTitle: contextProject?.title || null,
      projects: isProjectScopedChat ? [] : allProjectsCompact,
      contextProject: contextProject
        ? {
            id: contextProject.id,
            title: contextProject.title,
            type: contextProject.type,
            year: contextProject.year,
            role: contextProject.role,
            team: contextProject.team,
            problem: contextProject.problem,
            constraints: contextProject.constraints,
            process: contextProject.process,
            impact: contextProject.impact,
            skills: contextProject.skills,
            tags: contextProject.tags,
            caseStudyText: flattenCaseStudyText(contextProject.caseStudy, { maxLen: 12000 }),
            artifacts: (contextProject.artifacts || []).filter((a) => a && (a.kind === "url" || a.kind === "image" || a.kind === "video"))
          }
        : null
    };

    const user = [
      "Site knowledge (JSON):",
      JSON.stringify(data),
      "",
      "User question:",
      prompt
    ].join("\n");

    const endpoint = DEFAULT_AI_ENDPOINT;
    let res;
    try {
      /** @type {Record<string, string>} */
      const headers = {
        "Content-Type": "application/json"
      };

      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] }
          ]
        })
      });
    } catch (e) {
      // Most common on static sites: CORS blocks direct calls to api.openai.com
      throw new Error(
        `Network/CORS error calling OpenAI. Set an AI endpoint that supports CORS (a small proxy), then retry. (${redactSecrets(
          e?.message || String(e)
        )})`
      );
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`OpenAI error (${res.status}): ${msg || res.statusText}`);
    }
    const json = await res.json();

    const outputText =
      (typeof json?.output_text === "string" && json.output_text.trim()) ||
      (Array.isArray(json?.output)
        ? json.output
            .flatMap((item) => item?.content || [])
            .filter((c) => c && (c.type === "output_text" || c.type === "summary_text") && typeof c.text === "string")
            .map((c) => c.text)
            .join("\n")
            .trim()
        : "");

    if (outputText) return outputText;
    throw new Error("OpenAI returned no output text.");
  };

  const pushMsg = (role, text, { className } = {}) => {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}${className ? ` ${className}` : ""}`;
    wrap.innerHTML = `
      <div class="avatar" aria-hidden="true">${role === "user" ? "You" : "JS"}</div>
      <div class="bubble">${renderMarkdownish(text)}</div>
    `;
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  };

  const pushThinking = () => {
    const wrap = document.createElement("div");
    wrap.className = "msg bot thinking";
    wrap.innerHTML = `
      <div class="avatar" aria-hidden="true">JS</div>
      <div class="bubble">
        <span class="thinking-dots" aria-label="Thinking">
          <span></span><span></span><span></span>
        </span>
      </div>
    `;
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  };

  const onProjectPage = (() => {
    try {
      const p = new URL(window.location.href).pathname.toLowerCase();
      return p.endsWith("/project.html") || p.endsWith("project.html") || Boolean(document.getElementById("projectTitle"));
    } catch {
      return Boolean(document.getElementById("projectTitle"));
    }
  })();

  pushMsg(
    "bot",
    onProjectPage || controller.__contextProjectId
      ? "Ask me about this project (role, constraints, process, impact)."
      : "Ask me about a project (role, constraints, process, impact) or open a case study from the grid."
  );

  let chatBusy = false;
  const submitBtn = chatForm.querySelector('button[type="submit"]');
  const promptChips = () => Array.from(document.querySelectorAll(".chip[data-prompt]"));

  const setChatBusy = (busy) => {
    chatBusy = busy;
    chatPrompt.disabled = busy;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = busy;
    if (resetChatBtn instanceof HTMLButtonElement) resetChatBtn.disabled = busy;
    for (const el of promptChips()) {
      if (el instanceof HTMLButtonElement) el.disabled = busy;
    }
    chatForm.setAttribute("aria-busy", busy ? "true" : "false");
  };

  const runAssistant = async (val) => {
    if (chatBusy) return;
    setChatBusy(true);
    const thinking = pushThinking();
    try {
      try {
        const aiText = await callOpenAI({
          prompt: val,
          projects: controller.__projects || [],
          contextProjectId: controller.__contextProjectId || null
        });
        pushMsg("bot", aiText);
      } catch (err) {
        const msg = await controller.send(val);
        pushMsg("bot", msg.text);
        console.warn("AI mode failed", err);
        const safe = redactSecrets(err?.message || String(err));
        pushMsg("bot", `AI mode failed. Using built-in answers. Details: ${safe}`);
      }
    } finally {
      thinking.remove();
      setChatBusy(false);
    }
  };

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (chatBusy) return;
    const val = chatPrompt.value.trim();
    if (!val) return;
    chatPrompt.value = "";
    pushMsg("user", val);
    await runAssistant(val);
  });

  resetChatBtn?.addEventListener("click", () => {
    if (chatBusy) return;
    chatLog.innerHTML = "";
    const msg = controller.reset();
    pushMsg("bot", msg.text);
  });

  for (const chip of Array.from(document.querySelectorAll(".chip[data-prompt]"))) {
    chip.addEventListener("click", async () => {
      if (chatBusy) return;
      const p = chip.getAttribute("data-prompt") || "";
      if (!p) return;
      pushMsg("user", p);
      await runAssistant(p);
    });
  }
}

