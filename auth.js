const authPage = document.body.dataset.authPage;
const authMessage = document.getElementById("authMessage");

async function postAuth(path, payload) {
  if (window.location.protocol === "file:") {
    throw new Error("This page was opened directly from a file. Start Learnova, then open http://localhost:3000/login.html.");
  }
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("The Learnova server could not be reached. Start server.js and open the site at http://localhost:3000.");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`The login service returned HTTP ${response.status} without JSON. Confirm server.js is running and open http://localhost:3000/login.html.`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The login service returned invalid JSON (HTTP ${response.status}). Check the server terminal and try again.`);
  }
  if (!response.ok) throw new Error(result.error || "That didn’t work. Please try again.");
  return result;
}

function showAuthMessage(message, isError = true) {
  authMessage.textContent = message;
  authMessage.hidden = false;
  authMessage.classList.toggle("is-success", !isError);
  authMessage.setAttribute("role", isError ? "alert" : "status");
}

function setFormBusy(form, busy, buttonText) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = buttonText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-label", `${show ? "Hide" : "Show"} password`);
    button.setAttribute("aria-pressed", String(show));
    input.focus();
  });
});

if (authPage === "login" || authPage === "signup") {
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) return;
      const { student } = await response.json();
      if (student) window.location.replace("dashboard.html");
    })
    .catch(() => {});
}

if (authPage === "login") {
  const form = document.getElementById("loginForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    authMessage.hidden = true;
    setFormBusy(form, true, "Checking your details…");
    try {
      await postAuth("/api/auth/login", {
        identifier: document.getElementById("loginIdentifier").value.trim(),
        password: document.getElementById("loginPassword").value,
        remember: document.getElementById("rememberMe").checked,
      });
      window.location.replace("dashboard.html");
    } catch (error) {
      showAuthMessage(error.message);
      setFormBusy(form, false);
    }
  });
}

if (authPage === "signup") {
  const form = document.getElementById("signupForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const password = document.getElementById("signupPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    if (password !== confirmation) {
      showAuthMessage("Those passwords don’t match yet. Check them and try again.");
      document.getElementById("confirmPassword").focus();
      return;
    }
    authMessage.hidden = true;
    setFormBusy(form, true, "Creating your account…");
    try {
      await postAuth("/api/auth/signup", {
        name: document.getElementById("signupName").value.trim(),
        email: document.getElementById("signupEmail").value.trim(),
        password,
      });
      window.location.replace("dashboard.html");
    } catch (error) {
      showAuthMessage(error.message);
      setFormBusy(form, false);
    }
  });
}

if (authPage === "forgot") {
  const form = document.getElementById("forgotForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    authMessage.hidden = true;
    setFormBusy(form, true, "Sending…");
    try {
      const result = await postAuth("/api/auth/forgot-password", {
        email: document.getElementById("forgotEmail").value.trim(),
      });
      showAuthMessage(result.message, false);
      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "Reset link requested";
    } catch (error) {
      showAuthMessage(error.message);
      setFormBusy(form, false);
    }
  });
}

if (authPage === "reset") {
  const form = document.getElementById("resetForm");
  const resetToken = new URLSearchParams(window.location.search).get("token") || "";
  window.history.replaceState(null, "", window.location.pathname);
  if (!/^[a-f0-9]{64}$/.test(resetToken)) {
    showAuthMessage("This reset link is missing or invalid. Request a new one.");
    form.querySelector("button[type='submit']").disabled = true;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("newPasswordConfirm").value;
    if (password !== confirmation) {
      showAuthMessage("Those passwords don’t match yet. Check them and try again.");
      document.getElementById("newPasswordConfirm").focus();
      return;
    }
    authMessage.hidden = true;
    setFormBusy(form, true, "Saving…");
    try {
      const result = await postAuth("/api/auth/reset-password", { token: resetToken, password });
      showAuthMessage(result.message, false);
      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "Password saved";
    } catch (error) {
      showAuthMessage(error.message);
      setFormBusy(form, false);
    }
  });
}
