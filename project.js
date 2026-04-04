import { escapeHtml, loadProjects, createChatController, wireChatUI } from "./chat-core.js";
import { initTheme } from "./theme.js";

const $ = (sel) => document.querySelector(sel);

function getProjectIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("id");
}

function renderTags(tags) {
  const list = (tags || []).slice(0, 8);
  if (list.length === 0) return "";
  return list.map((t) => `<span class="tag" aria-hidden="true">${escapeHtml(t)}</span>`).join("");
}

function renderHeroImage(heroImage, title) {
  if (!heroImage || !heroImage.src) return "";
  const alt = heroImage.alt || `${title} cover image`;
  return `
    <figure class="hero-figure">
      <img class="hero-image" src="${escapeHtml(heroImage.src)}" alt="${escapeHtml(alt)}" loading="eager" />
    </figure>
  `;
}

function renderRichText(text) {
  const raw = String(text == null ? "" : text);
  if (!raw.trim()) return "";
  let s = escapeHtml(raw);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, href) => {
    const safeLabel = escapeHtml(label);
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
  });
  s = s.replace(/(^|[\s(])((https?:\/\/)[^\s<]+)(?=$|[\s).,!?])/g, (_m, lead, url) => {
    const safeUrl = escapeHtml(url);
    return `${lead}<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`;
  });
  return s;
}

function renderCaseStudySections(caseStudy) {
  if (!Array.isArray(caseStudy) || caseStudy.length === 0) return "";
  return caseStudy
    .filter((s) => s && (s.title || (Array.isArray(s.paragraphs) && s.paragraphs.length) || (Array.isArray(s.bullets) && s.bullets.length)))
    .map((s) => {
      const titleHtml = s.title ? `<h3>${escapeHtml(s.title)}</h3>` : "";
      const parasHtml = (s.paragraphs || [])
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => `<p>${renderRichText(x)}</p>`)
        .join("");
      const bulletsHtml = (s.bullets || []).length
        ? `<ul class="bullets">${(s.bullets || []).map((x) => `<li>${renderRichText(String(x))}</li>`).join("")}</ul>`
        : "";

      const subsectionsHtml = Array.isArray(s.subsections)
        ? s.subsections
            .filter(
              (sub) =>
                sub &&
                (sub.title || (Array.isArray(sub.paragraphs) && sub.paragraphs.length) || (Array.isArray(sub.bullets) && sub.bullets.length))
            )
            .map((sub) => {
              const subTitleHtml = sub.title ? `<h4>${escapeHtml(sub.title)}</h4>` : "";
              const subParasHtml = (sub.paragraphs || [])
                .filter((x) => typeof x === "string" && x.trim())
                .map((x) => `<p>${renderRichText(x)}</p>`)
                .join("");
              const subBulletsHtml = (sub.bullets || []).length
                ? `<ul class="bullets">${(sub.bullets || []).map((x) => `<li>${renderRichText(String(x))}</li>`).join("")}</ul>`
                : "";
              return `<div class="case-study-subsection">${subTitleHtml}${subParasHtml}${subBulletsHtml}</div>`;
            })
            .join("")
        : "";

      return `<section class="case-study-section">${titleHtml}${parasHtml}${bulletsHtml}${subsectionsHtml}</section>`;
    })
    .join("");
}

function buildFallbackCaseStudy(p) {
  const sections = [];
  if (p.problem) sections.push({ title: "Overview", paragraphs: [p.problem] });
  if (Array.isArray(p.constraints) && p.constraints.length) sections.push({ title: "Constraints", bullets: p.constraints });
  if (Array.isArray(p.process) && p.process.length) sections.push({ title: "Approach", bullets: p.process });
  if (Array.isArray(p.impact) && p.impact.length) sections.push({ title: "Impact", bullets: p.impact });
  return sections;
}

function renderProjectDetails(p) {
  const allArtifacts = p.artifacts || [];
  const imageArtifacts = allArtifacts.filter((a) => a && a.kind === "image" && a.src);
  const videoArtifacts = allArtifacts.filter((a) => a && a.kind === "video" && a.src);
  const otherArtifacts = allArtifacts.filter((a) => !(a && (a.kind === "image" || a.kind === "video") && a.src));

  const urlArtifacts = otherArtifacts.filter((a) => a && a.kind === "url" && a.href);
  const nonUrlArtifacts = otherArtifacts.filter((a) => !(a && a.kind === "url" && a.href));

  const linksHtml = urlArtifacts.length
    ? `
      <div class="artifact-links" aria-label="Project links">
        ${urlArtifacts
          .map((a) => {
            const label = a.label || a.href;
            return `<a class="link-btn" href="${escapeHtml(a.href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
          })
          .join("")}
      </div>
    `
    : "";

  const imagesHtml = imageArtifacts.length
    ? `
      <div class="artifact-gallery" aria-label="Project screenshots">
        ${imageArtifacts
          .map((a) => {
            const alt = a.alt || a.label || "Project screenshot";
            const cap = (a.label || "").trim()
              ? `<figcaption><h4 class="artifact-caption">${escapeHtml(a.label)}</h4></figcaption>`
              : "";
            return `
              <figure class="artifact-figure">
                ${cap}
                <a href="${escapeHtml(a.src)}" target="_blank" rel="noreferrer" class="artifact-media">
                  <img src="${escapeHtml(a.src)}" alt="${escapeHtml(alt)}" loading="lazy" />
                </a>
              </figure>
            `;
          })
          .join("")}
      </div>
    `
    : "";

  const videosHtml = videoArtifacts.length
    ? `
      <div class="artifact-gallery" aria-label="Project videos">
        ${videoArtifacts
          .map((a) => {
            const label = a.label || "Project video";
            const aria = a.alt || label;
            const cap = label.trim()
              ? `<figcaption><h4 class="artifact-caption">${escapeHtml(label)}</h4></figcaption>`
              : "";
            return `
              <figure class="artifact-figure">
                ${cap}
                <a href="${escapeHtml(a.src)}" target="_blank" rel="noreferrer" class="artifact-media artifact-video">
                  <video src="${escapeHtml(a.src)}" aria-label="${escapeHtml(aria)}" muted playsinline preload="metadata"></video>
                  <button class="artifact-play" type="button" aria-label="Play video">▶</button>
                </a>
              </figure>
            `;
          })
          .join("")}
      </div>
    `
    : "";

  const otherHtml = nonUrlArtifacts
    .map((a) => {
      const label = (a?.label || "").trim();
      const valueRaw = String(a?.value ?? "");
      const labelHtml = label ? `<h4 class="artifact-label">${escapeHtml(label)}</h4>` : "";
      const valueHtml = valueRaw.trim() ? `<div class="artifact-value">${escapeHtml(valueRaw)}</div>` : "";
      return `<li class="artifact">${labelHtml}${valueHtml}</li>`;
    })
    .join("");

  const caseStudy = Array.isArray(p.caseStudy) && p.caseStudy.length ? p.caseStudy : buildFallbackCaseStudy(p);
  const caseStudyHtml = renderCaseStudySections(caseStudy);

  return `
    <div class="detail">
      <div class="kvs" role="list" aria-label="Project details">
        <div class="kv-row" role="listitem">
          <h3 class="kv-k">Role</h3>
          <div class="kv-v">${escapeHtml((p.role || []).join(", "))}</div>
        </div>
        <div class="kv-row" role="listitem">
          <h3 class="kv-k">Team</h3>
          <div class="kv-v">${escapeHtml(p.team || "")}</div>
        </div>
        <div class="kv-row" role="listitem">
          <h3 class="kv-k">Summary</h3>
          <div class="kv-v">${escapeHtml(p.problem || "")}</div>
        </div>
        <div class="kv-row" role="listitem">
          <h3 class="kv-k">Skills</h3>
          <div class="kv-v">${escapeHtml((p.skills || []).join(" • "))}</div>
        </div>
        <div class="kv-row" role="listitem">
          <h3 class="kv-k">Tags</h3>
          <div class="kv-v">${escapeHtml((p.tags || []).join(" • "))}</div>
        </div>
      </div>

      ${caseStudyHtml ? `<article class="case-study" aria-label="Case study">${caseStudyHtml}</article>` : ""}

      <div style="margin-top:14px;">
        <strong>Artifacts</strong>
        ${linksHtml}
        ${imagesHtml}
        ${videosHtml}
        ${otherHtml ? `<ul class="artifact-list">${otherHtml}</ul>` : ""}
      </div>
    </div>
  `;
}

async function main() {
  initTheme();
  $("#year").textContent = String(new Date().getFullYear());

  const lightbox = /** @type {HTMLDialogElement|null} */ ($("#lightbox"));
  const lightboxImg = /** @type {HTMLImageElement|null} */ ($("#lightboxImg"));
  const lightboxVideo = /** @type {HTMLVideoElement|null} */ ($("#lightboxVideo"));
  const lightboxCaption = $("#lightboxCaption");
  const lightboxStage = $("#lightboxStage");
  const zoomInBtn = $("#zoomInBtn");
  const zoomOutBtn = $("#zoomOutBtn");
  const zoomResetBtn = $("#zoomResetBtn");

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let drag = null;
  /** @type {HTMLImageElement|HTMLVideoElement|null} */
  let activeMedia = null;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function applyTransform() {
    if (!activeMedia) return;
    activeMedia.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
  function resetView() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }
  function zoomAt(clientX, clientY, nextScale) {
    if (!lightboxStage || !activeMedia) return;
    const rect = lightboxStage.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const s0 = scale;
    const s1 = clamp(nextScale, 1, 6);
    if (s1 === s0) return;
    tx = x - (x - tx) * (s1 / s0);
    ty = y - (y - ty) * (s1 / s0);
    scale = s1;
    applyTransform();
  }

  function openLightbox({ src, alt, caption, autoplay }) {
    if (!lightbox || !lightboxImg) return;
    const isVideo = /\.mp4($|\?)/i.test(src);
    if (lightboxVideo) {
      lightboxVideo.pause?.();
      lightboxVideo.removeAttribute("src");
      lightboxVideo.load?.();
      lightboxVideo.style.display = "none";
      lightboxVideo.style.transform = "";
    }
    lightboxImg.style.display = isVideo ? "none" : "block";
    lightboxImg.src = isVideo ? "" : src;
    lightboxImg.alt = alt || "";
    lightboxImg.style.transform = "";

    if (zoomInBtn instanceof HTMLButtonElement) zoomInBtn.disabled = false;
    if (zoomOutBtn instanceof HTMLButtonElement) zoomOutBtn.disabled = false;
    if (zoomResetBtn instanceof HTMLButtonElement) zoomResetBtn.disabled = false;

    if (isVideo && lightboxVideo) {
      lightboxVideo.src = src;
      lightboxVideo.style.display = "block";
      lightboxVideo.muted = false;
      lightboxVideo.currentTime = 0;
      if (autoplay) Promise.resolve(lightboxVideo.play()).catch(() => {});
      activeMedia = lightboxVideo;
    } else {
      activeMedia = lightboxImg;
    }

    if (lightboxCaption) lightboxCaption.textContent = caption || "";
    resetView();
    lightbox.showModal();
  }

  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      const rect = lightbox.getBoundingClientRect();
      const inDialog = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inDialog) lightbox.close();
    });
  }

  zoomInBtn?.addEventListener("click", () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, scale * 1.25));
  zoomOutBtn?.addEventListener("click", () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, scale / 1.25));
  zoomResetBtn?.addEventListener("click", () => resetView());

  if (lightboxStage) {
    lightboxStage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
        zoomAt(e.clientX, e.clientY, scale * factor);
      },
      { passive: false }
    );
    lightboxStage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (scale === 1) zoomAt(e.clientX, e.clientY, 2.25);
      else resetView();
    });
    lightboxStage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (scale === 1) return;
      drag = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
      lightboxStage.setPointerCapture?.(e.pointerId);
    });
    lightboxStage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      tx = drag.startTx + (e.clientX - drag.startX);
      ty = drag.startTy + (e.clientY - drag.startY);
      applyTransform();
    });
    const endDrag = () => (drag = null);
    lightboxStage.addEventListener("pointerup", endDrag);
    lightboxStage.addEventListener("pointercancel", endDrag);
  }

  const projectId = getProjectIdFromUrl();
  if (!projectId) {
    $("#projectTitle").textContent = "Missing project id";
    $("#projectMeta").textContent = "Open this page with ?id=your-project-id";
    return;
  }

  const projects = await loadProjects();
  const p = projects.find((x) => x.id === projectId);
  if (!p) {
    $("#projectTitle").textContent = "Project not found";
    $("#projectMeta").textContent = `No project with id "${projectId}" in data/projects.json`;
    return;
  }

  document.title = `${p.title} — Portfolio`;
  $("#projectTitle").textContent = p.title;
  $("#projectMeta").textContent = `${p.type} • ${p.year} • ${(p.role || []).join(", ")}`;
  $("#projectProblem").textContent = p.problem || "";
  $("#projectHeroMedia").innerHTML = renderHeroImage(p.heroImage, p.title);
  $("#projectTagRow").innerHTML = renderTags(p.tags);
  $("#projectDetails").innerHTML = renderProjectDetails(p);

  const detailsRoot = $("#projectDetails");
  if (detailsRoot) {
    detailsRoot.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const anchor = t.closest(".artifact-media");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      e.preventDefault();
      const autoplay = Boolean(t.closest(".artifact-play"));
      const captionEl = anchor.closest(".artifact-figure")?.querySelector(".artifact-caption");
      const caption = captionEl ? captionEl.textContent : "";
      const img = anchor.querySelector("img");
      const video = anchor.querySelector("video");
      if (img instanceof HTMLImageElement) {
        openLightbox({ src: img.currentSrc || img.src, alt: img.alt, caption: caption || "", autoplay: false });
      } else if (video instanceof HTMLVideoElement) {
        openLightbox({
          src: video.currentSrc || video.src,
          alt: video.getAttribute("aria-label") || "Project video",
          caption: caption || "",
          autoplay
        });
      }
    });
  }

  const controller = createChatController({ projects, initialContextProjectId: p.id });
  wireChatUI({ controller });
}

main().catch((err) => {
  $("#projectTitle").textContent = "Couldn’t load portfolio data";
  $("#projectMeta").textContent = err?.message || String(err);
});

