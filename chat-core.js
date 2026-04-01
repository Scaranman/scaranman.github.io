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

  function answerForPiece(p, q) {
    const nq = normalize(q);
    if (!nq) return "Ask about role, constraints, process, impact, or artifacts.";

    if (nq.includes("role")) return `Role: ${(p.role || []).join(", ") || "—"}`;
    if (nq.includes("team")) return `Team: ${p.team || "—"}`;
    if (nq.includes("constraint")) return `Constraints:\n- ${(p.constraints || []).join("\n- ") || "—"}`;
    if (nq.includes("process") || nq.includes("approach")) return `Process:\n- ${(p.process || []).join("\n- ") || "—"}`;
    if (nq.includes("impact")) return `Impact:\n- ${(p.impact || []).join("\n- ") || "—"}`;
    if (nq.includes("tag")) return `Tags: ${(p.tags || []).join(", ") || "—"}`;
    if (nq.includes("artifact") || nq.includes("screenshot") || nq.includes("video")) {
      const count = (p.artifacts || []).length;
      return `This project has ${count} artifact${count === 1 ? "" : "s"} on the page. Open the artifact section below to view them.`;
    }
    return formatProjectSummary(p);
  }

  return {
    async send(prompt) {
      if (contextProject) return { role: "bot", text: answerForPiece(contextProject, prompt) };

      const p = pickProjectByQuery(projects, prompt);
      if (p) {
        return {
          role: "bot",
          text: `${formatProjectSummary(p)}\n\nOpen the full case study: project.html?id=${encodeURIComponent(p.id)}`
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
  const withBold = esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const lines = withBold.split("\n");
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

