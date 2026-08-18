import { escapeHtml, normalize, loadProjects, loadExperience, createChatController, wireChatUI } from "./chat-core.js";
import { initTheme } from "./theme.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

initTheme();

const projectsGrid = $("#projectsGrid");
const projectFilter = $("#projectFilter");

let projects = [];

function projectMatchesFilters(p) {
  const q = normalize(projectFilter.value);
  if (!q) return true;
  const blob = normalize(
    [
      p.title,
      p.type,
      p.year,
      (p.role || []).join(" "),
      p.team,
      p.problem,
      (p.skills || []).join(" "),
      (p.tags || []).join(" "),
      (p.constraints || []).join(" "),
      (p.process || []).join(" "),
      (p.impact || []).join(" ")
    ].join(" ")
  );
  return blob.includes(q);
}

function renderExperience(data) {
  const ol = $("#experienceTimeline");
  const resumeLink = $("#resumeDownloadLink");
  if (!ol) return;

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (entries.length === 0) {
    ol.innerHTML = `<li class="timeline-item"><div class="timeline-content"><p class="muted">No experience entries.</p></div></li>`;
    return;
  }

  ol.innerHTML = entries
    .map(
      (e) => `
    <li class="timeline-item">
      <div class="timeline-rail" aria-hidden="true"><div class="timeline-dot"></div></div>
      <div class="timeline-content">
        <div class="timeline-header">
          <img class="timeline-logo" src="${escapeHtml(e.logoSrc)}" alt="${escapeHtml(e.logoAlt)}" />
          <div class="timeline-title">
            <div class="timeline-role"><strong>${escapeHtml(e.roleTitle)}</strong> — ${escapeHtml(e.company)}</div>
            <div class="timeline-company">${escapeHtml(e.datesAndLocation)}</div>
          </div>
        </div>
        <ul class="timeline-bullets">
          ${(e.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
        </ul>
      </div>
    </li>`
    )
    .join("");

  if (resumeLink && data?.resumeDownloadHref) {
    resumeLink.setAttribute("href", data.resumeDownloadHref);
    if (data.resumeDownloadLabel) resumeLink.textContent = data.resumeDownloadLabel;
  }
}

function renderProjects() {
  const list = projects
    .slice()
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .filter(projectMatchesFilters);

  if (list.length === 0) {
    projectsGrid.innerHTML = `<div class="card pad" style="grid-column: 1 / -1;">
      <strong>No matches.</strong>
      <div style="margin-top:6px;">Try searching for “security”, “enterprise”, or “workflows”.</div>
    </div>`;
    return;
  }

  projectsGrid.innerHTML = list
    .map((p) => {
      const roles = (p.role || []).slice(0, 2).join(" · ");
      const impact = (p.impact && p.impact[0]) ? `Impact: ${escapeHtml(p.impact[0])}` : "Impact: —";
      return `
        <article class="project" role="button" tabindex="0" data-project-id="${escapeHtml(p.id)}" aria-label="Open ${escapeHtml(p.title)}">
          <h3>${escapeHtml(p.title)}</h3>
          <div class="meta">
            <span class="pill">${escapeHtml(p.type)} • ${escapeHtml(String(p.year))}</span>
            <span class="pill">${escapeHtml(roles || "—")}</span>
          </div>
          <div class="summary">${escapeHtml(p.problem || "")}</div>
          <div class="summary" style="margin-top:8px;">${impact}</div>
        </article>
      `;
    })
    .join("");

  for (const card of $$("#projectsGrid .project")) {
    const open = () => {
      const id = card.getAttribute("data-project-id");
      if (!id) return;
      window.location.href = `./project.html?id=${encodeURIComponent(id)}`;
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  }
}

async function main() {
  $("#year").textContent = String(new Date().getFullYear());

  try {
    const experienceData = await loadExperience();
    renderExperience(experienceData);
  } catch (err) {
    const ol = $("#experienceTimeline");
    if (ol) {
      ol.innerHTML = `<li class="timeline-item"><div class="timeline-content"><p><strong>Couldn’t load experience.</strong> ${escapeHtml(err?.message || String(err))}</p></div></li>`;
    }
  }

  projects = await loadProjects();
  renderProjects();

  projectFilter.addEventListener("input", renderProjects);

  const controller = createChatController({ projects });
  wireChatUI({ controller });
}

main().catch((err) => {
  projectsGrid.innerHTML = `<div class="card pad" style="grid-column: 1 / -1;">
    <strong>Couldn’t load portfolio data.</strong>
    <div style="margin-top:6px;">${escapeHtml(err?.message || String(err))}</div>
  </div>`;
});

