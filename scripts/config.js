// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2026 BerkaySevinc — MIT License

const { readFileSync } = require('fs');
const { join } = require('path');

// Strips // and /* */ comments from JSONC text before JSON.parse. Tracks
// whether we're inside a double-quoted string (respecting \" escapes) so a
// comment-like sequence inside a string value (e.g. a URL) is never touched.
function stripJsonComments(text) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function loadConfig() {
  try {
    const raw = readFileSync(join(__dirname, '..', 'config.jsonc'), 'utf8');
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return {};
  }
}

module.exports = { loadConfig };
