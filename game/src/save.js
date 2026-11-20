// Solmar Bay — persistence (v2).
//
// One localStorage key holds the whole run: wallet, health, the pistol,
// where the story stopped (mission AND step, so a resumed job picks up
// mid-stride), the shells already pocketed and the lifetime earnings that
// drive the rank ladder. Nothing is sent anywhere — the save never leaves
// this browser.

const SAVE_KEY = 'solmar-bay-save-v1';

/** True when a save exists (the title screen lights up CONTINUE). */
export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) != null;
  } catch {
    return false; // storage blocked (private mode, sandboxed frame…)
  }
}

/** Snapshot the run. Returns false when storage refused the write. */
export function saveGame(G) {
  try {
    const snapshot = {
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
      // Stand where the car stands when Jay is driving, so a reload never
      // strands him on the far side of the map from his ride.
      player: {
        x: G.player.inCar ? G.player.inCar.x : G.player.x,
        z: G.player.inCar ? G.player.inCar.z : G.player.z,
      },
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the save back, or null when there is none worth trusting. A save
 * with a non-finite wallet or a broken player position is rejected whole:
 * loading half of it would strand Jay off the map with no way back.
 */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    if (!data.player || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.z)) return null;
    if (!Number.isFinite(data.cash) || !Number.isFinite(data.health)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Wipe the save (New Game). */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable — nothing to wipe */
  }
}
