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
const MIME_TYPES = {
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  txt: "text/plain; charset=utf-8",
};

app.use(cors());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
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
