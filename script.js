const STORAGE_KEY = "libraryBooks";

const form = document.getElementById("book-form");
const statusText = document.getElementById("status");

function getStoredBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#b91c1c" : "#0f766e";
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

async function convertBookFile(file, formats) {
  const apiUrl = getConverterApiUrl();

  if (!apiUrl) {
    throw new Error("Адрес converter-server ещё не указан в converter-config.js.");
  }

  const payload = new FormData();
  payload.append("book", file);
  payload.append("formats", JSON.stringify(formats));

  const response = await fetch(`${apiUrl}/convert`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Конвертер не смог обработать файл.");
  }

  return response.json();
}

function getSelectedConvertFormats(formData) {
  const selected = formData.getAll("convertFormats").map((format) => String(format).toLowerCase());
  return Array.from(new Set([...selected, "txt"]));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveBook().catch((error) => {
    console.error(error);
    showStatus(`Ошибка сохранения: ${error.message || "проверьте настройки Supabase."}`, true);
  });
});

async function saveBook() {
  const formData = new FormData(form);
  const bookFile = formData.get("bookFile");
  const format = formData.get("format");
  const shouldConvert = formData.get("autoConvert") === "on";
  const convertFormats = getSelectedConvertFormats(formData);

  if (!bookFile || !bookFile.size) {
    showStatus("Добавьте файл книги.", true);
    return;
  }

  showStatus("Сохраняю книгу...");

  let uploadedBookUrl = "";
  let convertedFiles = [];

  if (shouldConvert) {
    if (!hasSupabase()) {
      throw new Error("Автоконвертация сохраняет результаты в Supabase. Сначала подключите базу.");
    }

    if (!convertFormats.length) {
      throw new Error("Выберите хотя бы один формат для конвертации.");
    }

    showStatus("Конвертирую книгу в EPUB, MOBI, PDF и TXT для чтения...");
    const conversion = await convertBookFile(bookFile, convertFormats);

    showStatus("Загружаю сконвертированные файлы в Supabase...");
    convertedFiles = await Promise.all(
      conversion.files.map(async (convertedFile) => {
        const blob = base64ToBlob(convertedFile.base64, convertedFile.mimeType);
        const url = await uploadSupabaseFile("book-files", convertedFile.format, blob, convertedFile.format);
        return {
          format: convertedFile.format,
          url,
        };
      }),
    );
  } else {
    uploadedBookUrl = await uploadSupabaseFile("book-files", format, bookFile, format);
  }

  const bookFiles = convertedFiles.length ? convertedFiles : [{ format, url: uploadedBookUrl }];

  const newBook = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: formData.get("title").trim(),
    author: formData.get("author").trim(),
    year: formData.get("year").trim(),
    isbn: formData.get("isbn").trim(),
    description: formData.get("description").trim(),
    files: bookFiles,
    createdAt: new Date().toISOString(),
  };

  if (!newBook.title || !newBook.author || !bookFiles.length) {
    showStatus("Заполните название, автора и добавьте файл книги.", true);
    return;
  }

  if (hasSupabase()) {
    await createSupabaseBook(newBook);
    showStatus("Книга сохранена в Supabase. Она будет видна на других устройствах.");
  } else {
    const books = getStoredBooks();
    books.unshift(newBook);
    saveStoredBooks(books);
    showStatus("Книга сохранена локально. Вставьте ключи Supabase, чтобы включить общую базу.");
  }

  form.reset();
}
