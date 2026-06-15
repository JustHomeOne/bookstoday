import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import cors from "cors";
import express from "express";
import multer from "multer";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
});

const ALLOWED_FORMATS = new Set(["epub", "mobi", "txt"]);
const METADATA_HOSTS = new Set(["fantasy-worlds.org", "www.fantasy-worlds.org"]);
const WIKISOURCE_HOSTS = new Set(["ru.wikisource.org"]);
const MIME_TYPES = {
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  txt: "text/plain; charset=utf-8",
};
const CONVERT_TIMEOUT_MS = 150000;

app.use(cors());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

function assertPublicMetadataUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Некорректная ссылка на страницу книги.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Поддерживаются только http и https ссылки.");
  }

  if (!METADATA_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Пока поддерживается импорт данных только с fantasy-worlds.org.");
  }

  return parsed.toString();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getHtmlText(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]) : "";
}

function getMetaContent(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return getHtmlText(html, pattern);
}

function parseFantasyWorldsMetadata(html) {
  const h1 = getHtmlText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleParts = h1.split(/\s+[—-]\s+/);

  return {
    author: getHtmlText(html, /Автор:\s*<a[^>]*>([\s\S]*?)<\/a>/i) || titleParts[0] || "",
    title: getHtmlText(html, /Название:\s*([^<\n]+)/i) || titleParts.slice(1).join(" — ") || getMetaContent(html, "og:title"),
    year: getHtmlText(html, /Год:\s*([0-9]{3,4})/i),
    isbn: getHtmlText(html, /ISBN:\s*([^<\n]+)/i).split(",")[0] || "",
    description: getHtmlText(html, /Аннотация[^:]*:\s*([\s\S]*?)(?:<br\s*\/?>\s*<br|<div|<p|<a|\n\s*\n)/i)
      || getMetaContent(html, "description"),
  };
}

async function fetchPageText(url) {
  const pageResponse = await fetch(url, {
    headers: {
      "user-agent": "BooksTodayMetadataBot/1.0",
    },
  });

  if (!pageResponse.ok) {
    throw new Error(`Источник вернул ошибку ${pageResponse.status}.`);
  }

  const contentType = pageResponse.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim() || "utf-8";
  const buffer = await pageResponse.arrayBuffer();

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

app.get("/metadata", async (request, response) => {
  try {
    const url = assertPublicMetadataUrl(request.query.url);
    const html = await fetchPageText(url);
    const metadata = parseFantasyWorldsMetadata(html);

    if (!metadata.title && !metadata.author) {
      response.status(422).send("Не удалось найти данные книги на странице.");
      return;
    }

    response.json(metadata);
  } catch (error) {
    response.status(400).send(error.message || "Ошибка импорта данных книги.");
  }
});

function assertWikisourceUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Некорректная ссылка Викитеки.");
  }

  if (parsed.protocol !== "https:" || !WIKISOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Поддерживаются только ссылки https://ru.wikisource.org/.");
  }

  return parsed;
}

function getWikisourceTitle(value) {
  const parsed = assertWikisourceUrl(value);

  if (parsed.searchParams.get("title")) {
    return parsed.searchParams.get("title");
  }

  const match = parsed.pathname.match(/^\/wiki\/(.+)$/);
  if (!match) {
    throw new Error("Не удалось определить название страницы Викитеки.");
  }

  return decodeURIComponent(match[1]).replace(/_/g, " ");
}

function getWikisourceUrl(title) {
  return `https://ru.wikisource.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

async function wikisourceApi(params) {
  const url = new URL("https://ru.wikisource.org/w/api.php");
  Object.entries({
    format: "json",
    formatversion: "2",
    origin: "*",
    ...params,
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const apiResponse = await fetch(url, {
      headers: {
        "user-agent": "BooksTodayWikisourceImporter/1.0",
      },
    });

    if (apiResponse.ok) {
      return apiResponse.json();
    }

    if (apiResponse.status === 429 && attempt < 3) {
      await new Promise((resolve) => {
        setTimeout(resolve, 30000 * (attempt + 1));
      });
      continue;
    }

    throw new Error(`Викитека вернула ошибку ${apiResponse.status}.`);
  }

  throw new Error("Викитека временно ограничила запросы.");
}

function stripWikisourceHtml(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|section)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n"));
}

function hasCopyrightWarning(text, categories = []) {
  const lower = text.toLowerCase();
  const categoryText = categories
    .map((category) => category.category || category["*"] || "")
    .join(" ")
    .toLowerCase();
  const combined = `${lower} ${categoryText}`;

  const publicDomainSignals = [
    "общественное достояние",
    "срок действия исключительного авторского права истёк",
    "срок действия исключительного авторского права истек",
  ];
  const strongWarnings = [
    "нарушение авторских прав",
    "copyright violation",
    "copyvio",
    "несвободная лицензия",
    "несвободный текст",
    "не свободный текст",
    "удалить как нарушение",
  ];

  if (publicDomainSignals.some((phrase) => combined.includes(phrase))) {
    return false;
  }

  return strongWarnings.some((phrase) => combined.includes(phrase));
}

function parseAuthorFromTitle(title) {
  const match = title.match(/\(([^)]+)\)/);
  return match ? match[1].replace(/\/.*/, "").trim() : "Викитека";
}

function cleanWikisourceTitle(title) {
  return String(title || "")
    .replace(/\/.*$/, "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

app.get("/wikisource/category", async (request, response) => {
  try {
    const categoryTitle = getWikisourceTitle(request.query.url);
    if (!categoryTitle.startsWith("Категория:")) {
      response.status(400).send("Нужна ссылка именно на категорию Викитеки.");
      return;
    }

    const data = await wikisourceApi({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: "0",
      cmlimit: "100",
    });

    const pages = (data.query?.categorymembers || []).map((page) => ({
      title: page.title,
      url: getWikisourceUrl(page.title),
      safe: true,
      reason: "Базовая проверка пройдена",
    }));

    response.json({ title: categoryTitle, pages });
  } catch (error) {
    response.status(400).send(error.message || "Ошибка загрузки категории Викитеки.");
  }
});

app.get("/wikisource/book", async (request, response) => {
  try {
    const pageTitle = getWikisourceTitle(request.query.url);
    const data = await wikisourceApi({
      action: "parse",
      page: pageTitle,
      prop: "text|displaytitle|categories",
      redirects: "1",
    });

    const parsed = data.parse;
    if (!parsed?.text) {
      response.status(422).send("Не удалось получить текст страницы Викитеки.");
      return;
    }

    const text = stripWikisourceHtml(parsed.text);
    if (hasCopyrightWarning(text, parsed.categories || [])) {
      response.status(422).send("Страница похожа на спорную по авторским правам. Импорт остановлен.");
      return;
    }

    response.json({
      title: cleanWikisourceTitle(parsed.title || pageTitle),
      author: parseAuthorFromTitle(parsed.title || pageTitle),
      year: "",
      slug: cleanWikisourceTitle(parsed.title || pageTitle).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, ""),
      description: "Текст импортирован из Викитеки.",
      text,
      sourceUrl: getWikisourceUrl(parsed.title || pageTitle),
      license: "CC BY-SA / условия Викитеки",
    });
  } catch (error) {
    response.status(400).send(error.message || "Ошибка импорта страницы Викитеки.");
  }
});

function sanitizeFormat(format) {
  return String(format || "").trim().toLowerCase();
}

function parseFormats(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return parsed.map(sanitizeFormat).filter((format) => ALLOWED_FORMATS.has(format));
  } catch {
    return [];
  }
}

function getInputExtension(fileName) {
  const extension = path.extname(fileName || "").replace(".", "").toLowerCase();
  return extension || "book";
}

function runCalibre(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("ebook-convert", [inputPath, outputPath], {
      env: {
        ...process.env,
        QT_QPA_PLATFORM: "offscreen",
        QTWEBENGINE_CHROMIUM_FLAGS: "--no-sandbox --disable-gpu",
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || "/tmp/runtime-root",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Конвертация заняла слишком много времени и была остановлена."));
    }, CONVERT_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ebook-convert exited with code ${code}`));
    });
  });
}

app.post("/convert", upload.single("book"), async (request, response) => {
  if (!request.file) {
    response.status(400).send("Файл книги не загружен.");
    return;
  }

  const formats = parseFormats(request.body.formats);
  if (!formats.length) {
    response.status(400).send("Выберите EPUB, MOBI или TXT.");
    return;
  }

  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `books-today-${jobId}`);
  const inputExtension = getInputExtension(request.file.originalname);
  const inputPath = path.join(tempDir, `source.${inputExtension}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(process.env.XDG_RUNTIME_DIR || "/tmp/runtime-root", {
      recursive: true,
      mode: 0o700,
    });
    await fs.writeFile(inputPath, request.file.buffer);

    const files = [];

    for (const format of formats) {
      const outputPath = path.join(tempDir, `converted.${format}`);
      await runCalibre(inputPath, outputPath);
      const buffer = await fs.readFile(outputPath);

      files.push({
        format,
        filename: `converted.${format}`,
        mimeType: MIME_TYPES[format] || "application/octet-stream",
        base64: buffer.toString("base64"),
      });
    }

    response.json({ files });
  } catch (error) {
    console.error(error);
    response.status(500).send(error.message || "Ошибка конвертации.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Books Today converter is running on port ${port}`);
});
