// ===== Storage Key (stable going forward) =====
const STORAGE_KEY = "progressiveWorkoutState_main";

// Legacy keys we used earlier; we'll try them if main is empty
const LEGACY_KEYS = [
  "progressiveWorkoutState_v1",
  "progressiveWorkoutState_v2",
  "progressiveWorkoutState_v3",
  "progressiveWorkoutState_v4"
];

// ===== ID helper (works even if crypto.randomUUID is missing) =====
function makeId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch (e) {}
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ===== Theme helpers (needed by default state) =====
function getSystemTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

// ===== Default Data =====
const defaultState = () => ({
  settings: {
    startDate: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
    restEveryNDays: 4,
    theme: getSystemTheme(), // "light" | "dark"
    settingsCollapsed: false
  },
  // how many training days completed in current cycle
  trainingDaysCompletedInCycle: 0,
  // which cycle (0-based)
  cycleIndex: 0,
  // last calendar date we marked as completed (yyyy-mm-dd)
  lastCompletedDate: null,
  // streaks
  streakCount: 0,
  bestStreak: 0,
  // per-day progress: remaining sets for each exercise for a given date
  perDayProgress: null,
  exercises: [
    {
      id: makeId(),
      name: "Pushups",
      sets: 3,
      startReps: 10,
      repIncrement: 1,
      maxReps: 40,
    },
    {
      id: makeId(),
      name: "Air Squats",
      sets: 3,
      startReps: 10,
      repIncrement: 1,
      maxReps: 30,
    },
    {
      id: makeId(),
      name: "Leg Lifts",
      sets: 3,
      startReps: 10,
      repIncrement: 1,
      maxReps: 30,
    },
    {
      id: makeId(),
      name: "Crunches",
      sets: 3,
      startReps: 15,
      repIncrement: 1,
      maxReps: 40,
    },
    {
      id: makeId(),
      name: "Pull-Ups",
      sets: 3,
      startReps: 3,
      repIncrement: 1,
      maxReps: 10,
    },
  ],
});

// ===== Helpers =====
function loadState() {
  // Try main key first
  let raw = localStorage.getItem(STORAGE_KEY);

  // If no data yet, try legacy keys
  if (!raw) {
    for (const key of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (legacyRaw) {
        raw = legacyRaw;
        break;
      }
    }
  }

  if (!raw) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(raw);
    const base = defaultState();

    // Merge parsed over defaults
    const merged = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };

    // Ensure required fields exist
    if (!Array.isArray(merged.exercises)) merged.exercises = base.exercises;
    if (!("streakCount" in merged)) merged.streakCount = 0;
    if (!("bestStreak" in merged)) merged.bestStreak = 0;
    if (!("settingsCollapsed" in merged.settings)) merged.settingsCollapsed = false;
    if (!merged.settings.theme) merged.settings.theme = getSystemTheme();

    return merged;
  } catch (e) {
    console.error("Error loading state", e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Date helpers
function todayString() {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor((b - a) / msPerDay);
  return diff;
}

// Exercise helpers
function trainingDaysToMax(ex) {
  if (ex.repIncrement <= 0) return 1;
  const needed = (ex.maxReps - ex.startReps) / ex.repIncrement;
  return Math.ceil(needed) + 1;
}

function cycleLengthInTrainingDays(exercises) {
  if (!exercises.length) return 1;
  return exercises
    .map(trainingDaysToMax)
    .reduce((max, n) => (n > max ? n : max), 1);
}

function repsForExercise(ex, trainingDayIndex) {
  const daysToMax = trainingDaysToMax(ex);
  const effectiveIndex = Math.min(trainingDayIndex, daysToMax);
  const incs = Math.max(effectiveIndex - 1, 0);
  const reps = ex.startReps + ex.repIncrement * incs;
  return Math.min(reps, ex.maxReps);
}

// ===== Theme helpers =====
function getEffectiveTheme() {
  const pref = state.settings.theme || getSystemTheme();
  return pref;
}

function applyTheme() {
  const theme = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", theme);
}

// ===== State =====
let state = loadState();

// ===== DOM Elements =====
const todayDateEl = document.getElementById("today-date");
const dayInfoEl = document.getElementById("day-info");
const cycleInfoEl = document.getElementById("cycle-info");
const streakInfoEl = document.getElementById("streak-info");
const restMessageEl = document.getElementById("rest-message");
const workoutContainerEl = document.getElementById("workout-container");
const exerciseBodyEl = document.getElementById("exercise-body");
const completeBtn = document.getElementById("complete-btn");
const completedMessageEl = document.getElementById("completed-message");

// Settings elements
const restDaysInput = document.getElementById("rest-days-input");
const startDateInput = document.getElementById("start-date-input");
const resetStartBtn = document.getElementById("reset-start-btn");
const settingsExerciseBody = document.getElementById("settings-exercise-body");
const addExerciseBtn = document.getElementById("add-exercise-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const resetCycleBtn = document.getElementById("reset-cycle-btn");
const settingsStatusEl = document.getElementById("settings-status");
const themeSelect = document.getElementById("theme-select");
const settingsBodyEl = document.getElementById("settings-body");
const toggleSettingsBtn = document.getElementById("toggle-settings-btn");

// ===== Core Logic =====
function isRestDayFor(dateStr) {
  const { restEveryNDays, startDate } = state.settings;
  if (!restEveryNDays || restEveryNDays <= 0) return false;

  const daysSinceStart = daysBetween(startDate, dateStr);
  const dayIndex = daysSinceStart + 1; // 1-based
  return dayIndex > 0 && dayIndex % restEveryNDays === 0;
}

function currentTrainingDayIndex() {
  // trainingDaysCompletedInCycle is count of *finished* training days
  return state.trainingDaysCompletedInCycle + 1;
}

function currentRepsMap() {
  const trainingDayIndex = currentTrainingDayIndex();
  const map = {};
  state.exercises.forEach((ex) => {
    map[ex.id] = repsForExercise(ex, trainingDayIndex);
  });
  return map;
}

function cycleCompleted() {
  const cycleLen = cycleLengthInTrainingDays(state.exercises);
  return state.trainingDaysCompletedInCycle >= cycleLen;
}

function updateStreak(prevDate, today) {
  if (!prevDate) {
    state.streakCount = 1;
  } else {
    const diff = daysBetween(prevDate, today);
    if (diff === 1) {
      state.streakCount = (state.streakCount || 0) + 1;
    } else if (diff === 0) {
      // same day; don't change streak here
      state.streakCount = state.streakCount || 1;
    } else {
      state.streakCount = 1;
    }
  }
  if (!state.bestStreak || state.streakCount > state.bestStreak) {
    state.bestStreak = state.streakCount;
  }
}

function markTodayCompleted() {
  const today = todayString();
  if (isRestDayFor(today)) return;

  // Prevent double-completion for same calendar day
  if (state.lastCompletedDate === today) return;

  const prevCompleted = state.lastCompletedDate;

  // Update streak before overwriting lastCompletedDate
  updateStreak(prevCompleted, today);

  state.trainingDaysCompletedInCycle += 1;
  state.lastCompletedDate = today;

  if (cycleCompleted()) {
    state.trainingDaysCompletedInCycle = 0;
    state.cycleIndex += 1;
  }

  saveState();
  render();
}

// ----- Per-day progress helpers -----
function ensurePerDayProgressForToday() {
  const today = todayString();

  if (!state.perDayProgress || state.perDayProgress.date !== today) {
    state.perDayProgress = {
      date: today,
      remainingSets: {},
    };
    state.exercises.forEach((ex) => {
      state.perDayProgress.remainingSets[ex.id] = ex.sets;
    });
    saveState();
    return;
  }

  // keep structure in sync with current exercises
  const existing = state.perDayProgress.remainingSets || {};
  const updated = {};
  state.exercises.forEach((ex) => {
    if (Object.prototype.hasOwnProperty.call(existing, ex.id)) {
      updated[ex.id] = existing[ex.id];
    } else {
      updated[ex.id] = ex.sets;
    }
  });
  state.perDayProgress.remainingSets = updated;
  saveState();
}

// ----- Settings sync helper -----
function syncExercisesFromTableToState() {
  const rows = settingsExerciseBody.querySelectorAll("tr");
  const updatedExercises = [];
  rows.forEach((tr) => {
    const id = tr.dataset.id || makeId();
    const name = tr.querySelector(".ex-name").value.trim() || "Exercise";
    const sets = parseInt(tr.querySelector(".ex-sets").value, 10) || 1;
    const startReps =
      parseInt(tr.querySelector(".ex-start").value, 10) || 1;
    const inc = parseInt(tr.querySelector(".ex-inc").value, 10);
    const maxReps =
      parseInt(tr.querySelector(".ex-max").value, 10) || startReps;

    updatedExercises.push({
      id,
      name,
      sets,
      startReps,
      repIncrement: isNaN(inc) ? 0 : inc,
      maxReps,
    });
  });
  state.exercises = updatedExercises;

  // when settings change, reset per-day sets for today
  state.perDayProgress = {
    date: todayString(),
    remainingSets: {},
  };
  state.exercises.forEach((ex) => {
    state.perDayProgress.remainingSets[ex.id] = ex.sets;
  });
}

// ===== Rendering =====
function renderToday() {
  const today = todayString();
  const date = new Date();
  todayDateEl.textContent = date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  ensurePerDayProgressForToday();

  const isRest = isRestDayFor(today);
  const alreadyCompleted = state.lastCompletedDate === today;

  const cycleLen = cycleLengthInTrainingDays(state.exercises);
  const trainingIndexRaw = currentTrainingDayIndex();
  const displayIndex = alreadyCompleted
    ? state.trainingDaysCompletedInCycle
    : trainingIndexRaw;

  if (isRest) {
    dayInfoEl.textContent = "Rest day (no training today).";
  } else {
    const completedSuffix = alreadyCompleted ? " (completed)" : "";
    dayInfoEl.textContent = `Training day ${displayIndex} of ${cycleLen} in this cycle${completedSuffix}.`;
  }
  cycleInfoEl.textContent = `Cycle #${state.cycleIndex + 1}`;

  // streak info
  if (state.streakCount && state.streakCount > 0) {
    streakInfoEl.textContent = `Streak: ${state.streakCount} day${state.streakCount === 1 ? "" : "s"} · Best: ${state.bestStreak}`;
  } else {
    streakInfoEl.textContent = "";
  }

  if (isRest) {
    restMessageEl.classList.remove("hidden");
    workoutContainerEl.classList.add("hidden");
  } else {
    restMessageEl.classList.add("hidden");
    workoutContainerEl.classList.remove("hidden");

    const repsMap = currentRepsMap();
    const remainingSets =
      (state.perDayProgress && state.perDayProgress.remainingSets) || {};

    exerciseBodyEl.innerHTML = "";
    state.exercises.forEach((ex) => {
      const reps = repsMap[ex.id] ?? ex.startReps;
      const setsLeft =
        typeof remainingSets[ex.id] === "number"
          ? remainingSets[ex.id]
          : ex.sets;

      const tr = document.createElement("tr");
      if (setsLeft <= 0) {
        tr.classList.add("exercise-completed");
      }
      tr.innerHTML = `
        <td>${ex.name}</td>
        <td>${setsLeft}</td>
        <td>${reps}</td>
        <td>
          <button
            class="secondary-btn complete-set-btn"
            data-id="${ex.id}"
            ${setsLeft <= 0 ? "disabled" : ""}
          >
            ✓&nbsp;set
          </button>
        </td>
      `;
      exerciseBodyEl.appendChild(tr);
    });
  }

  completeBtn.disabled = isRest || alreadyCompleted || !state.exercises.length;
  completedMessageEl.classList.toggle("hidden", !alreadyCompleted);
}

function renderSettings() {
  // Settings fields
  restDaysInput.value = state.settings.restEveryNDays ?? 0;
  startDateInput.value = state.settings.startDate;
  themeSelect.value = state.settings.theme || getSystemTheme();

  // Collapsed state
  const collapsed = !!state.settings.settingsCollapsed;
  settingsBodyEl.classList.toggle("hidden", collapsed);
  toggleSettingsBtn.setAttribute("aria-expanded", (!collapsed).toString());
  toggleSettingsBtn.textContent = collapsed ? "Show" : "Hide";

  // Exercises table
  settingsExerciseBody.innerHTML = "";
  state.exercises.forEach((ex) => {
    const tr = document.createElement("tr");
    tr.dataset.id = ex.id;
    tr.innerHTML = `
      <td><input type="text" class="ex-name" value="${ex.name}" /></td>
      <td><input type="number" class="ex-sets" min="1" value="${ex.sets}" /></td>
      <td><input type="number" class="ex-start" min="1" value="${ex.startReps}" /></td>
      <td><input type="number" class="ex-inc" min="0" value="${ex.repIncrement}" /></td>
      <td><input type="number" class="ex-max" min="1" value="${ex.maxReps}" /></td>
      <td><button class="danger-btn ex-delete">✕</button></td>
    `;
    settingsExerciseBody.appendChild(tr);
  });
}

function renderStatus(message, timeoutMs = 2000) {
  settingsStatusEl.textContent = message;
  if (timeoutMs) {
    setTimeout(() => {
      if (settingsStatusEl.textContent === message) {
        settingsStatusEl.textContent = "";
      }
    }, timeoutMs);
  }
}

function render() {
  applyTheme();
  renderToday();
  renderSettings();
}

// ===== Event Listeners =====
completeBtn.addEventListener("click", () => {
  markTodayCompleted();
});

resetStartBtn.addEventListener("click", () => {
  state.settings.startDate = todayString();
  saveState();
  render();
});

addExerciseBtn.addEventListener("click", () => {
  // First sync any unsaved edits from the table into state
  syncExercisesFromTableToState();

  // Then append a new default exercise
  state.exercises.push({
    id: makeId(),
    name: "New Exercise",
    sets: 3,
    startReps: 10,
    repIncrement: 1,
    maxReps: 20,
  });

  saveState();
  render();
});

settingsExerciseBody.addEventListener("click", (e) => {
  if (e.target.classList.contains("ex-delete")) {
    const tr = e.target.closest("tr");
    const id = tr.dataset.id;
    state.exercises = state.exercises.filter((ex) => ex.id !== id);

    // also drop from per-day progress, if present
    if (state.perDayProgress && state.perDayProgress.remainingSets) {
      delete state.perDayProgress.remainingSets[id];
    }

    saveState();
    render();
  }
});

// handle "Complete 1 set" buttons
exerciseBodyEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".complete-set-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!state.perDayProgress || !state.perDayProgress.remainingSets) return;

  const remaining = state.perDayProgress.remainingSets;
  if (typeof remaining[id] !== "number") return;

  if (remaining[id] > 0) {
    remaining[id] -= 1;
    if (remaining[id] < 0) remaining[id] = 0;
  }

  saveState();
  render();

  // check if all sets are now done
  const allZero = state.exercises.every(
    (ex) =>
      (state.perDayProgress.remainingSets[ex.id] ?? 0) <= 0
  );

  if (allZero) {
    markTodayCompleted();
  }
});

saveSettingsBtn.addEventListener("click", () => {
  const restDays = parseInt(restDaysInput.value, 10);
  const startDate = startDateInput.value || todayString();
  state.settings.restEveryNDays = isNaN(restDays) ? 0 : restDays;
  state.settings.startDate = startDate;
  state.settings.theme = themeSelect.value || getSystemTheme();

  // Update exercises from table and reset today's per-day sets
  syncExercisesFromTableToState();

  saveState();
  render();
  renderStatus("Settings saved.");
});

resetCycleBtn.addEventListener("click", () => {
  if (!confirm("Reset cycle back to day 1? This won't delete exercises.")) return;

  state.trainingDaysCompletedInCycle = 0;
  state.cycleIndex = 0;
  state.lastCompletedDate = null;
  state.perDayProgress = null;
  state.streakCount = 0;
  // keep bestStreak as a "high score"

  saveState();
  render();
  renderStatus("Cycle reset.");
});

toggleSettingsBtn.addEventListener("click", () => {
  state.settings.settingsCollapsed = !state.settings.settingsCollapsed;
  saveState();
  render();
});

// ===== Initial Render =====
render();
