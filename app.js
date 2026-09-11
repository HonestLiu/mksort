/* 数式整理 · MathMD Cleaner */

(function () {
  "use strict";

  const RULE_DEFS = [
    {
      id: "displayMath",
      label: "行间公式 \\[ \\] → $$",
      group: "math",
      forward: true,
      reverse: false,
      core: true,
    },
    {
      id: "inlineMath",
      label: "行内公式 \\( \\) → $",
      group: "math",
      forward: true,
      reverse: false,
      core: true,
    },
    {
      id: "reverseDisplay",
      label: "$$ → \\[ \\]",
      group: "math",
      forward: false,
      reverse: true,
      core: true,
    },
    {
      id: "reverseInline",
      label: "$ → \\( \\)",
      group: "math",
      forward: false,
      reverse: true,
      core: true,
    },
    {
      id: "zeroWidth",
      label: "去除零宽字符",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "normalizeEol",
      label: "统一换行 CRLF→LF",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "headingSpace",
      label: "标题后补空格",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "collapseBlank",
      label: "折叠多余空行",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "trimTrail",
      label: "去掉行尾空白",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "htmlComments",
      label: "移除 HTML 注释",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "brToNl",
      label: "<br> 转换行",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "listMarkers",
      label: "列表符号统一为 -",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "boldSpacing",
      label: "收紧 **加粗** 空格",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "aiPreface",
      label: "清理 AI 开场白",
      group: "clean",
      forward: true,
      reverse: true,
    },
    {
      id: "finalNewline",
      label: "文件末尾单换行",
      group: "clean",
      forward: true,
      reverse: true,
    },
  ];

  const SAMPLE = [
    "# 数学公式整理示例",
    "",
    "AI 常把公式写成 LaTeX 定界符，Markdown 渲染器却认 `$` / `$$`：",
    "",
    "行间能量方程：",
    "",
    "\\[ E = mc^2 \\]",
    "",
    "毕达哥拉斯定理也可以写成 \\( a^2 + b^2 = c^2 \\)，或者紧凑形式\\(x_i \\in \\mathbb{R}\\)。",
    "",
    "二次方程求根公式：",
    "",
    "\\[",
    "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    "\\]",
    "",
    "- 第一项 \\( \\alpha \\)",
    "* 第二项带零宽字符：​beta",
    "+ 第三项",
    "",
    "<br>",
    "",
    "<!-- 这是模型留下的注释 -->",
    "",
    "** 收紧空格 ** 和行尾空白：  ",
    "",
    "希望整理后可直接粘贴进支持 KaTeX / MathJax 的笔记应用。",
    "",
  ].join("\n");

  const el = {
    input: document.getElementById("inputArea"),
    output: document.getElementById("outputArea"),
    preview: document.getElementById("previewArea"),
    log: document.getElementById("changeLog"),
    chips: document.getElementById("rulesChips"),
    chipsPanel: document.getElementById("chipsPanel"),
    chipsToggle: document.getElementById("chipsToggle"),
    convertBtn: document.getElementById("convertBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    clearBtn: document.getElementById("clearBtn"),
    copyBtn: document.getElementById("copyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    themeToggle: document.getElementById("themeToggle"),
    fileInput: document.getElementById("fileInput"),
    inputStats: document.getElementById("inputStats"),
    outputStats: document.getElementById("outputStats"),
    replaceCount: document.getElementById("replaceCount"),
    statusText: document.getElementById("statusText"),
    toast: document.getElementById("toast"),
    dropHint: document.getElementById("dropHint"),
  };

  const state = {
    mode: "forward", // forward | reverse
    rules: Object.fromEntries(RULE_DEFS.map((r) => [r.id, true])),
    activeTab: "text",
    result: "",
    logs: [],
    debounceTimer: null,
    theme: "light",
  };

  /* ---------- helpers ---------- */

  function countChar(text) {
    return text.replace(/\s/g, "").length;
  }

  function countLines(text) {
    if (!text) return 0;
    return text.split("\n").length;
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("is-show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.remove("is-show"), 1800);
  }

  function setStatus(text, busy) {
    el.statusText.textContent = text;
    el.statusText.classList.toggle("is-busy", !!busy);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("mathmd-theme", theme);
    } catch (_) {}
  }

  function initTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem("mathmd-theme") || "";
    } catch (_) {}
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    applyTheme(theme);
  }

  /* ---------- conversion engine ---------- */

  function makeLog(ruleId, before, after, count) {
    return { ruleId, before, after, count };
  }

  function convertText(raw) {
    let text = raw;
    const logs = [];
    const on = (id) => !!state.rules[id];
    const mode = state.mode;

    // 1. normalize EOL first so later patterns behave
    if (on("normalizeEol")) {
      const next = text.replace(/\r\n?/g, "\n");
      if (next !== text) {
        logs.push(makeLog("normalizeEol", "CRLF / CR", "LF", text.length - next.length ? 1 : 1));
        text = next;
      }
    }

    // 2. zero-width / BOM / soft hyphen
    if (on("zeroWidth")) {
      const next = text.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "");
      if (next !== text) {
        const n = text.length - next.length;
        logs.push(makeLog("zeroWidth", "ZWNJ / ZWSP / BOM / soft-hyphen", "移除", n));
        text = next;
      }
    }

    // 3. HTML comments
    if (on("htmlComments")) {
      const next = text.replace(/<!--[\s\S]*?-->/g, "");
      if (next !== text) {
        const n = (text.match(/<!--[\s\S]*?-->/g) || []).length;
        logs.push(makeLog("htmlComments", "&lt;!-- ... --&gt;", "移除", n));
        text = next;
      }
    }

    // 4. <br> to newline
    if (on("brToNl")) {
      const next = text.replace(/<br\s*\/?>/gi, "\n");
      if (next !== text) {
        const n = (text.match(/<br\s*\/?>/gi) || []).length;
        logs.push(makeLog("brToNl", "&lt;br&gt;", "换行", n));
        text = next;
      }
    }

    // 5. AI preface cleanup (only leading junk)
    if (on("aiPreface")) {
      const next = text.replace(
        /^(?:[\s>*#-]*)*(?:好的|当然可以|以下是|下面是我|这是整理好的|Here(?:'s| is)[^\n]{0,80}\n|Sure[,.!\s][^\n]{0,80}\n|Okay[,.!\s][^\n]{0,80}\n|Certainly[^\n]{0,80}\n|Below is[^\n]{0,80}\n)/i,
        ""
      );
      if (next !== text) {
        logs.push(makeLog("aiPreface", "开场白前缀", "移除", 1));
        text = next;
      }
    }

    // 6. MATH delimiters
    if (mode === "forward") {
      if (on("displayMath")) {
        let count = 0;
        // Avoid matching already-escaped \\[
        const next = text.replace(/(^|[^\\])\\\[([\s\S]*?)\\\]/g, (m, lead, inner) => {
          count += 1;
          return `${lead}$$${inner}$$`;
        });
        if (count) {
          logs.push(makeLog("displayMath", "\\[ ... \\]", "$$ ... $$", count));
          text = next;
        }
      }

      if (on("inlineMath")) {
        let count = 0;
        // Priority 1: spaced form `\( … \)`
        let next = text.replace(/(^|[^\\])\\\(\s+([\s\S]*?)\s+\\\)/g, (m, lead, inner) => {
          count += 1;
          return `${lead}$${String(inner).trim()}$`;
        });
        // Priority 2: remaining `\(…\)`
        next = next.replace(/(^|[^\\])\\\(\s*([\s\S]*?)\s*\\\)/g, (m, lead, inner) => {
          count += 1;
          return `${lead}$${String(inner).trim()}$`;
        });
        if (count) {
          logs.push(makeLog("inlineMath", "\\( ... \\)", "$ ... $", count));
          text = next;
        }
      }
    } else {
      // reverse mode: convert $ / $$ back to LaTeX delimiters
      if (on("reverseDisplay")) {
        let count = 0;
        // $$ ... $$ (non-greedy, skip $$$ edge)
        const next = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => {
          count += 1;
          return `\\[${inner}\\]`;
        });
        if (count) {
          logs.push(makeLog("reverseDisplay", "$$ ... $$", "\\[ ... \\]", count));
          text = next;
        }
      }

      if (on("reverseInline")) {
        let count = 0;
        // Avoid $ already consumed as display; match single $...$ not starting empty
        // Use placeholder approach after display conversion already done.
        const next = text.replace(/\$([^$\n]+?)\$/g, (m, inner) => {
          count += 1;
          return `\\( ${inner.trim()} \\)`;
        });
        if (count) {
          logs.push(makeLog("reverseInline", "$ ... $", "\\( ... \\)", count));
          text = next;
        }
      }
    }

    // 7. heading space: ###Title -> ### Title (not inside code — simple heuristic)
    if (on("headingSpace")) {
      let count = 0;
      const next = text.replace(/^(#{1,6})([^#\s].*)$/gm, (m, hashes, rest) => {
        count += 1;
        return `${hashes} ${rest}`;
      });
      if (count) {
        logs.push(makeLog("headingSpace", "#标题", "# 标题", count));
        text = next;
      }
    }

    // 8. list markers * / + -> - (only top-level-ish bullet lines)
    if (on("listMarkers")) {
      let count = 0;
      const next = text.replace(/^([ \t]*)([*+])(\s+)/gm, (m, indent, bullet, sp) => {
        count += 1;
        return `${indent}-${sp}`;
      });
      if (count) {
        logs.push(makeLog("listMarkers", "* / +", "-", count));
        text = next;
      }
    }

    // 9. bold spacing: ** text ** -> **text**
    if (on("boldSpacing")) {
      let count = 0;
      let next = text.replace(/\*\*\s+([^*]+?)\s+\*\*/g, (m, inner) => {
        count += 1;
        return `**${inner.trim()}**`;
      });
      next = next.replace(/__\s+([^_]+?)\s+__/g, (m, inner) => {
        count += 1;
        return `__${inner.trim()}__`;
      });
      if (count) {
        logs.push(makeLog("boldSpacing", "** 加粗 **", "**加粗**", count));
        text = next;
      }
    }

    // 10. trim trailing whitespace (keep two-space hard breaks? — we still trim;
    //     markdown hard breaks become less common in AI dumps)
    if (on("trimTrail")) {
      const next = text.replace(/[ \t]+$/gm, "");
      if (next !== text) {
        const n = (text.match(/[ \t]+$/gm) || []).length;
        logs.push(makeLog("trimTrail", "行尾空白", "移除", n));
        text = next;
      }
    }

    // 11. collapse 3+ blank lines to 2
    if (on("collapseBlank")) {
      const next = text.replace(/\n{3,}/g, "\n\n");
      if (next !== text) {
        const n = (text.match(/\n{3,}/g) || []).length;
        logs.push(makeLog("collapseBlank", "3+ 空行", "2 空行", n));
        text = next;
      }
    }

    // 12. ensure single trailing newline
    if (on("finalNewline") && text.length) {
      const next = text.replace(/\n*$/, "\n");
      if (next !== text) {
        logs.push(makeLog("finalNewline", "文件末尾", "单换行", 1));
        text = next;
      }
    }

    return { text, logs };
  }

  /* ---------- preview ---------- */

  function protectMath(md) {
    const store = [];
    let text = md;

    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => {
      const i = store.length;
      store.push({ type: "display", content: inner });
      return `\n\n@@MATH${i}@@\n\n`;
    });

    text = text.replace(/\$([^$\n]+?)\$/g, (m, inner) => {
      const i = store.length;
      store.push({ type: "inline", content: inner });
      return `@@MATH${i}@@`;
    });

    return { text, store };
  }

  function renderKatexPiece(content, displayMode) {
    if (typeof katex !== "undefined") {
      try {
        return katex.renderToString(content, {
          displayMode,
          throwOnError: false,
          strict: false,
        });
      } catch (e) {
        return displayMode
          ? `<pre class="math-error">$$${escHtml(content)}$$</pre>`
          : `<code class="math-error">$${escHtml(content)}$</code>`;
      }
    }
    return displayMode
      ? `<pre>$$${escHtml(content)}$$</pre>`
      : `<code>$${escHtml(content)}$</code>`;
  }

  function renderPreview(md) {
    if (!md || !md.trim()) {
      el.preview.innerHTML = '<p class="preview-empty">整理后的 Markdown 会在这里实时渲染。</p>';
      return;
    }

    const { text, store } = protectMath(md);
    let html;

    if (typeof marked !== "undefined") {
      marked.setOptions({
        gfm: true,
        breaks: false,
        mangle: false,
        headerIds: false,
      });
      try {
        html = marked.parse(text);
      } catch (e) {
        html = `<pre>${escHtml(md)}</pre>`;
      }
    } else {
      html = `<pre>${escHtml(md)}</pre>`;
    }

    html = html.replace(/@@MATH(\d+)@@/g, (m, i) => {
      const item = store[Number(i)];
      if (!item) return m;
      return renderKatexPiece(item.content, item.type === "display");
    });

    el.preview.innerHTML = html;
  }

  /* ---------- UI: chips ---------- */

  function visibleRules() {
    return RULE_DEFS.filter((r) => (state.mode === "reverse" ? r.reverse : r.forward));
  }

  function renderChips() {
    const rules = visibleRules();
    el.chips.innerHTML = rules
      .map((r) => {
        const on = state.rules[r.id] !== false;
        return `<button type="button" class="chip ${on ? "is-on" : ""}" data-rule="${r.id}" title="点击开关">
          <span class="chip-dot"></span>
          ${escHtml(r.label)}
        </button>`;
      })
      .join("");
  }

  /* ---------- UI: log ---------- */

  function renderLogs(logs) {
    if (!logs.length) {
      el.log.innerHTML = '<li class="log-empty">没有需要处理的变更，内容已经是目标格式。</li>';
      return;
    }
    el.log.innerHTML = logs
      .map((log) => {
        const def = RULE_DEFS.find((r) => r.id === log.ruleId);
        const label = def ? def.label : log.ruleId;
        return `<li>
          <span class="log-tag">${escHtml(label)}</span>
          <div class="log-body">
            ${log.before} → ${log.after}
            <span class="log-count">× ${log.count}</span>
          </div>
        </li>`;
      })
      .join("");
  }

  /* ---------- stats ---------- */

  function updateStats() {
    const raw = el.input.value;
    const out = state.result;
    el.inputStats.textContent = `${countChar(raw)} 字 · ${countLines(raw)} 行`;

    if (!raw) {
      el.outputStats.textContent = "等待输入";
      el.outputStats.classList.add("is-idle");
      el.outputStats.classList.remove("is-busy");
      el.replaceCount.textContent = "0 处替换";
      return;
    }

    el.outputStats.classList.remove("is-idle");
    const total = state.logs.reduce((s, l) => s + (l.count || 0), 0);
    el.outputStats.textContent = total
      ? `已应用 ${state.logs.length} 条规则 · ${total} 处`
      : "已是目标格式";
    el.replaceCount.textContent = `${total} 处替换`;
  }

  /* ---------- main convert ---------- */

  function convert({ flash = true } = {}) {
    const raw = el.input.value;
    if (!raw) {
      state.result = "";
      state.logs = [];
      el.output.value = "";
      renderLogs([]);
      renderPreview("");
      updateStats();
      setStatus("就绪 · 修改输入后自动整理");
      return;
    }

    setStatus("整理中…", true);
    const { text, logs } = convertText(raw);
    state.result = text;
    state.logs = logs;
    el.output.value = text;
    renderLogs(logs);
    renderPreview(text);
    updateStats();

    const total = logs.reduce((s, l) => s + (l.count || 0), 0);
    setStatus(
      total ? `完成 · 共 ${total} 处替换` : "完成 · 无需替换",
      false
    );

    if (flash && total) {
      el.output.classList.remove("flash");
      // reflow
      void el.output.offsetWidth;
      el.output.classList.add("flash");
    }
  }

  function scheduleConvert() {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => convert({ flash: true }), 220);
  }

  /* ---------- tabs ---------- */

  function setTab(name) {
    state.activeTab = name;
    document.querySelectorAll(".tab").forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `panel-${name}`);
    });
    if (name === "preview") renderPreview(state.result || el.output.value);
  }

  /* ---------- file / clipboard ---------- */

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      el.input.value = String(reader.result || "");
      convert({ flash: true });
      showToast(`已导入 ${file.name}`);
    };
    reader.onerror = () => showToast("读取文件失败");
    reader.readAsText(file, "utf-8");
  }

  async function copyResult() {
    const text = state.result || el.output.value;
    if (!text) {
      showToast("没有可复制的内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制到剪贴板");
    } catch (_) {
      el.output.removeAttribute("readonly");
      el.output.select();
      try {
        document.execCommand("copy");
        showToast("已复制到剪贴板");
      } catch (e) {
        showToast("复制失败，请手动选择");
      }
      el.output.setAttribute("readonly", "");
    }
  }

  function downloadResult() {
    const text = state.result || el.output.value;
    if (!text) {
      showToast("没有可下载的内容");
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
    showToast("已下载 cleaned.md");
  }

  /* ---------- events ---------- */

  function bindEvents() {
    el.input.addEventListener("input", () => {
      updateStats();
      scheduleConvert();
    });

    el.convertBtn.addEventListener("click", () => {
      clearTimeout(state.debounceTimer);
      convert({ flash: true });
      showToast("已整理");
    });

    el.sampleBtn.addEventListener("click", () => {
      el.input.value = SAMPLE;
      convert({ flash: true });
      showToast("已载入示例");
    });

    el.clearBtn.addEventListener("click", () => {
      el.input.value = "";
      convert({ flash: false });
      el.input.focus();
      showToast("已清空");
    });

    el.copyBtn.addEventListener("click", copyResult);
    el.downloadBtn.addEventListener("click", downloadResult);

    el.themeToggle.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    document.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (mode === state.mode) return;
        state.mode = mode;
        document.querySelectorAll(".seg-btn").forEach((b) => {
          b.classList.toggle("is-active", b.dataset.mode === mode);
        });
        renderChips();
        convert({ flash: true });
        showToast(mode === "forward" ? "正向整理：转为 $ / $$" : "反向导出：转为 \\( \\) / \\[ \\]");
      });
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setTab(tab.dataset.tab));
    });

    el.chips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-rule]");
      if (!chip) return;
      const id = chip.dataset.rule;
      state.rules[id] = !state.rules[id];
      chip.classList.toggle("is-on", state.rules[id]);
      convert({ flash: true });
    });

    el.chipsToggle.addEventListener("click", () => {
      const open = !el.chipsPanel.classList.contains("is-open");
      el.chipsPanel.classList.toggle("is-open", open);
      el.chipsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    el.fileInput.addEventListener("change", () => {
      const file = el.fileInput.files && el.fileInput.files[0];
      if (file) readFile(file);
      el.fileInput.value = "";
    });

    // drag & drop
    let dragDepth = 0;
    const hideDropHint = () => {
      dragDepth = 0;
      el.dropHint.hidden = true;
    };
    const hasFiles = (e) => {
      const dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types) {
        return Array.from(dt.types).includes("Files");
      }
      return true;
    };

    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth += 1;
      el.dropHint.hidden = false;
    });
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) hideDropHint();
    });
    window.addEventListener("dragend", hideDropHint);
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      hideDropHint();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) readFile(file);
    });

    el.dropHint.addEventListener("click", hideDropHint);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.dropHint.hidden) {
        hideDropHint();
      }
    });

    // keyboard: Cmd/Ctrl+Enter convert, Cmd/Ctrl+S download
    document.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(state.debounceTimer);
        convert({ flash: true });
        showToast("已整理");
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        downloadResult();
      }
    });
  }

  /* ---------- unit self-check (console) ---------- */

  function selfCheck() {
    const cases = [
      {
        name: "display spaced",
        input: "\\[ E = mc^2 \\]",
        expect: "$$ E = mc^2 $$",
      },
      {
        name: "display multiline",
        input: "\\[\n x = 1\n\\]",
        expect: "$$\n x = 1\n$$",
      },
      {
        name: "inline spaced priority",
        input: "see \\( a^2 + b^2 \\) here",
        expect: "see $a^2 + b^2$ here",
      },
      {
        name: "inline no space",
        input: "\\(x_i\\)",
        expect: "$x_i$",
      },
      {
        name: "mixed",
        input: "# t\n\\[ a \\]\n\\( b \\)",
        expect: "# t\n$$ a $$\n$b$",
      },
    ];

    const results = cases.map((c) => {
      const rulesBak = { ...state.rules };
      const modeBak = state.mode;
      Object.keys(state.rules).forEach((k) => (state.rules[k] = false));
      state.rules.displayMath = true;
      state.rules.inlineMath = true;
      state.mode = "forward";
      const out = convertText(c.input).text;
      state.rules = rulesBak;
      state.mode = modeBak;
      return { ...c, out, ok: out === c.expect };
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.warn("[MathMD] self-check failures", failed);
    } else {
      console.info("[MathMD] self-check passed", results.length, "cases");
    }
    return results;
  }

  /* ---------- init ---------- */

  function init() {
    initTheme();
    renderChips();
    bindEvents();
    updateStats();

    // wait a tick for CDN scripts (they are defer + this is defer, order preserved)
    if (typeof marked === "undefined" || typeof katex === "undefined") {
      console.warn("[MathMD] CDN libraries not ready yet; preview may fall back.");
    }

    // auto-load sample for first-time UX? keep empty, but offer via button.
    // Prefer empty so users can paste immediately.
    setStatus("就绪 · 修改输入后自动整理");
    selfCheck();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
