const STORAGE_KEY = "libraryBooks";

const queryInput = document.getElementById("search-query");
const authorInput = document.getElementById("filter-author");
const yearMinInput = document.getElementById("filter-year-min");
const yearMaxInput = document.getElementById("filter-year-max");
const clearFiltersButton = document.getElementById("clear-filters");
const tableBody = document.querySelector("#books-table tbody");
const emptyMessage = document.getElementById("empty-message");
const countText = document.getElementById("count-text");

function loadBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filterBooks(books) {
  const query = queryInput.value.trim().toLowerCase();
  const authorFilter = authorInput.value.trim().toLowerCase();
  const yearMin = parseInt(yearMinInput.value, 10);
  const yearMax = parseInt(yearMaxInput.value, 10);

  return books.filter((book) => {
    const title = String(book.title || "").toLowerCase();
    const author = String(book.author || "").toLowerCase();
    const year = Number(book.year) || 0;

    const matchesQuery = !query || title.includes(query) || author.includes(query);
    const matchesAuthor = !authorFilter || author.includes(authorFilter);
    const matchesMin = Number.isNaN(yearMin) || year >= yearMin;
    const matchesMax = Number.isNaN(yearMax) || year <= yearMax;

    return matchesQuery && matchesAuthor && matchesMin && matchesMax;
  });
}

function renderBooks(books) {
  tableBody.innerHTML = "";

  if (!books.length) {
    emptyMessage.style.display = "block";
    countText.textContent = "Ни одной книги не найдено.";
    return;
  }

  emptyMessage.style.display = "none";
  countText.textContent = `Найдено книг: ${books.length}`;

  books.forEach((book) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(book.title)}</td>
      <td>${escapeHtml(book.author)}</td>
      <td>${escapeHtml(book.year || "—")}</td>
      <td>${escapeHtml(book.isbn || "—")}</td>
    `;
    tableBody.appendChild(row);
  });
}

function refresh() {
  const books = loadBooks();
  renderBooks(filterBooks(books));
}

function resetFilters() {
  queryInput.value = "";
  authorInput.value = "";
  yearMinInput.value = "";
  yearMaxInput.value = "";
  refresh();
}

queryInput.addEventListener("input", refresh);
authorInput.addEventListener("input", refresh);
yearMinInput.addEventListener("input", refresh);
yearMaxInput.addEventListener("input", refresh);
clearFiltersButton.addEventListener("click", resetFilters);

refresh();
