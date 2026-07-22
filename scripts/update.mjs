/* ─────────────────────────────────────────────────────────
   scripts/update.mjs
   GitHub Actions에서 매주 실행되어 data.json을 최신화합니다.

   ★ 검색 대상은 societies.json(학회 등록부)에서 읽습니다.
     - 등록부에 학회를 한 줄 추가하면, 기존 일정 데이터가 전혀 없어도
       Claude가 웹을 검색해 해당 학회의 일정을 찾아 data.json에
       자동으로 새 항목을 만들어 넣습니다.
     - data.json에만 있고 등록부에 없는 학회도 계속 검색됩니다(안전망).

   필요 환경변수: ANTHROPIC_API_KEY
──────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from "fs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(1); }

const MODEL = "claude-haiku-4-5";   // 가장 저렴한 최신 모델 ($1/$5 per MTok)
const SEARCHES_PER_CALL = 4;        // 호출당 웹 검색 상한 (비용 통제)

const DATA_PATH = new URL("../data.json", import.meta.url).pathname;
const REG_PATH  = new URL("../societies.json", import.meta.url).pathname;
const db  = JSON.parse(readFileSync(DATA_PATH, "utf8"));
let registry = { societies: [] };
try { registry = JSON.parse(readFileSync(REG_PATH, "utf8")); }
catch { console.warn("societies.json not found — falling back to societies in data.json"); }

/* ── 검색 대상 학회 목록 만들기: 등록부 ∪ data.json ── */
const regMap = new Map();  // soc → {group, hint}
for (const s of registry.societies || []) {
  if (s && s.soc) regMap.set(s.soc, { group: s.group || "INTL", hint: s.hint || "" });
}
for (const m of db.meetings) {           // 등록부에 없는 기존 학회도 포함(안전망)
  if (!regMap.has(m.soc)) regMap.set(m.soc, { group: m.group || "INTL", hint: "" });
}
const ALL_SOCS = [...regMap.keys()];
const GENERIC_HINT = s => `${s} — search the society's official website for its annual meeting dates and venue.`;

/* 3개씩 묶어 API 호출 그룹 자동 생성 */
const GROUPS = [];
for (let i = 0; i < ALL_SOCS.length; i += 3) {
  const socs = ALL_SOCS.slice(i, i + 3);
  GROUPS.push({ socs, hint: socs.map(s => regMap.get(s).hint || GENERIC_HINT(s)).join(" / ") });
}
console.log(`societies registered: ${ALL_SOCS.length} → API calls: ${GROUPS.length}`);
const newSocs = ALL_SOCS.filter(s => !db.meetings.some(m => m.soc === s));
if (newSocs.length) console.log("new societies (no data yet, will be discovered):", newSocs.join(", "));

const nameOf = v => (v && typeof v === "object") ? (v.en || v.ko || "") : (v || "");
const norm = s => String(s).toLowerCase().replace(/\s+/g, "");

function currentDataFor(socs) {
  return db.meetings.filter(m => socs.includes(m.soc)).map(m => ({
    soc: m.soc, name: nameOf(m.name), start: m.start, end: m.end, status: m.status,
    city: (m.city && m.city.en) || nameOf(m.city),
    venue: typeof m.venue === "string" ? m.venue : (m.venue?.en || ""),
  }));
}

async function queryGroup(g) {
  const today = new Date().toISOString().slice(0, 10);
  const held = currentDataFor(g.socs);
  const prompt = `Today is ${today}. Use web search to verify the annual meeting schedules of these radiation-oncology-related societies: ${g.socs.join(", ")}.
Search hints: ${g.hint}

Current data held (societies listed above but MISSING here are newly registered — find ALL their upcoming annual meetings and return them as new items):
${JSON.stringify(held)}

Task:
(1) For societies with existing data: find items whose dates/venue/status were newly announced or changed, and newly announced future editions.
(2) For newly registered societies with no data: find their upcoming annual meetings (this year and the next ~2 years) and return each as a new item.
Prefer official society websites as sources.

Respond with ONLY a JSON array in exactly this shape. No markdown fences, no prose. If nothing changed and no new items, output [].
[{"soc":"same abbreviation as above","name":{"ko":"대회명 한국어","en":"Meeting name in English"},"start":"YYYY-MM-DD or null","end":"YYYY-MM-DD or null","status":"confirmed|date-only|provisional|tbd","city":{"ko":"도시 한국어","en":"City"},"country":{"ko":"국가 한국어","en":"Country"},"venue":{"ko":"장소","en":"Venue"},"note":{"ko":"비고(선택)","en":"Note (optional)"},"url":"official URL"}]
Include only verified information; never guess. Keep notes short.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: SEARCHES_PER_CALL }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const m = clean.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

function mergeUpdates(updates) {
  let changed = 0;
  for (const u of updates) {
    if (!u || !u.soc || !u.name) continue;
    const uKeyEn = norm(u.soc + "|" + nameOf(u.name));
    const uKeyKo = norm(u.soc + "|" + (u.name?.ko || ""));
    const existing = db.meetings.find(m => {
      const kEn = norm(m.soc + "|" + nameOf(m.name));
      const kKo = norm(m.soc + "|" + (m.name?.ko || ""));
      return kEn === uKeyEn || (kKo && kKo === uKeyKo) ||
        (m.soc === u.soc && u.start && m.start === u.start);
    });
    if (existing) {
      let diff = false;
      for (const f of ["start", "end", "status", "url"]) {
        if (u[f] !== undefined && u[f] !== null && u[f] !== existing[f]) { existing[f] = u[f]; diff = true; }
      }
      for (const f of ["name", "city", "country", "venue", "note"]) {
        if (u[f] && JSON.stringify(u[f]) !== JSON.stringify(existing[f])) { existing[f] = u[f]; diff = true; }
      }
      if (existing.start) delete existing.yearHint;
      if (diff) { changed++; console.log("updated:", u.soc, nameOf(u.name)); }
    } else {
      const group = regMap.get(u.soc)?.group || "INTL";
      db.meetings.push({ ...u, group,
        ...(u.start ? {} : { yearHint: new Date().getFullYear() }) });
      changed++; console.log("added:", u.soc, nameOf(u.name));
    }
  }
  return changed;
}

let total = 0, errs = 0;
for (const g of GROUPS) {
  try {
    console.log("searching:", g.socs.join(", "));
    total += mergeUpdates(await queryGroup(g));
  } catch (e) { errs++; console.error("group failed:", g.socs.join(","), e.message); }
}

db.meta = db.meta || {};
db.meta.lastUpdated = new Date().toISOString();
db.meta.lastRun = { changed: total, failedGroups: errs };
writeFileSync(DATA_PATH, JSON.stringify(db, null, 1));
console.log(`done. changed=${total}, failedGroups=${errs}`);
