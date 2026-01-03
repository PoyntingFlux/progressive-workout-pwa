// ===== Storage Key (stable going forward) =====
const STORAGE_KEY = "progressiveWorkoutState_main";

// Legacy keys we used earlier; we'll try them if main is empty
const LEGACY_KEYS = [
  "progressiveWorkoutState_v1",
  "progressiveWorkoutState_v2",
  "progressiveWorkoutState_v3",
  "progressiveWorkoutState_v4"
];


// ===== Local date helpers (avoid UTC rollover issues on iOS) =====
function localYMD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMDLocal(dateStr) {
  // Expects yyyy-mm-dd
  const parts = String(dateStr || "").split("-").map((v) => parseInt(v, 10));
  const y = parts[0] || 1970;
  const m = parts[1] || 1;
  const d = parts[2] || 1;
  return new Date(y, m - 1, d);
}
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
    startDate: localYMD(), // yyyy-mm-dd
    restEveryNDays: 4,
    theme: getSystemTheme(), // "light" | "dark"
    settingsCollapsed: false
  },
  // how many training days completed in current cycle
  trainingDaysCompletedInCycle: 0,
  // which cycle (0-based)
  cycleIndex: 0,
  // last calendar date we marked as completed (yyyy-mm-dd, workout days only)
  lastCompletedDate: null,
  // last calendar date we updated the streak counter (can be workout or rest)
  lastStreakDate: null,
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
    if (!("lastStreakDate" in merged)) {
      merged.lastStreakDate = merged.lastCompletedDate || null;
    }

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
  // FIXED: Use LOCAL date (avoid UTC rollover issues at 7PM CST)
  return localYMD();
}

function daysBetween(dateStrA, dateStrB) {
  const a = parseYMDLocal(dateStrA);
  const b = parseYMDLocal(dateStrB);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((b - a) / msPerDay);
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

// Ensure auto-tune state exists (for older saved data too)
if (!state.autoTune) {
  state.autoTune = {
    pending: false,
    completedCycleIndex: null,
    snapshotExercises: [],
    reviews: {}
  };
}


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
const updateAppBtn = document.getElementById("update-app-btn");
const clearCacheBtn = document.getElementById("clear-cache-btn");

// Auto-tune review elements
const autoTuneSectionEl = document.getElementById("auto-tune-section");
const autoTuneBodyEl = document.getElementById("auto-tune-body");
const autoTuneCycleLabelEl = document.getElementById("auto-tune-cycle-label");
const applyAutoTuneBtn = document.getElementById("apply-auto-tune-btn");
const dismissAutoTuneBtn = document.getElementById("dismiss-auto-tune-btn");
const autoTuneStatusEl = document.getElementById("auto-tune-status");


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

// ----- Auto-tune helpers -----
function ensureAutoTuneState() {
  if (!state.autoTune) {
    state.autoTune = {
      pending: false,
      completedCycleIndex: null,
      snapshotExercises: [],
      reviews: {}
    };
  } else {
    if (!Array.isArray(state.autoTune.snapshotExercises)) {
      state.autoTune.snapshotExercises = [];
    }
    if (!state.autoTune.reviews) {
      state.autoTune.reviews = {};
    }
  }
}

function computeAutoTuneSuggestion(ex, review) {
  const baseStart = ex.startReps || 1;
  const baseMax = ex.maxReps || baseStart;
  const step = ex.repIncrement && ex.repIncrement > 0 ? ex.repIncrement : 1;

  if (review === "easy") {
    const newStart = baseStart + step;
    const newMax = baseMax + step * 2;
    return { start: newStart, max: newMax };
  }
  if (review === "hard") {
    const newStart = Math.max(1, baseStart - step);
    const newMax = Math.max(newStart, baseMax - step * 2);
    return { start: newStart, max: newMax };
  }
  // "right" or unknown: keep as-is
  return { start: baseStart, max: baseMax };
}

function startAutoTuneReviewForCompletedCycle(completedCycleIndex) {
  ensureAutoTuneState();
  state.autoTune.pending = true;
  state.autoTune.completedCycleIndex =
    typeof completedCycleIndex === "number" ? completedCycleIndex : null;
  state.autoTune.snapshotExercises = state.exercises.map((ex) => ({ ...ex }));
  state.autoTune.reviews = {};
}

// ---- Streak helpers ----
function bumpStreakForDay(dayStr) {
  const prev = state.lastStreakDate;
  if (!prev) {
    state.streakCount = 1;
  } else {
    const diff = daysBetween(prev, dayStr);
    if (diff === 1) {
      state.streakCount = (state.streakCount || 0) + 1;
    } else if (diff === 0) {
      state.streakCount = state.streakCount || 1;
    } else {
      state.streakCount = 1;
    }
  }
  state.lastStreakDate = dayStr;
  if (!state.bestStreak || state.streakCount > state.bestStreak) {
    state.bestStreak = state.streakCount;
  }
}

function maybeExtendStreakForRestDay(today) {
  if (!isRestDayFor(today)) return;

  // Don't double-count if we've already recorded this day
  if (state.lastStreakDate === today) return;

  // Only extend if yesterday's workout was completed (following the program).
  if (!state.lastCompletedDate) return;
  const diff = daysBetween(state.lastCompletedDate, today);
  if (diff !== 1) return;

  bumpStreakForDay(today);
  saveState();
}

function markTodayCompleted() {
  const today = todayString();
  if (isRestDayFor(today)) return;

  // Prevent double-completion for same calendar day
  if (state.lastCompletedDate === today) return;

  // Update streak for this workout day
  bumpStreakForDay(today);

  state.trainingDaysCompletedInCycle += 1;
  state.lastCompletedDate = today;

  if (cycleCompleted()) {
    const completedCycleIndex = state.cycleIndex;
    state.trainingDaysCompletedInCycle = 0;
    state.cycleIndex += 1;
    // Start an optional auto-tune review for the cycle we just finished.
    startAutoTuneReviewForCompletedCycle(completedCycleIndex);
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

  // If today is a rest day and we followed the plan yesterday,
  // automatically extend the streak without pressing any buttons.
  maybeExtendStreakForRestDay(today);

  todayDateEl.textContent = date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  ensurePerDayProgressForToday();

  const isRest = isRestDayFor(today);
  
  // HOLD LOGIC (NEW):
  // If the calendar schedule says today is a rest day, but yesterday was a workout day
  // and it was NOT completed, then we should NOT advance into a rest day.
  // Instead, treat today as a workout day until the missed workout is completed.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localYMD(d);
  })();

  let isRestAdjusted = isRest;
  if (isRestAdjusted) {
    const yesterdayWasRest = isRestDayFor(yesterday);
    const yesterdayCompleted = state.lastCompletedDate === yesterday;
    if (!yesterdayWasRest && !yesterdayCompleted) {
      // Yesterday was a workout day but wasn't completed - HOLD on the workout
      isRestAdjusted = false;
    }
  }
  
  const alreadyCompleted = state.lastCompletedDate === today;

  const cycleLen = cycleLengthInTrainingDays(state.exercises);
  const trainingIndexRaw = currentTrainingDayIndex();
  const displayIndex = alreadyCompleted
    ? state.trainingDaysCompletedInCycle
    : trainingIndexRaw;

  if (isRestAdjusted) {
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

  if (isRestAdjusted) {
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

  completeBtn.disabled = isRestAdjusted || alreadyCompleted || !state.exercises.length;
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

function renderAutoTune() {
  if (!autoTuneSectionEl) return;

  ensureAutoTuneState();
  const data = state.autoTune;

  if (!data.pending || !data.snapshotExercises || data.snapshotExercises.length === 0) {
    autoTuneSectionEl.classList.add("hidden");
    if (autoTuneBodyEl) autoTuneBodyEl.innerHTML = "";
    if (autoTuneStatusEl) autoTuneStatusEl.textContent = "";
    return;
  }

  autoTuneSectionEl.classList.remove("hidden");

  const labelIndex =
    (typeof data.completedCycleIndex === "number"
      ? data.completedCycleIndex
      : state.cycleIndex - 1) + 1;

  if (autoTuneCycleLabelEl) {
    autoTuneCycleLabelEl.textContent = `Cycle #${labelIndex}`;
  }

  if (autoTuneBodyEl) {
    autoTuneBodyEl.innerHTML = "";
    data.snapshotExercises.forEach((ex) => {
      const review = data.reviews[ex.id] || "right";
      const suggestion = computeAutoTuneSuggestion(ex, review);
      const originalRange = `${ex.startReps}–${ex.maxReps}`;
      let suggestionText;
      if (suggestion.start === ex.startReps && suggestion.max === ex.maxReps) {
        suggestionText = `Stay at ${originalRange}`;
      } else {
        suggestionText = `${originalRange} → ${suggestion.start}–${suggestion.max}`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ex.name}</td>
        <td>${originalRange}</td>
        <td>
          <select class="auto-review-select" data-id="${ex.id}">
            <option value="easy"${review === "easy" ? " selected" : ""}>Too Easy</option>
            <option value="right"${review === "right" ? " selected" : ""}>Just Right</option>
            <option value="hard"${review === "hard" ? " selected" : ""}>Too Hard</option>
          </select>
        </td>
        <td>${suggestionText}</td>
      `;
      autoTuneBodyEl.appendChild(tr);
    });
  }

  if (autoTuneStatusEl) {
    autoTuneStatusEl.textContent =
      "Review is optional. Nothing changes until you tap 'Apply Auto-Tune'.";
  }
}

function render() {
  applyTheme();
  renderToday();
  renderSettings();
  renderAutoTune();
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
  state.lastStreakDate = null;
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

// Auto-tune review interactions
if (autoTuneBodyEl) {
  autoTuneBodyEl.addEventListener("change", (e) => {
    const select = e.target.closest(".auto-review-select");
    if (!select) return;
    ensureAutoTuneState();
    const id = select.dataset.id;
    const value = select.value || "right";
    state.autoTune.reviews[id] = value;
    saveState();
    renderAutoTune();
  });
}

if (applyAutoTuneBtn) {
  applyAutoTuneBtn.addEventListener("click", () => {
    ensureAutoTuneState();
    const data = state.autoTune;
    if (!data.pending || !data.snapshotExercises || data.snapshotExercises.length === 0) {
      return;
    }

    const snapById = {};
    data.snapshotExercises.forEach((ex) => {
      snapById[ex.id] = ex;
    });

    state.exercises = state.exercises.map((ex) => {
      const snap = snapById[ex.id] || ex;
      const review = data.reviews[ex.id] || "right";
      const suggestion = computeAutoTuneSuggestion(snap, review);
      return {
        ...ex,
        startReps: suggestion.start,
        maxReps: suggestion.max,
      };
    });

    // Clear per-day progress so the next workout day starts fresh
    state.perDayProgress = null;

    state.autoTune.pending = false;
    saveState();
    render();
  });
}

if (dismissAutoTuneBtn) {
  dismissAutoTuneBtn.addEventListener("click", () => {
    ensureAutoTuneState();
    state.autoTune.pending = false;
    saveState();
    render();
  });
}

// ===== Service worker registration & in-app update helpers =====
let newWorker = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            // New version ready
            newWorker = sw;
            if (updateAppBtn) {
              updateAppBtn.classList.remove("hidden");
            }
          }
        });
      });
    })
    .catch(console.error);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // When the new service worker takes control, reload to pick up new files.
    window.location.reload();
  });
}

if (updateAppBtn) {
  updateAppBtn.addEventListener("click", () => {
    if (newWorker) {
      newWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      // Fallback: just reload, in case a new SW was already activated.
      window.location.reload();
    }
  });
}

// Manual cache clear button (doesn't touch workout data in localStorage)
if (clearCacheBtn) {
  clearCacheBtn.addEventListener("click", async () => {
    if (!confirm("Clear cached files and reload? Your workout data will be preserved.")) return;

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }

    window.location.reload();
  });
}

// ===== Initial Render =====
render();