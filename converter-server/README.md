# Books Today Converter

Free converter backend for Books Today. It uses Calibre `ebook-convert` and returns converted files as base64 JSON.

Supported output formats:

- EPUB
- MOBI
- PDF
- TXT

## Render deploy

1. Create a new Render Web Service.
2. Connect this GitHub repository.
3. Choose Docker.
4. Set root directory to `converter-server`.
5. Deploy.
6. Copy the Render URL into `converter-config.js`:

```js
window.BOOKS_CONVERTER_CONFIG = {
  apiUrl: "https://your-service.onrender.com",
};
```

Free Render services may sleep. The first conversion after sleep can be slow.
