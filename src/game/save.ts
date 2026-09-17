const KEY = "novye-ludi-sprint-v1";
const SAVE_VERSION = 1;

export type SaveData = {
  version: number;
  highScore: number;
  muted: boolean;
};

const defaults: SaveData = {
  version: SAVE_VERSION,
  highScore: 0,
  muted: false,
};

function migrate(raw: SaveData): SaveData {
  const next = { ...defaults, ...raw, version: SAVE_VERSION };
  if (!Number.isFinite(next.highScore) || next.highScore < 0) next.highScore = 0;
  next.muted = Boolean(next.muted);
  return next;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as SaveData;
    return migrate(parsed);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}
