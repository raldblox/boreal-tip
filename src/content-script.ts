const STATE = {
  watchSeconds: 0,
  lastTick: 0,
  thresholdSeconds: 300,
  lastPromptAt: 0
};

function now() {
  return Math.floor(Date.now() / 1000);
}

function findVideo() {
  return document.querySelector("video");
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
  maybeNudge();
}

setInterval(tick, 1000);