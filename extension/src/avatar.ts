import * as crypto from 'crypto';

/**
 * Avatar URLs for a commit author, resolved from name + email only (a commit
 * stores nothing else). Consumers render them as a fallback chain:
 * github → gravatar → initials. Computed in the extension host because the
 * webview can't run Node's crypto for the Gravatar md5.
 */
export interface Avatar {
  github?: string; // GitHub profile photo, when derivable from a noreply email
  gravatar: string; // Gravatar, with d=identicon so it always returns an image
  initials: string; // 1–2 uppercase letters
  color: string; // deterministic background, hashed from email
  initialsSvg: string; // offline fallback: a rectangular initials tile as a data URI
}

// GitHub noreply emails encode the numeric user id: "12345+login@users.noreply.github.com".
// That id maps straight to the avatar CDN with no API call or token.
const GH_NOREPLY = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/i;

const PALETTE = [
  '#1f6feb',
  '#238636',
  '#8957e5',
  '#bf3989',
  '#da7633',
  '#0969da',
  '#cf222e',
  '#6e7781',
];

export function resolveAvatar(name: string, email: string, size = 40): Avatar {
  const normalized = email.trim().toLowerCase();

  let github: string | undefined;
  const m = normalized.match(GH_NOREPLY);
  if (m) {
    github = `https://avatars.githubusercontent.com/u/${m[1]}?s=${size}&v=4`;
  }

  const hash = crypto.createHash('md5').update(normalized).digest('hex');
  const gravatar = `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;

  const initials = deriveInitials(name, normalized);
  const color = PALETTE[hashCode(normalized) % PALETTE.length];
  const initialsSvg = makeInitialsSvg(initials, color, size);

  return { github, gravatar, initials, color, initialsSvg };
}

/** Best single image URL for contexts that can't do a fallback chain (markdown hover). */
export function bestAvatarUrl(a: Avatar): string {
  return a.github ?? a.gravatar;
}

function deriveInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0] || '?';
  return local.slice(0, 2).toUpperCase();
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function makeInitialsSvg(initials: string, color: string, size: number): string {
  const fontSize = Math.round(size * 0.42);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="3" fill="${color}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" ` +
    `font-family="sans-serif" font-size="${fontSize}" fill="#ffffff">${escapeXml(initials)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!
  );
}
