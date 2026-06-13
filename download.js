const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Книга";
const format = params.get("format") || "файл";
const fileUrl = params.get("file");

const titleEl = document.getElementById("download-title");
const subtitleEl = document.getElementById("download-subtitle");
const timerText = document.getElementById("timer-text");
const downloadLink = document.getElementById("download-link");

let secondsLeft = 7;

titleEl.textContent = title;
subtitleEl.textContent = `Формат: ${format.toUpperCase()}`;

if (!fileUrl) {
  timerText.textContent = "Ссылка на файл не найдена.";
  downloadLink.style.display = "none";
} else {
  const timer = window.setInterval(() => {
    secondsLeft -= 1;

    if (secondsLeft > 0) {
      timerText.textContent = `Кнопка скачивания появится через ${secondsLeft} секунд.`;
      return;
    }

    window.clearInterval(timer);
    timerText.textContent = "Файл готов к скачиванию.";
    downloadLink.href = fileUrl;
    downloadLink.classList.remove("disabled");
    downloadLink.removeAttribute("aria-disabled");
  }, 1000);
}
