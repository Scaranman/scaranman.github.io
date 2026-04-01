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

function pickProjectByQuery(projects, q) {
  const nq = normalize(q);
  if (!nq) return null;
  return (
    projects.find((p) => normalize(p.title) === nq) ||
    projects.find((p) => normalize(p.title).includes(nq)) ||
    projects.find((p) => includesAny([p.title, p.problem, (p.tags || []).join(" ")].join(" "), nq.split(" ")))
  );
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
    async send(prompt) {
      if (contextProject) return { role: "bot", text: answerForProject(contextProject, prompt) };

      const p = pickProjectByQuery(projects, prompt);
      if (p) {
        const href = `project.html?id=${encodeURIComponent(p.id)}`;
        return {
          role: "bot",
          text: `${formatProjectSummary(p)}\n\n[View the full case study](${href})`
        };
      }

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

export function wireChatUI({ controller }) {
  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatPrompt = document.getElementById("chatPrompt");
  const resetChatBtn = document.getElementById("resetChatBtn");

  if (!(chatLog && chatForm && chatPrompt)) return;

  const pushMsg = (role, text) => {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    wrap.innerHTML = `
      <div class="avatar" aria-hidden="true">${role === "user" ? "You" : "JS"}</div>
      <div class="bubble">${renderMarkdownish(text)}</div>
    `;
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
  };

  pushMsg("bot", "Ask me about a project (role, constraints, process, impact) or open a case study from the grid.");

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = chatPrompt.value.trim();
    if (!val) return;
    chatPrompt.value = "";
    pushMsg("user", val);
    const msg = await controller.send(val);
    pushMsg("bot", msg.text);
  });

  resetChatBtn?.addEventListener("click", () => {
    chatLog.innerHTML = "";
    const msg = controller.reset();
    pushMsg("bot", msg.text);
  });

  for (const chip of Array.from(document.querySelectorAll(".chip[data-prompt]"))) {
    chip.addEventListener("click", async () => {
      const p = chip.getAttribute("data-prompt") || "";
      if (!p) return;
      pushMsg("user", p);
      const msg = await controller.send(p);
      pushMsg("bot", msg.text);
    });
  }
}

