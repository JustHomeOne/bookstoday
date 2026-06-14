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

function cleanChapterTitle(title) {
  return title
    .trim()
    .replace(/([А-Яа-яЁё])([IVXLCDM]+)$/i, "$1")
    .replace(/\s{2,}/g, " ");
}

function getChapterNumber(title) {
  const lower = cleanChapterTitle(title).toLowerCase();
  const russianOrdinals = [
    ["первая", 1],
    ["первый", 1],
    ["вторая", 2],
    ["второй", 2],
    ["третья", 3],
    ["третий", 3],
    ["четвертая", 4],
    ["четвёртая", 4],
    ["четвертый", 4],
    ["четвёртый", 4],
    ["пятая", 5],
    ["пятый", 5],
    ["шестая", 6],
    ["шестой", 6],
    ["седьмая", 7],
    ["седьмой", 7],
    ["восьмая", 8],
    ["восьмой", 8],
    ["девятая", 9],
    ["девятый", 9],
    ["десятая", 10],
    ["десятый", 10],
    ["одиннадцатая", 11],
    ["одиннадцатый", 11],
    ["двенадцатая", 12],
    ["двенадцатый", 12],
    ["тринадцатая", 13],
    ["тринадцатый", 13],
    ["четырнадцатая", 14],
    ["четырнадцатый", 14],
    ["пятнадцатая", 15],
    ["пятнадцатый", 15],
    ["шестнадцатая", 16],
    ["шестнадцатый", 16],
    ["семнадцатая", 17],
    ["семнадцатый", 17],
    ["восемнадцатая", 18],
    ["восемнадцатый", 18],
    ["девятнадцатая", 19],
    ["девятнадцатый", 19],
    ["двадцатая", 20],
    ["двадцатый", 20],
  ];

  const digitMatch = lower.match(/(?:глава|chapter)\s+(\d{1,3})/);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const romanMatch = lower.match(/(?:глава|chapter)\s+([ivxlcdm]{1,8})\b/i);
  if (romanMatch) {
    return romanToNumber(romanMatch[1]);
  }

  const ordinal = russianOrdinals.find(([word]) => lower.includes(word));
  return ordinal ? ordinal[1] : null;
}

function romanToNumber(value) {
  const numerals = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  return value
    .toLowerCase()
    .split("")
    .reduce((total, char, index, chars) => {
      const current = numerals[char] || 0;
      const next = numerals[chars[index + 1]] || 0;
      return current < next ? total - current : total + current;
    }, 0);
}

function createFrontMatterChapter(chaptersToPreserve) {
  const text = chaptersToPreserve
    .map((chapter) => `${chapter.title}\n\n${chapter.text}`.trim())
    .join("\n\n");

  return {
    title: "Начало книги",
    text: `Этот блок был в файле перед началом основного текста.\n\n${text}`,
  };
}

function removeFrontMatterContents(rawChapters) {
  const numbered = rawChapters.map((chapter) => getChapterNumber(chapter.title));
  const firstChapterIndex = numbered.findIndex((number) => number === 1);
  const hasOutOfOrderContentsBeforeStart = numbered
    .slice(0, firstChapterIndex)
    .some((number) => number && number > 1);

  if (firstChapterIndex > 0 && hasOutOfOrderContentsBeforeStart) {
    return [
      createFrontMatterChapter(rawChapters.slice(0, firstChapterIndex)),
      ...rawChapters.slice(firstChapterIndex),
    ];
  }

  const firstChapterIndexes = numbered
    .map((number, index) => (number === 1 ? index : -1))
    .filter((index) => index >= 0);

  if (firstChapterIndexes.length > 1) {
    const repeatedStartIndex = firstChapterIndexes[1];
    const possibleContents = rawChapters.slice(0, repeatedStartIndex);
    const numberedPossibleContents = possibleContents.filter((_, index) => numbered[index]);
    const shortPossibleContents = possibleContents.filter((chapter) => chapter.text.length < 700);

    if (numberedPossibleContents.length >= 3 && shortPossibleContents.length >= Math.ceil(possibleContents.length * 0.6)) {
      return [
        createFrontMatterChapter(possibleContents),
        ...rawChapters.slice(repeatedStartIndex),
      ];
    }
  }

  return rawChapters;
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
          title: cleanChapterTitle(currentTitle),
          text: buffer.join("\n").trim(),
        });
      }

      currentTitle = cleanChapterTitle(line);
      buffer = [];
      return;
    }

    buffer.push(line);
  });

  if (buffer.join("\n").trim()) {
    result.push({
      title: cleanChapterTitle(currentTitle),
      text: buffer.join("\n").trim(),
    });
  }

  const chaptersWithoutContents = removeFrontMatterContents(result);
  return chaptersWithoutContents.length > 1 ? chaptersWithoutContents : [];
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
