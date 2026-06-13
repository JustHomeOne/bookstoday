const STORAGE_KEY = "libraryBooks";
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

function renderBooks(books) {
  tableBody.innerHTML = "";

  if (!books.length) {
    emptyMessage.style.display = "block";
    countText.textContent = "Книг пока нет.";
    return;
  }

  emptyMessage.style.display = "none";
  countText.textContent = `Всего книг: ${books.length}`;

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

const books = loadBooks();
renderBooks(books);
