import { useState, useRef } from "react";
import {
  Save, Plus, Scissors, Copy, Clipboard, Play, Square, RotateCcw,
  FastForward, ChevronDown, Folder, Circle, Atom, FileCode, Files, X,
} from "lucide-react";

const MONO = "Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

/* ============ 회로 스펙 ============ */
const BELL = { n: 2, gates: [{ col: 0, kind: "H", q: 0 }, { col: 1, kind: "CNOT", ctrl: 0, tgt: 1 }] };
const GHZ = { n: 3, gates: [{ col: 0, kind: "H", q: 0 }, { col: 1, kind: "CNOT", ctrl: 0, tgt: 1 }, { col: 2, kind: "CNOT", ctrl: 1, tgt: 2 }] };

/* ============ Wolfram 양자 시뮬레이터 ============ */
function fnFromWolfram(expr) {
  let s = expr.replace(/\s+/g, "")
    .replace(/Sin/g, "sin").replace(/Cos/g, "cos").replace(/Tan/g, "tan")
    .replace(/Exp/g, "exp").replace(/Sqrt/g, "sqrt").replace(/Abs/g, "abs").replace(/Pi/g, "PI");
  s = s.replace(/\[/g, "(").replace(/\]/g, ")").replace(/\^/g, "**");
  s = s.replace(/(\d)([a-zA-Z(])/g, "$1*$2").replace(/\)([a-zA-Z(0-9])/g, ")*$1");
  s = s.replace(/\b(sin|cos|tan|exp|sqrt|abs)\b/g, "Math.$1").replace(/\bPI\b/g, "Math.PI");
  return new Function("x", "return (" + s + ")");
}
const boundVal = (s) => { try { return fnFromWolfram(s)(0); } catch { return 0; } };

function evalWolfram(input) {
  const n = input.replace(/\s+/g, "");
  if (!n) return null;
  // --- 양자 ---
  if (n.includes("Needs[") && n.includes("QuantumFramework"))
    return { kind: "stream", value: "Wolfram Quantum Framework v1.4.0 이(가) 로드되었습니다." };
  if (n.includes('["Amplitudes"]'))
    return { kind: "rules", value: '<|"00" -> 1/Sqrt[2], "11" -> 1/Sqrt[2]|>' };
  if (n.includes("MatrixForm") && n.includes("Hadamard"))
    return { kind: "matrix", rows: [["1/√2", "1/√2"], ["1/√2", "-1/√2"]], label: "Hadamard 연산자 (2×2 유니터리)" };
  if (n.includes("DensityMatrix") || (n.includes("MatrixForm") && n.includes("Bell")))
    return { kind: "matrix", rows: [["1/2", "0", "0", "1/2"], ["0", "0", "0", "0"], ["0", "0", "0", "0"], ["1/2", "0", "0", "1/2"]], label: "Bell 상태 밀도행렬 ρ (4×4)" };
  if (/Probabilit/i.test(n) && /Plot/i.test(n))
    return { kind: "probplot", data: [{ label: "|00⟩", p: 0.5 }, { label: "|01⟩", p: 0 }, { label: "|10⟩", p: 0 }, { label: "|11⟩", p: 0.5 }], title: "측정 확률 분포" };
  if (n.includes("Bloch"))
    return { kind: "bloch", label: "|+⟩", desc: "Bloch 구 위의 |+⟩ 상태 (적도 +x 방향)" };
  if (n.includes("VonNeumann") || n.includes("EntanglementMonotone"))
    return { kind: "number", value: "1", label: "Bell 상태 얽힘 엔트로피 (bits)" };
  if (n.includes('"CNOT",2,3') || /ghz/i.test(n))
    return { kind: "circuit", spec: GHZ, caption: "GHZ 상태 준비 회로 (3 qubits)" };
  if (n.includes('QuantumState["Bell"]'))
    return { kind: "ket", num: "|00⟩ + |11⟩", den: "√2", label: "QuantumState · 2 qubits · pure" };
  if (n.includes('QuantumState["+"]') || n.includes('QuantumState["Plus"]'))
    return { kind: "ket", num: "|0⟩ + |1⟩", den: "√2", label: "QuantumState · 1 qubit · |+⟩" };
  if (n.includes("QuantumCircuit") || n.includes('"CNOT"'))
    return { kind: "circuit", spec: BELL, caption: "Bell 상태 준비 회로 (2 qubits)" };
  if (n.includes("QuantumState"))
    return { kind: "ket", num: "|0⟩", den: "", label: "QuantumState · 1 qubit" };
  // --- 일반 ---
  if (n === "$Version") return { kind: "text", value: "14.1.0 for Linux x86 (64-bit) (2025)" };
  if (/^Plot\[/.test(n)) {
    const m = input.match(/Plot\[(.+),\s*\{x,\s*([^,]+),\s*([^}]+)\}\s*\]/s);
    return m ? { kind: "plot", fn: m[1].trim(), a: m[2].trim(), b: m[3].trim() } : { kind: "expr", value: input, unknown: true };
  }
  try { const v = Function('"use strict";return (' + n.replace(/\^/g, "**") + ")")(); if (typeof v === "number" && isFinite(v)) return { kind: "number", value: String(v) }; } catch {}
  return { kind: "expr", value: input, unknown: true };
}

function evalPython(input) {
  const t = input.trim(), n = t.replace(/\s+/g, "");
  if (!n) return null;
  const pr = t.match(/^print\((.+)\)$/s);
  if (pr) return { kind: "stream", value: pr[1].trim().replace(/^["']|["']$/g, "") };
  if (n === "sum(range(11))") return { kind: "number", value: "55" };
  if (/^[A-Z][A-Za-z]*\[/.test(n) || n.startsWith("$") || n.includes("Quantum") || n.includes("Needs[")) {
    const name = (t.match(/^[A-Za-z$]+/) || ["?"])[0];
    return { kind: "error", value: `NameError: name '${name}' is not defined` };
  }
  try { const v = Function('"use strict";return (' + n.replace(/\^/g, "**") + ")")(); if (typeof v === "number" && isFinite(v)) return { kind: "number", value: String(v) }; } catch {}
  return { kind: "error", value: "NameError: name is not defined" };
}
function evalR(input) {
  const t = input.trim(), n = t.replace(/\s+/g, "");
  if (!n) return null;
  if (/^[A-Z][A-Za-z]*\[/.test(n) || n.startsWith("$") || n.includes("Quantum") || n.includes("Needs[")) {
    const name = (t.match(/^[A-Za-z$]+/) || ["?"])[0];
    return { kind: "error", value: `Error: could not find function "${name}"` };
  }
  try { const v = Function('"use strict";return (' + n.replace(/\^/g, "**") + ")")(); if (typeof v === "number" && isFinite(v)) return { kind: "number", value: "[1] " + v }; } catch {}
  return { kind: "error", value: "Error: object not found" };
}
const evaluate = (input, k) => (k === "wl" ? evalWolfram(input) : k === "py" ? evalPython(input) : evalR(input));

/* ============ 렌더 헬퍼 ============ */
function Frac({ num, den, size = 14 }) {
  if (!den) return <span style={{ fontFamily: SERIF, fontSize: size }}>{num}</span>;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", fontFamily: SERIF, fontSize: size, lineHeight: 1.15 }}>
      <span style={{ padding: "0 3px" }}>{num}</span>
      <span style={{ borderTop: "1px solid currentColor", padding: "0 3px" }}>{den}</span>
    </span>
  );
}
const entryNode = (s, key) => {
  if (typeof s === "string" && s.includes("/")) { const [a, b] = s.split("/"); return <Frac key={key} num={a} den={b} size={13} />; }
  return <span key={key} style={{ fontFamily: SERIF, fontSize: 14 }}>{s}</span>;
};

function mathNodes(str) {
  let s = str.replace(/->/g, "→").replace(/Pi/g, "π").replace(/Infinity/g, "∞").replace(/Sqrt\[([^\]]+)\]/g, "√($1)");
  const out = []; let i = 0, buf = "";
  const flush = () => { if (buf) { out.push(<span key={out.length}>{buf}</span>); buf = ""; } };
  while (i < s.length) {
    if (s[i] === "^") {
      flush(); i++; let sup = "";
      if (s[i] === "(") { i++; while (i < s.length && s[i] !== ")") { sup += s[i]; i++; } i++; }
      else { while (i < s.length && /[0-9a-zA-Z.\-]/.test(s[i])) { sup += s[i]; i++; } }
      out.push(<sup key={out.length} style={{ fontSize: "0.72em" }}>{sup}</sup>);
    } else { buf += s[i]; i++; }
  }
  flush(); return out;
}

/* --- 회로도 --- */
function CircuitView({ spec, caption }) {
  const { n, gates } = spec;
  const cols = Math.max(...gates.map((g) => g.col)) + 1;
  const left = 38, colW = 60, top = 26, rowH = 46, padR = 24;
  const W = left + 18 + colW * cols + padR, H = top + rowH * (n - 1) + 34;
  const xc = (c) => left + 18 + c * colW + 14;
  const yq = (q) => top + q * rowH;
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W }} className="w-full border border-gray-200 rounded bg-white">
        {Array.from({ length: n }).map((_, q) => (
          <g key={q}>
            <text x="8" y={yq(q) + 4} fontSize="12" fill="#64748b">q{q === 0 ? "₀" : q === 1 ? "₁" : "₂"}</text>
            <line x1={left} y1={yq(q)} x2={W - 8} y2={yq(q)} stroke="#334155" strokeWidth="1.4" />
          </g>
        ))}
        {gates.map((g, k) => {
          if (g.kind === "CNOT") {
            const x = xc(g.col);
            return (
              <g key={k}>
                <line x1={x} y1={yq(g.ctrl)} x2={x} y2={yq(g.tgt)} stroke="#334155" strokeWidth="1.4" />
                <circle cx={x} cy={yq(g.ctrl)} r="5.5" fill="#334155" />
                <circle cx={x} cy={yq(g.tgt)} r="13" fill="white" stroke="#334155" strokeWidth="1.4" />
                <line x1={x} y1={yq(g.tgt) - 11} x2={x} y2={yq(g.tgt) + 11} stroke="#334155" strokeWidth="1.4" />
                <line x1={x - 11} y1={yq(g.tgt)} x2={x + 11} y2={yq(g.tgt)} stroke="#334155" strokeWidth="1.4" />
              </g>
            );
          }
          const x = xc(g.col), y = yq(g.q);
          return (
            <g key={k}>
              <rect x={x - 16} y={y - 16} width="32" height="32" rx="4" fill="#eef1fb" stroke="#5b6fd6" />
              <text x={x} y={y + 5} fontSize="15" fill="#3b4cae" textAnchor="middle" fontWeight="600">{g.kind}</text>
            </g>
          );
        })}
      </svg>
      {caption && <div className="text-xs text-gray-400">{caption}</div>}
    </div>
  );
}

/* --- 상태 ket --- */
function KetView({ num, den, label }) {
  return (
    <div className="space-y-1">
      <span style={{ fontFamily: SERIF, fontSize: 16 }} className="text-gray-900 inline-flex items-center">
        {den ? <Frac num={num} den={den} size={16} /> : <span>{num}</span>}
      </span>
      {label && <div className="text-xs text-gray-400">{label}</div>}
    </div>
  );
}

/* --- 행렬 (MatrixForm) --- */
function MatrixView({ rows, label }) {
  return (
    <div className="space-y-1">
      <div className="inline-flex items-stretch">
        <div style={{ width: 7, borderLeft: "2px solid #475569", borderTop: "2px solid #475569", borderBottom: "2px solid #475569" }} />
        <div className="px-2 py-1">
          {rows.map((r, i) => (
            <div key={i} className="flex">
              {r.map((e, j) => <div key={j} className="text-center" style={{ minWidth: 46, padding: "3px 6px" }}>{entryNode(e, j)}</div>)}
            </div>
          ))}
        </div>
        <div style={{ width: 7, borderRight: "2px solid #475569", borderTop: "2px solid #475569", borderBottom: "2px solid #475569" }} />
      </div>
      {label && <div className="text-xs text-gray-400">{label}</div>}
    </div>
  );
}

/* --- 측정 확률 막대그래프 --- */
function ProbPlotView({ data, title }) {
  const W = 320, H = 190, padL = 36, padB = 30, padT = 12;
  const bw = (W - padL - 14) / data.length;
  const yv = (p) => padT + (1 - p) * (H - padT - padB);
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 340 }} className="w-full border border-gray-200 rounded bg-white">
        {[0, 0.5, 1].map((t, k) => (
          <g key={k}>
            <line x1={padL} x2={W - 8} y1={yv(t)} y2={yv(t)} stroke="#eef0f3" />
            <text x={padL - 6} y={yv(t) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, k) => {
          const x = padL + 6 + k * bw, h = (1 - (yv(d.p) - padT) / (H - padT - padB)) * 0;
          const top = yv(d.p), bh = yv(0) - top;
          return (
            <g key={k}>
              {d.p > 0 && <rect x={x} y={top} width={bw - 12} height={bh} rx="2" fill="#5b6fd6" />}
              <text x={x + (bw - 12) / 2} y={H - padB + 13} fontSize="10" fill="#475569" textAnchor="middle">{d.label}</text>
              {d.p > 0 && <text x={x + (bw - 12) / 2} y={top - 3} fontSize="9" fill="#5b6fd6" textAnchor="middle">{d.p}</text>}
            </g>
          );
        })}
        <line x1={padL} y1={yv(0)} x2={W - 8} y2={yv(0)} stroke="#cbd5e1" />
      </svg>
      {title && <div className="text-xs text-gray-400">{title}</div>}
    </div>
  );
}

/* --- Bloch 구 --- */
function BlochView({ label, desc }) {
  const cx = 80, cy = 82, r = 60;
  const vx = cx + r * 0.82, vy = cy - r * 0.08;
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 200 175" style={{ maxWidth: 220 }} className="w-full border border-gray-200 rounded bg-white">
        <circle cx={cx} cy={cy} r={r} fill="#f8fafc" stroke="#cbd5e1" />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.32} fill="none" stroke="#cbd5e1" />
        <ellipse cx={cx} cy={cy} rx={r * 0.32} ry={r} fill="none" stroke="#e2e8f0" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#94a3b8" strokeDasharray="3 3" />
        <text x={cx + 4} y={cy - r - 3} fontSize="11" fill="#475569">|0⟩</text>
        <text x={cx + 4} y={cy + r + 12} fontSize="11" fill="#475569">|1⟩</text>
        <line x1={cx} y1={cy} x2={vx} y2={vy} stroke="#dc2626" strokeWidth="2" />
        <polygon points={`${vx},${vy} ${vx - 9},${vy - 4} ${vx - 8},${vy + 5}`} fill="#dc2626" />
        <circle cx={cx} cy={cy} r="2.5" fill="#475569" />
        <text x={vx - 2} y={vy - 6} fontSize="12" fill="#dc2626" fontWeight="600">{label}</text>
      </svg>
      {desc && <div className="text-xs text-gray-400">{desc}</div>}
    </div>
  );
}

function PlotView({ fn, a, b }) {
  const W = 460, H = 270, pad = 32;
  let f; try { f = fnFromWolfram(fn); } catch { return <span className="text-gray-400 italic">(렌더 불가)</span>; }
  const ax = boundVal(a), bx = boundVal(b), N = 200, pts = [];
  for (let k = 0; k <= N; k++) { const x = ax + (bx - ax) * (k / N); let y; try { y = f(x); } catch { y = NaN; } if (isFinite(y)) pts.push([x, y]); }
  if (!pts.length) return <span className="text-gray-400 italic">(렌더 불가)</span>;
  const ys = pts.map((p) => p[1]); let mn = Math.min(...ys), mx = Math.max(...ys); if (mn === mx) { mn -= 1; mx += 1; }
  const sx = (x) => pad + ((x - ax) / (bx - ax)) * (W - 2 * pad);
  const sy = (y) => H - pad - ((y - mn) / (mx - mn)) * (H - 2 * pad);
  const d = pts.map((p, k) => (k ? "L" : "M") + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1)).join(" ");
  const y0 = mn <= 0 && mx >= 0 ? sy(0) : H - pad;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 440 }} className="w-full border border-gray-200 rounded bg-white">
      <line x1={pad} y1={y0} x2={W - pad} y2={y0} stroke="#cbd5e1" />
      <path d={d} fill="none" stroke="#5b6fd6" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function OutputView({ d }) {
  if (!d) return null;
  if (d.kind === "circuit") return <CircuitView spec={d.spec} caption={d.caption} />;
  if (d.kind === "ket") return <KetView num={d.num} den={d.den} label={d.label} />;
  if (d.kind === "matrix") return <MatrixView rows={d.rows} label={d.label} />;
  if (d.kind === "probplot") return <ProbPlotView data={d.data} title={d.title} />;
  if (d.kind === "bloch") return <BlochView label={d.label} desc={d.desc} />;
  if (d.kind === "plot") return <PlotView fn={d.fn} a={d.a} b={d.b} />;
  if (d.kind === "stream") return <pre style={{ fontFamily: MONO, fontSize: 13 }} className="text-gray-800 whitespace-pre-wrap m-0">{d.value}</pre>;
  if (d.kind === "error") return <pre style={{ fontFamily: MONO, fontSize: 12.5 }} className="whitespace-pre-wrap m-0 px-2 py-1.5 rounded text-red-700 bg-red-50 border border-red-200">{d.value}</pre>;
  if (d.kind === "text" || d.kind === "number")
    return (
      <div>
        <span style={{ fontFamily: SERIF, fontSize: 15 }} className="text-gray-900">{d.value}</span>
        {d.label && <div className="text-xs text-gray-400">{d.label}</div>}
      </div>
    );
  return (
    <span style={{ fontFamily: SERIF, fontSize: 15 }} className="text-gray-900 leading-relaxed">
      {mathNodes(d.value)}
      {d.unknown && <span style={{ fontFamily: "system-ui" }} className="ml-2 text-xs text-amber-600">※ 데모 미등록 입력</span>}
    </span>
  );
}

/* ============ 데이터 ============ */
const KERNELS = {
  wl: { id: "wl", name: "Wolfram Language", icon: Atom, color: "#dc2626" },
  py: { id: "py", name: "Python 3 (ipykernel)", icon: FileCode, color: "#eab308" },
  r: { id: "r", name: "R", icon: FileCode, color: "#2563eb" },
};
const SEED = [
  'Needs["Wolfram`QuantumFramework`"]',
  'QuantumState["Bell"]',
  'QuantumState["Bell"]["Amplitudes"]',
  'QuantumOperator["Hadamard"]["MatrixForm"]',
  'QuantumState["Bell"]["DensityMatrix"] // MatrixForm',
  'QuantumCircuitOperator[{"H", "CNOT"}]["Diagram"]',
  'ghz = QuantumCircuitOperator[{"H", {"CNOT", 1, 2}, {"CNOT", 2, 3}}];\nghz["Diagram"]',
  'QuantumMeasurement[\n  QuantumCircuitOperator[{"H", "CNOT"}][]\n]["ProbabilitiesPlot"]',
  'QuantumState["+"]["BlochPlot"]',
  'QuantumEntanglementMonotone[\n  QuantumState["Bell"], "VonNeumannEntropy"]',
];
let CID = 1;
const mkCell = (input = "") => ({ id: CID++, input, output: null, count: null, status: "idle" });

/* ============ 셀 ============ */
function Cell({ cell, active, onSel, onChange, onRun, taRefs }) {
  const prompt = cell.status === "running" ? "[*]" : cell.count != null ? `[${cell.count}]` : "[ ]";
  const showOut = cell.output && cell.output.kind !== "stream" && cell.output.kind !== "error";
  return (
    <div onClick={() => onSel(cell.id)} className="flex cursor-text bg-white">
      <div style={{ width: 6, background: active ? "#2196f3" : "transparent" }} />
      <div className="flex-1 min-w-0 py-1.5 pr-3">
        <div className="flex gap-1">
          <div style={{ width: 64, color: "#307fc1", fontFamily: MONO, fontSize: 12 }} className="shrink-0 text-right pt-2 select-none">{prompt}:</div>
          <div className="flex-1 min-w-0 flex rounded-sm overflow-hidden border" style={{ borderColor: active ? "#90caf9" : "#e0e0e0", background: "#f7f7f7" }}>
            <textarea
              ref={(el) => { taRefs.current[cell.id] = el; }}
              value={cell.input}
              onChange={(e) => onChange(cell.id, e.target.value)}
              onFocus={() => onSel(cell.id)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); onRun(cell.id); } }}
              rows={Math.max(1, cell.input.split("\n").length)}
              placeholder="양자 코드 입력 후 Shift+Enter…"
              spellCheck={false}
              style={{ fontFamily: MONO, fontSize: 13 }}
              className="flex-1 resize-none bg-transparent px-2.5 py-1.5 text-gray-800 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        {cell.output && (
          <div className="flex gap-1 mt-1">
            <div style={{ width: 64, color: showOut ? "#d84315" : "transparent", fontFamily: MONO, fontSize: 12 }} className="shrink-0 text-right pt-0.5 select-none">
              {showOut ? `[${cell.count}]:` : ""}
            </div>
            <div className="flex-1 min-w-0 pt-0.5 pl-1"><OutputView d={cell.output} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ 메인 ============ */
export default function App() {
  const [kernel, setKernel] = useState(KERNELS.wl);
  const [cells, setCells] = useState(() => SEED.map((s) => mkCell(s)));
  const [activeId, setActiveId] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [pendKernel, setPendKernel] = useState("wl");
  const execRef = useRef(1);
  const taRefs = useRef({});

  const change = (id, v) => setCells((cs) => cs.map((c) => (c.id === id ? { ...c, input: v } : c)));
  const focusCell = (id) => setTimeout(() => { const el = taRefs.current[id]; if (el) el.focus(); }, 0);

  const advance = (id) => setCells((cs) => {
    const i = cs.findIndex((c) => c.id === id);
    if (i === cs.length - 1) { const nc = mkCell(); setActiveId(nc.id); focusCell(nc.id); return [...cs, nc]; }
    const nx = cs[i + 1].id; setActiveId(nx); focusCell(nx); return cs;
  });

  const runCell = (id) => {
    const cell = cells.find((c) => c.id === id);
    if (!cell || !cell.input.trim()) { advance(id); return; }
    setCells((cs) => cs.map((x) => (x.id === id ? { ...x, status: "running" } : x)));
    setBusy(true);
    setTimeout(() => {
      setCells((cs) => {
        const c = cs.find((x) => x.id === id); if (!c) return cs;
        const out = evaluate(c.input, kernel.id); const n = execRef.current++;
        let next = cs.map((x) => (x.id === id ? { ...x, status: "done", output: out, count: n } : x));
        let nextId;
        if (next[next.length - 1].id === id) { const nc = mkCell(); next = [...next, nc]; nextId = nc.id; }
        else { const i = next.findIndex((x) => x.id === id); nextId = next[i + 1].id; }
        setActiveId(nextId); focusCell(nextId);
        return next;
      });
      setBusy(false);
    }, 460);
  };

  const restart = () => { execRef.current = 1; setCells((cs) => cs.map((c) => ({ ...c, output: null, count: null, status: "idle" }))); };

  const restartRunAll = () => {
    const snap = cells.filter((c) => c.input.trim()).map((c) => ({ id: c.id, input: c.input }));
    execRef.current = 1;
    setCells((cs) => cs.map((c) => ({ ...c, output: null, count: null, status: "idle" })));
    setBusy(true);
    const kid = kernel.id;
    const step = (j) => {
      if (j >= snap.length) { setBusy(false); return; }
      const { id, input } = snap[j];
      setCells((cs) => cs.map((c) => (c.id === id ? { ...c, status: "running" } : c)));
      setActiveId(id);
      setTimeout(() => {
        const out = evaluate(input, kid); const n = execRef.current++;
        setCells((cs) => cs.map((c) => (c.id === id ? { ...c, status: "done", output: out, count: n } : c)));
        setTimeout(() => step(j + 1), 200);
      }, 440);
    };
    setTimeout(() => step(0), 240);
  };

  const addCell = () => setCells((cs) => { const nc = mkCell(); setActiveId(nc.id); focusCell(nc.id); return [...cs, nc]; });
  const openDialog = () => { setPendKernel(kernel.id); setDialog(true); };
  const confirmKernel = () => { setKernel(KERNELS[pendKernel]); restart(); setDialog(false); };

  const KIcon = kernel.icon;
  const tb = { borderColor: "#e0e0e0" };

  return (
    <div className="relative w-full rounded-lg overflow-hidden border bg-white flex flex-col"
      style={{ borderColor: "#cfcfcf", fontFamily: "system-ui, sans-serif", aspectRatio: "16 / 9" }}>
      <div className="flex items-center gap-3 px-3 text-xs border-b shrink-0" style={{ ...tb, height: 30, color: "#3c3c3c", background: "#fff" }}>
        {["File", "Edit", "View", "Run", "Kernel", "Settings", "Help"].map((m) => (
          <span key={m} onClick={() => m === "Kernel" && openDialog()} className="cursor-default hover:text-black px-0.5">{m}</span>
        ))}
        <span className="ml-auto text-gray-300">JupyterLab · Quantum</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col items-center gap-1 py-2 border-r shrink-0" style={{ ...tb, width: 44, background: "#f0f0f0" }}>
          <button onClick={() => setShowFiles((v) => !v)} title="File Browser" className="p-1.5 rounded"
            style={{ background: showFiles ? "#fff" : "transparent", color: showFiles ? "#1976d2" : "#616161" }}><Folder size={20} /></button>
          <button title="Running" className="p-1.5 rounded text-gray-600"><Files size={20} /></button>
        </div>

        {showFiles && (
          <div className="border-r shrink-0" style={{ ...tb, width: 178, background: "#fafafa" }}>
            <div className="px-2 py-1.5 text-xs font-semibold tracking-wide border-b" style={{ ...tb, color: "#5a5a5a" }}>파일</div>
            <div className="px-2 py-1.5 text-xs text-gray-500">/ home / user /</div>
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs" style={{ background: "#e3f2fd", color: "#1565c0" }}><span style={{ color: "#f57c00" }}>◆</span> quantum_demo.ipynb</div>
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500"><Folder size={13} /> circuits</div>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between border-b shrink-0" style={{ ...tb, height: 30, background: "#f7f7f7" }}>
            <div className="flex items-center gap-1.5 px-3 h-full border-r bg-white text-xs" style={tb}>
              <span style={{ color: "#f57c00" }}>◆</span> quantum_demo.ipynb <X size={12} className="text-gray-400 ml-1" />
            </div>
            <button onClick={openDialog} className="flex items-center gap-1.5 px-3 text-xs hover:bg-gray-100 h-full" title="커널 변경">
              <KIcon size={14} style={{ color: kernel.color }} />
              <span className="text-gray-700">{kernel.name}</span>
              <Circle size={9} style={{ color: busy ? "#fb8c00" : "#bdbdbd", fill: busy ? "#fb8c00" : "transparent" }} />
            </button>
          </div>

          <div className="flex items-center gap-0.5 px-2 border-b shrink-0" style={{ ...tb, height: 34 }}>
            {[Save, Plus, Scissors, Copy, Clipboard].map((Ic, i) => (
              <button key={i} onClick={() => i === 1 && addCell()} className="p-1.5 rounded text-gray-500 hover:bg-gray-100"><Ic size={15} /></button>
            ))}
            <span className="mx-1 w-px h-4" style={{ background: "#e0e0e0" }} />
            <button onClick={() => runCell(activeId)} title="실행 (Shift+Enter)" className="p-1.5 rounded text-gray-600 hover:bg-gray-100"><Play size={15} /></button>
            <button onClick={() => setBusy(false)} title="중단" className="p-1.5 rounded text-gray-600 hover:bg-gray-100"><Square size={15} /></button>
            <button onClick={restart} title="재시작" className="p-1.5 rounded text-gray-600 hover:bg-gray-100"><RotateCcw size={15} /></button>
            <button onClick={restartRunAll} title="재시작 후 전체 실행" className="p-1.5 rounded text-gray-600 hover:bg-gray-100"><FastForward size={15} /></button>
            <span className="mx-1 w-px h-4" style={{ background: "#e0e0e0" }} />
            <div className="flex items-center gap-1 text-xs text-gray-600 border rounded px-2 py-1" style={tb}>Code <ChevronDown size={12} /></div>
            <button onClick={restartRunAll} className="ml-auto text-xs text-blue-600 hover:underline px-2">▶▶ 전체 실행</button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-1 bg-white">
            {cells.map((c) => <Cell key={c.id} cell={c} active={activeId === c.id} onSel={setActiveId} onChange={change} onRun={runCell} taRefs={taRefs} />)}
          </div>

          <div className="flex items-center gap-3 px-3 border-t text-xs shrink-0" style={{ ...tb, height: 24, color: "#616161", background: "#f7f7f7" }}>
            <span>{busy ? "Busy" : "Idle"}</span>
            <span className="ml-auto">{kernel.name} | 셀 {cells.length}개</span>
          </div>
        </div>

        {(() => {
          const kernelVersion = { wl: "14.0", py: "3.12", jl: "1.10" }[kernel.id] || "—";
          const packages = kernel.id === "wl"
            ? [{ name: "QuantumFramework", version: "1.4.0" }, { name: "GeneralUtilities", version: "1.0.4" }]
            : kernel.id === "py"
              ? [{ name: "qiskit", version: "1.0.2" }, { name: "numpy", version: "1.26.4" }]
              : [{ name: "Yao", version: "0.8.10" }];
          return (
            <aside className="border-l shrink-0 flex flex-col" style={{ ...tb, width: 200, background: "#fafafa" }}>
              <div className="px-2 py-1.5 text-xs font-semibold tracking-wide border-b" style={{ ...tb, color: "#5a5a5a" }}>버전</div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-700">
                <KIcon size={13} style={{ color: kernel.color }} />
                <span>{kernel.name}</span>
                <span className="ml-auto text-gray-400">{kernelVersion}</span>
              </div>

              <div className="px-2 py-1.5 text-xs font-semibold tracking-wide border-b border-t" style={{ ...tb, color: "#5a5a5a" }}>패키지</div>
              {packages.map((p) => (
                <div key={p.name} className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-700">
                  <span style={{ color: "#f57c00" }}>◆</span>
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto text-gray-400">{p.version}</span>
                </div>
              ))}

              <div className="px-2 py-1.5 text-xs font-semibold tracking-wide border-b border-t" style={{ ...tb, color: "#5a5a5a" }}>상태</div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-700">
                <Circle size={9} style={{ color: busy ? "#fb8c00" : "#43a047", fill: busy ? "#fb8c00" : "#43a047" }} />
                <span>{busy ? "실행 중" : "준비됨"}</span>
                <span className="ml-auto text-gray-400">셀 {cells.length}</span>
              </div>
            </aside>
          );
        })()}
      </div>

      {dialog && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div className="bg-white rounded shadow-xl border w-80" style={{ borderColor: "#cfcfcf" }}>
            <div className="px-4 py-3 border-b font-semibold text-sm" style={tb}>Select Kernel</div>
            <div className="px-4 py-4 text-sm text-gray-700">
              <div className="mb-2 text-xs text-gray-500">Select kernel for: <b>quantum_demo.ipynb</b></div>
              <select value={pendKernel} onChange={(e) => setPendKernel(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" style={tb}>
                {Object.values(KERNELS).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <div className="mt-2 text-xs text-gray-400">커널 변경 시 실행 상태가 초기화됩니다.</div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={tb}>
              <button onClick={() => setDialog(false)} className="px-3 py-1.5 text-sm rounded border text-gray-600 hover:bg-gray-50" style={tb}>Cancel</button>
              <button onClick={confirmKernel} className="px-3 py-1.5 text-sm rounded text-white" style={{ background: "#1976d2" }}>Select</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
