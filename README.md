## easy-github-profile

A zero-effort GitHub profile README template. Fork it, edit one file, and your profile is live — no coding required.

---

> 📋 Example profile — see setup instructions below.

<img src="assets/header.svg" width="100%"/>
<br>
<img src="assets/typing.svg" width="100%"/>
<br>
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

---

## Features

- **One file to configure** — everything lives in `config.json`, no code to touch
- **Fully automatic** — GitHub Actions generates all SVGs on every push and on a daily schedule
- **GitHub API integration** — name and bio are pulled directly from your GitHub profile, no manual input needed
- **No dependencies** — pure Node.js, no `npm install` required
- **Animated header** — wave animation with your name and bio
- **Typing effect** — animated typewriter with your custom lines
- **Custom badge sections** — add as many sections as you want with any badges and colors
- **Dark/light mode support** — labels automatically adapt to the viewer's theme
- **Auto-detect text color** — light-colored badges automatically use dark text
- **Fork-friendly** — works for any GitHub username automatically, no hardcoded values
- **Daily auto-update** — profile stays in sync with your GitHub data every day at midnight UTC

---

## Quick Start

**1. Fork this repository**

Click the **Fork** button at the top right of this page.

**2. Rename the repository**

Go to your forked repo → **Settings** → rename it to `{your-username}` (must match your GitHub username exactly for the profile README to work).

**3. Edit `config.json`**

Customize your typing lines, badge sections, and optionally override your name and bio.

**4. Push — you're done**

Edit `config.json` and push. The Action runs automatically and generates all SVGs. Your profile is live.

> To generate SVGs without editing anything, trigger it manually: **Actions** → **Generate Assets** → **Run workflow**

---

## Configuration

All customization happens in `config.json`.

### Header

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

### Typing

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

### Sections

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

### Using Sections in README

Place section images wherever you want in `README.md`:

```html
<div align="center">
  <img src="assets/sections/lang.svg"/>
  <br><br>
  <img src="assets/sections/fw.svg"/>
</div>
```

---

## License

MIT © [BerkaySevinc](https://github.com/BerkaySevinc)