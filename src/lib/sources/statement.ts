// Fetches a problem statement from its source and renders it to clean HTML
// (math via KaTeX). For PERSONAL single-user use — we fetch once and cache in
// the DB; we don't redistribute. Sources: Codeforces, CSES.

import * as cheerio from "cheerio";
import katex from "katex";
import { spawn } from "node:child_process";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(decodeEntities(tex), {
      displayMode: display,
      throwOnError: false,
    });
  } catch {
    return display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
  }
}

// Codeforces fronts statements with a Cloudflare bot challenge that 403s Node's
// undici fetch; curl's TLS fingerprint passes. Spawn curl with stdin IGNORED so
// it can never emit a `write EPIPE` that escapes as an uncaught exception.
function curlGet(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("curl", ["-sL", "-m", "25", "-A", UA, url], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      return resolve(null);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size <= 25 * 1024 * 1024) chunks.push(d);
    });
    child.stdout.on("error", () => {});
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const out = Buffer.concat(chunks).toString("utf8");
      resolve(out.length > 200 && !/Just a moment/i.test(out.slice(0, 500)) ? out : null);
    });
  });
}

async function fetchHtml(url: string): Promise<string> {
  const viaCurl = await curlGet(url);
  if (viaCurl) return viaCurl;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`statement fetch ${url} -> HTTP ${res.status}`);
  return res.text();
}

function absolutize($: cheerio.CheerioAPI, origin: string) {
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    if (src.startsWith("//")) $(el).attr("src", "https:" + src);
    else if (src.startsWith("/")) $(el).attr("src", origin + src);
  });
  $("script, style, link").remove();
}

function renderCodeforces(html: string): string {
  const $ = cheerio.load(html);
  const node = $(".problem-statement").first();
  if (!node.length) throw new Error("CF: .problem-statement not found");

  // Pull the limits/IO out of the raw header into a clean meta bar, then drop
  // the whole header (its title + scattered limit divs render awkwardly).
  const header = node.find(".header").first();
  const pick = (sel: string): string | null => {
    const el = header.find(sel).first();
    if (!el.length) return null;
    el.find(".property-title").remove();
    return el.text().trim() || null;
  };
  const time = pick(".time-limit");
  const mem = pick(".memory-limit");
  const inp = pick(".input-file");
  const outp = pick(".output-file");
  header.remove();

  absolutize($, "https://codeforces.com");
  let out = node.html() ?? "";
  // Codeforces uses $$$$$$...$$$$$$ for DISPLAY math and $$$...$$$ for inline.
  // Display must be replaced first, or the 6-dollar delimiters desync the
  // 3-dollar matcher and mangle the rest of the statement.
  out = out
    .replace(/\$\$\$\$\$\$([\s\S]+?)\$\$\$\$\$\$/g, (_m, tex) => renderMath(tex, true))
    .replace(/\$\$\$([\s\S]+?)\$\$\$/g, (_m, tex) => renderMath(tex, false));

  const io =
    inp || outp
      ? `${(inp ?? "standard input").replace("standard input", "stdin")} / ${(outp ?? "standard output").replace("standard output", "stdout")}`
      : null;
  const pills = [
    time && `<span class="meta-pill">⏱ ${time}</span>`,
    mem && `<span class="meta-pill">▤ ${mem}</span>`,
    io && `<span class="meta-pill">${io}</span>`,
  ].filter(Boolean);
  const meta = pills.length ? `<div class="stmt-meta">${pills.join("")}</div>` : "";
  return meta + out;
}

function renderCses(html: string): string {
  const $ = cheerio.load(html);
  const node = $(".content .md").first();
  if (!node.length) throw new Error("CSES: .content .md not found");
  // CSES pre-wraps math in spans with raw LaTeX inside (for client MathJax).
  node.find("span.math-display").each((_i, el) => {
    $(el).replaceWith(renderMath($(el).text(), true));
  });
  node.find("span.math-inline").each((_i, el) => {
    $(el).replaceWith(renderMath($(el).text(), false));
  });
  node.find(".task-score, .task-constraints-toggle").remove();
  absolutize($, "https://cses.fi");
  return node.html() ?? "";
}

// Returns rendered statement HTML, or null if the source isn't supported / fails.
export async function fetchAndRenderStatement(
  source: string,
  url: string,
): Promise<string | null> {
  try {
    const html = await fetchHtml(url);
    if (source === "CODEFORCES") return renderCodeforces(html);
    if (source === "CSES") return renderCses(html);
    return null;
  } catch {
    return null;
  }
}
