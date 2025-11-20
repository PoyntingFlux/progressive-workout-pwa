// ===== Storage Keys =====
const STORAGE_KEY = "progressiveWorkoutState_v4";

// ===== ID helper (works even if crypto.randomUUID is missing) =====
function makeId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch (e) {}
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ===== Default Data =====
const defaultState = () => ({
  settings: {
    startDate: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
    restEveryNDays: 4,
  },
  // how many training days completed in current cycle
  trainingDaysCompletedInCycle: 0,
  // which cycle (0-based)
  cycleIndex: 0,
  // last calendar date we marked as completed (yyyy-mm-dd)
  lastCompletedDate: null,
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    // Backwards-safe: ensure required pieces exist
    return {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultState().settings, ...(parsed.settings || {}) },
    };
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

// ===== State =====
let state = loadState();

// ===== DOM Elements =====
const todayDateEl = document.getElementById("today-date");
const dayInfoEl = document.getElementById("day-info");
const cycleInfoEl = document.getElementById("cycle-info");
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

function markTodayCompleted() {
  const today = todayString();
  if (isRestDayFor(today)) return;

  // Prevent double-completion for same calendar day
  if (state.lastCompletedDate === today) return;

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

  const cycleLen = cycleLengthInTrainingDays(state.exercises);
  const trainingIndex = currentTrainingDayIndex();
  dayInfoEl.textContent = isRest
    ? "Rest day (no training today)."
    : `Training day ${trainingIndex} of ${cycleLen} in this cycle.`;
  cycleInfoEl.textContent = `Cycle #${state.cycleIndex + 1}`;

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
            Complete 1 set
          </button>
        </td>
      `;
      exerciseBodyEl.appendChild(tr);
    });
  }

  const alreadyCompleted = state.lastCompletedDate === today;
  completeBtn.disabled = isRest || alreadyCompleted || !state.exercises.length;
  completedMessageEl.classList.toggle("hidden", !alreadyCompleted);
}

function renderSettings() {
  // Settings fields
  restDaysInput.value = state.settings.restEveryNDays ?? 0;
  startDateInput.value = state.settings.startDate;

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

// New: handle "Complete 1 set" buttons
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

  saveState();
  render();
  renderStatus("Cycle reset.");
});

// ===== Initial Render =====
render();
