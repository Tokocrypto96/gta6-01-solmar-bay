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
