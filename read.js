const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Книга";
const fileUrl = params.get("file");

const titleEl = document.getElementById("reader-title");
const readerText = document.getElementById("reader-text");

titleEl.textContent = title;

async function loadText() {
  if (!fileUrl) {
    readerText.textContent = "Ссылка на текст не найдена.";
    return;
  }

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error("Не удалось загрузить текст.");
    }

    readerText.textContent = await response.text();
  } catch (error) {
    readerText.textContent = error.message || "Ошибка загрузки текста.";
  }
}

loadText();
