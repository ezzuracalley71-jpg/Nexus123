const homeSearch = document.getElementById("home-search");
const addressInput = document.getElementById("address-input");
const tabsStrip = document.getElementById("tabs-strip");
const contentArea = document.getElementById("content-area");
const toastContainer = document.getElementById("toast-container");
const resumeButton = document.getElementById("resume-btn");
const bookmarkIcon = document.getElementById("bookmark-icon");
const loadingIndicator = document.getElementById("loading-indicator");
const settingsMenu = document.getElementById("settings-menu");

let normalTabs = [];
let incognitoTabs = [];
let isIncognito = false;
let activeTabId = null;
let tabCounter = 0;
let serviceWorkerReady = false;
let bookmarks = JSON.parse(localStorage.getItem("cineweb_bookmarks") || "[]");

const defaultWallpaperVideo = document.getElementById("wallpaper-default");
const incognitoWallpaperVideo = document.getElementById("wallpaper-incognito");

const defaultApps = [
  { name: "DuckDuckGo", icon: "D", url: "https://duckduckgo.com" },
  { name: "Wikipedia", icon: "W", url: "https://en.m.wikipedia.org" },
  { name: "VS Code", icon: "</>", url: "https://vscode.dev" },
  { name: "Music", icon: "♪", url: "https://soundcloud.com" },
  { name: "Gaming", icon: "◎", url: "https://poki.com" },
  { name: "Reddit", icon: "R", url: "https://reddit.com" }
];

function currentTabs() {
  return isIncognito ? incognitoTabs : normalTabs;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

async function safePlay(video) {
  if (!video) return;

  try {
    await video.play();
  } catch {}
}

function syncWallpaperPlayback() {
  if (isIncognito) {
    defaultWallpaperVideo?.pause();
    safePlay(incognitoWallpaperVideo);
    return;
  }

  incognitoWallpaperVideo?.pause();
  safePlay(defaultWallpaperVideo);
}

async function ensureServiceWorkerControl() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  await navigator.serviceWorker.register("/scramjet-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  if (navigator.serviceWorker.controller) {
    sessionStorage.removeItem("cineweb-sw-reload");
    serviceWorkerReady = true;
    return;
  }

  if (!sessionStorage.getItem("cineweb-sw-reload")) {
    sessionStorage.setItem("cineweb-sw-reload", "1");
    window.location.reload();
    return new Promise(() => {});
  }

  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", resolve, {
      once: true
    });
  });

  sessionStorage.removeItem("cineweb-sw-reload");
  serviceWorkerReady = true;
}

function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const options = {
    weekday: "long",
    month: "long",
    day: "numeric"
  };

  document.getElementById("clock-time").textContent = timeString;
  document.getElementById("clock-date").textContent = now.toLocaleDateString(
    undefined,
    options
  );
}

function saveSession() {
  if (isIncognito) return;

  localStorage.setItem("cineweb_tabs", JSON.stringify(normalTabs));
  localStorage.setItem("cineweb_active_id", activeTabId || "");
}

function updateResumeButton() {
  const tabs = currentTabs();

  if (tabs.length > 0) {
    resumeButton.classList.add("visible");
    resumeButton.querySelector("span:last-child").textContent = isIncognito
      ? "Return to Incognito"
      : "Return to Session";
    return;
  }

  resumeButton.classList.remove("visible");
}

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return "";

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  if (!value.includes(".")) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  }

  return `https://${value}`;
}

function toEmbedUrl(url) {
  return `/embed.html?url=${encodeURIComponent(url)}`;
}

function setLoading(loading) {
  loadingIndicator.hidden = !loading;
}

function updateBookmarkStatus(url) {
  const isBookmarked = bookmarks.some((entry) => entry.url === url);
  bookmarkIcon.textContent = isBookmarked ? "★" : "☆";
}

function getActiveTab() {
  return currentTabs().find((tab) => tab.id === activeTabId) || null;
}

function renderApps() {
  const grid = document.getElementById("app-grid");
  grid.innerHTML = "";

  defaultApps.forEach((app) => {
    const shortcut = document.createElement("button");
    shortcut.className = "app-shortcut";
    shortcut.type = "button";
    shortcut.innerHTML = `
      <span class="app-icon-box">${app.icon}</span>
      <span class="app-label">${app.name}</span>
    `;
    shortcut.addEventListener("click", () => openBrowser(app.url));
    grid.appendChild(shortcut);
  });
}

function renderBookmarks() {
  const section = document.getElementById("bookmarks-section");
  const title = section.querySelector(".section-title");
  section.innerHTML = "";
  section.appendChild(title);

  if (bookmarks.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "flex";

  bookmarks.forEach((bookmark) => {
    const entry = document.createElement("button");
    entry.className = "app-shortcut";
    entry.type = "button";
    entry.innerHTML = `
      <span class="app-icon-box" style="border-radius: 50%; width: 50px; height: 50px; font-size: 1.1rem;">★</span>
      <span class="app-label">${bookmark.title}</span>
    `;

    entry.addEventListener("click", () => openBrowser(bookmark.url));
    entry.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!confirm(`Delete bookmark "${bookmark.title}"?`)) {
        return;
      }

      bookmarks = bookmarks.filter((item) => item.url !== bookmark.url);
      localStorage.setItem("cineweb_bookmarks", JSON.stringify(bookmarks));
      renderBookmarks();
      updateBookmarkStatus(getActiveTab()?.url || "");
    });

    section.appendChild(entry);
  });
}

function addTabToStrip(id, title) {
  const tab = document.createElement("div");
  tab.className = "tab";
  tab.id = `tab-ui-${id}`;
  tab.innerHTML = `
    <span class="icon">◻</span>
    <span class="tab-text">${title}</span>
    <button class="tab-close" type="button" aria-label="Close tab">×</button>
  `;

  tab.addEventListener("click", (event) => {
    if (event.target.classList.contains("tab-close")) {
      closeTab(id, event);
      return;
    }

    switchTab(id);
  });

  tabsStrip.appendChild(tab);
  tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
}

function bindIframeMessaging(iframe, id) {
  iframe.addEventListener("load", () => {
    const tab = currentTabs().find((entry) => entry.id === id);
    if (!tab) return;

    const tabUi = document.getElementById(`tab-ui-${id}`);
    if (tabUi) {
      tabUi.querySelector(".tab-text").textContent = tab.title || new URL(tab.url).hostname;
    }
  });
}

function createIframe(id, url) {
  const iframe = document.createElement("iframe");
  iframe.id = `frame-${id}`;
  iframe.src = toEmbedUrl(url);
  iframe.dataset.tabId = id;
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
  );
  iframe.setAttribute("allow", "pointer-lock; fullscreen; autoplay");

  bindIframeMessaging(iframe, id);
  contentArea.appendChild(iframe);
}

function switchTab(id) {
  activeTabId = id;
  const tabData = currentTabs().find((tab) => tab.id === id);

  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll("#content-area iframe").forEach((frame) => frame.classList.remove("active"));

  document.getElementById(`tab-ui-${id}`)?.classList.add("active");
  document.getElementById(`frame-${id}`)?.classList.add("active");

  if (tabData) {
    addressInput.value = tabData.url;
    updateBookmarkStatus(tabData.url);
  }

  saveSession();
}

function closeTab(id, event) {
  event.stopPropagation();
  const tabs = currentTabs();
  const index = tabs.findIndex((tab) => tab.id === id);

  if (index === -1) return;

  tabs.splice(index, 1);
  document.getElementById(`tab-ui-${id}`)?.remove();
  document.getElementById(`frame-${id}`)?.remove();

  if (tabs.length === 0) {
    goHome();
  } else {
    const nextTab = tabs[Math.min(index, tabs.length - 1)];
    switchTab(nextTab.id);
  }

  saveSession();
  updateResumeButton();
}

function createNewTab(url = "https://duckduckgo.com") {
  const tabs = currentTabs();
  tabCounter += 1;
  const id = `tab-${tabCounter}`;
  const title = new URL(url).hostname.replace(/^www\./, "");

  tabs.push({ id, url, title, ready: false });
  addTabToStrip(id, title);
  createIframe(id, url);
  switchTab(id);
  updateResumeButton();
}

function loadSession() {
  const savedTabs = JSON.parse(localStorage.getItem("cineweb_tabs") || "[]");
  const savedActiveId = localStorage.getItem("cineweb_active_id");

  if (savedTabs.length === 0) {
    updateResumeButton();
    return;
  }

  normalTabs = savedTabs.map((tab) => ({ ...tab, ready: false }));

  savedTabs.forEach((tab) => {
    const numericId = Number.parseInt(tab.id.replace("tab-", ""), 10);
    if (numericId > tabCounter) {
      tabCounter = numericId;
    }

    addTabToStrip(tab.id, tab.title || new URL(tab.url).hostname);
    createIframe(tab.id, tab.url);
  });

  if (savedActiveId && normalTabs.some((tab) => tab.id === savedActiveId)) {
    switchTab(savedActiveId);
  } else {
    switchTab(normalTabs[normalTabs.length - 1].id);
  }

  updateResumeButton();
}

function openBrowser(url) {
  document.body.classList.add("browser-active");
  createNewTab(url);
}

function resumeSession() {
  if (currentTabs().length === 0) return;
  document.body.classList.add("browser-active");
}

function goHome() {
  document.body.classList.remove("browser-active");
  closeMenu();
  updateResumeButton();
}

function sendFrameCommand(type, extra = {}) {
  const iframe = document.getElementById(`frame-${activeTabId}`);
  if (!iframe?.contentWindow) return;

  iframe.contentWindow.postMessage({ type, ...extra }, window.location.origin);
}

function reloadTab() {
  const tab = getActiveTab();
  if (!tab) return;

  sendFrameCommand("reload");
  showToast("Reloading...");
}

function handleSearch(rawValue) {
  const url = normalizeUrl(rawValue);
  if (!url) return;

  if (document.body.classList.contains("browser-active")) {
    const tab = getActiveTab();
    if (!tab) {
      createNewTab(url);
      return;
    }

    tab.url = url;
    tab.title = "Loading...";
    addressInput.value = url;
    updateBookmarkStatus(url);

    const tabUi = document.getElementById(`tab-ui-${tab.id}`);
    tabUi?.querySelector(".tab-text").replaceChildren("Loading...");
    const iframe = document.getElementById(`frame-${tab.id}`);
    if (tab.ready && iframe?.contentWindow) {
      sendFrameCommand("navigate", { url });
    } else if (iframe) {
      iframe.src = toEmbedUrl(url);
    }
    saveSession();
    return;
  }

  openBrowser(url);
}

function toggleBookmark() {
  const tab = getActiveTab();
  if (!tab) return;

  const existingIndex = bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
  if (existingIndex > -1) {
    bookmarks.splice(existingIndex, 1);
    localStorage.setItem("cineweb_bookmarks", JSON.stringify(bookmarks));
    renderBookmarks();
    updateBookmarkStatus(tab.url);
    showToast("Bookmark Removed");
    return;
  }

  const defaultName = new URL(tab.url).hostname.replace(/^www\./, "");
  const name = prompt("Bookmark Name:", defaultName);
  if (!name) return;

  bookmarks.push({ title: name, url: tab.url });
  localStorage.setItem("cineweb_bookmarks", JSON.stringify(bookmarks));
  renderBookmarks();
  updateBookmarkStatus(tab.url);
  showToast("Bookmark Added");
}

function closeAllTabs() {
  currentTabs().length = 0;
  tabsStrip.innerHTML = "";
  contentArea.innerHTML = "";
  activeTabId = null;
  saveSession();
  goHome();
  updateResumeButton();
  showToast("Session Cleared");
}

function toggleIncognito() {
  tabsStrip.innerHTML = "";
  contentArea.innerHTML = "";

  isIncognito = !isIncognito;
  document.body.classList.toggle("incognito-mode");
  syncWallpaperPlayback();

  const targetTabs = currentTabs();
  if (targetTabs.length > 0) {
    targetTabs.forEach((tab) => {
      addTabToStrip(tab.id, tab.title || "Loaded");
      createIframe(tab.id, tab.url);
    });

    switchTab(targetTabs[targetTabs.length - 1].id);
  } else {
    createNewTab();
  }

  updateResumeButton();
  showToast(isIncognito ? "Incognito Mode Active" : "Standard Mode Active");
}

function toggleMenu(event) {
  if (event) {
    event.stopPropagation();
  }

  settingsMenu.classList.toggle("open");
}

function closeMenu() {
  settingsMenu.classList.remove("open");
}

window.resumeSession = resumeSession;
window.goHome = goHome;
window.toggleIncognito = toggleIncognito;
window.toggleBookmark = toggleBookmark;
window.closeAllTabs = closeAllTabs;
window.toggleMenu = toggleMenu;
window.createNewTab = createNewTab;

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (!event.data || typeof event.data !== "object") return;

  const frame = Array.from(document.querySelectorAll("#content-area iframe")).find(
    (candidate) => candidate.contentWindow === event.source
  );

  if (!frame) return;

  const tabId = frame.dataset.tabId;
  const tab = normalTabs.find((entry) => entry.id === tabId) || incognitoTabs.find((entry) => entry.id === tabId);
  if (!tab) return;

  if (event.data.type === "embed-ready") {
    tab.ready = true;
    return;
  }

  if (event.data.type === "embed-state") {
    if (typeof event.data.url === "string" && event.data.url) {
      tab.url = event.data.url;
      if (activeTabId === tab.id) {
        addressInput.value = tab.url;
        updateBookmarkStatus(tab.url);
      }
    }

    if (typeof event.data.title === "string" && event.data.title) {
      tab.title = event.data.title;
      const tabUi = document.getElementById(`tab-ui-${tab.id}`);
      tabUi?.querySelector(".tab-text").replaceChildren(event.data.title);
    }

    saveSession();
  }
});

document.getElementById("new-tab-btn").addEventListener("click", () => createNewTab());
document.getElementById("menu-btn").addEventListener("click", toggleMenu);
document.getElementById("minimize-btn").addEventListener("click", () => {
  goHome();
  closeMenu();
});
document.getElementById("switch-mode-btn").addEventListener("click", () => {
  toggleIncognito();
  closeMenu();
});
document.getElementById("clear-session-btn").addEventListener("click", () => {
  closeAllTabs();
  closeMenu();
});
document.getElementById("home-brand").addEventListener("click", goHome);
document.getElementById("home-brand").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    goHome();
  }
});
document.getElementById("back-btn").addEventListener("click", () => sendFrameCommand("back"));
document.getElementById("forward-btn").addEventListener("click", () => sendFrameCommand("forward"));
document.getElementById("reload-btn").addEventListener("click", reloadTab);
document.getElementById("bookmark-btn").addEventListener("click", toggleBookmark);
document.getElementById("incognito-toggle").addEventListener("click", toggleIncognito);
resumeButton.addEventListener("click", resumeSession);

homeSearch.addEventListener("keypress", (event) => {
  if (event.key !== "Enter") return;
  handleSearch(homeSearch.value);
  homeSearch.value = "";
});

addressInput.addEventListener("keypress", (event) => {
  if (event.key !== "Enter") return;
  handleSearch(addressInput.value);
  addressInput.blur();
});

addressInput.addEventListener("focus", () => {
  addressInput.select();
});

document.addEventListener("click", (event) => {
  const menuButton = document.getElementById("menu-btn");
  if (!settingsMenu.contains(event.target) && !menuButton.contains(event.target)) {
    closeMenu();
  }
});

window.addEventListener("load", async () => {
  try {
    setLoading(true);
    await ensureServiceWorkerControl();
    serviceWorkerReady = true;
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : "Service worker failed");
  } finally {
    setLoading(false);
  }

  renderApps();
  renderBookmarks();
  updateClock();
  setInterval(updateClock, 1000);
  loadSession();
  syncWallpaperPlayback();
});
