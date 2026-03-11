c
function readWalletAddressFromModal() {
  const valueEl = document.querySelector<HTMLElement>("#js-wallet-address__value");
  const addressText = normalizeText(valueEl?.textContent);
  const match = addressText.match(/0x[a-fA-F0-9]{40}/);
  return match?.[0] || "";
}

async function waitFor(fn: () => boolean, timeoutMs: number, stepMs = 150) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}onst DEBUG = true;
const STATE = {
  watchSeconds: 0,
  lastTick: 0,
  thresholdSeconds: 300,
  lastPromptAt: 0,
  currentVideoId: "",
  currentCreatorId: "",
  pendingSave: false,
  paymentAttempted: false
};

type Creator = {
  creatorId: string;
  displayName: string;
  url?: string;
  avatarUrl?: string;
  paymentUrl?: string;
  walletAddress?: string;
  walletUpdatedAt?: number;
  platform: "rumble";
};

type Video = {
  videoId: string;
  title: string;
  url: string;
  creatorId: string;
};

type Ledger = {
  creators: Record<string, Creator>;
  videos: Record<string, Video>;
  creatorTotals: Record<string, number>;
  videoTotals: Record<string, number>;
  lastUpdatedAt: number;
};

declare const chrome: any;

const LEDGER_KEY = "borealLedger";
let ledgerCache: Ledger | null = null;
let lastPageKey = "";
const walletAttemptedAt: Record<string, number> = {};
const WALLET_RETRY_SECONDS = 600;

function log(...args: any[]) {
  if (!DEBUG) return;
  console.log("[BorealTip]", ...args);
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function findVideo() {
  return document.querySelector("video");
}

function normalizeText(value?: string | null) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonLdObjects() {
  const nodes = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  const results: any[] = [];
  for (const node of nodes) {
    const raw = node.textContent?.trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;
    if (Array.isArray(parsed)) {
      results.push(...parsed);
    } else if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
      results.push(...parsed["@graph"]);
    } else {
      results.push(parsed);
    }
  }
  return results;
}

function findVideoObject() {
  const objects = extractJsonLdObjects();
  return objects.find((obj) => {
    const type = obj?.["@type"];
    if (!type) return false;
    if (Array.isArray(type)) return type.includes("VideoObject");
    return type === "VideoObject";
  });
}

function selectText(selectors: string[]) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return normalizeText(el.textContent);
  }
  return "";
}

function selectTextWithin(root: Element | null, selectors: string[]) {
  if (!root) return "";
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return normalizeText(el.textContent);
  }
  return "";
}

function selectAttrWithin(root: Element | null, selectors: string[], attr: string) {
  if (!root) return "";
  for (const selector of selectors) {
    const el = root.querySelector(selector) as HTMLElement | null;
    if (!el) continue;
    const val = el.getAttribute(attr);
    if (val) return val;
  }
  return "";
}

function selectAttr(selectors: string[], attr: string) {
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) continue;
    const val = el.getAttribute(attr);
    if (val) return val;
  }
  return "";
}

function getCanonicalUrl() {
  const link = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
  if (link?.href) return link.href;
  return window.location.href.split("?")[0];
}

function parseCreatorIdFromUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path) return "";
    const parts = path.split("/").filter(Boolean);
    return parts.slice(0, 2).join("/");
  } catch {
    return "";
  }
}

function getCreatorMeta(): Creator | null {
  const videoObject = findVideoObject();
  const author = videoObject?.author || videoObject?.creator || videoObject?.publisher;
  const authorObj = Array.isArray(author) ? author[0] : author;
  const authorName = normalizeText(authorObj?.name);
  const authorUrl = typeof authorObj?.url === "string" ? authorObj.url : "";
  const ogDescription = normalizeText(
    (document.querySelector("meta[property='og:description']") as HTMLMetaElement | null)?.content
  );
  const byMatch = ogDescription.match(/\bby\s+([^|–-]+)/i);
  const ogByName = byMatch ? normalizeText(byMatch[1]) : "";

  const mainRoot =
    document.querySelector("main") ||
    document.querySelector("[data-js='portal']") ||
    document.body;

  const scopedName = selectTextWithin(mainRoot, [
    ".channel__name",
    ".channel__title",
    "[data-channel-name]",
    "a[href*='/c/'] .channel__name",
    "a[href*='/user/'] .channel__name"
  ]);

  const displayName =
    authorName ||
    scopedName ||
    ogByName ||
    normalizeText(
      (document.querySelector("meta[name='author']") as HTMLMetaElement | null)?.content
    );

  const channelLink =
    authorUrl ||
    selectAttrWithin(mainRoot, ["a[href^='/c/']", "a[href^='/user/']", "a[href*='/channel/']"], "href") ||
    "";

  const avatarUrl =
    selectAttr([".channel__image", ".channel__avatar img", "img.channel__image"], "src") || "";

  const creatorIdFromLink = channelLink ? parseCreatorIdFromUrl(new URL(channelLink, location.origin).href) : "";
  const creatorId = creatorIdFromLink || normalizeText(displayName).toLowerCase().replace(/\s+/g, "-");
  const creatorUrl = channelLink ? new URL(channelLink, location.origin).href : authorUrl || "";
  const paymentUrl = extractPaymentUrl();

  if (!creatorId) return null;

  return {
    creatorId,
    displayName: displayName || creatorId,
    url: creatorUrl || undefined,
    avatarUrl: avatarUrl || undefined,
    paymentUrl: paymentUrl || undefined,
    platform: "rumble"
  };
}

function getVideoMeta(creatorId: string): Video | null {
  const videoObject = findVideoObject();
  const jsonTitle = normalizeText(videoObject?.name);
  const jsonUrl = typeof videoObject?.url === "string" ? videoObject.url : "";

  const title =
    selectText(["h1", ".video__title", ".media__title", "[data-video-title]"]) ||
    jsonTitle ||
    normalizeText(
      (document.querySelector("meta[property='og:title']") as HTMLMetaElement | null)?.content
    );

  const url = jsonUrl || getCanonicalUrl();
  const videoId = url ? new URL(url).pathname.replace(/\/+$/, "") || url : url;

  if (!videoId) return null;

  return {
    videoId,
    title: title || "Untitled",
    url,
    creatorId
  };
}

async function loadLedger(): Promise<Ledger> {
  if (ledgerCache) return ledgerCache;
  const data = await chrome.storage.local.get(LEDGER_KEY);
  ledgerCache =
    data?.[LEDGER_KEY] ?? {
      creators: {},
      videos: {},
      creatorTotals: {},
      videoTotals: {},
      lastUpdatedAt: 0
    };
  return ledgerCache;
}

async function saveLedger(ledger: Ledger) {
  ledger.lastUpdatedAt = now();
  await chrome.storage.local.set({ [LEDGER_KEY]: ledger });
}

function scheduleSave() {
  if (STATE.pendingSave) return;
  STATE.pendingSave = true;
  setTimeout(async () => {
    STATE.pendingSave = false;
    if (!ledgerCache) return;
    await saveLedger(ledgerCache);
  }, 5000);
}

async function recordWatch(deltaSeconds: number) {
  const creator = getCreatorMeta();
  if (!creator) return;

  const video = getVideoMeta(creator.creatorId);
  if (!video) return;

  const ledger = await loadLedger();
  const existingCreator = ledger.creators[creator.creatorId];
  ledger.creators[creator.creatorId] = {
    ...existingCreator,
    ...creator
  };
  ledger.videos[video.videoId] = video;

  ledger.creatorTotals[creator.creatorId] =
    (ledger.creatorTotals[creator.creatorId] ?? 0) + deltaSeconds;
  ledger.videoTotals[video.videoId] = (ledger.videoTotals[video.videoId] ?? 0) + deltaSeconds;

  STATE.currentCreatorId = creator.creatorId;
  STATE.currentVideoId = video.videoId;
  scheduleSave();
}

function extractPaymentUrl() {
  const tipButton = document.querySelector<HTMLButtonElement>(
    "button[hx-get='/-htmx/wallet/payment/qr-address']"
  );
  const raw = tipButton?.getAttribute("hx-vals");
  if (!raw) return "";
  const json = raw.replace(/&quot;/g, "\"");
  const data = safeJsonParse(json);
  if (data?.payment_url && typeof data.payment_url === "string") return data.payment_url;
  return "";
}

function findTipButton() {
  const direct = document.querySelector<HTMLButtonElement>(
    "button[data-js='modal__open__rumble_wallet'], button[data-js='tip__button'], button[hx-get='/-htmx/wallet/payment/qr-modal']"
  );
  if (direct) return direct;

  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of candidates) {
    const text = normalizeText(btn.textContent);
    const hx = btn.getAttribute("hx-get");
    if (hx === "/-htmx/wallet/payment/qr-modal") return btn;
    if (text === "Tip") return btn;
  }
  return null;
}

function openTipModalSilently() {
  const btn = findTipButton();
  if (btn) {
    log("Click tip button");
    btn.click();
  } else {
    log("Tip button not found");
  }
}

function findTipModalRoot() {
  return document.querySelector<HTMLElement>(".js-modal-rumble-wallet-qr, [data-js='modal__content']");
}

function findAnotherWalletButton() {
  return document.querySelector<HTMLButtonElement>(
    "button[hx-get='/-htmx/wallet/payment/qr-address']"
  );
}

function findPolygonButton() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[hx-get='/-htmx/wallet/payment/qr-address']")
  );
  for (const btn of buttons) {
    const raw = btn.getAttribute("hx-vals");
    if (!raw) continue;
    const json = raw.replace(/&quot;/g, "\"");
    const data = safeJsonParse(json);
    const currency = typeof data?.currency === "string" ? data.currency.toLowerCase() : "";
    if (
      data?.action === "address-qr" &&
      data?.blockchain === "polygon" &&
      (currency.includes("usdt") || currency.includes("usd"))
    ) {
      return btn;
    }
  }
  return null;
}
function closeTipModalSilently() {
  const closeBtn = document.querySelector<HTMLButtonElement>("button[data-js='modal__close']");
  if (closeBtn) {
    log("Close tip modal");
    closeBtn.click();
  }
}

async function resolvePaymentUrlViaModal() {
  if (STATE.paymentAttempted) return extractPaymentUrl();
  STATE.paymentAttempted = true;

  openTipModalSilently();

  const start = Date.now();
  while (Date.now() - start < 3000) {
    const url = extractPaymentUrl();
    if (url) {
      closeTipModalSilently();
      return url;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  closeTipModalSilently();
  return "";
}

async function resolveWalletAddressViaModalFlow() {
  if (STATE.paymentAttempted) return "";
  STATE.paymentAttempted = true;

  openTipModalSilently();

  const modalReady = await waitFor(() => !!findTipModalRoot(), 5000, 120);
  log("Tip modal root", modalReady);
  if (!modalReady) {
    closeTipModalSilently();
    return "";
  }

  const another = findAnotherWalletButton();
  if (another) {
    log("Click 'Tip with another crypto wallet'");
    another.click();
  } else {
    log("'Tip with another crypto wallet' button not found");
  }

  const buttonsReady = await waitFor(
    () => !!findPolygonButton() || !!readWalletAddressFromModal(),
    6000,
    150
  );
  log("Network buttons ready", buttonsReady);

  const start2 = Date.now();
  while (Date.now() - start2 < 8000) {
    const polygonBtn = findPolygonButton();
    if (polygonBtn) {
      log("Polygon button found");
      const raw = polygonBtn.getAttribute("hx-vals");
      if (raw) {
        const json = raw.replace(/&quot;/g, "\"");
        const data = safeJsonParse(json);
        const address = typeof data?.address === "string" ? data.address : "";
        if (address) {
          log("Polygon address from button", address);
          closeTipModalSilently();
          return address;
        }
      }
      polygonBtn.click();
      log("Click polygon button");
    }
    const modalAddress = readWalletAddressFromModal();
    if (modalAddress) {
      log("Wallet address from modal", modalAddress);
      closeTipModalSilently();
      return modalAddress;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  closeTipModalSilently();
  return "";
}
async function tryFetchWalletAddress(retry = 0) {
  log("Attempt wallet fetch");
  let paymentUrl = extractPaymentUrl();
  if (!paymentUrl) {
    paymentUrl = await resolvePaymentUrlViaModal();
  }
  if (!paymentUrl) {
    if (retry < 3) {
      log("No payment URL yet, retrying soon");
      setTimeout(() => void tryFetchWalletAddress(retry + 1), 3000);
    }
    return;
  }

  const creator = getCreatorMeta();
  if (!creator) return;
  const lastAttempt = walletAttemptedAt[creator.creatorId] ?? 0;
  const nowTs = now();
  if (nowTs - lastAttempt < WALLET_RETRY_SECONDS) return;
  walletAttemptedAt[creator.creatorId] = nowTs;

  let finalAddress = await resolveWalletAddressViaModalFlow();
  if (!finalAddress) {
    log("Modal flow did not return address");
    return;
  }

  log("Resolved wallet address", finalAddress);
  const ledger = await loadLedger();
  const existing = ledger.creators[creator.creatorId];
  ledger.creators[creator.creatorId] = {
    ...existing,
    ...creator,
    walletAddress: finalAddress,
    walletUpdatedAt: nowTs,
    paymentUrl
  };
  scheduleSave();
}

function updateContextIfChanged() {
  const video = getVideoMeta(STATE.currentCreatorId || "");
  const key = `${location.pathname}|${video?.videoId ?? ""}`;
  if (key === lastPageKey) return;
  lastPageKey = key;
  STATE.lastTick = now();
  STATE.watchSeconds = 0;
  STATE.currentVideoId = video?.videoId ?? "";
  STATE.paymentAttempted = false;
  void tryFetchWalletAddress();
}

function ensureNudgeContainer() {
  let el = document.getElementById("boreal-tip-nudge");
  if (el) return el;

  el = document.createElement("div");
  el.id = "boreal-tip-nudge";
  el.style.position = "fixed";
  el.style.right = "16px";
  el.style.bottom = "16px";
  el.style.zIndex = "999999";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.color = "#fff";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "10px";
  el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  el.style.fontSize = "13px";
  el.style.boxShadow = "0 6px 24px rgba(0,0,0,0.35)";
  el.style.display = "none";

  const text = document.createElement("div");
  text.id = "boreal-tip-nudge-text";
  text.textContent = "Enjoyed this content? Tip now.";

  const actions = document.createElement("div");
  actions.style.marginTop = "8px";
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const yes = document.createElement("button");
  yes.textContent = "Tip";
  yes.style.cursor = "pointer";
  yes.style.border = "0";
  yes.style.padding = "6px 10px";
  yes.style.borderRadius = "8px";
  yes.style.background = "#e6d27a";
  yes.style.color = "#000";

  const no = document.createElement("button");
  no.textContent = "Not now";
  no.style.cursor = "pointer";
  no.style.border = "0";
  no.style.padding = "6px 10px";
  no.style.borderRadius = "8px";
  no.style.background = "#444";
  no.style.color = "#fff";

  actions.appendChild(yes);
  actions.appendChild(no);
  el.appendChild(text);
  el.appendChild(actions);

  document.body.appendChild(el);

  yes.addEventListener("click", () => {
    el.style.display = "none";
    openTipModal();
  });

  no.addEventListener("click", () => {
    el.style.display = "none";
  });

  return el;
}

function openTipModal() {
  const btn = document.querySelector("button[data-js='modal__open__rumble_wallet']") as HTMLButtonElement | null;
  if (btn) {
    btn.click();
    return;
  }

  const fallback = document.querySelector("button[data-js='tip__button']") as HTMLButtonElement | null;
  if (fallback) fallback.click();
}

function maybeNudge() {
  const t = now();
  if (STATE.watchSeconds < STATE.thresholdSeconds) return;
  if (t - STATE.lastPromptAt < 600) return;

  STATE.lastPromptAt = t;
  const el = ensureNudgeContainer();
  el.style.display = "block";
}

function tick() {
  updateContextIfChanged();
  const video = findVideo();
  if (!video || video.paused || video.ended) {
    STATE.lastTick = now();
    return;
  }

  const t = now();
  if (STATE.lastTick === 0) STATE.lastTick = t;
  const delta = Math.max(0, t - STATE.lastTick);
  STATE.lastTick = t;

  STATE.watchSeconds += delta;
  void recordWatch(delta);
  if (STATE.currentCreatorId) {
    const lastAttempt = walletAttemptedAt[STATE.currentCreatorId] ?? 0;
    if (now() - lastAttempt > WALLET_RETRY_SECONDS) {
      void tryFetchWalletAddress();
    }
  }
  maybeNudge();
}

setInterval(tick, 1000);

window.addEventListener("popstate", () => updateContextIfChanged());

const originalPushState = history.pushState;
history.pushState = function (...args) {
  const result = originalPushState.apply(this, args as any);
  updateContextIfChanged();
  return result;
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  const result = originalReplaceState.apply(this, args as any);
  updateContextIfChanged();
  return result;
};

const observer = new MutationObserver(() => updateContextIfChanged());
observer.observe(document.documentElement, { childList: true, subtree: true });
