const STORAGE_KEY = "libraryBooks";

const form = document.getElementById("book-form");
const statusText = document.getElementById("status");

function getStoredBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#b91c1c" : "#0f766e";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const newBook = {
    title: formData.get("title").trim(),
    author: formData.get("author").trim(),
    year: formData.get("year").trim(),
    isbn: formData.get("isbn").trim(),
  };

  if (!newBook.title || !newBook.author) {
    showStatus("Пожалуйста, заполните название и автора.", true);
    return;
  }

  const books = getStoredBooks();
  books.unshift(newBook);
  saveStoredBooks(books);
  showStatus("Книга добавлена. Откройте library.html для просмотра списка.");
  form.reset();
});
