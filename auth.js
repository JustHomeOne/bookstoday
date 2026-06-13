const USERS_KEY = "libraryUsers";
const SESSION_KEY = "librarySession";
const AUTH_DISABLED = true;

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".auth-panel");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authStatus = document.getElementById("auth-status");

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setSession(email) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, createdAt: new Date().toISOString() }));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function showStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#b91c1c" : "#0f766e";
}

function switchPanel(targetId) {
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === targetId));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === targetId));
  showStatus("");
}

function disableAuth() {
  showStatus("Вход и регистрация временно отключены.", true);
  tabs.forEach((tab) => {
    tab.disabled = true;
    tab.classList.remove("active");
  });
  panels.forEach((panel) => panel.classList.remove("active"));
  document.querySelectorAll("input, button").forEach((el) => {
    el.disabled = true;
  });
}

if (AUTH_DISABLED) {
  disableAuth();
} else {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.target));
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = registerForm.email.value.trim().toLowerCase();
    const password = registerForm.password.value;
    const passwordConfirm = registerForm.passwordConfirm.value;

    if (!email || !password || !passwordConfirm) {
      showStatus("Заполните все поля.", true);
      return;
    }

    if (password !== passwordConfirm) {
      showStatus("Пароли не совпадают.", true);
      return;
    }

    if (password.length < 6) {
      showStatus("Пароль должен быть не менее 6 символов.", true);
      return;
    }

    const users = loadUsers();
    const exists = users.some((user) => user.email === email);

    if (exists) {
      showStatus("Пользователь с таким email уже существует.", true);
      return;
    }

    users.push({ email, password });
    saveUsers(users);
    setSession(email);
    registerForm.reset();
    showStatus("Регистрация прошла успешно. Вы вошли.");
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = loginForm.email.value.trim().toLowerCase();
    const password = loginForm.password.value;

    if (!email || !password) {
      showStatus("Заполните email и пароль.", true);
      return;
    }

    const users = loadUsers();
    const user = users.find((user) => user.email === email && user.password === password);

    if (!user) {
      showStatus("Неверный email или пароль.", true);
      return;
    }

    setSession(email);
    loginForm.reset();
    showStatus(`Вы успешно вошли как ${email}.`);
  });

  const session = getSession();
  if (session && session.email) {
    showStatus(`Текущая сессия: ${session.email}`);
  }
}
