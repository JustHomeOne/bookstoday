const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Книга";
const fileUrl = params.get("file");
const bookId = params.get("bookId");

const titleEl = document.getElementById("reader-title");
const readerText = document.getElementById("reader-text");
const readerStatus = document.getElementById("reader-status");
const chapterTitle = document.getElementById("chapter-title");
const chapterSelect = document.getElementById("chapter-select");
const chapterCounter = document.getElementById("chapter-counter");
const progressBar = document.getElementById("progress-bar");
const prevButton = document.getElementById("prev-chapter");
const nextButton = document.getElementById("next-chapter");
const readerUserStatus = document.getElementById("reader-user-status");
const readerLoginLink = document.getElementById("reader-login-link");
const noteForm = document.getElementById("note-form");
const noteText = document.getElementById("note-text");
const notesList = document.getElementById("notes-list");

const CHUNK_SIZE = 12000;
let chapters = [];
let currentChapterIndex = 0;
let currentSession = null;
let notes = [];
let progressSaveTimer = null;

titleEl.textContent = title;

function getStorageKey() {
  return `reader-progress:${fileUrl || title}`;
}

function getBookKey() {
  return bookId || fileUrl || title;
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

async function initReaderSession() {
  if (!hasSupabase()) {
    readerUserStatus.textContent = "Войдите, чтобы сохранять заметки между устройствами.";
    return;
  }

  try {
    currentSession = await getSupabaseSession();
  } catch (error) {
    console.error(error);
    currentSession = null;
  }

  if (currentSession?.user?.email) {
    readerUserStatus.textContent = `Заметки сохраняются для ${currentSession.user.email}.`;
    readerLoginLink.hidden = true;
    noteForm.hidden = false;
    notesList.hidden = false;
    return;
  }

  readerUserStatus.textContent = "Войдите, чтобы сохранять заметки между устройствами.";
  readerLoginLink.hidden = false;
  noteForm.hidden = true;
  notesList.hidden = true;
}

function saveLocalProgress() {
  try {
    localStorage.setItem(getStorageKey(), String(currentChapterIndex));
  } catch {
    // Reading should still work if localStorage is unavailable.
  }
}

function queueRemoteProgressSave() {
  if (!currentSession?.user) return;

  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(async () => {
    try {
      await saveReaderProgress({
        bookKey: getBookKey(),
        bookTitle: title,
        fileUrl,
        chapterIndex: currentChapterIndex,
      });
    } catch (error) {
      console.error(error);
    }
  }, 450);
}

function saveProgress() {
  saveLocalProgress();
  queueRemoteProgressSave();
}

async function loadProgress() {
  if (currentSession?.user) {
    try {
      const remoteProgress = await fetchReaderProgress(getBookKey());

      if (Number.isInteger(remoteProgress?.chapter_index) && remoteProgress.chapter_index >= 0) {
        return remoteProgress.chapter_index;
      }
    } catch (error) {
      console.error(error);
    }
  }

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

function formatNoteChapter(index) {
  const chapter = chapters[index];
  return chapter ? chapter.title : `Глава ${Number(index) + 1}`;
}

function renderNotes() {
  if (!notesList || !currentSession?.user) return;

  if (!notes.length) {
    notesList.innerHTML = `<p class="muted">Заметок пока нет.</p>`;
    return;
  }

  notesList.innerHTML = notes.map((note) => `
    <article class="note-item">
      <div>
        <strong>${escapeHtml(formatNoteChapter(note.chapter_index))}</strong>
        <p>${escapeHtml(note.note_text)}</p>
      </div>
      <button class="note-delete" type="button" data-note-id="${escapeHtml(note.id)}" aria-label="Удалить заметку">Удалить</button>
    </article>
  `).join("");
}

async function loadNotes() {
  if (!currentSession?.user) return;

  try {
    notes = await fetchReaderNotes(getBookKey());
    renderNotes();
  } catch (error) {
    console.error(error);
    notesList.innerHTML = `<p class="muted">Не удалось загрузить заметки.</p>`;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    const savedProgress = await loadProgress();
    renderChapter(Math.min(savedProgress, chapters.length - 1));
    await loadNotes();
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

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentSession?.user) {
    readerStatus.textContent = "Войдите, чтобы сохранять заметки.";
    return;
  }

  const text = noteText.value.trim();
  if (!text) return;

  noteForm.querySelector("button").disabled = true;

  try {
    const note = await createReaderNote({
      bookKey: getBookKey(),
      bookTitle: title,
      fileUrl,
      chapterIndex: currentChapterIndex,
      noteText: text,
    });

    if (note) {
      notes = [note, ...notes];
      noteText.value = "";
      renderNotes();
    }
  } catch (error) {
    readerStatus.textContent = error.message || "Не удалось сохранить заметку.";
  } finally {
    noteForm.querySelector("button").disabled = false;
  }
});

notesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-note-id]");
  if (!button) return;

  const noteId = button.dataset.noteId;
  button.disabled = true;

  try {
    await deleteReaderNote(noteId);
    notes = notes.filter((note) => note.id !== noteId);
    renderNotes();
  } catch (error) {
    readerStatus.textContent = error.message || "Не удалось удалить заметку.";
    button.disabled = false;
  }
});

(async function initReader() {
  await initReaderSession();
  await loadText();
}());
