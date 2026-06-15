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
const MIME_TYPES = {
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  txt: "text/plain; charset=utf-8",
};

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
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
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
