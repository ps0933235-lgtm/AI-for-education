const studentDataPrefix = () => `learnova.student.${currentStudent.id}.`;
const STORE = {
  tasks: "tasks",
  quizHistory: "quizHistory",
  topics: "topics",
  activities: "activities",
  notesCount: "notesCount",
};

let currentStudent = null;
let tasks = [];
let quizHistory = [];
let learnedTopics = [];
let recentActivities = [];
let notesGenerated = 0;
let activeQuiz = null;
let currentFlashcards = [];
let flashcardIndex = 0;
let flashcardFlipped = false;
let tutorAbortController = null;
let quizAbortController = null;
let lastTutorAnswer = null;
let lastTutorTopic = "";
let lastTutorContext = "";
let lastNotesRequest = null;
let currentNotesText = "";

const getElement = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function readStoredValue(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch {
    return fallback;
  }
}

function saveStudentValue(name, value) {
  try {
    localStorage.setItem(`${studentDataPrefix()}${STORE[name]}`, JSON.stringify(value));
  } catch {
    document.querySelector(".autosave-label")?.replaceChildren(document.createTextNode("Could not save on this device"));
  }
}

function recordActivity(label, detail, href, icon) {
  recentActivities.unshift({ label, detail, href, icon, at: new Date().toISOString() });
  recentActivities = recentActivities.slice(0, 20);
  saveStudentValue("activities", recentActivities);
}

function recordTopic(topic) {
  const cleanTopic = topic.trim();
  if (!learnedTopics.some((item) => item.toLowerCase() === cleanTopic.toLowerCase())) {
    learnedTopics.unshift(cleanTopic);
    learnedTopics = learnedTopics.slice(0, 100);
    saveStudentValue("topics", learnedTopics);
  }
}

async function postJson(url, payload, controller) {
  if (window.location.protocol === "file:") {
    throw new Error("This page was opened directly from a file. Start Learnova, then open http://localhost:3000.");
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("The Learnova server could not be reached. Start server.js and open the site at http://localhost:3000.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response. Please try again.");
  }
  if (response.status === 401) {
    window.location.replace("login.html");
    throw new Error("Please log in to continue.");
  }
  if (!response.ok) throw new Error(result.error || `That didn’t work (${response.status}). Please try again.`);
  return result;
}

function setTheme() {
  const toggle = getElement("themeToggle");
  if (!toggle) return;
  let theme = "light";
  try { theme = localStorage.getItem("learnova.theme") || "light"; } catch {}
  document.body.classList.toggle("dark-mode", theme === "dark");
  const updateToggle = () => {
    const dark = document.body.classList.contains("dark-mode");
    toggle.textContent = dark ? "☀" : "☾";
    toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    try { localStorage.setItem("learnova.theme", dark ? "dark" : "light"); } catch {}
  };
  updateToggle();
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    updateToggle();
  });
}

function updateProgress() {
  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalScore = quizHistory.reduce((total, quiz) => total + Number(quiz.score || 0), 0);
  const average = quizHistory.length ? Math.round(totalScore / quizHistory.length) : 0;
  const marksEarned = quizHistory.reduce((total, quiz) => total + Number(quiz.marks || 0), 0);
  const possibleMarks = quizHistory.reduce((total, quiz) => total + Number(quiz.totalQuestions || 0), 0);
  const taskPercentage = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  getElement("quizCount").textContent = quizHistory.length;
  getElement("averageScore").textContent = average;
  getElement("totalMarks").textContent = marksEarned;
  getElement("totalMarksMeta").textContent = `Across ${possibleMarks} questions`;
  getElement("taskCount").textContent = completedTasks;
  getElement("progressQuizCount").textContent = quizHistory.length;
  getElement("progressScore").textContent = average;
  getElement("progressMarks").textContent = `${marksEarned} / ${possibleMarks} marks earned`;
  getElement("progressTaskCount").textContent = completedTasks;
  getElement("taskProgressLabel").textContent = taskPercentage;
  getElement("quizProgressBar").style.width = `${average}%`;
  getElement("taskProgressBar").style.width = `${taskPercentage}%`;
}

function renderTasks() {
  const list = getElement("taskList");
  getElement("taskTotal").textContent = tasks.length;
  if (!tasks.length) {
    list.innerHTML = '<li class="task-empty">Nothing on the list yet. Add one small step to begin 🌱</li>';
    updateProgress();
    return;
  }
  list.innerHTML = tasks.map((task) => `
    <li class="task-item${task.completed ? " is-complete" : ""}">
      <input class="task-checkbox" type="checkbox" data-task-action="toggle" data-task-id="${escapeHTML(task.id)}" aria-label="Mark ${escapeHTML(task.title)} ${task.completed ? "as not complete" : "as complete"}"${task.completed ? " checked" : ""}>
      <div class="task-text"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.subject)}${task.date ? ` · ${escapeHTML(formatTaskDate(task.date))}` : ""}</span></div>
      <button class="task-delete" type="button" data-task-action="delete" data-task-id="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">×</button>
    </li>`).join("");
  updateProgress();
}

function formatTaskDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

getElement("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const subject = getElement("taskSubject").value.trim();
  const title = getElement("taskName").value.trim();
  if (!subject || !title) return;
  tasks.unshift({
    id: `${Date.now()}-${crypto.randomUUID()}`,
    subject,
    title,
    date: getElement("taskDate").value,
    completed: false,
  });
  saveStudentValue("tasks", tasks);
  renderTasks();
  recordActivity("Added a study task", `${subject} · ${title}`, "index.html#planner", "🗓️");
  event.currentTarget.reset();
  getElement("taskSubject").focus();
});

getElement("taskList").addEventListener("change", (event) => {
  const control = event.target.closest("[data-task-action='toggle']");
  if (!control) return;
  const task = tasks.find((item) => item.id === control.dataset.taskId);
  if (!task) return;
  task.completed = control.checked;
  saveStudentValue("tasks", tasks);
  if (task.completed) recordActivity("Completed a study task", task.title, "index.html#planner", "✓");
  renderTasks();
});

getElement("taskList").addEventListener("click", (event) => {
  const control = event.target.closest("[data-task-action='delete']");
  if (!control) return;
  tasks = tasks.filter((task) => task.id !== control.dataset.taskId);
  saveStudentValue("tasks", tasks);
  renderTasks();
});

function setTutorBusy(isBusy) {
  getElement("tutorSubmit").disabled = isBusy;
  getElement("tutorResponse").setAttribute("aria-busy", String(isBusy));
}

function renderTutorAnswer(answer, topic) {
  const sections = answer.sections.map((section) => `
    <section class="tutor-answer-section"><span class="answer-label">${escapeHTML(section.heading)}</span>
      <p>${escapeHTML(section.content)}</p>
      ${section.points?.length ? `<ul>${section.points.map((point) => `<li>${escapeHTML(point)}</li>`).join("")}</ul>` : ""}
    </section>`).join("");
  const followUps = answer.followUps.map((question) => `
    <button type="button" data-tutor-followup="${escapeHTML(question)}">${escapeHTML(question)}</button>`).join("");
  getElement("tutorResponse").innerHTML = `<article class="tutor-answer">
    <div class="tutor-answer-header"><h4>${escapeHTML(answer.title)}</h4><span class="demo-badge live-badge">AI ANSWER</span></div>
    ${sections}
    <p class="notes-accuracy-note">AI answers can make mistakes. Check important facts with your course materials or teacher.</p>
    <div class="tutor-followups" aria-label="Ask a follow-up question">${followUps}</div>
  </article>`;
}

function showTutorError(message) {
  getElement("tutorResponse").innerHTML = `<p class="tutor-error"><span class="tutor-error-icon">!</span><span>${escapeHTML(message)}</span></p>`;
}

async function askTutor(topic, question = "", followUp = false) {
  const normalizedTopic = topic.trim();
  if (!normalizedTopic) {
    showTutorError("Please enter a topic or question so your tutor knows what to explain.");
    getElement("tutorTopic").focus();
    return;
  }
  if (tutorAbortController) tutorAbortController.abort();
  const controller = new AbortController();
  tutorAbortController = controller;
  if (!followUp || normalizedTopic.toLowerCase() !== lastTutorTopic.toLowerCase()) lastTutorContext = "";
  setTutorBusy(true);
  getElement("tutorResponse").innerHTML = '<div class="tutor-loading" role="status"><span class="tutor-spinner" aria-hidden="true"></span><span>Thinking it through with you<span class="tutor-loading-dots"></span></span></div>';
  try {
    const result = await postJson("/api/tutor", {
      topic: normalizedTopic,
      question,
      context: followUp ? lastTutorContext : "",
      intent: followUp ? "simple" : getElement("tutorIntent").value,
      level: getElement("tutorLevel").value,
      language: getElement("tutorLanguage").value,
    }, controller);
    lastTutorAnswer = result.answer;
    lastTutorTopic = normalizedTopic;
    lastTutorContext = `${result.answer.title}\n${result.answer.sections.map((section) => `${section.heading}: ${section.content}`).join("\n")}`.slice(0, 3500);
    getElement("tutorTopic").value = normalizedTopic;
    renderTutorAnswer(result.answer, normalizedTopic);
    recordTopic(normalizedTopic);
    recordActivity("Learned about a topic", normalizedTopic, "index.html#tutor", "✨");
  } catch (error) {
    if (error.name !== "AbortError") showTutorError(error.message);
  } finally {
    if (tutorAbortController === controller) {
      setTutorBusy(false);
      tutorAbortController = null;
    }
  }
}

getElement("tutorForm").addEventListener("submit", (event) => {
  event.preventDefault();
  askTutor(getElement("tutorTopic").value);
});

getElement("clearTutor").addEventListener("click", () => {
  tutorAbortController?.abort();
  tutorAbortController = null;
  getElement("tutorForm").reset();
  getElement("tutorResponse").innerHTML = '<div class="response-placeholder"><span>💬</span><p>Your explanation will show up here.<br><small>Ask about anything you’re learning.</small></p></div>';
  getElement("tutorResponse").setAttribute("aria-busy", "false");
  getElement("tutorSubmit").disabled = false;
  lastTutorAnswer = null;
  lastTutorContext = "";
  lastTutorTopic = "";
  getElement("tutorTopic").focus();
});

getElement("tutorResponse").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tutor-followup]");
  if (!button || !lastTutorAnswer) return;
  askTutor(lastTutorTopic, button.dataset.tutorFollowup, true);
});

function setQuizBusy(isBusy) {
  getElement("startQuizButton").disabled = isBusy;
  getElement("quizWorkspace").setAttribute("aria-busy", String(isBusy));
}

function showQuizError(message) {
  getElement("quizWorkspace").innerHTML = `<div class="quiz-error-state"><div class="empty-illustration">⚠️</div><h3>We couldn’t make that quiz.</h3><p class="quiz-error">${escapeHTML(message)}</p><p>Check your topic and server setup, then try again.</p></div>`;
}

function renderQuizQuestion() {
  const quiz = activeQuiz;
  const question = quiz.questions[quiz.index];
  const letters = ["A", "B", "C", "D"];
  const options = question.options.map((option, index) => {
    const state = quiz.answered && index === question.answerIndex ? " is-correct"
      : quiz.answered && index === quiz.selected && index !== question.answerIndex ? " is-wrong" : "";
    return `<button class="quiz-option${state}" type="button" data-answer="${index}"${quiz.answered ? " disabled" : ""}>
      <span class="option-letter">${letters[index]}</span><span>${escapeHTML(option)}</span></button>`;
  }).join("");
  const completed = quiz.answered ? quiz.index + 1 : quiz.index;
  const progress = (completed / quiz.questions.length) * 100;
  getElement("quizWorkspace").innerHTML = `
    <div class="quiz-heading"><div><h3>${escapeHTML(quiz.title)}</h3><p>${escapeHTML(quiz.subject)} · ${escapeHTML(quiz.topic)} · ${escapeHTML(quiz.level)} practice</p></div><span class="quiz-counter">${quiz.index + 1} / ${quiz.questions.length}</span></div>
    <div class="quiz-question"><h4>${quiz.index + 1}. ${escapeHTML(question.question)}</h4><div class="quiz-options">${options}</div>
    ${quiz.answered ? `<p class="quiz-explanation"><strong>${quiz.selected === question.answerIndex ? "That’s right!" : "Good try."}</strong> ${escapeHTML(question.explanation)}</p>` : ""}</div>
    <div class="quiz-progress" role="progressbar" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
    <div class="quiz-actions"><p>${quiz.score} correct so far</p>${quiz.answered ? `<button class="button button-primary" type="button" data-quiz-next>${quiz.index === quiz.questions.length - 1 ? "See my score" : "Next question"} →</button>` : ""}</div>`;
}

function showQuizResults() {
  const quiz = activeQuiz;
  const score = Math.round((quiz.score / quiz.questions.length) * 100);
  quizHistory.unshift({
    score,
    marks: quiz.score,
    totalQuestions: quiz.questions.length,
    topic: quiz.topic,
    completedAt: new Date().toISOString(),
  });
  quizHistory = quizHistory.slice(0, 100);
  saveStudentValue("quizHistory", quizHistory);
  updateProgress();
  const message = score === 100 ? "Look at that—you got every one!" : score >= 60 ? "A lovely effort. Keep building on it." : "Every answer is a chance to learn something new.";
  getElement("quizWorkspace").innerHTML = `
    <div class="quiz-results"><div class="score-ring">${score}%</div><h3>${message}</h3>
    <p>You got ${quiz.score} out of ${quiz.questions.length} questions right on <strong>${escapeHTML(quiz.topic)}</strong>.</p>
    <p class="demo-disclaimer" style="justify-content:center">Your score is saved to your account’s learning progress on this device.</p>
    <button class="button button-primary" type="button" id="restartQuiz">Try again <span aria-hidden="true">↻</span></button></div>`;
  recordActivity("Finished a quiz", `${quiz.topic} · ${score}%`, "index.html#quiz", "🧩");
  getElement("restartQuiz").addEventListener("click", startQuiz);
}

async function startQuiz(event) {
  if (event) event.preventDefault();
  const subject = getElement("quizSubject").value === "Other"
    ? getElement("customQuizSubject").value.trim()
    : getElement("quizSubject").value;
  const topic = getElement("quizTopic").value.trim();
  const count = Number(getElement("questionCount").value);
  const level = getElement("quizLevel").value;
  if (!subject) {
    showQuizError("Enter the subject you want to practice.");
    getElement("customQuizSubject").focus();
    return;
  }
  if (!topic) {
    showQuizError("Add a topic so the questions match what you’re learning.");
    getElement("quizTopic").focus();
    return;
  }
  if (quizAbortController) quizAbortController.abort();
  const controller = new AbortController();
  quizAbortController = controller;
  activeQuiz = null;
  setQuizBusy(true);
  getElement("quizWorkspace").innerHTML = '<div class="quiz-loading" role="status"><span class="tutor-spinner" aria-hidden="true"></span><span>Making a thoughtful practice quiz for you…</span></div>';
  try {
    const result = await postJson("/api/quiz", { subject, topic, level, count }, controller);
    const questions = result.quiz.questions.map((question) => ({
      ...question,
      answerIndex: question.answerIndex,
    }));
    activeQuiz = {
      title: result.quiz.title,
      subject,
      topic,
      level,
      questions,
      index: 0,
      score: 0,
      answered: false,
      selected: null,
    };
    renderQuizQuestion();
    recordTopic(topic);
    recordActivity("Started a quiz", `${subject} · ${topic}`, "index.html#quiz", "🧩");
    getElement("quizWorkspace").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (error.name !== "AbortError") showQuizError(error.message);
  } finally {
    if (quizAbortController === controller) {
      setQuizBusy(false);
      quizAbortController = null;
    }
  }
}

getElement("quizForm").addEventListener("submit", startQuiz);
getElement("quizSubject").addEventListener("change", () => {
  const isOther = getElement("quizSubject").value === "Other";
  getElement("customSubjectField").hidden = !isOther;
  getElement("customQuizSubject").required = isOther;
});

getElement("quizWorkspace").addEventListener("click", (event) => {
  const answerButton = event.target.closest("[data-answer]");
  if (answerButton && activeQuiz && !activeQuiz.answered) {
    activeQuiz.selected = Number(answerButton.dataset.answer);
    activeQuiz.answered = true;
    if (activeQuiz.selected === activeQuiz.questions[activeQuiz.index].answerIndex) activeQuiz.score += 1;
    renderQuizQuestion();
    return;
  }
  if (!event.target.closest("[data-quiz-next]") || !activeQuiz) return;
  if (activeQuiz.index === activeQuiz.questions.length - 1) {
    showQuizResults();
    return;
  }
  activeQuiz.index += 1;
  activeQuiz.answered = false;
  activeQuiz.selected = null;
  renderQuizQuestion();
});

const notesForm = getElement("notesForm");
const notesOutput = getElement("notesOutput");
const notesFormError = getElement("notesFormError");

const notesString = (value) => escapeHTML(String(value ?? ""));
const notesList = (items) => `<ul>${items.map((item) => `<li>${notesString(item)}</li>`).join("")}</ul>`;
const notesUiLabels = {
  english: {
    language: "English", levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
    types: { short: "Short Notes", detailed: "Detailed Notes", exam: "Exam Notes" },
    lengths: { "one-page": "1-page", "two-page": "2-page", detailed: "Detailed" },
    document: "AI-GENERATED STUDY NOTES", studyNotes: "Study notes",
    introduction: "1. Topic introduction", definition: "2. Simple definition",
    explanation: "3. Explanation in easy language", headings: "4. Important headings and subheadings",
    steps: "5. Step-by-step explanation", flowchart: "Flowchart",
    examples: "6. Real-life examples", keywords: "7. Important keywords",
    advantages: "8. Advantages and disadvantages", advantage: "Advantages",
    disadvantage: "Disadvantages or limitations", points: "9. Important points to remember",
    summary: "10. Short summary", examQuestions: "11. Important exam questions with answers",
    mcqs: "12. MCQs with correct answers", answer: "Answer:", correct: "Correct answer",
    accuracy: "AI-generated content can contain mistakes. Check important facts against your course materials or ask your teacher.",
  },
  hindi: {
    language: "हिंदी", levels: { beginner: "शुरुआती", intermediate: "मध्यवर्ती", advanced: "उन्नत" },
    types: { short: "संक्षिप्त नोट्स", detailed: "विस्तृत नोट्स", exam: "परीक्षा नोट्स" },
    lengths: { "one-page": "1 पृष्ठ", "two-page": "2 पृष्ठ", detailed: "विस्तृत" },
    document: "AI द्वारा तैयार अध्ययन नोट्स", studyNotes: "अध्ययन नोट्स",
    introduction: "1. विषय का परिचय", definition: "2. सरल परिभाषा",
    explanation: "3. बहुत आसान भाषा में व्याख्या", headings: "4. महत्वपूर्ण शीर्षक और उपशीर्षक",
    steps: "5. चरण-दर-चरण व्याख्या", flowchart: "प्रवाह-चित्र",
    examples: "6. वास्तविक जीवन के उदाहरण", keywords: "7. महत्वपूर्ण शब्द",
    advantages: "8. फ़ायदे और नुकसान", advantage: "फ़ायदे",
    disadvantage: "नुकसान या सीमाएँ", points: "9. याद रखने योग्य महत्वपूर्ण बातें",
    summary: "10. छोटा सारांश", examQuestions: "11. महत्वपूर्ण परीक्षा प्रश्न और उत्तर",
    mcqs: "12. सही उत्तर सहित बहुविकल्पीय प्रश्न", answer: "उत्तर:", correct: "सही उत्तर",
    accuracy: "AI से बनी सामग्री में गलती हो सकती है। महत्वपूर्ण तथ्यों को अपनी पाठ्य सामग्री से जाँचें या शिक्षक से पूछें।",
  },
  hinglish: {
    language: "Hinglish", levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
    types: { short: "Short Notes", detailed: "Detailed Notes", exam: "Exam Notes" },
    lengths: { "one-page": "1-page", "two-page": "2-page", detailed: "Detailed" },
    document: "AI-GENERATED STUDY NOTES", studyNotes: "Study notes",
    introduction: "1. Topic ka introduction", definition: "2. Simple definition",
    explanation: "3. Bahut easy language mein explanation", headings: "4. Important headings aur subheadings",
    steps: "5. Step-by-step explanation", flowchart: "Flowchart",
    examples: "6. Real-life examples", keywords: "7. Important keywords",
    advantages: "8. Faayde aur nuksaan", advantage: "Faayde",
    disadvantage: "Nuksaan ya limitations", points: "9. Yaad rakhne wali important baatein",
    summary: "10. Short summary", examQuestions: "11. Important exam questions aur answers",
    mcqs: "12. Correct answers ke saath MCQs", answer: "Answer:", correct: "Correct answer",
    accuracy: "AI-generated content mein mistakes ho sakti hain. Important facts ko apne course material se check karo ya teacher se poochho.",
  },
};

function renderGeneratedNotes(notes, settings) {
  const labels = notesUiLabels[settings.language] || notesUiLabels.english;
  const headings = notes.headings.map((heading) => `
    <div class="note-subheading"><h5>${notesString(heading.title)}</h5>${notesList(heading.points)}</div>`).join("");
  const keywords = `<ul>${notes.keywords.map((keyword) => `<li><strong class="note-keyword">${notesString(keyword.term)}</strong> — ${notesString(keyword.meaning)}</li>`).join("")}</ul>`;
  const examQuestions = notes.examQuestions.map((item, index) => `
    <div class="notes-exam-question"><strong>Q${index + 1}. ${notesString(item.question)}</strong><p><b>${notesString(labels.answer)}</b> ${notesString(item.answer)}</p></div>`).join("");
  const mcqs = notes.mcqs.map((item, index) => `
    <div class="notes-mcq"><strong>Q${index + 1}. ${notesString(item.question)}</strong>
      ${notesList(item.options.map((option) => option === item.correctAnswer ? `${option} ✓ (${labels.correct})` : option))}
      <p class="notes-mcq-answer">${notesString(labels.answer)} ${notesString(item.correctAnswer)}. ${notesString(item.explanation)}</p>
    </div>`).join("");
  const comparison = notes.comparison ? `
    <section class="note-block"><h5>${notesString(notes.comparison.title)}</h5><div class="notes-table-wrap"><table class="notes-table">
      <thead><tr>${notes.comparison.columns.map((column) => `<th>${notesString(column)}</th>`).join("")}</tr></thead>
      <tbody>${notes.comparison.rows.map((row) => `<tr>${row.map((cell) => `<td>${notesString(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></section>` : "";
  const flowchart = notes.flowchart?.length ? `
    <section class="note-block"><h5>${notesString(labels.flowchart)}</h5><div class="notes-flow">${notes.flowchart.map((step, index) => `${index ? '<span class="notes-flow-arrow" aria-hidden="true">→</span>' : ""}<span class="notes-flow-step">${notesString(step)}</span>`).join("")}</div></section>` : "";
  return `<article class="generated-notes">
    <header class="notes-document-header"><p>${notesString(labels.document)} · ${notesString(labels.levels[settings.level])} · ${notesString(labels.types[settings.notesType])}</p><h4>${notesString(notes.title || settings.topic)}</h4><p>${notesString(settings.subject || labels.studyNotes)} · ${notesString(labels.language)} · ${notesString(labels.lengths[settings.length])}</p></header>
    <section class="note-block"><h5>${notesString(labels.introduction)}</h5><p>${notesString(notes.introduction)}</p></section>
    <section class="note-block"><h5>${notesString(labels.definition)}</h5><p class="note-definition"><strong>${notesString(notes.definition)}</strong></p></section>
    <section class="note-block"><h5>${notesString(labels.explanation)}</h5><p>${notesString(notes.explanation)}</p></section>
    <section class="note-block"><h5>${notesString(labels.headings)}</h5>${headings || "<p>No subtopics were returned.</p>"}</section>
    <section class="note-block"><h5>${notesString(labels.steps)}</h5>${notesList(notes.steps)}</section>${flowchart}
    <section class="note-block"><h5>${notesString(labels.examples)}</h5>${notesList(notes.examples)}</section>
    <section class="note-block"><h5>${notesString(labels.keywords)}</h5>${keywords}</section>${comparison}
    <section class="note-block"><h5>${notesString(labels.advantages)}</h5><h6>${notesString(labels.advantage)}</h6>${notesList(notes.advantages)}<h6>${notesString(labels.disadvantage)}</h6>${notesList(notes.disadvantages)}</section>
    <section class="note-block"><h5>${notesString(labels.points)}</h5>${notesList(notes.importantPoints)}</section>
    <section class="note-block"><h5>${notesString(labels.summary)}</h5><p class="notes-summary">${notesString(notes.summary)}</p></section>
    <section class="note-block"><h5>${notesString(labels.examQuestions)}</h5>${examQuestions}</section>
    <section class="note-block"><h5>${notesString(labels.mcqs)}</h5>${mcqs}</section>
    <p class="notes-accuracy-note">${notesString(labels.accuracy)}</p></article>`;
}

function validateNotes(notes) {
  const arrayFields = ["steps", "examples", "keywords", "advantages", "disadvantages", "importantPoints", "examQuestions", "mcqs", "headings"];
  const stringFields = ["title", "introduction", "definition", "explanation", "summary"];
  const isStringList = (items) => Array.isArray(items) && items.every((item) => typeof item === "string");
  if (!notes || typeof notes !== "object" || stringFields.some((field) => typeof notes[field] !== "string")
      || arrayFields.some((field) => !Array.isArray(notes[field]))) {
    throw new Error("The AI returned incomplete notes. Please try again.");
  }
  if (!notes.steps.length || !notes.examples.length || !notes.mcqs.length
      || !notes.headings.every((item) => item && typeof item.title === "string" && isStringList(item.points))
      || !notes.keywords.every((item) => item && typeof item.term === "string" && typeof item.meaning === "string")
      || !notes.examQuestions.every((item) => item && typeof item.question === "string" && typeof item.answer === "string")
      || !notes.mcqs.every((item) => item && typeof item.question === "string" && Array.isArray(item.options)
        && item.options.length === 4 && item.options.every((option) => typeof option === "string")
        && item.options.includes(item.correctAnswer) && typeof item.explanation === "string")) {
    throw new Error("The AI returned incomplete note sections. Please try again.");
  }
  if (notes.comparison && (!Array.isArray(notes.comparison.columns) || !Array.isArray(notes.comparison.rows)
      || !notes.comparison.rows.every((row) => Array.isArray(row) && row.length === notes.comparison.columns.length))) {
    throw new Error("The AI returned an invalid comparison table. Please try again.");
  }
  return notes;
}

function readNotesSettings() {
  return {
    topic: getElement("notesTopic").value.trim(),
    language: getElement("notesLanguage").value,
    level: getElement("notesLevel").value,
    notesType: getElement("notesType").value,
    explanation: getElement("notesExplanation").value,
    length: getElement("notesLength").value,
  };
}

function setNotesBusy(isBusy) {
  getElement("generateNotes").disabled = isBusy;
  getElement("regenerateNotes").disabled = isBusy || !lastNotesRequest;
  getElement("copyNotes").disabled = isBusy || !currentNotesText;
  getElement("downloadNotesPDF").disabled = isBusy || !currentNotesText;
  notesOutput.setAttribute("aria-busy", String(isBusy));
}

async function generateNotes(settings = readNotesSettings()) {
  notesFormError.hidden = true;
  notesFormError.textContent = "";
  if (!settings.topic) {
    notesFormError.textContent = "Enter a topic, subject, or chapter before making notes.";
    notesFormError.hidden = false;
    getElement("notesTopic").focus();
    return;
  }
  lastNotesRequest = settings;
  currentNotesText = "";
  setNotesBusy(true);
  notesOutput.innerHTML = '<div class="notes-loading" role="status"><span class="tutor-spinner" aria-hidden="true"></span><span>Making your study notes with the configured AI…</span></div>';
  try {
    const result = await postJson("/api/notes", settings);
    const notes = validateNotes(result.notes);
    notesOutput.innerHTML = renderGeneratedNotes(notes, settings);
    currentNotesText = notesOutput.innerText.trim();
    notesGenerated += 1;
    saveStudentValue("notesCount", notesGenerated);
    recordTopic(settings.topic);
    recordActivity("Made study notes", settings.topic, "index.html#notes", "📝");
  } catch (error) {
    notesOutput.innerHTML = '<div class="response-placeholder"><span>⚠️</span><p>Notes could not be made.<br><small>Check the message above and try again.</small></p></div>';
    notesFormError.textContent = error.message || "Could not reach the notes service. Start the backend and try again.";
    notesFormError.hidden = false;
  } finally {
    setNotesBusy(false);
  }
}

notesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  generateNotes();
});

getElement("regenerateNotes").addEventListener("click", () => {
  if (lastNotesRequest) generateNotes({ ...lastNotesRequest });
});

getElement("copyNotes").addEventListener("click", async () => {
  if (!currentNotesText) return;
  const button = getElement("copyNotes");
  try {
    await navigator.clipboard.writeText(currentNotesText);
    button.textContent = "✓ Copied!";
  } catch {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = currentNotesText;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      button.textContent = copied ? "✓ Copied!" : "Copy unavailable";
    } catch {
      button.textContent = "Copy unavailable";
    }
  }
  window.setTimeout(() => { button.textContent = "▢ Copy notes"; }, 1800);
});

getElement("downloadNotesPDF").addEventListener("click", () => {
  if (currentNotesText) window.print();
});

function setFlashcard(index) {
  if (!currentFlashcards.length) return;
  flashcardIndex = (index + currentFlashcards.length) % currentFlashcards.length;
  flashcardFlipped = false;
  const card = currentFlashcards[flashcardIndex];
  getElement("flashcard").classList.remove("is-flipped");
  getElement("flashcard").setAttribute("aria-pressed", "false");
  getElement("flashcardText").textContent = card.front;
  getElement("flashcardSideLabel").textContent = `QUESTION · ${flashcardIndex + 1} OF ${currentFlashcards.length}`;
  getElement("flashcardCounter").textContent = `${flashcardIndex + 1} / ${currentFlashcards.length}`;
}

function flipFlashcard() {
  if (!currentFlashcards.length) return;
  flashcardFlipped = !flashcardFlipped;
  getElement("flashcard").classList.toggle("is-flipped", flashcardFlipped);
  getElement("flashcard").setAttribute("aria-pressed", String(flashcardFlipped));
  getElement("flashcardText").textContent = flashcardFlipped
    ? currentFlashcards[flashcardIndex].back
    : currentFlashcards[flashcardIndex].front;
  getElement("flashcardSideLabel").textContent = flashcardFlipped ? "ANSWER" : `QUESTION · ${flashcardIndex + 1} OF ${currentFlashcards.length}`;
}

getElement("flashcardForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const topic = getElement("flashcardTopic").value.trim();
  const error = getElement("flashcardError");
  error.hidden = true;
  if (!topic) {
    error.textContent = "Enter a topic first.";
    error.hidden = false;
    return;
  }
  const button = getElement("makeFlashcards");
  button.disabled = true;
  button.textContent = "Making your cards…";
  try {
    const result = await postJson("/api/flashcards", {
      topic,
      level: getElement("flashcardLevel").value,
      language: getElement("flashcardLanguage").value,
    });
    currentFlashcards = result.cards;
    const hasCards = currentFlashcards.length > 0;
    getElement("flashcard").disabled = !hasCards;
    getElement("previousCard").disabled = !hasCards;
    getElement("flipCard").disabled = !hasCards;
    getElement("nextCard").disabled = !hasCards;
    setFlashcard(0);
    recordTopic(topic);
    recordActivity("Made study flashcards", topic, "index.html#flashcards", "🗂️");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Make my flashcards <span aria-hidden="true">→</span>';
  }
});

getElement("flashcard").addEventListener("click", flipFlashcard);
getElement("flipCard").addEventListener("click", flipFlashcard);
getElement("previousCard").addEventListener("click", () => setFlashcard(flashcardIndex - 1));
getElement("nextCard").addEventListener("click", () => setFlashcard(flashcardIndex + 1));

getElement("siteSearch").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = getElement("siteSearchInput").value.trim().toLowerCase();
  const destinations = [
    { terms: ["tutor", "explain", "ask ai", "question", "help"], href: "#tutor" },
    { terms: ["quiz", "test", "practice", "exam"], href: "#quiz" },
    { terms: ["note", "summary", "chapter"], href: "#notes" },
    { terms: ["flashcard", "remember", "cards"], href: "#flashcards" },
    { terms: ["plan", "task", "schedule"], href: "#planner" },
    { terms: ["progress", "score", "dashboard"], href: "#progress" },
  ];
  const destination = destinations.find((item) => item.terms.some((term) => query.includes(term)));
  if (!query || !destination) {
    getElement("siteSearchMessage").textContent = query ? "Try “tutor”, “notes”, “quiz”, “flashcards”, or “planner”." : "Type a tool or topic to find your next step.";
    return;
  }
  getElement("siteSearchMessage").textContent = "";
  document.querySelector(destination.href)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

getElement("logoutButton").addEventListener("click", async () => {
  const button = getElement("logoutButton");
  button.disabled = true;
  try {
    await postJson("/api/auth/logout", {});
    window.location.replace("login.html");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try logging out again";
    button.title = error.message;
  }
});

const menuToggle = getElement("menuToggle");
const primaryNav = getElement("primaryNav");
menuToggle.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  menuToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
  primaryNav.classList.toggle("is-open", !expanded);
});
primaryNav.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  primaryNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
});

async function initializeLearningApp() {
  setTheme();
  getElement("currentYear").textContent = new Date().getFullYear();
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
  try {
    ({ student: currentStudent } = await response.json());
  } catch {
    window.location.replace("login.html");
    return;
  }
  if (!currentStudent) {
    window.location.replace("login.html");
    return;
  }
  getElement("headerStudentName").textContent = currentStudent.name;
  getElement("accountLink").hidden = true;
  getElement("dashboardLink").hidden = false;
  getElement("logoutButton").hidden = false;
  getElement("dashboardGreeting").innerHTML = `Welcome back, <span class="gradient-text">${escapeHTML(currentStudent.name)}</span>.`;
  getElement("dashboardSubheading").textContent = "Pick up where you left off, or choose what you need today.";
  const prefix = studentDataPrefix();
  tasks = readStoredValue(`${prefix}${STORE.tasks}`, []);
  quizHistory = readStoredValue(`${prefix}${STORE.quizHistory}`, []);
  learnedTopics = readStoredValue(`${prefix}${STORE.topics}`, []);
  recentActivities = readStoredValue(`${prefix}${STORE.activities}`, []);
  notesGenerated = Number(readStoredValue(`${prefix}${STORE.notesCount}`, 0)) || 0;
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(quizHistory)) quizHistory = [];
  if (!Array.isArray(learnedTopics)) learnedTopics = [];
  if (!Array.isArray(recentActivities)) recentActivities = [];
  renderTasks();
  updateProgress();
}

initializeLearningApp();
