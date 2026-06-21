type RunLang = "CPP" | "PYTHON";

// Default competitive-programming starter templates (multi-test ready, fast I/O).
// Your Personal Reference Book (later phase) will let you save your own.
export const TEMPLATES: Record<RunLang, string> = {
  CPP: `#include <bits/stdc++.h>
using namespace std;

using ll = long long;
#define all(x) begin(x), end(x)
#define sz(x) (int)(x).size()

void solve() {

}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t = 1;
    cin >> t;
    while (t--) solve();

    return 0;
}
`,
  PYTHON: `import sys
input = sys.stdin.readline


def solve():
    pass


def main():
    t = int(input())
    for _ in range(t):
        solve()


if __name__ == "__main__":
    main()
`,
};

export const LANG_LABEL: Record<RunLang, string> = {
  CPP: "C++",
  PYTHON: "Python",
};

// Your saved template per language (localStorage). Once saved, it becomes the
// default starting code for every problem you haven't started yet.
export function getTemplate(lang: RunLang): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`template:${lang}`);
    if (saved != null) return saved;
  }
  return TEMPLATES[lang];
}

export function saveTemplate(lang: RunLang, code: string) {
  try {
    localStorage.setItem(`template:${lang}`, code);
  } catch {}
}

export function hasCustomTemplate(lang: RunLang): boolean {
  return typeof window !== "undefined" && localStorage.getItem(`template:${lang}`) != null;
}

export function resetTemplate(lang: RunLang) {
  try {
    localStorage.removeItem(`template:${lang}`);
  } catch {}
}
