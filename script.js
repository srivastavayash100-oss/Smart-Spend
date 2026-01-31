const STORAGE_KEY = "smartSpendApp_v1";

let state = {
  currentMonthId: null,
  monthlyGoal: 0,
  rule: { essentials: 40, lifestyle: 30, invest: 20, savings: 10 },
  activeMode: "balanced", // store which mode is locked
  spent: { essentials: 0, lifestyle: 0, invest: 0, savings: 0 },
  limits: { essentials: 0, lifestyle: 0, invest: 0, savings: 0 },
  alertsHistory: [],
  spends: []
};

let trophies = 0;
let history = [];

/* MODAL STATE */

let confirmResolve = null;
let inputResolve = null;

/* BOOT */

window.onload = () => {
  loadAll();
  const nowId = getCurrentMonthId();

  if (!state.currentMonthId) {
    state.currentMonthId = nowId;
  } else if (state.currentMonthId !== nowId) {
    autoFinalizeIfNeeded();
  }

  // Wire modal buttons
  setupModals();

  // Spends click delegation (for performance)
  setupSpendsDelegation();

  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.classList.add("hidden");
      document.getElementById("meme-flow").classList.remove("hidden");
      playCinematicSequence();
    }, 1000);
  }, 2800);

  initTiltCards();
  renderLimits();
  renderBarsAndAlerts();
  renderHomeMini();
  renderTrophiesScreen();
  updateTrophyHeader();
  updateHomeTrophyCTA();
  renderSpendsList();

  // sync mode pills + hidden select from state
  selectMode(state.activeMode || "balanced");
};

function getCurrentMonthId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/* MONTH HELPERS (for missed months handling) */

function monthDiff(fromId, toId) {
  const [fy, fm] = fromId.split("-").map(Number);
  const [ty, tm] = toId.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function addMonths(id, offset) {
  const [y, m] = id.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/* STORAGE */

function saveAll() {
  try {
    const payload = { state, trophies, history };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Storage failed", e);
  }
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.state) state = Object.assign(state, parsed.state);
    if (typeof parsed.trophies === "number") trophies = parsed.trophies;
    if (Array.isArray(parsed.history)) history = parsed.history;
  } catch (e) {
    console.warn("Load failed", e);
  }
}

/* CUSTOM MODALS */

function setupModals() {
  const modalOverlay = document.getElementById("modalOverlay");
  const confirmBtn = document.getElementById("modalConfirmBtn");
  const cancelBtn = document.getElementById("modalCancelBtn");

  const inputOverlay = document.getElementById("inputModalOverlay");
  const inputConfirmBtn = document.getElementById("inputModalConfirmBtn");
  const inputCancelBtn = document.getElementById("inputModalCancelBtn");
  const inputField = document.getElementById("inputModalField");

  if (confirmBtn && cancelBtn && modalOverlay) {
    confirmBtn.onclick = () => {
      if (confirmResolve) confirmResolve(true);
      confirmResolve = null;
      modalOverlay.classList.add("hidden");
    };
    cancelBtn.onclick = () => {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = null;
      modalOverlay.classList.add("hidden");
    };
  }

  if (inputConfirmBtn && inputCancelBtn && inputOverlay && inputField) {
    inputConfirmBtn.onclick = () => {
      if (inputResolve) inputResolve(inputField.value);
      inputResolve = null;
      inputOverlay.classList.add("hidden");
    };
    inputCancelBtn.onclick = () => {
      if (inputResolve) inputResolve(null);
      inputResolve = null;
      inputOverlay.classList.add("hidden");
    };
  }
}

function openConfirm(options) {
  return new Promise(resolve => {
    const overlay = document.getElementById("modalOverlay");
    const titleEl = document.getElementById("modalTitle");
    const msgEl = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirmBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    if (!overlay || !titleEl || !msgEl || !confirmBtn || !cancelBtn) {
      const res = window.confirm(options.message || "Are you sure?");
      resolve(res);
      return;
    }

    titleEl.textContent = options.title || "Confirm";
    msgEl.textContent = options.message || "";
    confirmBtn.textContent = options.confirmLabel || "OK";
    cancelBtn.textContent = options.cancelLabel || "Cancel";

    confirmResolve = resolve;
    overlay.classList.remove("hidden");
  });
}

function openInput(options) {
  return new Promise(resolve => {
    const overlay = document.getElementById("inputModalOverlay");
    const titleEl = document.getElementById("inputModalTitle");
    const msgEl = document.getElementById("inputModalMessage");
    const field = document.getElementById("inputModalField");
    const confirmBtn = document.getElementById("inputModalConfirmBtn");
    const cancelBtn = document.getElementById("inputModalCancelBtn");

    if (!overlay || !titleEl || !msgEl || !field || !confirmBtn || !cancelBtn) {
      const res = window.prompt(
        options.message || "",
        options.defaultValue || ""
      );
      resolve(res);
      return;
    }

    titleEl.textContent = options.title || "Edit";
    msgEl.textContent = options.message || "";
    field.value = options.defaultValue || "";
    confirmBtn.textContent = options.confirmLabel || "Save";
    cancelBtn.textContent = options.cancelLabel || "Cancel";

    inputResolve = resolve;
    overlay.classList.remove("hidden");
    field.focus();
    field.select();
  });
}

/* AUTO FINALIZE if month changed – now handles missed months */

function autoFinalizeIfNeeded() {
  const nowId = getCurrentMonthId();
  const lastId = state.currentMonthId || nowId;

  const diff = monthDiff(lastId, nowId);
  if (diff <= 0) {
    state.currentMonthId = nowId;
    saveAll();
    return;
  }

  const totalSpent =
    state.spent.essentials +
    state.spent.lifestyle +
    state.spent.invest +
    state.spent.savings;

  // 1) finalize last active month if there were spends
  if (totalSpent > 0) {
    finalizeCurrentMonth(true); // locks lastId
  } else {
    state.currentMonthId = nowId;
  }

  // 2) add neutral entries for fully missed months (between lastId and nowId)
  const missingCount = diff - 1;
  if (missingCount > 0) {
    for (let i = 1; i <= missingCount; i++) {
      const midId = addMonths(lastId, i);
      const already = history.find(h => h.monthId === midId);
      if (already) continue;

      history.push({
        monthId: midId,
        score: 0,
        deltaT: 0,
        trophiesAfter: trophies,
        league: getLeague(trophies),
        summary: "Month not tracked. No data — clean slate carried forward."
      });

      state.alertsHistory.push({
        text: `Missed month (${monthLabelFromId(
          midId
        )}) added as a neutral entry in your ladder.`,
        ts: new Date().toLocaleString()
      });
    }
  }

  state.currentMonthId = nowId;
  saveAll();

  const note = document.getElementById("setupNote");
  if (note) {
    note.textContent =
      "New month started. Set this month’s spending goal when you’re ready.";
  }
}

/* CINEMATIC */

function playCinematicSequence() {
  setTimeout(() => {
    const flow = document.getElementById("meme-flow");
    flow.style.filter = "brightness(4)";

    setTimeout(() => {
      flow.style.filter = "none";
      document.getElementById("shock-moment").classList.add("hidden");
      document.getElementById("success-moment").classList.remove("hidden");

      confetti({
        particleCount: 200,
        spread: 80,
        origin: { y: 0.7 },
        colors: ["#FFDE00", "#D4AF37", "#ffffff"]
      });

      setTimeout(() => {
        const flowElem = document.getElementById("meme-flow");
        flowElem.style.transform = "translateY(-100vh)";
        flowElem.style.transition = "1.8s cubic-bezier(0.85, 0, 0.15, 1)";

        setTimeout(() => {
          flowElem.classList.add("hidden");
          document.getElementById("app-shell").classList.remove("hidden");
          renderLimits();
          renderBarsAndAlerts();
          renderHomeMini();
          renderTrophiesScreen();
          updateTrophyHeader();
          updateHomeTrophyCTA();
          renderSpendsList();
        }, 1500);
      }, 5000);
    }, 200);
  }, 4500);
}

/* NAVIGATION */

function switchScreen(target) {
  const mapping = {
    home: "screen-home",
    stats: "screen-stats",
    rule: "screen-rule",
    alerts: "screen-alerts",
    add: "screen-add",
    trophies: "screen-trophies"
  };

  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  const id = mapping[target];
  if (id) document.getElementById(id).classList.remove("hidden");

  document.querySelectorAll("#bottom-nav .nav-item").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.target === target) btn.classList.add("active");
  });

  if (target === "trophies") {
    renderTrophiesScreen();
    updateTrophyHeader();
  }

  if (target === "rule") {
    selectMode(state.activeMode || "balanced");
  }
}

/* MODE PILLS */

function selectMode(mode) {
  document.querySelectorAll(".mode-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.mode === mode);
  });

  const sel = document.getElementById("modeSelect");
  if (sel) sel.value = mode;

  state.activeMode = mode;

  const customBlock = document.getElementById("customRuleBlock");
  if (customBlock) {
    if (mode === "custom") customBlock.classList.remove("hidden");
    else customBlock.classList.add("hidden");
  }

  saveAll();
}

/* SETUP */

function applySetup() {
  const goalInput = document.getElementById("monthlyGoal");
  const note = document.getElementById("setupNote");

  const goal = parseFloat(goalInput.value);
  if (!goal || goal <= 0) {
    note.textContent = "Add a realistic monthly spending goal first.";
    return;
  }
  state.monthlyGoal = goal;

  const mode = state.activeMode || "balanced";

  if (mode === "balanced") {
    state.rule = { essentials: 40, lifestyle: 30, invest: 20, savings: 10 };
  } else if (mode === "student") {
    state.rule = { essentials: 45, lifestyle: 35, invest: 10, savings: 10 };
  } else if (mode === "wealth") {
    state.rule = { essentials: 35, lifestyle: 20, invest: 25, savings: 20 };
  } else if (mode === "custom") {
    const e = parseFloat(document.getElementById("ruleEss").value) || 0;
    const l = parseFloat(document.getElementById("ruleLife").value) || 0;
    const i = parseFloat(document.getElementById("ruleInv").value) || 0;
    const s = parseFloat(document.getElementById("ruleSav").value) || 0;
    const sum = e + l + i + s;
    if (sum !== 100) {
      note.textContent = "Custom rule must sum to exactly 100%.";
      return;
    }
    state.rule = { essentials: e, lifestyle: l, invest: i, savings: s };
  }

  for (let cat in state.limits) {
    state.limits[cat] = (state.monthlyGoal * state.rule[cat]) / 100;
  }

  note.textContent =
    "Rule locked for this month. Your bars will now move against this line.";
  renderLimits();
  renderBarsAndAlerts();
  renderHomeMini();
  saveAll();
}

/* LIMIT SNAPSHOT */

function renderLimits() {
  const limitsGrid = document.getElementById("limitsGrid");
  const ruleSummary = document.getElementById("ruleSummary");
  if (!limitsGrid || !ruleSummary) return;
  limitsGrid.innerHTML = "";

  if (!state.monthlyGoal || state.monthlyGoal <= 0) {
    ruleSummary.textContent =
      "No rule locked yet. Set a goal to see your month split.";
    return;
  }

  const modeLabelMap = {
    balanced: "Balanced",
    student: "Student",
    wealth: "Wealth Builder",
    custom: "Custom"
  };
  const modeName = modeLabelMap[state.activeMode] || "Balanced";

  ruleSummary.textContent = `Mode: ${modeName} · Monthly Goal: ₹${state.monthlyGoal.toLocaleString()} · E ${state.rule.essentials}% · L ${state.rule.lifestyle}% · I ${state.rule.invest}% · S ${state.rule.savings}%.`;

  for (let cat of ["essentials", "lifestyle", "invest", "savings"]) {
    const chip = document.createElement("div");
    chip.className = "limit-chip";
    chip.innerHTML = `
      <span class="label">${cat.toUpperCase()}</span>
      <span class="value">₹${Math.round(
        state.limits[cat] || 0
      ).toLocaleString()} • ${state.rule[cat]}%</span>
    `;
    limitsGrid.appendChild(chip);
  }
}

/* HOME MINI */

function renderHomeMini() {
  const mini = document.getElementById("homeMiniStats");
  if (!mini) return;
  mini.innerHTML = "";
  const totalSpent =
    state.spent.essentials +
    state.spent.lifestyle +
    state.spent.invest +
    state.spent.savings;

  const goal = state.monthlyGoal || 0;

  const card1 = document.createElement("div");
  card1.className = "mini-card";
  card1.innerHTML = `
    <div>Total logged</div>
    <strong>₹${totalSpent.toLocaleString()}</strong>
  `;
  mini.appendChild(card1);

  const card2 = document.createElement("div");
  card2.className = "mini-card";
  const pct = goal > 0 ? Math.round((totalSpent / goal) * 100) : 0;
  card2.innerHTML = `
    <div>Goal usage</div>
    <strong>${pct}%</strong>
  `;
  mini.appendChild(card2);
}

/* STATS & ALERTS */

function renderBarsAndAlerts() {
  const grid = document.getElementById("barsGrid");
  const alertPanel = document.getElementById("alertPanel");
  if (!grid || !alertPanel) return;
  grid.innerHTML = "";
  alertPanel.innerHTML = "";

  const colors = {
    essentials: "var(--essentials)",
    lifestyle: "var(--lifestyle)",
    invest: "var(--invest)",
    savings: "var(--savings)"
  };

  let alerts = [];

  for (let cat of ["essentials", "lifestyle", "invest", "savings"]) {
    const spent = state.spent[cat];
    const limit = state.limits[cat] || 0;
    let percentUsed = limit > 0 ? Math.min((spent / limit) * 100, 160) : 0;

    // Savings bar visually full if rule/limit set
    if (cat === "savings" && limit > 0) {
      percentUsed = 100;
    }

    const row = document.createElement("div");
    row.className = "bar-row";
    row.dataset.cat = cat;

    const labelName = cat.toUpperCase();
    const usedLabel =
      limit > 0
        ? `₹${spent.toLocaleString()} / ₹${Math.round(
            limit
          ).toLocaleString()}`
        : `₹${spent.toLocaleString()}`;

    const color = colors[cat];

    row.innerHTML = `
      <div class="bar-header">
        <span>${labelName}</span>
        <span>${usedLabel}</span>
      </div>
      <div class="bar-bg">
        <div class="bar-fill" style="width:${percentUsed}%; background:${color};">
          <div class="bar-fill-inner"></div>
        </div>
      </div>
    `;
    grid.appendChild(row);

    if (limit > 0) {
      if (cat === "essentials") {
        if (percentUsed >= 100) {
          alerts.push({
            class: "alert-soft",
            text:
              "Essentials shield is fully used this month. Good info to carry into next cycle."
          });
        } else if (percentUsed >= 80) {
          alerts.push({
            class: "alert-soft",
            text:
              "Soft nudge: Essentials is brushing close to its line. Just stay conscious, not guilty."
          });
        }
      } else if (cat === "lifestyle") {
        if (percentUsed >= 100) {
          alerts.push({
            class: "alert-strong",
            text:
              "Lifestyle just crossed its agreed line. No shame — just notice what story you're writing this month."
          });
          row.classList.add("shake-x");
        } else if (percentUsed >= 70) {
          alerts.push({
            class: "alert-warn",
            text:
              "Awareness ping: Lifestyle is getting heavy. If this still feels worth it, own it. If not, maybe slow a little."
          });
          row.classList.add("shake-x");
        }
      } else if (cat === "invest" || cat === "savings") {
        if (spent > 0 && percentUsed < 40) {
          alerts.push({
            class: "alert-soft",
            text:
              "Future-you got a small deposit today. Even tiny steps compound over seasons."
          });
        } else if (percentUsed >= 100) {
          alerts.push({
            class: "alert-soft",
            text: `You maxed your ${
              cat === "invest" ? "Investment" : "Savings"
            } line. That’s a serious wealth-builder move.`
          });
        }
      }
    }
  }

  const seen = new Set();
  alerts.forEach(a => {
    if (seen.has(a.text)) return;
    seen.add(a.text);
    const pill = document.createElement("div");
    pill.className = `alert-pill ${a.class}`;
    pill.textContent = a.text;
    alertPanel.appendChild(pill);

    state.alertsHistory.push({
      text: a.text,
      ts: new Date().toLocaleString()
    });
  });

  renderAlertsHistory();
}

/* ALERT LOG */

function renderAlertsHistory() {
  const box = document.getElementById("alertsHistory");
  if (!box) return;
  box.innerHTML = "";
  if (!state.alertsHistory.length) {
    box.textContent = "No alerts yet. Your month is still quiet.";
    return;
  }
  state.alertsHistory
    .slice()
    .reverse()
    .forEach(a => {
      const item = document.createElement("div");
      item.className = "alert-history-item";
      item.textContent = `${a.ts} • ${a.text}`;
      box.appendChild(item);
    });
}

/* ADD SPEND */

function quickSelect(cat) {
  document
    .querySelectorAll(".chip")
    .forEach(ch => ch.classList.remove("active"));
  const btn = document.querySelector(`.chip[data-cat="${cat}"]`);
  if (btn) btn.classList.add("active");
  const sel = document.getElementById("cat");
  sel.value = cat;
}

function addSpend(fromAddScreen = false) {
  const val = parseFloat(document.getElementById("amt").value);
  const sel = document.getElementById("cat");
  const cat = sel.value;

  if (!val || val <= 0 || !state.spent.hasOwnProperty(cat)) return;

  state.spent[cat] += val;

  const spendEntry = {
    id: Date.now() + "-" + Math.random().toString(16).slice(2),
    amount: val,
    category: cat,
    ts: new Date().toLocaleString()
  };
  state.spends.push(spendEntry);

  document.getElementById("amt").value = "";
  document.querySelectorAll(".chip").forEach(ch =>
    ch.classList.remove("active")
  );

  if (window.navigator.vibrate) {
    window.navigator.vibrate(10);
  }

  const saveBtn = document.querySelector("#screen-add .btn-pro.full");
  if (saveBtn) {
    saveBtn.style.transform = "scale(0.96)";
    saveBtn.style.boxShadow = "0 0 12px rgba(212,175,55,0.6)";
    setTimeout(() => {
      saveBtn.style.transform = "";
      saveBtn.style.boxShadow = "";
    }, 120);
  }

  renderBarsAndAlerts();
  renderHomeMini();
  appendSingleSpendRow(spendEntry); // performance: only latest DOM append
  saveAll();
}

/* TROPHIES ENGINE: SCORE */

function calculateMonthlyScore() {
  const goal = state.monthlyGoal || 0;
  const spentTotal =
    state.spent.essentials +
    state.spent.lifestyle +
    state.spent.invest +
    state.spent.savings;

  let score = 0;

  // Goal usage
  if (!goal || spentTotal <= goal) {
    score += 20;
  } else {
    const ratio = spentTotal / goal;
    if (ratio <= 1.2) score += 10;
    else if (ratio <= 1.5) score += 0;
    else score -= 10;
  }

  // Future-you (Invest + Savings)
  const invLimit = state.limits.invest || 0;
  const savLimit = state.limits.savings || 0;
  const futureLimit = invLimit + savLimit;
  const futureSpent = state.spent.invest + state.spent.savings;

  if (futureLimit > 0) {
    const fr = futureSpent / futureLimit;
    if (fr >= 1.0) score += 30;
    else if (fr >= 0.7) score += 20;
    else if (fr >= 0.4) score += 10;
    else score += 0;
  }

  // Lifestyle pressure
  const lifeLimit = state.limits.lifestyle || 0;
  const lifeSpent = state.spent.lifestyle;
  if (lifeLimit > 0) {
    const lr = lifeSpent / lifeLimit;
    if (lr <= 1.0) score += 20;
    else if (lr <= 1.3) score += 5;
    else if (lr <= 1.6) score += 0;
    else score -= 10;
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return score;
}

function getStreakInfo() {
  const last = history.slice(-2);
  let pos = 0;
  let neg = 0;
  last.forEach(m => {
    if (m.deltaT > 0) pos++;
    else if (m.deltaT < 0) neg++;
  });
  return { pos, neg };
}

/* TROPHY DELTA */

function calculateTrophyDelta(score, streakInfo) {
  let delta = 0;

  if (score >= 75) delta = 18;
  else if (score >= 55) delta = 10;
  else if (score >= 35) delta = 3;
  else if (score >= 25) delta = 0;
  else delta = -8;

  if (delta > 0 && streakInfo.pos >= 2) {
    delta = Math.round(delta * 1.25);
  }
  if (delta < 0 && streakInfo.neg >= 2) {
    delta = Math.round(delta * 0.5);
  }
  return delta;
}

/* LEAGUES */

function getLeague(t) {
  if (t >= 400) return "Legend";
  if (t >= 300) return "Champion";
  if (t >= 220) return "Master";
  if (t >= 150) return "Crystal";
  if (t >= 90)  return "Gold";
  if (t >= 40)  return "Silver";
  return "Bronze";
}

function leagueClassName(name) {
  return name.toLowerCase();
}

function monthLabelFromId(id) {
  const [y, m] = id.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* FINALIZE MONTH */

function finalizeCurrentMonth(isAuto = false) {
  const note = document.getElementById("trophyNote");
  const currentId = state.currentMonthId || getCurrentMonthId();

  const already = history.find(h => h.monthId === currentId);
  if (already && !isAuto) {
    if (note)
      note.textContent =
        "This month is already finalized. New spends will count into the next month.";
    return;
  }

  const spentTotal =
    state.spent.essentials +
    state.spent.lifestyle +
    state.spent.invest +
    state.spent.savings;

  if (spentTotal <= 0 && !isAuto) {
    if (note)
      note.textContent =
        "No spends logged this month. Nothing to finalize yet.";
    return;
  }

  const score = calculateMonthlyScore();
  const streakInfo = getStreakInfo();
  let deltaT = calculateTrophyDelta(score, streakInfo);
  trophies = Math.max(0, trophies + deltaT);

  const league = getLeague(trophies);

  const summaryText =
    score >= 70
      ? "Strong future‑you month."
      : score >= 50
      ? "Balanced month with a few spikes."
      : score >= 30
      ? "Chill month; story is neutral."
      : "Heavy month. Next cycle is a clean slate.";

  const goal = state.monthlyGoal || 0;
  let extraMsg = "";
  if (goal > 0 && spentTotal < goal) {
    const saved = goal - spentTotal;
    extraMsg = ` You spent about ₹${Math.round(
      saved
    ).toLocaleString()} less than your goal — that’s a quiet win.`;
  }

  history = history.filter(h => h.monthId !== currentId);
  history.push({
    monthId: currentId,
    score,
    deltaT,
    trophiesAfter: trophies,
    league,
    summary: summaryText + extraMsg
  });

  state.alertsHistory.push({
    text: `Month locked (${monthLabelFromId(
      currentId
    )}): ${summaryText}${extraMsg}`,
    ts: new Date().toLocaleString()
  });

  state.spent = { essentials: 0, lifestyle: 0, invest: 0, savings: 0 };
  state.alertsHistory = [];
  state.spends = [];
  state.currentMonthId = getCurrentMonthId();

  renderBarsAndAlerts();
  renderHomeMini();
  renderAlertsHistory();
  renderTrophiesScreen();
  updateTrophyHeader();
  updateHomeTrophyCTA();

  const scoreEls = [
    document.getElementById("trophyScore"),
    document.getElementById("trophyScoreHome")
  ];
  scoreEls.forEach(el => {
    if (!el) return;
    el.classList.remove("score-pop");
    void el.offsetWidth;
    el.classList.add("score-pop");
  });

  const badgeEls = [
    document.getElementById("trophyLeagueBadge"),
    document.getElementById("trophyLeagueBadgeHome")
  ];
  badgeEls.forEach(el => {
    if (!el) return;
    el.classList.remove("badge-shine");
    void el.offsetWidth;
    el.classList.add("badge-shine");
  });

  renderSpendsList();
  saveAll();

  if (!isAuto && note) {
    const sign = deltaT > 0 ? "+" : "";
    note.textContent = `Month locked. ${sign}${deltaT} trophies · ${league} league.${extraMsg ? " " + extraMsg : ""}`;
  }
}

/* TROPHY UI */

function updateTrophyHeader() {
  const scoreEl = document.getElementById("trophyScore");
  const badgeEl = document.getElementById("trophyLeagueBadge");
  if (!scoreEl || !badgeEl) return;
  scoreEl.textContent = trophies.toString();

  const league = getLeague(trophies);
  badgeEl.textContent = league;
  badgeEl.className = "trophy-badge " + leagueClassName(league);
}

function updateHomeTrophyCTA() {
  const scoreEl = document.getElementById("trophyScoreHome");
  const badgeEl = document.getElementById("trophyLeagueBadgeHome");
  if (!scoreEl || !badgeEl) return;
  scoreEl.textContent = trophies.toString();

  const league = getLeague(trophies);
  badgeEl.textContent = league;
  badgeEl.className = "trophy-badge " + leagueClassName(league);
}

function renderTrophiesScreen() {
  const list = document.getElementById("trophyHistoryList");
  if (!list) return;
  list.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "trophy-empty";
    empty.textContent = "No months locked yet. Finalize a month to start your ladder.";
    list.appendChild(empty);
    return;
  }

  const sorted = history
    .slice()
    .sort((a, b) => (a.monthId > b.monthId ? -1 : 1));

  sorted.forEach(h => {
    const card = document.createElement("div");
    card.className = "trophy-card";

    const deltaClass = h.deltaT >= 0 ? "pos" : "neg";
    const sign = h.deltaT > 0 ? "+" : "";

    card.innerHTML = `
      <div class="trophy-card-main">
        <div class="trophy-card-month">${monthLabelFromId(h.monthId)}</div>
        <div class="trophy-card-summary">${h.summary}</div>
      </div>
      <div class="trophy-card-right">
        <div class="trophy-card-delta ${deltaClass}">
          ${sign}${h.deltaT} trophies
        </div>
        <div>${h.trophiesAfter} · ${h.league}</div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* TILT EFFECT */

function initTiltCards() {
  const cards = document.querySelectorAll(".tilt-card");
  if (!cards.length) return;

  const maxTilt = 10;

  cards.forEach(card => {
    card.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const percentX = x / rect.width - 0.5;
      const percentY = y / rect.height - 0.5;

      const tiltX = (percentY * -maxTilt).toFixed(2);
      const tiltY = (percentX * maxTilt).toFixed(2);

      card.style.transform = `
        perspective(900px)
        rotateX(${tiltX}deg)
        rotateY(${tiltY}deg)
        scale(1.02)
      `;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform =
        "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
    });
  });
}

/* SPENDS LIST + RESET + PERFORMANCE IMPROVEMENTS */

function recalcTotalsFromSpends() {
  state.spent = { essentials: 0, lifestyle: 0, invest: 0, savings: 0 };
  state.spends.forEach(s => {
    if (state.spent.hasOwnProperty(s.category)) {
      state.spent[s.category] += s.amount;
    }
  });
}

// Single-row DOM builder
function appendSingleSpendRow(s, container) {
  const box = container || document.getElementById("spendsList");
  if (!box) return;

  if (box.textContent === "No spends logged yet.") {
    box.textContent = "";
  }

  const row = document.createElement("div");
  row.className = "spend-row";
  row.dataset.id = s.id;

  row.innerHTML = `
    <div class="spend-main">
      <div class="spend-top">
        <span class="spend-cat">${s.category.toUpperCase()}</span>
        <span class="spend-amt">₹${s.amount.toLocaleString()}</span>
      </div>
      <div class="spend-meta">${s.ts}</div>
    </div>
    <div class="spend-actions">
      <button class="spend-btn" data-action="edit">Edit</button>
      <button class="spend-btn danger" data-action="del">Del</button>
    </div>
  `;

  // latest upar dikhana hai
  box.prepend(row);
}

function renderSpendsList() {
  const box = document.getElementById("spendsList");
  if (!box) return;
  box.innerHTML = "";

  if (!state.spends.length) {
    box.textContent = "No spends logged yet.";
    return;
  }

  // Full render once (or after finalize/reset)
  state.spends
    .slice()
    .reverse()
    .forEach(s => appendSingleSpendRow(s, box));
}

// Event delegation for edit/delete (performance)
function setupSpendsDelegation() {
  const box = document.getElementById("spendsList");
  if (!box) return;

  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".spend-btn");
    if (!btn) return;

    const row = btn.closest(".spend-row");
    if (!row) return;
    const id = row.dataset.id;

    if (btn.dataset.action === "edit") {
      editSpend(id, row);
    } else if (btn.dataset.action === "del") {
      deleteSpend(id, row);
    }
  });
}

/* EDIT WITH INPUT MODAL */

async function editSpend(id, rowNode) {
  const entry = state.spends.find(s => s.id === id);
  if (!entry) return;

  const newAmtStr = await openInput({
    title: "Edit spend",
    message: `Update amount for ${entry.category.toUpperCase()}:`,
    defaultValue: entry.amount
  });
  if (newAmtStr === null) return;

  const newAmt = parseFloat(newAmtStr);
  if (!newAmt || newAmt <= 0) return;

  entry.amount = newAmt;
  recalcTotalsFromSpends();
  renderBarsAndAlerts();
  renderHomeMini();
  saveAll();

  const row = rowNode || document.querySelector(`.spend-row[data-id="${id}"]`);
  if (row) {
    const amtEl = row.querySelector(".spend-amt");
    if (amtEl) amtEl.textContent = `₹${entry.amount.toLocaleString()}`;
  }
}

/* DELETE WITH CONFIRM MODAL */

async function deleteSpend(id, rowNode) {
  const ok = await openConfirm({
    title: "Delete spend?",
    message: "This will remove this spend from this month’s story.",
    confirmLabel: "Delete",
    cancelLabel: "Keep it"
  });
  if (!ok) return;

  state.spends = state.spends.filter(s => s.id !== id);
  recalcTotalsFromSpends();
  renderBarsAndAlerts();
  renderHomeMini();
  saveAll();

  const row = rowNode || document.querySelector(`.spend-row[data-id="${id}"]`);
  if (row && row.parentNode) row.parentNode.removeChild(row);

  if (!state.spends.length) {
    document.getElementById("spendsList").textContent = "No spends logged yet.";
  }
}

/* FULL RESET WITH CONFIRM MODAL */

async function fullResetAllData() {
  const ok = await openConfirm({
    title: "Full reset?",
    message: "This will delete all months, trophies, spends, alerts — everything.",
    confirmLabel: "Reset all",
    cancelLabel: "Cancel"
  });
  if (!ok) return;

  state = {
    currentMonthId: getCurrentMonthId(),
    monthlyGoal: 0,
    rule: { essentials: 40, lifestyle: 30, invest: 20, savings: 10 },
    activeMode: "balanced",
    spent: { essentials: 0, lifestyle: 0, invest: 0, savings: 0 },
    limits: { essentials: 0, lifestyle: 0, invest: 0, savings: 0 },
    alertsHistory: [],
    spends: []
  };
  trophies = 0;
  history = [];

  renderLimits();
  renderBarsAndAlerts();
  renderHomeMini();
  renderAlertsHistory();
  renderTrophiesScreen();
  updateTrophyHeader();
  updateHomeTrophyCTA();
  renderSpendsList();
  saveAll();
}
