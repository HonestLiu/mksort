(() => {
  const $ = (id) => document.getElementById(id);

  const inputEl = $("input");
  const outputEl = $("output");
  const statsEl = $("stats");
  const previewEl = $("preview");
  const inMeta = $("in-meta");
  const outMeta = $("out-meta");
  const toastEl = $("toast");

  const opts = {
    spacedFirst: $("opt-spaced-first"),
    trimInner: $("opt-trim-inner"),
    displayBlock: $("opt-display-block"),
    protectCode: $("opt-protect-code"),
    collapseBlank: $("opt-collapse-blank"),
    trimTrailing: $("opt-trim-trailing"),
    normalizeHeadings: $("opt-normalize-headings"),
    stripBoilerplate: $("opt-strip-boilerplate"),
    doubleEscape: $("opt-double-escape"),
    alignEnv: $("opt-align-env"),
    dollarGaps: $("opt-dollar-gaps"),
  };

  const SAMPLE = [
    "这里是模型的回答。",
    "",
    "先看行内公式：能量关系 \\( E = mc^2 \\)，以及带空格版本 \\( a^2 + b^2 = c^2 \\)。",
    "",
    "再看块级公式：",
    "",
    "\\[",
    "  \\int_0^1 x^2 \\, dx = \\frac{1}{3}",
    "\\]",
    "",
    "双重转义也可能出现：\\\\( F = ma \\\\) 与",
    "",
    "\\\\[",
    "  \\sum_{i=1}^n i = \\frac{n(n+1)}{2}",
    "\\\\]",
    "",
    "对齐环境：",
    "",
    "\\begin{align}",
    "  a &= b + c \\\\",
    "  d &= e",
    "\\end{align}",
    "",
    "###标题缺空格",
    "",
    "```python",
    "# 这里的 \\( x \\) 不应被改动",
    "print(r\"\\( not math \\)\")",
    "```",
    "",
    "行内代码 `\\( code \\)` 也不该动。",
    "",
    "这段有多余空行。",
    "",
    "",
    "",
    "结尾。",
    "",
  ].join("\n");

  let toastTimer = null;

  function toast(msg) {
    toastEl.hidden = false;
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 1800);
  }

  function countChars(text) {
    return text.length;
  }

  function protectRegions(text, enable) {
    if (!enable) return { text, map: [] };

    const map = [];
    let i = 0;
    let out = text;
    const fenceRe = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g;
    const inlineRe = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;

    out = out.replace(fenceRe, (match) => {
      const token = `\u0000CODEBLOCK${i}\u0000`;
      map.push({ token, value: match });
      i += 1;
      return token;
    });

    out = out.replace(inlineRe, (match) => {
      const token = `\u0000INLINECODE${i}\u0000`;
      map.push({ token, value: match });
      i += 1;
      return token;
    });

    return { text: out, map };
  }

  function restoreRegions(text, map) {
    let out = text;
    for (const item of map) {
      out = out.split(item.token).join(item.value);
    }
    return out;
  }

  function trimInnerMath(content) {
    return content.replace(/^\s+/, "").replace(/\s+$/, "").replace(/[ \t]{2,}/g, " ");
  }

  function transform(text, options) {
    const stats = {
      doubleEscape: 0,
      spacedInline: 0,
      compactInline: 0,
      display: 0,
      alignEnv: 0,
      dollarGaps: 0,
      blankLines: 0,
      trailing: 0,
      headings: 0,
      boilerplate: 0,
    };

    let s = text.replace(/\r\n?/g, "\n");

    const protectedRes = protectRegions(s, options.protectCode);
    s = protectedRes.text;
    const map = protectedRes.map;

    if (options.doubleEscape) {
      s = s.replace(/\\\\\(/g, () => {
        stats.doubleEscape += 1;
        return "\\(";
      });
      s = s.replace(/\\\\\)/g, () => {
        stats.doubleEscape += 1;
        return "\\)";
      });
      s = s.replace(/\\\\\[/g, () => {
        stats.doubleEscape += 1;
        return "\\[";
      });
      s = s.replace(/\\\\\]/g, () => {
        stats.doubleEscape += 1;
        return "\\]";
      });
    }

    if (options.spacedFirst) {
      s = s.replace(/\\\(\s+([\s\S]+?)\s+\\\)/g, (_, body) => {
        stats.spacedInline += 1;
        const inner = options.trimInner ? trimInnerMath(body) : body;
        return "$" + inner + "$";
      });
    }

    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => {
      stats.compactInline += 1;
      const inner = options.trimInner ? trimInnerMath(body) : body;
      return "$" + inner + "$";
    });

    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => {
      stats.display += 1;
      const inner = options.trimInner
        ? trimInnerMath(body)
        : body.replace(/^\n/, "").replace(/\n[ \t]*$/, "");
      if (options.displayBlock) {
        return "\n$$\n" + inner + "\n$$\n";
      }
      return "$$" + inner + "$$";
    });

    if (options.alignEnv) {
      const envRe = /(^|\n)([ \t]*)(\\begin\{(align\*?|gather\*?|equation\*?|eqnarray\*?|multline\*?|flalign\*?)\}[\s\S]*?\\end\{\4\})/g;
      s = s.replace(envRe, (match, lead, indent, block) => {
        stats.alignEnv += 1;
        return lead + indent + "$$\n" + block.trim() + "\n" + indent + "$$";
      });
      s = s.replace(/\$\$\s*\$\$/g, () => {
        stats.alignEnv -= 1;
        return "$$";
      });
    }

    if (options.dollarGaps) {
      s = s.replace(/\$\s+\$/g, () => {
        stats.dollarGaps += 1;
        return "$$";
      });
      s = s.replace(/\$\$\s*\$\$/g, () => {
        stats.dollarGaps += 1;
        return "$$";
      });
    }

    if (options.stripBoilerplate) {
      const lines = s.split("\n");
      const patterns = [
        /^\s*(好的|当然可以|当然|没问题|以下是|下面是|希望这(篇|份|段)|如有需要|如果需要|请让我知道|Let me know|Here(?:'s| is)|Sure[,!]?|Of course|Certainly)\b.*$/i,
        /^\s*(根据您的要求|按照您的要求|针对您的问题|综上所述[,，]?|总结如下[:：]?)\s*$/i,
      ];
      let removed = 0;
      const kept = lines.filter((line) => {
        const isBoiler = patterns.some((re) => re.test(line)) && line.trim().length < 80;
        if (isBoiler) removed += 1;
        return !isBoiler;
      });
      stats.boilerplate = removed;
      s = kept.join("\n");
    }

    if (options.normalizeHeadings) {
      s = s.replace(/^(#{1,6})([^\s#])/gm, (_, hashes, next) => {
        stats.headings += 1;
        return hashes + " " + next;
      });
    }

    if (options.trimTrailing) {
      const lines = s.split("\n");
      let changed = 0;
      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i].replace(/[ \t]+$/g, "");
        if (trimmed !== lines[i]) {
          changed += 1;
          lines[i] = trimmed;
        }
      }
      stats.trailing = changed;
      s = lines.join("\n");
    }

    if (options.collapseBlank) {
      const before = s;
      s = s.replace(/\n{3,}/g, "\n\n");
      const b = (before.match(/\n/g) || []).length;
      const a = (s.match(/\n/g) || []).length;
      stats.blankLines = Math.max(0, b - a);
    }

    s = s.replace(/\n+$/, "\n");
    if (s === "\n") s = "";

    const result = restoreRegions(s, map);
    return { text: result, stats };
  }

  function readOptions() {
    return {
      spacedFirst: opts.spacedFirst.checked,
      trimInner: opts.trimInner.checked,
      displayBlock: opts.displayBlock.checked,
      protectCode: opts.protectCode.checked,
      collapseBlank: opts.collapseBlank.checked,
      trimTrailing: opts.trimTrailing.checked,
      normalizeHeadings: opts.normalizeHeadings.checked,
      stripBoilerplate: opts.stripBoilerplate.checked,
      doubleEscape: opts.doubleEscape.checked,
      alignEnv: opts.alignEnv.checked,
      dollarGaps: opts.dollarGaps.checked,
    };
  }

  function renderStats(stats) {
    const rows = [
      ["双重转义修复", stats.doubleEscape],
      ["带空格行内公式", stats.spacedInline],
      ["紧凑行内公式", stats.compactInline],
      ["块级公式", stats.display],
      ["对齐环境包裹", stats.alignEnv],
      ["空 $ 清理", stats.dollarGaps],
      ["空行压缩", stats.blankLines],
      ["行尾空白", stats.trailing],
      ["标题空格", stats.headings],
      ["AI 套话", stats.boilerplate],
    ];

    const total = rows.reduce((sum, row) => sum + row[1], 0);
    if (total === 0) {
      statsEl.innerHTML = '<div class="stat empty">没有触发任何替换。内容可能已经很干净，或尚未粘贴文本。</div>';
      return;
    }

    const parts = rows
      .filter((row) => row[1] > 0)
      .map((row) => '<div class="stat"><span class="label">' + row[0] + '</span><span class="value">' + row[1] + "</span></div>");
    parts.push('<div class="stat"><span class="label">合计动作</span><span class="value">' + total + "</span></div>");
    statsEl.innerHTML = parts.join("");
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function markdownToHtml(md) {
    const blocks = [];
    let prepared = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => {
      const token = "%%KATEX_BLOCK_" + blocks.length + "%%";
      blocks.push(body.trim());
      return "\n\n" + token + "\n\n";
    });

    prepared = prepared.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (_, body) => {
      return "%%KATEX_INLINE_" + body + "%%";
    });

    let html;
    try {
      html = window.marked.parse(prepared);
    } catch (e) {
      html = "<pre>" + escapeHtml(md) + "</pre>";
    }

    blocks.forEach((body, idx) => {
      let rendered;
      try {
        rendered = katex.renderToString(body, {
          displayMode: true,
          throwOnError: false,
          strict: false,
        });
      } catch (e) {
        rendered = "<code>" + escapeHtml(body) + "</code>";
      }
      html = html.replace(new RegExp("%%KATEX_BLOCK_" + idx + "%%", "g"), rendered);
    });

    html = html.replace(/%%KATEX_INLINE_([\s\S]*?)%%/g, (_, body) => {
      try {
        return katex.renderToString(body, {
          displayMode: false,
          throwOnError: false,
          strict: false,
        });
      } catch (e) {
        return "<code>" + escapeHtml(body) + "</code>";
      }
    });

    return html;
  }

  function updatePreview(md) {
    if (!md.trim()) {
      previewEl.innerHTML = '<p style="color:var(--ink-muted)">预览为空。整理后的 Markdown 会在这里渲染。</p>';
      return;
    }
    previewEl.innerHTML = markdownToHtml(md);
  }

  function run(optsArg) {
    const silent = optsArg && optsArg.silent;
    const src = inputEl.value;
    const res = transform(src, readOptions());
    outputEl.value = res.text;
    inMeta.textContent = countChars(src) + " 字符";
    outMeta.textContent = countChars(res.text) + " 字符";
    renderStats(res.stats);
    updatePreview(res.text);
    if (!silent && src.trim()) {
      const stats = res.stats;
      const total =
        stats.doubleEscape +
        stats.spacedInline +
        stats.compactInline +
        stats.display +
        stats.alignEnv +
        stats.dollarGaps +
        stats.blankLines +
        stats.trailing +
        stats.headings +
        stats.boilerplate;
      toast(total ? "完成 · " + total + " 处处理" : "内容已很干净");
    }
  }

  let timer = null;
  function scheduleRun() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      run({ silent: true });
    }, 180);
  }

  inputEl.addEventListener("input", scheduleRun);
  Object.keys(opts).forEach(function (key) {
    opts[key].addEventListener("change", function () {
      run({ silent: true });
    });
  });

  $("btn-run").addEventListener("click", function () {
    run();
  });
  $("btn-sample").addEventListener("click", function () {
    inputEl.value = SAMPLE;
    run({ silent: true });
    toast("已载入示例");
  });
  $("btn-clear").addEventListener("click", function () {
    inputEl.value = "";
    outputEl.value = "";
    inMeta.textContent = "0 字符";
    outMeta.textContent = "0 字符";
    statsEl.innerHTML = '<div class="stat empty">尚未整理。粘贴内容后点击「整理 Markdown」。</div>';
    updatePreview("");
    inputEl.focus();
  });

  $("btn-copy").addEventListener("click", function () {
    const text = outputEl.value;
    if (!text) {
      toast("没有可复制的内容");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("已复制到剪贴板");
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    outputEl.removeAttribute("readonly");
    outputEl.select();
    try {
      document.execCommand("copy");
      toast("已复制");
    } catch (e) {
      toast("复制失败，请手动复制");
    }
    outputEl.setAttribute("readonly", "readonly");
  }

  $("btn-download").addEventListener("click", function () {
    const text = outputEl.value;
    if (!text) {
      toast("没有可下载的内容");
      return;
    }
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleaned.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("已下载 cleaned.md");
  });

  $("btn-theme").addEventListener("click", function () {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("md-cleaner-theme", next);
    } catch (e) {
      /* ignore */
    }
  });

  try {
    const saved = localStorage.getItem("md-cleaner-theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {
    /* ignore */
  }

  function assert(name, cond) {
    if (!cond) console.error("[md-cleaner self-test failed]", name);
  }

  function allOn(over) {
    return {
      spacedFirst: true,
      trimInner: true,
      displayBlock: true,
      protectCode: true,
      collapseBlank: true,
      trimTrailing: true,
      normalizeHeadings: true,
      stripBoilerplate: false,
      doubleEscape: true,
      alignEnv: true,
      dollarGaps: true,
      ...(over || {}),
    };
  }

  function selfTest() {
    const r1 = transform("Hello \\( E = mc^2 \\) end", allOn());
    assert("spaced inline", r1.text.indexOf("Hello $E = mc^2$ end") !== -1);

    const r2 = transform("\\[\n  a+b\n\\]", allOn());
    assert("display block", r2.text.indexOf("$$\na+b\n$$") !== -1);

    const r3 = transform("```md\n\\( x \\)\n```", allOn({ collapseBlank: false, trimTrailing: false, normalizeHeadings: false, alignEnv: false, dollarGaps: false }));
    assert("protect code", r3.text.indexOf("\\( x \\)") !== -1);

    const r4 = transform("\\\\( F=ma \\\\)", allOn());
    assert("double escape", r4.text.indexOf("$F=ma$") !== -1);

    const r5 = transform("\\( a \\) and \\(b\\)", allOn());
    assert("both inline forms", r5.text.indexOf("$a$") !== -1 && r5.text.indexOf("$b$") !== -1);
  }

  selfTest();
  run({ silent: true });
})();
