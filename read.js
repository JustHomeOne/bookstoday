const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Книга";
const fileUrl = params.get("file");

const titleEl = document.getElementById("reader-title");
const readerText = document.getElementById("reader-text");
const readerStatus = document.getElementById("reader-status");
const chapterTitle = document.getElementById("chapter-title");
const chapterSelect = document.getElementById("chapter-select");
const chapterCounter = document.getElementById("chapter-counter");
const progressBar = document.getElementById("progress-bar");
const prevButton = document.getElementById("prev-chapter");
const nextButton = document.getElementById("next-chapter");

const CHUNK_SIZE = 12000;
let chapters = [];
let currentChapterIndex = 0;

titleEl.textContent = title;

function getStorageKey() {
  return `reader-progress:${fileUrl || title}`;
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function isChapterHeading(line) {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  return [
    "глава",
    "часть",
    "книга",
    "раздел",
    "пролог",
    "эпилог",
    "chapter",
    "part",
    "book",
  ].some((word) => lower === word || lower.startsWith(`${word} `) || lower.startsWith(`${word}.`) || lower.startsWith(`${word}:`));
}

function splitByHeadings(text) {
  const lines = text.split("\n");
  const result = [];
  let currentTitle = "Начало";
  let buffer = [];

  lines.forEach((line) => {
    if (isChapterHeading(line)) {
      if (buffer.join("\n").trim()) {
        result.push({
          title: currentTitle,
          text: buffer.join("\n").trim(),
        });
      }

      currentTitle = line.trim();
      buffer = [];
      return;
    }

    buffer.push(line);
  });

  if (buffer.join("\n").trim()) {
    result.push({
      title: currentTitle,
      text: buffer.join("\n").trim(),
    });
  }

  return result.length > 1 ? result : [];
}

function splitIntoReadableParts(text) {
  const paragraphs = text.split(/\n{2,}/);
  const result = [];
  let buffer = "";

  paragraphs.forEach((paragraph) => {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length > CHUNK_SIZE && buffer) {
      result.push(buffer.trim());
      buffer = paragraph;
      return;
    }

    buffer = next;
  });

  if (buffer.trim()) {
    result.push(buffer.trim());
  }

  return result.map((part, index) => ({
    title: `Часть ${index + 1}`,
    text: part,
  }));
}

function splitTextIntoChapters(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [{ title: "Пустой текст", text: "В файле нет текста для чтения." }];
  }

  const headingChapters = splitByHeadings(normalized);
  return headingChapters.length ? headingChapters : splitIntoReadableParts(normalized);
}

function saveProgress() {
  try {
    localStorage.setItem(getStorageKey(), String(currentChapterIndex));
  } catch {
    // Reading should still work if localStorage is unavailable.
  }
}

function loadProgress() {
  try {
    const saved = Number(localStorage.getItem(getStorageKey()));
    return Number.isInteger(saved) && saved >= 0 ? saved : 0;
  } catch {
    return 0;
  }
}

function renderChapterOptions() {
  chapterSelect.innerHTML = "";
  chapters.forEach((chapter, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chapter.title;
    chapterSelect.appendChild(option);
  });
}

function renderChapter(index) {
  currentChapterIndex = Math.min(Math.max(index, 0), chapters.length - 1);
  const chapter = chapters[currentChapterIndex];
  const progress = ((currentChapterIndex + 1) / chapters.length) * 100;

  chapterTitle.textContent = chapter.title;
  readerText.textContent = chapter.text;
  chapterSelect.value = String(currentChapterIndex);
  chapterCounter.textContent = `Глава ${currentChapterIndex + 1} из ${chapters.length}`;
  progressBar.style.width = `${progress}%`;

  prevButton.disabled = currentChapterIndex === 0;
  nextButton.disabled = currentChapterIndex === chapters.length - 1;
  readerStatus.textContent = chapters.length > 1
    ? "Книга разделена на удобные части."
    : "Текст открыт полностью.";

  saveProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadText() {
  if (!fileUrl) {
    readerStatus.textContent = "Ссылка на текст не найдена.";
    return;
  }

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error("Не удалось загрузить текст.");
    }

    chapters = splitTextIntoChapters(await response.text());
    renderChapterOptions();
    renderChapter(Math.min(loadProgress(), chapters.length - 1));
  } catch (error) {
    readerStatus.textContent = error.message || "Ошибка загрузки текста.";
  }
}

chapterSelect.addEventListener("change", () => {
  renderChapter(Number(chapterSelect.value));
});

prevButton.addEventListener("click", () => {
  renderChapter(currentChapterIndex - 1);
});

nextButton.addEventListener("click", () => {
  renderChapter(currentChapterIndex + 1);
});

loadText();
