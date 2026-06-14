const SUPABASE_CONFIG = window.BOOKS_SUPABASE_CONFIG || {};
const SUPABASE_READY = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase);

const booksDb = SUPABASE_READY
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  : null;

function hasSupabase() {
  return Boolean(booksDb);
}

function toPublicBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    year: row.year || "",
    isbn: row.isbn || "",
    description: row.description || "",
    files: (row.book_files || []).map((file) => ({
      format: file.format,
      url: file.file_url,
    })),
    createdAt: row.created_at,
  };
}

async function fetchSupabaseBooks() {
  if (!booksDb) return null;

  const { data, error } = await booksDb
    .from("books")
    .select("id,title,author,year,isbn,description,created_at,book_files(format,file_url)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(toPublicBook);
}

function normalizeBookField(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeIsbn(value) {
  return normalizeBookField(value).replace(/[^0-9x]/g, "");
}

async function findDuplicateBook({ title, author, isbn }) {
  if (!booksDb) return null;

  const normalizedTitle = normalizeBookField(title);
  const normalizedAuthor = normalizeBookField(author);
  const normalizedIsbn = normalizeIsbn(isbn);

  const { data, error } = await booksDb
    .from("books")
    .select("id,title,author,isbn");

  if (error) {
    throw error;
  }

  if (normalizedIsbn) {
    const byIsbn = data.find((book) => normalizeIsbn(book.isbn) === normalizedIsbn);

    if (byIsbn) {
      return byIsbn;
    }
  }

  if (!normalizedTitle || !normalizedAuthor) {
    return null;
  }

  return data.find((book) => (
    normalizeBookField(book.title) === normalizedTitle
    && normalizeBookField(book.author) === normalizedAuthor
  )) || null;
}

function getFileExtension(file, fallback) {
  const fromName = file?.name?.split(".").pop();
  return String(fromName || fallback || "file").toLowerCase();
}

async function uploadSupabaseFile(bucket, folder, file, fallbackExtension) {
  if (!booksDb || !file) return "";

  const extension = getFileExtension(file, fallbackExtension);
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await booksDb.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = booksDb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function createSupabaseBook(book) {
  if (!booksDb) return null;

  const { data: createdBook, error: bookError } = await booksDb
    .from("books")
    .insert({
      title: book.title,
      author: book.author,
      year: book.year ? Number(book.year) : null,
      isbn: book.isbn || null,
      description: book.description || null,
    })
    .select("id")
    .single();

  if (bookError) {
    throw bookError;
  }

  const files = (book.files || []).filter((file) => file.url && file.format);
  if (files.length) {
    const { error: filesError } = await booksDb.from("book_files").insert(
      files.map((file) => ({
        book_id: createdBook.id,
        format: file.format,
        file_url: file.url,
      })),
    );

    if (filesError) {
      throw filesError;
    }
  }

  return createdBook.id;
}
