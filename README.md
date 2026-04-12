## easy-github-profile

A zero-effort GitHub profile README setup. Fork it and your profile is live instantly — fully customizable, no coding required.

> 👇 See setup instructions below.

<br>

---

> 👤 Example profile.

<!-- PROFILE:START -->
<img src="assets/header.svg" width="100%"/>
<img src="assets/typing.svg" width="100%"/>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/stats.svg"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/langs.svg" width="100%"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<div align="center">
  <img src="assets/sections/lang.svg"/>
  <br>
  <br>
  <img src="assets/sections/fw.svg"/>
  <br>
  <br>
  <img src="assets/sections/tools.svg"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<div align="center">
  <img src="assets/labels/lang.svg"/><br>
  <img src="assets/badges/C%23.svg">
  <img src="assets/badges/JAVASCRIPT.svg">
  <img src="assets/badges/HTML5.svg">
  <img src="assets/badges/CSS3.svg">
  <br><br>
  <img src="assets/labels/fw.svg"/><br>
  <img src="assets/badges/.NET.svg">
  <img src="assets/badges/ASP.NET%20CORE.svg">
  <img src="assets/badges/NODE.JS.svg">
  <br><br>
  <img src="assets/labels/tools.svg"/><br>
  <img src="assets/badges/GIT.svg">
  <img src="assets/badges/GITHUB.svg">
  <img src="assets/badges/VISUAL%20STUDIO.svg">
  <img src="assets/badges/VS%20CODE.svg">
  <img src="assets/badges/CLAUDE%20CODE.svg">
</div>
<br>
<img src="assets/footer.svg" width="100%"/>
<!-- PROFILE:END -->

---

<br>

## ✨ Features

- **Up in minutes** — just follow the Quick Start steps below, no configuration required
- **One file to configure** — everything lives in `config.json`, no code to touch

- **Animations** — animated wave header, typewriter effect, and more
- **Dark/light mode support** — labels automatically adapt to the viewer's theme

- **Fully automatic** — GitHub Actions generates all SVGs on every push and on a daily schedule
- **Daily auto-update** — profile stays in sync with your GitHub data every day at midnight UTC

- **No dependencies** — nothing to install
- **GitHub API integration** — name and bio are pulled directly from your GitHub profile, no manual input needed
- **Fork-friendly** — works for any GitHub username automatically, no hardcoded values

<br>

---

<br>

## 🚀 Quick Start

### 1. Fork this repository

Click the **Fork** button at the top right of this page.

### 2. Name the repository `{your-username}`

When forking, you can set the name directly. If you missed it, go to **Settings** and rename it there. The name must match your GitHub username exactly for the profile README to work.

> ⚠️ If you already have a `{your-username}` repository, you'll need to delete it first.

### 3. Clean up `README.md`

Remove any content that doesn't belong on your profile page — the project title, description, example note, and setup instructions.

### 4. Trigger the Action

Go to **Actions** → **Generate Assets** → **Run workflow**. Your profile is live. 🎉

### 5. Customize _(optional)_

Edit `config.json` to personalize your typing lines, badge sections, colors, and more. See the [Customize](#%EF%B8%8F-customize) section below for details.

<br>

---

<br>

## ⚙️ Customize

All customization happens in `config.json`.

<br>

### 🖼️ Header

```json
"header": {
  "name": null,
  "bio": null
}
```

| Field | Description |
|-------|-------------|
| `name` | Your display name. `null` = fetched from your GitHub profile |
| `bio` | Your subtitle text. `null` = fetched from your GitHub profile bio |

---

### ⌨️ Typing

```json
"typing": {
  "lines": [
    ".NET & C# Developer",
    "ASP.NET Core · Node.js"
  ]
}
```

| Field | Description |
|-------|-------------|
| `lines` | Lines shown in the typewriter animation, one by one. `null` or `[]` = fetched from your GitHub profile (bio, company, location, blog) |

---

### 📊 Stats

```json
"stats": {
  "show": {
    "commits":   true,
    "prs":       true,
    "issues":    true,
    "stars":     true,
    "repos":     true,
    "followers": true
  }
}
```

| Field | Description |
|-------|-------------|
| `show.commits` | Total commits this year (includes private) |
| `show.prs` | Total pull requests |
| `show.issues` | Total issues opened |
| `show.stars` | Total stars across all repos |
| `show.repos` | Total public repositories |
| `show.followers` | Follower count |

Set any field to `false` to hide it. Remaining stats auto-expand to fill the card.

---

### 🌐 Top Languages

No configuration needed — top languages are fetched automatically from your public repositories and the top 6 are shown.

---

### 🏷️ Sections

```json
"sections": [
  {
    "id": "lang",
    "label": "Languages",
    "badges": [
      { "text": "C#",         "color": "#1d7a1a" },
      { "text": "JAVASCRIPT", "color": "#e0c910" }
    ]
  }
]
```

| Field | Description |
|-------|-------------|
| `id` | Used as the output filename: `assets/sections/{id}.svg` |
| `label` | Section heading shown above the badges |
| `badges` | List of badge objects |
| `badges[].text` | Badge label (displayed in uppercase) |
| `badges[].color` | Badge background color (hex) |

To add a new section, add a new object to the array and add `<img src="assets/sections/{id}.svg"/>` to `README.md`.

---

### ➖ Divider / 🔻 Footer

No configuration needed — these are static animated SVGs.

<br>

---

<br>

## 📝 Editing README.md

All generated assets are just image files — place them anywhere in `README.md` however you like. Here's the full example used in this repo:

```html
<img src="assets/header.svg" width="100%"/>
<img src="assets/typing.svg" width="100%"/>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/stats.svg"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/langs.svg" width="100%"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<div align="center">
  <img src="assets/sections/lang.svg"/>
  <br>
  <br>
  <img src="assets/sections/fw.svg"/>
  <br>
  <br>
  <img src="assets/sections/tools.svg"/>
</div>
<br>
<img src="assets/footer.svg" width="100%"/>
```

| Asset | Path |
|-------|------|
| Header | `assets/header.svg` |
| Typing animation | `assets/typing.svg` |
| Divider | `assets/divider.svg` |
| GitHub Stats | `assets/stats.svg` |
| Top Languages | `assets/langs.svg` |
| Section (label + badges) | `assets/sections/{id}.svg` |
| Footer | `assets/footer.svg` |

<br>

---

<br>

## 📄 License

MIT © [BerkaySevinc](https://github.com/BerkaySevinc)
