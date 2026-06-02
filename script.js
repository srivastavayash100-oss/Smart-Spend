const STORAGE_KEY = "smartSpendApp_v1";

let state = {
  currentMonthId: null,
  monthlyGoal: 0,
  rule: { essentials: 40, lifestyle: 30, invest: 20, savings: 10 },
  activeMode: "balanced",
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

/* NAV STATE FOR TRANSITIONS */
let currentScreenId = "screen-home";

/* BOOT */
document.addEventListener("DOMContentLoaded", () => {
  loadAll();
  checkMonthlyReset();
  const nowId = getCurrentMonthId();

  if (!state.currentMonthId) {
    state.currentMonthId = nowId;
  } else if (state.currentMonthId !== nowId) {
    autoFinalizeIfNeeded();
  }

  setupModals();
  setupSpendsDelegation();

  // FIX: Slow net independent automatic splash removal loop
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.classList.add("hidden");
        
        // FIX: Directly unlocking app shell bypassing meme layout completely
        const appShell = document.getElementById("app-shell");
        if (appShell) appShell.classList.remove("hidden");
        
        initTiltCards();
        renderLimits();
        renderBarsAndAlerts();
        renderHomeMini();
        renderTrophiesScreen();
        updateTrophyHeader();
        updateHomeTrophyCTA();
        renderSpendsList();

        selectMode(state.activeMode || "balanced");
      }, 500);
    }
  }, 1200);

  // Ensure initial screen has active class
  const homeScreen = document.getElementById("screen-home");
  if (homeScreen) {
    homeScreen.classList.add("screen-active");
    
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
});

function getCurrentMonthId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/* MONTH HELPERS */

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

/* AUTO FINALIZE & MISSED MONTHS */

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

  if (totalSpent > 0) {
    finalizeCurrentMonth(true); // locks lastId
  } else {
    state.currentMonthId = nowId;
  }

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

// 🔥 AUTO MONTHLY RESET ON 1st TAREEKH
function checkMonthlyReset() {
  const now = new Date();
  const today = now.getDate();
  const currentHour = now.getHours();
  
  // 1st tareekh 6-10 AM ke beech chalega
  if (today === 1 && currentHour >= 6 && currentHour < 10) {
    
    const nowId = getCurrentMonthId();
    const prevId = addMonths(nowId, -1);
    
    // Previous month pending hai to finalize
    if (state.currentMonthId === prevId && 
        (state.spent.essentials + state.spent.lifestyle + state.spent.invest + state.spent.savings) > 0) {
      
      finalizeCurrentMonth(true);
      
      // Notification (permission check karke)
      if (Notification.permission === 'granted') {
        new Notification('Smart Spend', {
         body: `📅 New month started! Set this month's ₹ goal.`,
          icon: 'icon.png'
        });
      }
      
      // 2 sec me fresh reload
      setTimeout(() => location.reload(), 2000);
    }
  }
}

/* NAVIGATION WITH TRANSITIONS */

function switchScreen(target) {
  const mapping = {
    home: "screen-home",
    stats: "screen-stats",
    rule: "screen-rule",
    about: "screen-about",
    add: "screen-add",
    trophies: "screen-trophies"
  };

  const nextId = mapping[target];
  if (!nextId) return;

  const currentEl = currentScreenId
    ? document.getElementById(currentScreenId)
    : null;
  const nextEl = document.getElementById(nextId);
  if (!nextEl) return;

  if (currentEl && currentEl !== nextEl) {
    currentEl.classList.remove("screen-active");
    currentEl.classList.add("screen-leave");
    setTimeout(() => {
      currentEl.classList.add("hidden");
      currentEl.classList.remove("screen-leave");
    }, 260);
  }

  nextEl.classList.remove("hidden");
  requestAnimationFrame(() => {
    nextEl.classList.add("screen-active");
  });

  currentScreenId = nextId;

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

/* HOME MINI + HERO DASHBOARD */

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

  // Simple Cash Balances Layout for Instant Readability
  mini.innerHTML = `
    <div class="mini-card" style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); padding: 14px; border-radius: 12px;">
      <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Cash Logged</div>
      <strong style="font-size: 16px; color: #fff; display: block; margin-top: 4px;">₹${totalSpent.toLocaleString()}</strong>
    </div>
    <div class="mini-card" style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); padding: 14px; border-radius: 12px;">
      <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Target Boundary</div>
      <strong style="font-size: 16px; color: #fff; display: block; margin-top: 4px;">₹${goal.toLocaleString()}</strong>
    </div>
  `;

  // Synchronizing Base Components
  const league = getLeague(trophies);
  if (document.getElementById("homeHeroLeague")) document.getElementById("homeHeroLeague").textContent = league;
  if (document.getElementById("homeHeroTrophies")) document.getElementById("homeHeroTrophies").textContent = trophies.toString();

  // --- AUTOMATIC DYNAMIC COLOR ENGINE START ---
  
  // 1. Total Goal used color matrix (0-80% White, 80-100% Orange, 100%+ Red)
  const metricGoal = document.getElementById("homeMetricGoal");
  if (metricGoal) {
    const gPct = goal > 0 ? Math.round((totalSpent / goal) * 100) : 0;
    metricGoal.textContent = `${gPct}%`;
    if (gPct >= 100) metricGoal.style.color = "#f97373";      // Crimson Red
    else if (gPct >= 80) metricGoal.style.color = "var(--lifestyle)"; // Alert Orange
    else metricGoal.style.color = "#fff";                     // Pure White
  }

  // 2. Lifestyle Load color matrix (0-70% Green/Normal, 70-100% Orange, 100%+ Red)
  const lifeLimit = state.limits.lifestyle || 0;
  const life = state.spent.lifestyle;
  const metricLifestyle = document.getElementById("homeMetricLifestyle");
  if (metricLifestyle) {
    const lpct = lifeLimit > 0 ? Math.round((life / lifeLimit) * 100) : 0;
    metricLifestyle.textContent = lifeLimit ? `${lpct}%` : "—";
    if (lpct >= 100) metricLifestyle.style.color = "#f97373"; // Crossed Red
    else if (lpct >= 70) metricLifestyle.style.color = "var(--lifestyle)"; // Heavy Orange
    else metricLifestyle.style.color = "var(--essentials)";   // Balanced Green
  }

  // 3. Money Saved color matrix (0-39% Red, 40-99% Light Green, 100%+ Neon Green)
  const futureLimit = (state.limits.invest || 0) + (state.limits.savings || 0);
  const futureSpent = state.spent.invest + state.spent.savings;
  const metricFuture = document.getElementById("homeMetricFuture");
  if (metricFuture) {
    const fpct = futureLimit > 0 ? Math.round((futureSpent / futureLimit) * 100) : 0;
    metricFuture.textContent = futureLimit ? `${fpct}%` : "—";
    if (fpct >= 100) metricFuture.style.color = "#4ade80";    // Solid Neon Green
    else if (fpct >= 40) metricFuture.style.color = "#bbf7d0"; // Progress Soft Green
    else metricFuture.style.color = "#fca5a5";                // Low Savings Soft Red
  }
  
  // --- AUTOMATIC DYNAMIC COLOR ENGINE END ---

  // Premium Introspective Copywriting
  const headline = document.getElementById("homeHeroHeadline");
  const sub = document.getElementById("homeHeroSub");
  if (headline && sub) {
    if (!goal) {
      headline.textContent = "Deploy System Target";
      sub.textContent = "Go to Monthly Plan to configure parameters and deploy your target spending baseline.";
    } else if (totalSpent === 0) {
      headline.textContent = "Zero Transactions Logged";
      sub.textContent = "Your sheet is completely clean. First transaction will deploy your system metrics.";
    } else if (totalSpent <= goal) {
      headline.textContent = "Parameters Stable";
      sub.textContent = "Conscious monitoring configuration active inside designated framework limits.";
    } else {
      headline.textContent = "Target Limit Crossed";
      sub.textContent = "Boundary threshold exceeded. No guilt constraint — notice systemic patterns for next season.";
    }
  }
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
             "Your Essentials budget is fully used for this month. Treat this as a clear signal for planning the next cycle."
          });
        } else if (percentUsed >= 80) {
          alerts.push({
            class: "alert-soft",
            text:
              "Essentials spending is getting close to its limit. Stay aware and adjust if needed."
          });
        }
      } else if (cat === "lifestyle") {
        if (percentUsed >= 100) {
          alerts.push({
            class: "alert-strong",
            text:
              "Lifestyle spending has crossed the planned limit. Notice the pattern this month."
          });
          row.classList.add("shake-x");
        } else if (percentUsed >= 70) {
          alerts.push({
            class: "alert-warn",
            text:
             "Lifestyle spending is getting heavy. If it still feels right, own it; if not, consider slowing down."
          });
          row.classList.add("shake-x");
        }
      } else if (cat === "invest" || cat === "savings") {
        if (spent > 0 && percentUsed < 40) {
          alerts.push({
            class: "alert-soft",
            text:
              "You added a small amount to future you today. Even small steps compound over time."
          });
        } else if (percentUsed >= 100) {
          alerts.push({
            class: "alert-soft",
            text: `You fully used your ${cat === "invest" ? "Investment" : "Savings"} allocation this month. That is a strong long‑term move.`
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

  // stats hero update
  const totalSpent =
    state.spent.essentials +
    state.spent.lifestyle +
    state.spent.invest +
    state.spent.savings;
  const goal = state.monthlyGoal || 0;
  const heroValueEl = document.getElementById("statsHeroValue");
  const heroTagEl = document.getElementById("statsHeroTag");

  if (heroValueEl && heroTagEl) {
    let pct = goal > 0 ? Math.round((totalSpent / goal) * 100) : 0;
    if (pct > 999) pct = 999;
    heroValueEl.textContent = `${pct}%`;

    if (!goal) {
      heroTagEl.textContent = "Set a monthly goal to light this up.";
    } else if (pct === 0) {
      heroTagEl.textContent = "Month just started. Clean slate.";
    } else if (pct < 60) {
      heroTagEl.textContent = "Plenty of room left in this month.";
    } else if (pct < 100) {
      heroTagEl.textContent = "You’re in the awareness zone now.";
    } else {
      heroTagEl.textContent = "Goal crossed. Notice the story, not the shame.";
    }
  }
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
  const amtInput = document.getElementById("amt");
  const val = parseFloat(amtInput.value);
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

  // dopamine pulse on label
  const label = document.querySelector('label[for="amt"]');
  if (label) {
    label.classList.remove("add-pulse");
    void label.offsetWidth;
    label.classList.add("add-pulse");
  }

  amtInput.value = "";
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
  appendSingleSpendRow(spendEntry);
  saveAll();
  
  const limit = state.limits[cat];
  if (limit > 0) {
    const percentUsed = (state.spent[cat] / limit) * 100;
    
    // 80% WARNING (Essentials + Lifestyle only)
    if (percentUsed >= 80 && (cat === 'essentials' || cat === 'lifestyle') && Notification.permission === 'granted') {
      new Notification('Smart Spend', {
        body: `💡 ${cat.toUpperCase()} ${Math.round(percentUsed)}% - Getting close...`,
        icon: 'icon.png'
      });
    }
    
    // 100% CROSSED (Essentials + Lifestyle only)  
    if (percentUsed >= 100 && (cat === 'essentials' || cat === 'lifestyle') && Notification.permission === 'granted') {
      new Notification('Smart Spend', {
        body: `⚠️ ${cat.toUpperCase()} 100% - Limit crossed. No shame, just notice.`,
        icon: 'icon.png'
      });
    }
    
    // INVESTMENT FULL
    if (cat === 'invest' && percentUsed >= 100 && Notification.permission === 'granted') {
      new Notification('Smart Spend', {
        body: '🎉 INVESTMENTS 100% - Serious wealth move! 💰',
        icon: 'icon.png'
      });
    }
    
    // SAVINGS FULL
    if (cat === 'savings' && percentUsed >= 100 && Notification.permission === 'granted') {
      new Notification('Smart Spend', {
        body: '🏆 SAVINGS 100% - Future-you is rich today! ✨',
        icon: 'icon.png'
      });
    }
  }
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

  if (!goal || spentTotal <= goal) {
    score += 20;
  } else {
    const ratio = spentTotal / goal;
    if (ratio <= 1.2) score += 10;
    else if (ratio <= 1.5) score += 0;
    else score -= 10;
  }

  const invLimit = state.limits.invest || 0;
  const savLimit = state.limits.savings || 0;
  const futureLimit = invLimit + savLimit;
  const futureSpent = state.spent.invest + state.spent.savings;

  if (futureLimit > 0) {
    const fr = futureSpent / futureLimit;
    if (fr >= 1.0) score += 30;
    else if (fr >= 0.7) score += 20;
    else if (fr >= 0.4) score += 10;
  }

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
  if (t >= 500) return "Legend";
  if (t >= 300) return "Champion";
  if (t >= 150) return "Master";
  if (t >= 100) return "Crystal";
  if (t >= 60)  return "Gold";
  if (t >= 30)  return "Silver";
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
    ).toLocaleString()} less than your goal, that’s a quiet win.`;
  }

  history = history.filter(h => h.monthId !== currentId);
  history.push({
    monthId: currentId,
    score,
    deltaT,
    trophiesAfter: trophies,
    league,
    summary: summaryText + extraMsg,
    actualSpent: spentTotal 
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

    const sorted = history.slice().sort((a, b) => b.monthId.localeCompare(a.monthId));

    sorted.forEach(h => {
        const card = document.createElement("div");
        card.className = "trophy-card";

        const deltaClass = h.deltaT >= 0 ? "pos" : "neg";
        const sign = h.deltaT > 0 ? "+" : "";

        // YEH HAI WO CHANGE JO TUMHE CHAHIYE
        const displayTotal = `Total Month Spend: ₹${(h.actualSpent || 0).toLocaleString()}`;

        card.innerHTML = `
            <div class="trophy-card-main">
                <div class="trophy-card-month">${monthLabelFromId(h.monthId)}</div>
                <div class="trophy-card-summary">${h.summary}</div>
                <div style="font-size: 11px; color: var(--gold-leaf); margin-top: 6px; font-weight: 700;">
                    ${displayTotal}
                </div>
            </div>
            <div class="trophy-card-right">
                <div class="trophy-card-delta ${deltaClass}">${sign}${h.deltaT} trophies</div>
                <div style="margin-top: 4px; color: #6b7280; font-size: 10px;">${h.trophiesAfter} · ${h.league}</div>
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

/* SPENDS LIST + PERFORMANCE */

function recalcTotalsFromSpends() {
  state.spent = { essentials: 0, lifestyle: 0, invest: 0, savings: 0 };
  state.spends.forEach(s => {
    if (state.spent.hasOwnProperty(s.category)) {
      state.spent[s.category] += s.amount;
    }
  });
}

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

  state.spends
    .slice()
    .reverse()
    .forEach(s => appendSingleSpendRow(s, box));
}

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

/* EDIT SPEND */

async function editSpend(id, rowNode) {
  const entry = state.spends.find(s => s.id === id);
  if (!entry) return;

  const newAmtStr = await openInput({
    title: "Edit spend",
    message: `Update amount for ${entry.category.toUpperCase()}`,

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

/* DELETE SPEND */

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

/* FULL RESET */

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
  
  renderTrophiesScreen();
  updateTrophyHeader();
  updateHomeTrophyCTA();
  renderSpendsList();
  saveAll();
}

/* SERVICE WORKER + PWA BANNER AUTO UPDATE LOGIC */
let newWorker;
let deferredPrompt;
const installBanner = document.getElementById('pwa-install-banner');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Smart-Spend/sw.js', { updateViaCache: 'none' })
    .then(reg => {
      console.log('SW Auto-Update Ready');
      
      reg.addEventListener('updatefound', () => {
        newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            showUpdateToast();
          }
        });
      });
      
      // Check updates every 3 min
      setInterval(() => reg.update(), 3 * 60 * 1000);
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    location.reload();
  });
}

function showUpdateToast() {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;top:20px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
    color:white;padding:15px 25px;border-radius:25px;
    box-shadow:0 20px 40px rgba(0,0,0,0.3);z-index:10000;
    font-weight:600;font-size:16px;
  `;
  toast.innerHTML = `🎉 New version ready! <button onclick="location.reload()" style="background:#FFD700;color:#333;border:none;padding:8px 16px;border-radius:20px;margin-left:15px;font-weight:600;cursor:pointer;font-size:14px;">Update Now</button>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 10000);
}

// PWA INSTALL BANNER
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    if(installBanner) {
      installBanner.classList.add('show');
      installBanner.classList.remove('hidden');
    }
  }, 3000);
});

if(document.getElementById('btn-install-now')) {
  document.getElementById('btn-install-now').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        if(installBanner) installBanner.classList.remove('show');
      }
      deferredPrompt = null;
    }
  });
}

if(document.getElementById('btn-close-banner')) {
  document.getElementById('btn-close-banner').addEventListener('click', () => {
    if(installBanner) installBanner.classList.remove('show');
  });
}
