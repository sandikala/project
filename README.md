# Research Lab Map — Static GitHub Pages Template

Static, database-free research relationship map inspired by the interaction model of MIT Senseable City Lab's Lab Map. The implementation, styling, and code in this repository are original and do not copy MIT source code or branding.

## GitHub repository target

Upload the contents of this folder to:

`https://github.com/sandikala/project`

Then enable:

**Settings → Pages → Deploy from a branch → main → /(root)**

Expected public URL:

`https://sandikala.github.io/project/`

## Files

- `index.html` — interface
- `styles.css` — visual design and responsive layout
- `app.js` — relationship-map interaction
- `config.js` — lab name/tagline/about copy
- `data/lab.json` — all editable content
- `.nojekyll` — GitHub Pages compatibility
- `404.html` — fallback redirect

## Data model

Everything is maintained in `data/lab.json`.

A person record:

```json
{
  "id": "res-01",
  "name": "Researcher Name",
  "role": "Urban Analytics",
  "bio": "Short bio",
  "projects": ["project-a", "project-b"]
}
```

A project record:

```json
{
  "id": "project-a",
  "name": "Project A",
  "year": 2026,
  "status": "ongoing",
  "summary": "Project summary",
  "tags": ["AI", "Urban"],
  "url": "https://example.org/project-a"
}
```

The `projects` values on a person must match project `id` values.

## Functions

- Leadership / Researchers / Projects columns
- automatic relationship lines
- hover to highlight connected people/projects
- click to pin a relationship selection
- project/person detail panel
- search with network-context preservation
- URL deep links (`#project=...`, `#person=...`)
- Esc to clear selection
- responsive mobile layout
- zero database
- zero npm/build step

## Local preview

Because browsers restrict `fetch()` from `file://`, preview through HTTP:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
