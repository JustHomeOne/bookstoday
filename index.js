const STORAGE_KEY = "libraryBooks";

const queryInput = document.getElementById("search-query");
const formatInput = document.getElementById("filter-format");
const yearMinInput = document.getElementById("filter-year-min");
const yearMaxInput = document.getElementById("filter-year-max");
const clearFiltersButton = document.getElementById("clear-filters");
const booksGrid = document.getElementById("books-grid");
const emptyMessage = document.getElementById("empty-message");
const countText = document.getElementById("count-text");

function loadLocalBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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

function getBookFormats(book) {
  if (Array.isArray(book.files)) {
    return book.files.filter((file) => file && file.url && file.format);
  }

  if (book.fileUrl && book.format) {
    return [{ format: book.format, url: book.fileUrl }];
  }

  return [];
}

function filterBooks(books) {
  const query = queryInput.value.trim().toLowerCase();
  const format = formatInput.value;
  const yearMin = parseInt(yearMinInput.value, 10);
  const yearMax = parseInt(yearMaxInput.value, 10);

  return books.filter((book) => {
    const title = String(book.title || "").toLowerCase();
    const author = String(book.author || "").toLowerCase();
    const isbn = String(book.isbn || "").toLowerCase();
    const year = Number(book.year) || 0;
    const formats = getBookFormats(book).map((file) => file.format);
    const virtualFormats = formats.includes("txt")
      ? [...new Set([...formats, "epub", "mobi"])]
      : formats;

    const matchesQuery = !query || title.includes(query) || author.includes(query) || isbn.includes(query);
    const matchesFormat = !format || virtualFormats.includes(format);
    const matchesMin = Number.isNaN(yearMin) || year >= yearMin;
    const matchesMax = Number.isNaN(yearMax) || year <= yearMax;

    return matchesQuery && matchesFormat && matchesMin && matchesMax;
  });
}

function createDownloadUrl(book, file) {
  const params = new URLSearchParams({
    bookId: book.id || "",
    title: book.title || "Книга",
    format: file.format,
    file: file.url,
  });

  return `download.html?${params.toString()}`;
}

function createReadUrl(book, file) {
  const params = new URLSearchParams({
    title: book.title || "Книга",
    file: file.url,
    v: "20260614-11",
  });

  return `read.html?${params.toString()}`;
}

function createLazyDownloadUrl(book, format, txtFile) {
  const params = new URLSearchParams({
    bookId: book.id || "",
    title: book.title || "Книга",
    format,
    sourceFormat: "txt",
    sourceFile: txtFile.url,
  });

  return `download.html?${params.toString()}`;
}

function getFormatLabel(format) {
  return String(format || "").toUpperCase();
}

function renderFormatButton(book, file) {
  if (file.format === "txt") {
    return `
      <a class="format-link read-link" href="${escapeHtml(createReadUrl(book, file))}">
        Читать TXT
      </a>
      <a class="format-link" href="${escapeHtml(createDownloadUrl(book, file))}">
        Скачать TXT
      </a>
    `;
  }

  return `
    <a class="format-link" href="${escapeHtml(createDownloadUrl(book, file))}">
      Скачать ${escapeHtml(getFormatLabel(file.format))}
    </a>
  `;
}

function renderBooks(books) {
  booksGrid.innerHTML = "";

  if (!books.length) {
    emptyMessage.style.display = "block";
    countText.textContent = "Книги не найдены.";
    return;
  }

  emptyMessage.style.display = "none";
  countText.textContent = `Найдено книг: ${books.length}`;

  books.forEach((book) => {
    const formats = getBookFormats(book);
    const txtFile = formats.find((file) => file.format === "txt");
    const availableFormats = new Set(formats.map((file) => file.format));
    const card = document.createElement("article");
    card.className = "book-card";

    const badgeFormats = txtFile
      ? [...new Set([...formats.map((file) => file.format), "epub", "mobi"])]
      : formats.map((file) => file.format);

    const badges = badgeFormats.length
      ? badgeFormats.map((bookFormat) => `<span class="format-badge">${escapeHtml(getFormatLabel(bookFormat))}</span>`).join("")
      : `<span class="format-badge empty">Нет файлов</span>`;

    const lazyButtons = txtFile
      ? ["epub", "mobi"]
        .filter((format) => !availableFormats.has(format))
        .map((format) => `
          <a class="format-link lazy-link" href="${escapeHtml(createLazyDownloadUrl(book, format, txtFile))}">
            Скачать ${escapeHtml(getFormatLabel(format))}
          </a>
        `)
        .join("")
      : "";

    const formatButtons = formats.length
      ? `${formats.map((file) => renderFormatButton(book, file)).join("")}${lazyButtons}`
      : `<span class="muted">Файлы скоро появятся</span>`;

    card.innerHTML = `
      <div class="book-content">
        <div>
          <div class="book-topline">${badges}</div>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="book-meta">${escapeHtml(book.author)}${book.year ? `, ${escapeHtml(book.year)}` : ""}</p>
          ${book.isbn ? `<p class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</p>` : ""}
          ${book.description ? `<p class="book-description">${escapeHtml(book.description)}</p>` : ""}
        </div>
        <div class="format-list">${formatButtons}</div>
      </div>
    `;

    booksGrid.appendChild(card);
  });
}

async function loadBooks() {
  if (hasSupabase()) {
    try {
      return await fetchSupabaseBooks();
    } catch (error) {
      console.error(error);
      countText.textContent = "Supabase недоступен, показаны локальные книги.";
    }
  }

  return loadLocalBooks();
}

async function refresh() {
  const books = await loadBooks();
  renderBooks(filterBooks(books));
}

function resetFilters() {
  queryInput.value = "";
  formatInput.value = "";
  yearMinInput.value = "";
  yearMaxInput.value = "";
  refresh();
}

[queryInput, formatInput, yearMinInput, yearMaxInput].forEach((input) => {
  input.addEventListener("input", refresh);
});

clearFiltersButton.addEventListener("click", resetFilters);
refresh();
