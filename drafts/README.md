# Scheduled article publishing

Put finished article HTML files in this directory and add an entry to `queue.json`:

```json
[
  {
    "source": "drafts/my-article.html",
    "destination": "Latest/my-article.html",
    "publishDate": "2026-09-05"
  }
]
```

The scheduled GitHub Action publishes up to three due entries per day. After publishing, it records `publishedAt`, regenerates `rss.xml` and `sitemap.xml`, and commits the changes. Articles still need to meet the validation and editorial rules before being queued.

The daily trend workflow saves five new candidates in `drafts/generated/`. Review and edit them first. To approve one, move it into `drafts/`, change its robots tag to `index, follow`, and add it to `queue.json` with the desired `publishDate`.

The generator uses the GitHub Actions secret `GEMINI_API_KEY` and selects the available `gemini-3.6-flash` model, skipping the unavailable `gemini-2.5-flash` model.