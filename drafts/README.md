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

The daily scheduled workflow saves one draft each for Bollywood, Web Series, Cricket, Career, and Current Affairs in `drafts/generated/`. Career drafts contain English, Hindi, and Marathi sections based on the latest Majhi Naukri feed post and preserve its important links. On Sundays it also creates a weekly Current Affairs draft; on the first day of each month it creates a monthly Current Affairs draft. Review and edit them first, then add the chosen file to `queue.json` with the desired `publishDate`.

Generated drafts are retained for 24 hours. After that they are deleted automatically. When a queued draft is published, it is moved into its `destination` path and removed from `drafts/generated/`.

Publishing is schedule-based. A due queue entry is published when its `publishDate` arrives; `approvedAt` is optional and is not required by the workflow. Generated drafts remain `noindex, nofollow` until publication. Career rewrites must retain the original publisher attribution and original important links for editorial and rights review.

The generator uses the GitHub Actions secret `GEMINI_API_KEY` and selects the available `gemini-3.6-flash` model, skipping the unavailable `gemini-2.5-flash` model.