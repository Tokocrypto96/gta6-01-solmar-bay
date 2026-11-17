// Solmar Bay — save / load. One localStorage key, written on mission events and
// every 15 seconds of play. Nothing leaves the browser.
const SAVE_KEY = 'solmar-bay-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(G) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(G.player.cash),
      health: G.player.health,
      pistol: G.player.pistol,
      missionIndex: G.missions.index,
      missionStep: G.missions.stepIndex,
      missionActive: G.missions.active,
      missionTimer: G.missions.timer,
      missionDone: G.missions.done,
      shells: G.shells.collected,
      totalEarned: G.totalEarned,
      player: {
        x: G.player.inCar ? G.player.inCar.x : G.player.x,
        z: G.player.inCar ? G.player.inCar.z : G.player.z,
      },
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    // A save with a broken player position (NaN, missing) would strand Jay
    // off the map: reject it instead of loading a corrupted game.
    if (!data.player || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.z)) return null;
    if (!Number.isFinite(data.cash) || !Number.isFinite(data.health)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
