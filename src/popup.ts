const LEDGER_KEY = "borealLedger";

type Creator = {
  creatorId: string;
  displayName: string;
  avatarUrl?: string;
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

function secondsToMinutes(sec: number) {
  if (!sec || sec < 60) return "<1m";
  const minutes = Math.round(sec / 60);
  return `${minutes}m`;
}

function sortBySeconds<T extends { id: string; seconds: number }>(items: T[]) {
  return items.sort((a, b) => b.seconds - a.seconds);
}

async function loadLedger(): Promise<Ledger | null> {
  const data = await chrome.storage.local.get(LEDGER_KEY);
  return data?.[LEDGER_KEY] ?? null;
}

function renderRow(name: string, value: string, link?: string) {
  const row = document.createElement("div");
  row.className = "row";

  const title = document.createElement(link ? "a" : "div");
  title.className = "row-title";
  title.textContent = name;
  if (link) {
    (title as HTMLAnchorElement).href = link;
    (title as HTMLAnchorElement).target = "_blank";
    (title as HTMLAnchorElement).rel = "noreferrer";
  }

  const val = document.createElement("div");
  val.className = "row-value";
  val.textContent = value;

  row.appendChild(title);
  row.appendChild(val);
  return row;
}

async function render() {
  const ledger = await loadLedger();
  const creatorList = document.getElementById("creator-list") as HTMLDivElement;
  const videoList = document.getElementById("video-list") as HTMLDivElement;
  const todayTotal = document.getElementById("today-total") as HTMLDivElement;
  const todayCreators = document.getElementById("today-creators") as HTMLDivElement;

  creatorList.innerHTML = "";
  videoList.innerHTML = "";

  if (!ledger) {
    todayTotal.textContent = "0m";
    todayCreators.textContent = "No data yet";
    return;
  }

  const creatorItems = Object.entries(ledger.creatorTotals).map(([id, seconds]) => ({
    id,
    seconds
  }));

  const videoItems = Object.entries(ledger.videoTotals).map(([id, seconds]) => ({
    id,
    seconds
  }));

  const totalSeconds = creatorItems.reduce((sum, item) => sum + item.seconds, 0);
  todayTotal.textContent = secondsToMinutes(totalSeconds);
  todayCreators.textContent = `${creatorItems.length} creators tracked`;

  sortBySeconds(creatorItems)
    .slice(0, 6)
    .forEach((item) => {
      const creator = ledger.creators[item.id];
      creatorList.appendChild(
        renderRow(
          creator?.displayName ?? item.id,
          secondsToMinutes(item.seconds),
          creator?.url
        )
      );
    });

  sortBySeconds(videoItems)
    .slice(0, 6)
    .forEach((item) => {
      const video = ledger.videos[item.id];
      videoList.appendChild(
        renderRow(video?.title ?? item.id, secondsToMinutes(item.seconds), video?.url)
      );
    });
}

function exportJson(ledger: Ledger) {
  const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boreal-ledger.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(ledger: Ledger) {
  const rows = [["type", "id", "name", "seconds"]];

  for (const [id, seconds] of Object.entries(ledger.creatorTotals)) {
    const creator = ledger.creators[id];
    rows.push(["creator", id, creator?.displayName ?? id, seconds.toString()]);
  }

  for (const [id, seconds] of Object.entries(ledger.videoTotals)) {
    const video = ledger.videos[id];
    rows.push(["video", id, video?.title ?? id, seconds.toString()]);
  }

  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boreal-ledger.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function setupExportButtons() {
  const ledger = await loadLedger();
  const jsonBtn = document.getElementById("export-json") as HTMLButtonElement;
  const csvBtn = document.getElementById("export-csv") as HTMLButtonElement;

  jsonBtn.addEventListener("click", () => {
    if (ledger) exportJson(ledger);
  });

  csvBtn.addEventListener("click", () => {
    if (ledger) exportCsv(ledger);
  });
}

render();
setupExportButtons();
