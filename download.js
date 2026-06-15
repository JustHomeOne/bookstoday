const params = new URLSearchParams(window.location.search);
const bookId = params.get("bookId");
const title = params.get("title") || "Книга";
const format = String(params.get("format") || "file").toLowerCase();
const fileUrl = params.get("file");
const sourceFileUrl = params.get("sourceFile");
const sourceFormat = String(params.get("sourceFormat") || "").toLowerCase();

const titleEl = document.getElementById("download-title");
const subtitleEl = document.getElementById("download-subtitle");
const timerText = document.getElementById("timer-text");
const downloadButton = document.getElementById("download-link");

let secondsLeft = 15;
let isReady = false;
let resolvedFileUrl = fileUrl;

function sanitizeFilename(value) {
  return String(value || "book")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "book";
}

function getConverterApiUrl() {
  const config = window.BOOKS_CONVERTER_CONFIG || {};
  return String(config.apiUrl || "").replace(/\/$/, "");
}

function getDownloadName() {
  return `${sanitizeFilename(title)}.${format}`;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

async function fetchSourceFile() {
  const response = await fetch(sourceFileUrl);
  if (!response.ok) {
    throw new Error("Не удалось загрузить TXT для конвертации.");
  }

  const blob = await response.blob();
  return new File([blob], `${sanitizeFilename(title)}.${sourceFormat || "txt"}`, {
    type: blob.type || "text/plain; charset=utf-8",
  });
}

async function convertSourceFile() {
  const apiUrl = getConverterApiUrl();
  if (!apiUrl) {
    throw new Error("Адрес converter-server ещё не указан.");
  }

  const sourceFile = await fetchSourceFile();
  const payload = new FormData();
  payload.append("book", sourceFile);
  payload.append("formats", JSON.stringify([format]));

  const response = await fetch(`${apiUrl}/convert`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Не удалось сконвертировать файл.");
  }

  const conversion = await response.json();
  const convertedFile = conversion.files?.[0];
  if (!convertedFile) {
    throw new Error("Конвертер не вернул готовый файл.");
  }

  return base64ToBlob(convertedFile.base64, convertedFile.mimeType);
}

async function ensureFileUrl() {
  if (resolvedFileUrl) {
    return resolvedFileUrl;
  }

  if (!bookId || !sourceFileUrl || sourceFormat !== "txt" || !["epub", "mobi"].includes(format)) {
    throw new Error("Нет готового файла и нет TXT-источника для конвертации.");
  }

  timerText.textContent = `Первое скачивание: конвертирую ${format.toUpperCase()}...`;
  const blob = await convertSourceFile();
  timerText.textContent = `Загружаю готовый ${format.toUpperCase()} в хранилище...`;
  const url = await uploadSupabaseFile("book-files", format, blob, format);
  await addSupabaseBookFile(bookId, { format, url });
  resolvedFileUrl = url;
  return resolvedFileUrl;
}

async function downloadWithFilename() {
  if (!isReady) return;

  downloadButton.classList.add("disabled");
  downloadButton.setAttribute("aria-disabled", "true");

  try {
    const readyFileUrl = await ensureFileUrl();
    timerText.textContent = "Скачиваю файл...";
    const response = await fetch(readyFileUrl);
    if (!response.ok) {
      throw new Error("Не удалось загрузить файл.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getDownloadName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    timerText.textContent = `Файл сохранен как ${getDownloadName()}.`;
  } catch (error) {
    timerText.textContent = error.message || "Ошибка скачивания файла.";
  } finally {
    downloadButton.classList.remove("disabled");
    downloadButton.removeAttribute("aria-disabled");
  }
}

titleEl.textContent = title;
subtitleEl.textContent = `Формат: ${format.toUpperCase()}`;

if (!fileUrl && !sourceFileUrl) {
  timerText.textContent = "Ссылка на файл не найдена.";
  downloadButton.style.display = "none";
} else {
  downloadButton.addEventListener("click", downloadWithFilename);

  const timer = window.setInterval(() => {
    secondsLeft -= 1;

    if (secondsLeft > 0) {
      timerText.textContent = `Смотрите рекламное видео. Скачивание откроется через ${secondsLeft} секунд.`;
      return;
    }

    window.clearInterval(timer);
    isReady = true;
    timerText.textContent = resolvedFileUrl
      ? "Файл готов к скачиванию."
      : `Файл будет создан при первом скачивании ${format.toUpperCase()}.`;
    downloadButton.classList.remove("disabled");
    downloadButton.removeAttribute("aria-disabled");
  }, 1000);
}
