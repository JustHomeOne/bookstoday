const form = document.getElementById("book-form");
const statusText = document.getElementById("status");
const importMetadataButton = document.getElementById("import-metadata");
const sourceUrlInput = document.getElementById("sourceUrl");
const TARGET_FORMATS = ["epub", "mobi", "txt"];
const ALLOWED_UPLOAD_FORMATS = new Set(TARGET_FORMATS);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#b91c1c" : "#0f766e";
}

function getConverterApiUrl() {
  const config = window.BOOKS_CONVERTER_CONFIG || {};
  return String(config.apiUrl || "").replace(/\/$/, "");
}

function getFileExtension(file) {
  return String(file?.name?.split(".").pop() || "").toLowerCase();
}

function formatMegabytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function getConvertFormats(sourceFormat) {
  return TARGET_FORMATS.filter((format) => format !== sourceFormat);
}

async function convertBookFile(file, formats) {
  const apiUrl = getConverterApiUrl();

  if (!apiUrl) {
    throw new Error("Адрес converter-server ещё не указан в converter-config.js.");
  }

  const payload = new FormData();
  payload.append("book", file);
  payload.append("formats", JSON.stringify(formats));

  let response;
  try {
    response = await fetch(`${apiUrl}/convert`, {
      method: "POST",
      body: payload,
    });
  } catch {
    throw new Error("Не удалось связаться с converter-server. Проверьте, что Render-сервис Live, и попробуйте ещё раз через минуту.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Конвертер не смог обработать файл.");
  }

  return response.json();
}

async function fetchBookMetadata(sourceUrl) {
  const apiUrl = getConverterApiUrl();

  if (!apiUrl) {
    throw new Error("Адрес converter-server ещё не указан в converter-config.js.");
  }

  const response = await fetch(`${apiUrl}/metadata?url=${encodeURIComponent(sourceUrl)}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Не удалось получить данные книги.");
  }

  return response.json();
}

function setFieldValue(name, value) {
  const field = form.elements[name];
  if (field && value) {
    field.value = value;
  }
}

async function importMetadata() {
  const sourceUrl = sourceUrlInput.value.trim();

  if (!sourceUrl) {
    showStatus("Вставьте ссылку на страницу книги.", true);
    return;
  }

  showStatus("Получаю данные книги по ссылке...");
  const metadata = await fetchBookMetadata(sourceUrl);

  setFieldValue("title", metadata.title);
  setFieldValue("author", metadata.author);
  setFieldValue("year", metadata.year);
  setFieldValue("isbn", metadata.isbn);
  setFieldValue("description", metadata.description);

  showStatus("Данные заполнены. Проверьте поля и загрузите файл книги.");
}

importMetadataButton.addEventListener("click", () => {
  importMetadata().catch((error) => {
    console.error(error);
    showStatus(`Ошибка импорта: ${error.message || "проверьте ссылку."}`, true);
  });
});

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

  if (!bookFile || !bookFile.size) {
    showStatus("Добавьте файл книги.", true);
    return;
  }

  if (bookFile.size > MAX_UPLOAD_BYTES) {
    showStatus(`Файл слишком большой: ${formatMegabytes(bookFile.size)} MB. Для бесплатного Render лучше загружать файлы до 25 MB.`, true);
    return;
  }

  const format = getFileExtension(bookFile);

  if (!ALLOWED_UPLOAD_FORMATS.has(format)) {
    showStatus("Можно загружать только EPUB, MOBI или TXT.", true);
    return;
  }

  if (!hasSupabase()) {
    throw new Error("Загрузка книг и автоконвертация требуют подключённый Supabase.");
  }

  const bookTitle = formData.get("title").trim();
  const bookAuthor = formData.get("author").trim();
  const bookIsbn = formData.get("isbn").trim();

  if (!bookTitle || !bookAuthor) {
    showStatus("Заполните название и автора.", true);
    return;
  }

  showStatus("Проверяю, нет ли такой книги в каталоге...");
  const duplicateBook = await findDuplicateBook({
    title: bookTitle,
    author: bookAuthor,
    isbn: bookIsbn,
  });

  if (duplicateBook) {
    const duplicateReason = bookIsbn && duplicateBook.isbn
      ? `ISBN ${duplicateBook.isbn}`
      : `${duplicateBook.title} — ${duplicateBook.author}`;

    showStatus(`Такая книга уже есть в каталоге: ${duplicateReason}. Сначала удалите старую запись из базы, если хотите загрузить её заново.`, true);
    return;
  }

  const convertFormats = getConvertFormats(format);

  showStatus("Загружаю оригинальный файл в Supabase...");
  const originalUrl = await uploadSupabaseFile("book-files", format, bookFile, format);

  showStatus("Конвертирую книгу в EPUB, MOBI и TXT...");
  const conversion = await convertBookFile(bookFile, convertFormats);

  showStatus("Загружаю сконвертированные файлы в Supabase...");
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

  const newBook = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: bookTitle,
    author: bookAuthor,
    year: formData.get("year").trim(),
    isbn: bookIsbn,
    description: formData.get("description").trim(),
    files: [{ format, url: originalUrl }, ...convertedFiles],
    createdAt: new Date().toISOString(),
  };

  await createSupabaseBook(newBook);
  showStatus("Книга сохранена и доступна в EPUB, MOBI и TXT.");
  form.reset();
}
