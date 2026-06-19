const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".auth-panel");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authStatus = document.getElementById("auth-status");
const currentUserBox = document.getElementById("current-user-box");
const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-button");

function showStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#b91c1c" : "#0f766e";
}

function setLoading(form, isLoading) {
  form.querySelectorAll("input, button").forEach((el) => {
    el.disabled = isLoading;
  });
}

function switchPanel(targetId) {
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === targetId));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === targetId));
  showStatus("");
}

function updateAccountBox(session) {
  const email = session?.user?.email || "";
  currentUserBox.hidden = !email;
  currentUserEmail.textContent = email;
}

function requireSupabaseAuth() {
  if (!hasSupabase()) {
    showStatus("Supabase не подключен. Проверьте supabase-config.js.", true);
    return false;
  }

  return true;
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchPanel(tab.dataset.target));
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireSupabaseAuth()) return;

  const email = registerForm.email.value.trim().toLowerCase();
  const password = registerForm.password.value;
  const passwordConfirm = registerForm.passwordConfirm.value;

  if (password !== passwordConfirm) {
    showStatus("Пароли не совпадают.", true);
    return;
  }

  setLoading(registerForm, true);
  showStatus("Создаем аккаунт...");

  try {
    const { data, error } = await booksDb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });

    if (error) throw error;

    registerForm.reset();
    updateAccountBox(data.session);
    showStatus(data.session
      ? "Аккаунт создан, вы вошли."
      : "Аккаунт создан. Если Supabase попросит подтвердить email, откройте письмо и войдите.");
  } catch (error) {
    showStatus(error.message || "Не удалось зарегистрироваться.", true);
  } finally {
    setLoading(registerForm, false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireSupabaseAuth()) return;

  const email = loginForm.email.value.trim().toLowerCase();
  const password = loginForm.password.value;

  setLoading(loginForm, true);
  showStatus("Входим...");

  try {
    const { data, error } = await booksDb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    loginForm.reset();
    updateAccountBox(data.session);
    showStatus(`Вы вошли как ${data.user.email}.`);
  } catch (error) {
    showStatus(error.message || "Не удалось войти.", true);
  } finally {
    setLoading(loginForm, false);
  }
});

logoutButton.addEventListener("click", async () => {
  if (!requireSupabaseAuth()) return;

  const { error } = await booksDb.auth.signOut();
  if (error) {
    showStatus(error.message || "Не удалось выйти.", true);
    return;
  }

  updateAccountBox(null);
  showStatus("Вы вышли из аккаунта.");
});

async function initAuthPage() {
  if (!requireSupabaseAuth()) {
    loginForm.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
    registerForm.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
    return;
  }

  const { data } = await booksDb.auth.getSession();
  updateAccountBox(data.session);

  if (data.session?.user?.email) {
    showStatus(`Текущий аккаунт: ${data.session.user.email}`);
  }
}

initAuthPage();
