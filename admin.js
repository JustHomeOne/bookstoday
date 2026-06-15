const ADMIN_PASSWORD = "books-admin-2026";
const TARGET_FORMATS = ["epub", "mobi", "txt"];

const loginSection = document.getElementById("admin-login");
const panelSection = document.getElementById("admin-panel");
const passwordInput = document.getElementById("admin-password");
const loginButton = document.getElementById("admin-login-button");
const loginStatus = document.getElementById("admin-login-status");
const categoryInput = document.getElementById("wikisource-category");
const loadCategoryButton = document.getElementById("load-wikisource-category");
const selectAllButton = document.getElementById("select-all-books");
const selectSafeButton = document.getElementById("select-safe-books");
const importSelectedButton = document.getElementById("import-selected-books");
const importList = document.getElementById("wikisource-list");
const adminStatus = document.getElementById("admin-status");

let categoryPages = [];

function showAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? "#b91c1c" : "#0f766e";
}

function getConverterApiUrl() {
  const config = window.BOOKS_CONVERTER_CONFIG || {};
  return String(config.apiUrl || "").replace(/\/$/, "");
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

async function apiGet(path, params) {
  const apiUrl = getConverterApiUrl();
  if (!apiUrl) {
    throw new Error("Адрес converter-server ещё не указан.");
  }

  const url = new URL(`${apiUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Сервер вернул ошибку.");
  }

  return response.json();
}

async function convertTextFile(file) {
  const apiUrl = getConverterApiUrl();
  const payload = new FormData();
  payload.append("book", file);
  payload.append("formats", JSON.stringify(["epub", "mobi"]));

  const response = await fetch(`${apiUrl}/convert`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Ошибка конвертации.");
  }

  return response.json();
}

function unlockAdmin() {
  sessionStorage.setItem("books-admin-ok", "1");
  loginSection.hidden = true;
  panelSection.hidden = false;
}

function renderCategoryPages() {
  importList.innerHTML = "";

  categoryPages.forEach((page, index) => {
    const row = document.createElement("label");
    row.className = "import-row";
    row.innerHTML = `
      <input type="checkbox" value="${index}" ${page.safe ? "" : "disabled"} />
      <span>
        <strong>${page.title}</strong>
        <small>${page.safe ? "Можно импортировать" : page.reason}</small>
      </span>
    `;
    importList.appendChild(row);
  });

  selectSafeButton.disabled = !categoryPages.some((page) => page.safe);
  selectAllButton.disabled = !categoryPages.length;
  importSelectedButton.disabled = !categoryPages.length;
}

async function loadWikisourceCategory() {
  const url = categoryInput.value.trim();
  if (!url) {
    showAdminStatus("Вставьте ссылку на категорию Викитеки.", true);
    return;
  }

  showAdminStatus("Загружаю список страниц из Викитеки...");
  const result = await apiGet("/wikisource/category", { url });
  categoryPages = result.pages;
  renderCategoryPages();
  showAdminStatus(`Найдено страниц: ${categoryPages.length}. Выберите книги для импорта.`);
}

function getSelectedPages() {
  return [...importList.querySelectorAll("input[type='checkbox']:checked")]
    .map((input) => categoryPages[Number(input.value)])
    .filter(Boolean);
}

async function importOneWikisourceBook(page) {
  const book = await apiGet("/wikisource/book", { url: page.url });
  const duplicate = await findDuplicateBook({
    title: book.title,
    author: book.author,
    isbn: "",
  });

  if (duplicate) {
    return "duplicate";
  }

  const textBlob = new Blob([book.text], { type: "text/plain; charset=utf-8" });
  const textFile = new File([textBlob], `${book.slug || "book"}.txt`, { type: "text/plain; charset=utf-8" });
  const txtUrl = await uploadSupabaseFile("book-files", "txt", textFile, "txt");
  const conversion = await convertTextFile(textFile);
  const convertedFiles = await Promise.all(
    conversion.files.map(async (convertedFile) => {
      const blob = base64ToBlob(convertedFile.base64, convertedFile.mimeType);
      const url = await uploadSupabaseFile("book-files", convertedFile.format, blob, convertedFile.format);
      return {
        format: convertedFile.format,
        url,
      };
    }),
  );

  await createSupabaseBook({
    title: book.title,
    author: book.author || "Викитека",
    year: book.year || "",
    isbn: "",
    description: `${book.description || ""}\n\nИсточник: ${book.sourceUrl}\nЛицензия: ${book.license}`.trim(),
    files: [{ format: "txt", url: txtUrl }, ...convertedFiles],
  });

  return "imported";
}

async function importSelectedBooks() {
  const selected = getSelectedPages();
  if (!selected.length) {
    showAdminStatus("Выберите хотя бы одну книгу.", true);
    return;
  }

  importSelectedButton.disabled = true;
  let imported = 0;
  let duplicates = 0;

  for (const page of selected) {
    showAdminStatus(`Импортирую: ${page.title}`);
    const result = await importOneWikisourceBook(page);
    if (result === "duplicate") {
      duplicates += 1;
    } else {
      imported += 1;
    }
  }

  showAdminStatus(`Готово. Импортировано: ${imported}. Уже были в каталоге: ${duplicates}.`);
  importSelectedButton.disabled = false;
}

loginButton.addEventListener("click", () => {
  if (passwordInput.value === ADMIN_PASSWORD) {
    unlockAdmin();
    return;
  }

  loginStatus.textContent = "Неверный пароль.";
  loginStatus.style.color = "#b91c1c";
});

loadCategoryButton.addEventListener("click", () => {
  loadWikisourceCategory().catch((error) => {
    console.error(error);
    showAdminStatus(`Ошибка: ${error.message || "не удалось загрузить категорию."}`, true);
  });
});

selectSafeButton.addEventListener("click", () => {
  importList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = categoryPages[Number(input.value)]?.safe || false;
  });
});

selectAllButton.addEventListener("click", () => {
  importList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = true;
  });
});

importSelectedButton.addEventListener("click", () => {
  importSelectedBooks().catch((error) => {
    console.error(error);
    showAdminStatus(`Ошибка импорта: ${error.message || "проверьте Render и Supabase."}`, true);
    importSelectedButton.disabled = false;
  });
});

if (sessionStorage.getItem("books-admin-ok") === "1") {
  unlockAdmin();
}
