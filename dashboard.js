function loadDashboardData(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function renderRecentActivities(activities) {
  const list = document.getElementById("recentActivities");
  if (!activities.length) {
    list.innerHTML = '<li class="activity-empty">Your learning journey will show up here. Try a topic, make notes, or finish a study task.</li>';
    return;
  }
  list.innerHTML = activities.filter((activity) => activity && typeof activity === "object").slice(0, 6).map((activity) => `
    <li class="recent-activity"><span class="activity-dot" aria-hidden="true">${escapeDashboardText(activity.icon || "✦")}</span>
      <span><strong>${escapeDashboardText(activity.label)}</strong><small>${escapeDashboardText(activity.detail || "")}</small></span>
      <time>${formatActivityDate(activity.at)}</time>
    </li>`).join("");
}

function escapeDashboardText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderDashboard(student) {
  document.getElementById("dashboardWelcome").textContent = `Welcome back, ${student.name}!`;
  const prefix = `learnova.student.${student.id}.`;
  const topics = loadDashboardData(`${prefix}topics`, []);
  const activities = loadDashboardData(`${prefix}activities`, []);
  const notes = loadDashboardData(`${prefix}notesCount`, 0);
  const quizzes = loadDashboardData(`${prefix}quizHistory`, []);
  const tasks = loadDashboardData(`${prefix}tasks`, []);
  const topicList = Array.isArray(topics) ? topics : [];
  const activityList = Array.isArray(activities) ? activities : [];
  const quizList = Array.isArray(quizzes)
    ? quizzes.filter((item) => item && typeof item === "object" && Number.isFinite(Number(item.score)))
    : [];
  const taskList = Array.isArray(tasks) ? tasks.filter((task) => task && typeof task === "object") : [];
  const validNotes = Number.isFinite(Number(notes)) ? Math.max(0, Number(notes)) : 0;
  const average = quizList.length
    ? Math.min(100, Math.max(0, Math.round(quizList.reduce((total, item) => total + Number(item.score || 0), 0) / quizList.length)))
    : 0;
  const completedTasks = taskList.filter((task) => task && task.completed).length;
  const taskPercent = taskList.length ? Math.round((completedTasks / taskList.length) * 100) : 0;

  document.getElementById("dashTopics").textContent = topicList.length;
  document.getElementById("dashNotes").textContent = validNotes;
  document.getElementById("dashQuizzes").textContent = quizList.length;
  document.getElementById("dashTasks").textContent = completedTasks;
  document.getElementById("dashScoreText").textContent = quizList.length
    ? `${average}% average across ${quizList.length} ${quizList.length === 1 ? "quiz" : "quizzes"}`
    : "No quizzes yet. Your first try is waiting.";
  document.getElementById("dashScoreBar").style.width = `${average}%`;
  document.getElementById("dashTaskText").textContent = taskList.length
    ? `${completedTasks} of ${taskList.length} study tasks complete · ${taskPercent}%`
    : "Add a small task when you’re ready.";
  document.getElementById("dashTaskBar").style.width = `${taskPercent}%`;
  renderRecentActivities(activityList);
  const allowedDestinations = ["index.html#tutor", "index.html#notes", "index.html#quiz", "index.html#flashcards", "index.html#planner"];
  const latestDestination = activityList.find((activity) => activity && allowedDestinations.includes(activity.href))?.href;
  if (latestDestination) document.getElementById("continueLearning").href = latestDestination;
}

async function startDashboard() {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  let response;
  try {
    response = await fetch("/api/auth/me", { credentials: "same-origin" });
  } catch {
    window.location.replace("login.html");
    return;
  }
  if (!response.ok) {
    window.location.replace("login.html");
    return;
  }
  const { student } = await response.json();
  if (!student) {
    window.location.replace("login.html");
    return;
  }
  renderDashboard(student);
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  const button = document.getElementById("logoutButton");
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    });
    if (!response.ok) throw new Error("The server could not end this session.");
    window.location.replace("login.html");
  } catch {
    button.disabled = false;
    button.textContent = "Try logging out again";
  }
});

const themeToggle = document.getElementById("themeToggle");
let storedTheme = "light";
try { storedTheme = localStorage.getItem("learnova.theme") || "light"; } catch {}
if (storedTheme === "dark") document.body.classList.add("dark-mode");
themeToggle.textContent = document.body.classList.contains("dark-mode") ? "☀" : "☾";
themeToggle.setAttribute("aria-label", document.body.classList.contains("dark-mode") ? "Switch to light mode" : "Switch to dark mode");
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const dark = document.body.classList.contains("dark-mode");
  try { localStorage.setItem("learnova.theme", dark ? "dark" : "light"); } catch {}
  themeToggle.textContent = dark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
});

startDashboard();
