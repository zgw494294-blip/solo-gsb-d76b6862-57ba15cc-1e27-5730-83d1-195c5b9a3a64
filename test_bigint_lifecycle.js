/* 大整数选手编号生命周期测试：最小 DOM/事件 stub 加载真实 static/app.js，
   验证超出 JS 安全整数范围的编号（9007199254740992 与 9007199254740993，
   Number 无法区分二者）在响应解析、结果展示、罚秒归属、名次排序与复核绑定
   全程不混同；改号/删行立即释放、前导零等值不算改号、在途请求不延迟失效。 */
"use strict";
const fs = require("fs");
const path = require("path");

/* ---------------- mini DOM（与 test_ranking_lifecycle.js 相同：解析 innerHTML） ---------------- */

class TokenList {
  constructor() { this._s = new Set(); }
  add(...names) { names.forEach((n) => n && this._s.add(n)); }
  remove(n) { this._s.delete(n); }
  contains(n) { return this._s.has(n); }
  [Symbol.iterator]() { return this._s[Symbol.iterator](); }
}

class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.classList = new TokenList();
    this.dataset = {};
    this.id = "";
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this._text = "";
    this._html = "";
    this._listeners = new Map();
    this.name = "";
    this.type = "";
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(html) {
    this._html = html;
    this.children = [];
    // parseHtml 返回活动数组：appendChild 会把节点从 root 摘除，须遍历副本。
    if (html) [...parseHtml(html)].forEach((n) => this.appendChild(n));
  }
  get innerHTML() { return this._html; }
  appendChild(c) {
    if (c.parent) c.parent._remove(c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  _remove(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
  }
  remove() { if (this.parent) { this.parent._remove(this); this.parent = null; } }
  insertAdjacentHTML(_pos, html) { [...parseHtml(html)].forEach((n) => this.appendChild(n)); }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  dispatchEvent(evt) {
    let node = this;
    if (!evt.target) evt.target = this;
    if (!evt.preventDefault) evt.preventDefault = () => {};
    while (node) {
      const fns = node._listeners.get(evt.type) || [];
      for (const fn of fns) fn.call(node, evt);
      node = node.parent;
    }
  }
  _descendants(out = []) {
    for (const c of this.children) { out.push(c); c._descendants(out); }
    return out;
  }
  matches(sel) {
    let s = sel.trim();
    const checked = s.endsWith(":checked");
    if (checked) s = s.slice(0, -":checked".length);
    let m = s.match(/^([\w-]+)?(?:\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/);
    if (s.startsWith(".") || s.startsWith("#")) m = null;
    if (s.startsWith(".")) {
      if (checked && !this.checked) return false;
      return this.classList.contains(s.slice(1));
    }
    if (s.startsWith("#")) return this.id === s.slice(1);
    if (!m) return false;
    const [, tag, attr, val] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (attr) {
      const actual = attr === "class" ? [...this.classList].join(" ") : this.attrs[attr] ?? this[attr];
      if (val !== undefined && String(actual) !== val) return false;
      if (val === undefined && actual === undefined) return false;
    }
    if (checked && !this.checked) return false;
    return true;
  }
  querySelector(sel) { return this._descendants().find((n) => n.matches(sel)); }
  querySelectorAll(sel) { return this._descendants().filter((n) => n.matches(sel)); }
  closest(sel) {
    let n = this;
    while (n) { if (n.matches(sel)) return n; n = n.parent; }
    return null;
  }
}

const VOID_TAGS = new Set(["input", "br", "img", "hr", "meta", "link"]);

function parseHtml(html) {
  const root = new El("#root");
  const stack = [root];
  const tokenRe = /<\/?[a-zA-Z][\w-]*(?:[^<>]*?)\/?>|[^<]+/g;
  let tok;
  while ((tok = tokenRe.exec(html))) {
    const t = tok[0];
    if (t[0] !== "<") continue;
    const closing = t[1] === "/";
    const selfClose = t.endsWith("/>");
    const nameM = t.match(/^<\/?([\w-]+)/);
    const tag = nameM[1].toLowerCase();
    if (closing) {
      const el = stack.pop();
      if (el && el._contentStart !== undefined) {
        el._html = html.slice(el._contentStart, tok.index);
      }
      continue;
    }
    const el = new El(tag);
    const attrRe = /([\w:-]+)(?:\s*=\s*"([^"]*)")?/g;
    let am;
    const raw = t.replace(/^<\/?[\w-]+/, "").replace(/\/?>$/, "");
    while ((am = attrRe.exec(raw))) {
      const [, k, v] = am;
      if (!k || k === "/") continue;
      if (v === undefined) { el.attrs[k] = true; continue; }
      el.attrs[k] = v;
      if (k === "class") v.split(/\s+/).forEach((c) => c && el.classList.add(c));
      else if (k === "id") el.id = v;
      else if (k.startsWith("data-")) {
        const dk = k.slice(5);
        el.dataset[dk] = v;
        el.dataset[dk.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      }
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = true;
      else if (k === "hidden") el.hidden = true;
      else if (k === "name") el.name = v;
      else if (k === "type") el.type = v;
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !VOID_TAGS.has(tag)) {
      el._contentStart = tok.index + t.length;
      stack.push(el);
    }
  }
  return root.children;
}

/* ---------------- document stub ---------------- */

const byId = new Map();
function mk(id, tag = "div") { const e = new El(tag); e.id = id; byId.set(id, e); return e; }

const form = mk("judge-form", "form");
const runnerRows = mk("runner-rows");
const recordRows = mk("record-rows");
const addRunner = mk("add-runner", "button");
const addRecord = mk("add-record", "button");
mk("record-count", "span");
mk("error-box"); mk("pending-hint");
const results = mk("results");
for (const id of ["smMin", "smMax", "mfMin", "mfMax"]) mk(id, "input");
mk("sample-btn", "button"); mk("clear-btn", "button");

for (const id of ["smMin", "smMax", "mfMin", "mfMax"]) form.appendChild(byId.get(id));
form.appendChild(runnerRows);
form.appendChild(recordRows);

global.document = {
  getElementById: (id) => byId.get(id),
};

/* ---------------- fetch 桩：以原始响应文本为准（大整数字面量不经 JS Number） ---------------- */

const BIG_LO = "9007199254740992"; // 2^53：Number 已无法区分它与 +1
const BIG_HI = "9007199254740993";

function lapJson(s, m, f, st, mt, ft) {
  return (
    `{"start":{"id":"${s}","time":${st}},"middle":{"id":"${m}","time":${mt}},` +
    `"finish":{"id":"${f}","time":${ft}},"smTime":${mt - st},"mfTime":${ft - mt},"totalTime":${ft - st}}`
  );
}
const LAP_LO = lapJson("a1", "b1", "c1", 0, 10, 20);
const LAP_HI = lapJson("d1", "e1", "f1", 0, 10, 20);

// 以模板字符串原样拼出响应文本：编号字面量逐位精确，模拟后端的真实输出。
function resultText(...runnerNums) {
  const runners = runnerNums
    .map((num) => {
      const lap = num === BIG_LO ? LAP_LO : LAP_HI;
      return `{"runner":${num},"lapCount":1,"totalTime":20,"laps":[${lap}],"unused":[]}`;
    })
    .join(",");
  return `{"ok":true,"result":{"runners":[${runners}]}}`;
}

const server = { text: resultText(BIG_LO, BIG_HI), hold: null };
global.fetch = async (_url, opts) => {
  JSON.parse(opts.body); // 前端始终发送合法 JSON
  const body = server.hold ? await server.hold : server.text;
  return {
    ok: true,
    status: 200,
    // app.js 必须用 text() 做无损解析；若退回 json() 立即暴露。
    json: async () => { throw new Error("应使用 text() 无损解析响应"); },
    text: async () => body,
  };
};

/* ---------------- 加载真实 app.js ---------------- */

new Function(fs.readFileSync(path.join(__dirname, "static", "app.js"), "utf8"))();

/* ---------------- 测试辅助 ---------------- */

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("  ✓", msg); }
  else { failures++; console.error("  ✗", msg); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const $ = (id) => byId.get(id);
function setVal(id, v) { $(id).value = v; }
function fire(el, type) { el.dispatchEvent({ type, preventDefault() {}, target: el }); }
async function flush(n = 5) { for (let i = 0; i < n; i++) await tick(); }
async function adjudicate() { fire(form, "submit"); await flush(); }

function setRow(ids, runner, gate, time) {
  const rows = recordRows.querySelectorAll(".record-row");
  for (const row of rows) {
    if (row.querySelector(".rec-id").value === "") {
      row.querySelector(".rec-id").value = ids;
      row.querySelector(".rec-runner").value = runner;
      row.querySelector(".rec-gate").value = gate;
      row.querySelector(".rec-time").value = time;
      return row;
    }
  }
  throw new Error("no empty row");
}
function findRow(id) {
  return recordRows.querySelectorAll(".record-row").find((r) => r.querySelector(".rec-id").value === id);
}
const numInputs = () => [...runnerRows.querySelectorAll(".runner-number")];
function rowOfRunner(v) {
  const hits = [...runnerRows.querySelectorAll(".runner-row")]
    .filter((x) => x.querySelector(".runner-number").value === v);
  if (hits.length !== 1) throw new Error(`runner ${v} 出现 ${hits.length} 次，无法唯一定位`);
  return hits[0];
}
function setRunnerAndFire(row, v) {
  row.querySelector(".runner-number").value = v;
  fire(runnerRows, "input");
}

const slotHtml = () => results.querySelector(".ranking-table-slot").innerHTML;
const rowHtml = (runner, laps, total, pen, adj, rank) =>
  `<td>${runner}</td><td>${laps}</td><td>${total} 秒</td><td>${pen} 秒</td><td>${adj} 秒</td><td>${rank}</td>`;
const rowOrder = (...nums) => {
  const h = slotHtml();
  const idx = nums.map((n) => h.indexOf(`<td>${n}</td>`));
  return idx.every((i) => i >= 0) && idx.every((v, i) => i === 0 || idx[i - 1] < v);
};

function editorOf(runner) {
  return results.querySelectorAll(".penalty-editor").find((e) => e.dataset.runner === runner);
}
function savePenalty(runner, seconds, reason) {
  const ed = editorOf(runner);
  ed.querySelector(".penalty-seconds").value = seconds;
  ed.querySelector(".penalty-reason").value = reason;
  fire(ed.querySelector(".penalty-save"), "click");
  return {
    error: ed.querySelector(".penalty-error"),
    current: ed.querySelector(".penalty-current"),
  };
}
function saveReviewBox(boxIndex, status, note) {
  const box = results.querySelectorAll(".review-box")[boxIndex];
  const radios = [...box.querySelectorAll("input[type=radio]")];
  radios.forEach((x) => { x.checked = false; });
  radios.find((x) => x.value === status).checked = true;
  box.querySelector(".review-note").value = note;
  fire(box.querySelector(".review-save"), "click");
  return box;
}
const penaltiesOf = () => globalThis.__penaltiesForTest;

/* ---------------- 场景 ---------------- */

async function main() {
  assert(Number(BIG_LO) === Number(BIG_HI), "复现前提：Number 无法区分两个编号（修复前混同的根源）");

  // 初始合法输入：区间 10~60 / 10~60，选手 BIG_LO / BIG_HI，各一趟 20 秒。
  setVal("smMin", "10"); setVal("smMax", "60"); setVal("mfMin", "10"); setVal("mfMax", "60");
  fire(addRunner, "click"); // 共 2 行选手
  numInputs()[0].value = BIG_LO; numInputs()[1].value = BIG_HI;
  fire(runnerRows, "input");
  for (let i = 0; i < 4; i++) fire(addRecord, "click"); // 共 6 行记录
  setRow("a1", BIG_LO, "S", "0"); setRow("b1", BIG_LO, "M", "10"); setRow("c1", BIG_LO, "F", "20");
  setRow("d1", BIG_HI, "S", "0"); setRow("e1", BIG_HI, "M", "10"); setRow("f1", BIG_HI, "F", "20");
  server.text = resultText(BIG_LO, BIG_HI);
  await adjudicate();

  console.log("大整数编号从响应到展示全程无损");
  assert(results.innerHTML.includes(`<h3>选手 ${BIG_LO}</h3>`), "前者编号 9007199254740992 精确显示");
  assert(results.innerHTML.includes(`<h3>选手 ${BIG_HI}</h3>`), "后者编号 9007199254740993 精确显示");
  assert(slotHtml().includes(`<td>${BIG_LO}</td>`) && slotHtml().includes(`<td>${BIG_HI}</td>`),
    "名次表两个编号分别精确显示，不混同");
  assert(slotHtml().includes(rowHtml(BIG_LO, 1, 20, 0, 20, "第 1 名")), "前者：1 次、20 秒、并列第 1 名");
  assert(slotHtml().includes(rowHtml(BIG_HI, 1, 20, 0, 20, "第 1 名")), "后者：1 次、20 秒、并列第 1 名");
  assert(rowOrder(BIG_LO, BIG_HI), "并列时按编号精确升序：…992 在 …993 前");
  assert(editorOf(BIG_LO) && editorOf(BIG_HI) && editorOf(BIG_LO) !== editorOf(BIG_HI),
    "两名选手各有独立的罚秒编辑区");

  console.log("罚秒按编号精确归属，互不影响");
  let r = savePenalty(BIG_LO, "7", "踩线");
  assert(slotHtml().includes(rowHtml(BIG_LO, 1, 20, 7, 27, "第 2 名")), "前者 7 秒生效：调整后 27 排第 2");
  assert(slotHtml().includes(rowHtml(BIG_HI, 1, 20, 0, 20, "第 1 名")), "后者不受影响：0 秒排第 1");
  assert(penaltiesOf().get(BIG_LO).seconds === 7, "罚秒键为精确编号 …992");
  assert(!penaltiesOf().has(BIG_HI) && penaltiesOf().size === 1, "后者无任何罚秒记录");
  assert(editorOf(BIG_HI).querySelector(".penalty-seconds").value === "0", "后者编辑器仍显示 0 秒");
  assert(editorOf(BIG_HI).querySelector(".penalty-reason").value === "", "后者原因为空");
  assert(r.current.innerHTML.includes("当前已保存：7 秒") && r.current.innerHTML.includes("踩线"),
    "前者回显 7 秒与原因");

  console.log("复核按编号精确绑定，互不影响");
  saveReviewBox(0, "pass", "前者备注");
  saveReviewBox(1, "doubt", "后者备注");
  await adjudicate();
  assert(results.innerHTML.includes("前者备注") && results.innerHTML.includes("后者备注"),
    "两条复核分别保存并渲染");
  findRow("b1").querySelector(".rec-time").value = "11";
  fire(findRow("b1").querySelector(".rec-time"), "input"); // 只动前者绑定记录
  await adjudicate();
  assert(!results.innerHTML.includes("前者备注"), "前者绑定记录被改 → 前者复核立即丢弃");
  assert(results.innerHTML.includes("后者备注"), "后者复核不受影响");
  findRow("b1").querySelector(".rec-time").value = "10";
  fire(findRow("b1").querySelector(".rec-time"), "input"); // 改回不恢复
  await adjudicate();
  assert(!results.innerHTML.includes("前者备注"), "改回后前者复核不恢复");
  assert(results.innerHTML.includes("后者备注"), "后者复核仍保留");

  console.log("大整数改号立即释放原编号罚秒，临时重号与改回不恢复");
  savePenalty(BIG_HI, "9", "迟到");
  assert(penaltiesOf().get(BIG_HI).seconds === 9, "前置：后者 9 秒已生效");
  const rowLO = rowOfRunner(BIG_LO);
  const rowHI = rowOfRunner(BIG_HI);
  setRunnerAndFire(rowLO, BIG_HI); // 前者改号为后者：临时重号
  assert(!penaltiesOf().has(BIG_LO), "改号瞬间：前者 …992 的 7 秒立即释放");
  assert(penaltiesOf().get(BIG_HI).seconds === 9, "后者行未改号：9 秒仍归属后者");
  setRunnerAndFire(rowLO, BIG_LO); // 改回：行离开 …993，其 9 秒也立即释放
  assert(!penaltiesOf().has(BIG_HI), "改回瞬间：…993 的 9 秒同样立即释放（即使另一行仍占用）");
  assert(!penaltiesOf().has(BIG_LO), "前者的 7 秒不恢复");
  await adjudicate();
  assert(editorOf(BIG_LO).querySelector(".penalty-seconds").value === "0", "前者编辑器回显 0 秒");
  assert(editorOf(BIG_HI).querySelector(".penalty-seconds").value === "0", "后者编辑器回显 0 秒");
  assert(results.innerHTML.includes("后者备注"), "罚秒释放不影响后者复核");

  console.log("删除选手行立即释放其大整数编号罚秒，绑定复核同时失效");
  savePenalty(BIG_HI, "6", "阻挡");
  assert(penaltiesOf().get(BIG_HI).seconds === 6, "前置：后者 6 秒已生效");
  fire(rowHI.querySelector(".remove-runner"), "click");
  assert(!penaltiesOf().has(BIG_HI), "删行瞬间：…993 的 6 秒立即释放");
  server.text = resultText(BIG_LO);
  await adjudicate();
  assert(!results.innerHTML.includes("后者备注"), "绑定选手被删：后者复核立即失效");
  assert(results.innerHTML.includes(`<h3>选手 ${BIG_LO}</h3>`), "前者结果正常渲染");

  console.log("前导零等值写法不算改号");
  savePenalty(BIG_LO, "3", "设备故障");
  setRunnerAndFire(rowLO, "0" + BIG_LO); // 09007199254740992 与 …992 同值
  assert(penaltiesOf().get(BIG_LO).seconds === 3, "前导零等值写法：罚秒保留，不触发释放");
  await adjudicate();
  assert(slotHtml().includes(rowHtml(BIG_LO, 1, 20, 3, 23, "第 1 名")), "名次表仍套用 3 秒罚秒");

  console.log("仅有前者时改号为后者：旧处罚立即清除（任务原始复现）");
  setRunnerAndFire(rowLO, BIG_HI); // 09007199254740992 → 9007199254740993
  assert(!penaltiesOf().has(BIG_LO), "改号瞬间：…992 的 3 秒立即释放，不等重算");
  server.text = resultText(BIG_HI);
  await adjudicate();
  assert(editorOf(BIG_HI).querySelector(".penalty-seconds").value === "0", "后者只显示默认 0 秒");
  assert(editorOf(BIG_HI).querySelector(".penalty-reason").value === "", "后者原因为空");
  assert(slotHtml().includes(rowHtml(BIG_HI, 1, 20, 0, 20, "第 1 名")), "名次表按 …993 精确显示且无罚秒");

  console.log("请求在途期间改号同样立即失效，过期响应不得恢复");
  savePenalty(BIG_HI, "4", "抢跑");
  assert(penaltiesOf().get(BIG_HI).seconds === 4, "前置：后者 4 秒已生效");
  let resolveHold;
  server.hold = new Promise((res) => { resolveHold = res; });
  fire(form, "submit"); // 请求在途
  setRunnerAndFire(rowLO, BIG_LO); // 在途期间改号
  assert(!penaltiesOf().has(BIG_HI), "在途期间改号：…993 的 4 秒立即释放，不等响应");
  resolveHold(resultText(BIG_HI)); // 旧编号的过期响应返回
  await flush();
  server.hold = null;
  assert(results.innerHTML === "", "过期响应被丢弃，未恢复结果与名次");
  assert(!penaltiesOf().has(BIG_LO) && !penaltiesOf().has(BIG_HI), "过期响应未恢复任何罚秒");
  server.text = resultText(BIG_LO);
  await adjudicate();
  assert(editorOf(BIG_LO).querySelector(".penalty-seconds").value === "0", "改回 …992 仍是默认 0 秒");
  assert(slotHtml().includes(rowHtml(BIG_LO, 1, 20, 0, 20, "第 1 名")), "名次表按当前编号精确显示");

  console.log("无损 JSON 解析单元断言");
  const parsed = globalThis.__parseJsonLosslessForTest(
    `{"runner":${BIG_HI},"lo":${BIG_LO},"small":101,"zero":0,"s":"9007199254740993","f":1.5,"id":"a1"}`
  );
  assert(parsed.runner === BIG_HI, "超范围整数 9007199254740993 解析为精确字符串");
  assert(parsed.lo === BIG_LO, "2^53 本身也按字符串精确保留（Number 无法区分它与 +1）");
  assert(parsed.small === 101 && typeof parsed.small === "number", "安全整数仍是 number");
  assert(parsed.zero === 0, "0 仍是 number");
  assert(parsed.s === BIG_HI, "字符串字段内容不受影响");
  assert(parsed.f === 1.5, "浮点字面量不受影响");
  assert(parsed.id === "a1", "普通字符串字段不受影响");

  console.log(failures === 0 ? "\nALL BIGINT SCENARIOS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
