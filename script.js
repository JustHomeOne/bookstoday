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
  saveBook().catch((error) => {
    console.error(error);
    showStatus(`Ошибка сохранения: ${error.message || "проверьте настройки Supabase."}`, true);
  });
});

async function saveBook() {
  const formData = new FormData(form);
  const manualFileUrl = formData.get("fileUrl").trim();
  const coverFile = formData.get("coverFile");
  const bookFile = formData.get("bookFile");
  const format = formData.get("format");

  showStatus("Сохраняю книгу...");

  const uploadedCoverUrl = coverFile && coverFile.size
    ? await uploadSupabaseFile("book-covers", "covers", coverFile, "jpg")
    : "";

  const uploadedBookUrl = bookFile && bookFile.size
    ? await uploadSupabaseFile("book-files", format, bookFile, format)
    : "";

  const fileUrl = uploadedBookUrl || manualFileUrl;

  const newBook = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: formData.get("title").trim(),
    author: formData.get("author").trim(),
    year: formData.get("year").trim(),
    isbn: formData.get("isbn").trim(),
    description: formData.get("description").trim(),
    coverUrl: uploadedCoverUrl || formData.get("coverUrl").trim(),
    files: [{ format, url: fileUrl }],
    createdAt: new Date().toISOString(),
  };

  if (!newBook.title || !newBook.author || !fileUrl) {
    showStatus("Заполните название, автора и добавьте ссылку или файл книги.", true);
    return;
  }

  if (hasSupabase()) {
    await createSupabaseBook(newBook);
    showStatus("Книга сохранена в Supabase. Она будет видна на других устройствах.");
  } else {
    const books = getStoredBooks();
    books.unshift(newBook);
    saveStoredBooks(books);
    showStatus("Книга сохранена локально. Вставьте ключи Supabase, чтобы включить общую базу.");
  }

  form.reset();
}
