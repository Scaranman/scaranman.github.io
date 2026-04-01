const STORAGE_KEY = "portfolio-theme";

function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}

  const prefersLight =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;

  const logoSrc = t === "light" ? "./assets/logo.png" : "./assets/inverse-logo.png";
  for (const img of Array.from(document.querySelectorAll("img.brand-mark"))) {
    img.setAttribute("src", logoSrc);
  }

  const btn = document.getElementById("themeToggle");
  if (btn) {
    const isDark = t === "dark";
    btn.setAttribute("aria-checked", isDark ? "true" : "false");
    const label = btn.querySelector(".theme-toggle-label");
    if (label) label.textContent = isDark ? "Dark" : "Light";
  }
}

function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  applyTheme(t);
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {}
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  setTheme(current === "light" ? "dark" : "light");
}

export function initTheme() {
  applyTheme(getPreferredTheme());

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", toggleTheme);
    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleTheme();
      }
    });
  }
}

