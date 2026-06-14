const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Книга";
const format = String(params.get("format") || "file").toLowerCase();
const fileUrl = params.get("file");

const titleEl = document.getElementById("download-title");
const subtitleEl = document.getElementById("download-subtitle");
const timerText = document.getElementById("timer-text");
const downloadButton = document.getElementById("download-link");

let secondsLeft = 7;
let isReady = false;

function sanitizeFilename(value) {
  return String(value || "book")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "book";
}

function getDownloadName() {
  return `${sanitizeFilename(title)}.${format}`;
}

async function downloadWithFilename() {
  if (!isReady || !fileUrl) return;

  downloadButton.classList.add("disabled");
  downloadButton.setAttribute("aria-disabled", "true");
  timerText.textContent = "Скачиваю файл...";

  try {
    const response = await fetch(fileUrl);
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

    timerText.textContent = `Файл сохранён как ${getDownloadName()}.`;
  } catch (error) {
    timerText.textContent = error.message || "Ошибка скачивания файла.";
  } finally {
    downloadButton.classList.remove("disabled");
    downloadButton.removeAttribute("aria-disabled");
  }
}

titleEl.textContent = title;
subtitleEl.textContent = `Формат: ${format.toUpperCase()}`;

if (!fileUrl) {
  timerText.textContent = "Ссылка на файл не найдена.";
  downloadButton.style.display = "none";
} else {
  downloadButton.addEventListener("click", downloadWithFilename);

  const timer = window.setInterval(() => {
    secondsLeft -= 1;

    if (secondsLeft > 0) {
      timerText.textContent = `Кнопка скачивания появится через ${secondsLeft} секунд.`;
      return;
    }

    window.clearInterval(timer);
    isReady = true;
    timerText.textContent = "Файл готов к скачиванию.";
    downloadButton.classList.remove("disabled");
    downloadButton.removeAttribute("aria-disabled");
  }, 1000);
}
