// 材料と在庫
import { useState } from "preact/hooks";
import boxImg from "../assets/box.jpg";
import { store, useData } from "../data/store";
import { unitCost } from "../lib/calc";
import { n1, uid, y2 } from "../lib/format";
import { groupMats, MAT_CATS, matCat, matchName, usageCount } from "../lib/matcat";
import { isLowMat, packIn } from "../lib/stock";
import type { Material } from "../lib/types";
import { DelButton, NumField, SelectField, TextField, toast } from "../ui/parts";

/** 開いている材料と検索語(タブを移っても覚えておく。保存はしない) */
let openId: string | null = null;
let query = "";

function patch(id: string, p: Partial<Material>) {
  store.apply([{ t: "patch", col: "mats", id, patch: p }]);
}

function MatCard({ m, onClose }: { m: Material; onClose: () => void }) {
  const low = isLowMat(m);
  return (
    <div class={"card mat-ed" + (low ? " low" : "")}>
      <div class="row">
        <h2 style={{ margin: 0 }}>{m.name}</h2>
        <button class="right" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div class="grid">
        <TextField label="品名" cls="full" value={m.name} onCommit={(v) => patch(m.id, { name: v })} />
        <SelectField label="種類" cls="full" value={matCat(m)} options={MAT_CATS} onCommit={(v) => patch(m.id, { cat: v })} />
        <TextField label="単位(g・ml・個)" value={m.unit} onCommit={(v) => patch(m.id, { unit: v })} />
        <NumField label="購入量(1パック)" value={m.packQty} onCommit={(v) => patch(m.id, { packQty: v })} />
        <NumField label="購入価格(円)" value={m.packPrice} onCommit={(v) => patch(m.id, { packPrice: v })} />
        <NumField
          label={`在庫(${m.unit})`}
          value={m.qty}
          onCommit={(v) => store.apply([{ t: "incr", col: "mats", id: m.id, field: "qty", delta: v - m.qty }])}
        />
        <NumField label="発注点" value={m.min} onCommit={(v) => patch(m.id, { min: v })} />
      </div>
      <div class="row">
        <b>
          原価 {y2(unitCost(m))}/{m.unit}
        </b>
        {low && (
          <span class="alert">
            <b>発注が必要です</b>
          </span>
        )}
      </div>
      <div class="row" style={{ marginTop: "8px" }}>
        <button
          onClick={() => {
            store.apply([{ t: "incr", col: "mats", id: m.id, field: "qty", delta: packIn(m) - m.qty }]);
            toast(`${m.name}を${n1(m.packQty)}${m.unit}入庫しました`);
          }}
        >
          ＋1パック入庫
        </button>
        <DelButton
          cls="right"
          onConfirm={() => {
            const d = store.data;
            // この材料を使っているルセットからも外す
            const ops = d.prods
              .filter((p) => p.lines.some((l) => l.m === m.id))
              .map((p) => ({
                t: "patch" as const,
                col: "prods" as const,
                id: p.id,
                patch: { lines: p.lines.filter((l) => l.m !== m.id) },
              }));
            store.apply([{ t: "del", col: "mats", id: m.id }, ...ops]);
          }}
        />
      </div>
    </div>
  );
}

/** 一覧の1行。品名・原価・在庫。押すと編集が開く */
function MatRow({ m, uses, onOpen }: { m: Material; uses: number; onOpen: () => void }) {
  const low = isLowMat(m);
  return (
    <button class={"mrow" + (low ? " low" : "")} onClick={onOpen}>
      <span class="nm">
        {m.name}
        {low && <em>発注</em>}
        <small>
          在庫 {n1(m.qty)}
          {m.unit}
          {uses > 0 && ` ・ ${uses}品で使用`}
        </small>
      </span>
      <b>
        {y2(unitCost(m))}
        <small>/{m.unit}</small>
      </b>
    </button>
  );
}

export function Mats() {
  const d = useData();
  const [open, setOpen] = useState<string | null>(openId);
  const [q, setQ] = useState(query);
  const toggle = (id: string | null) => {
    openId = id;
    setOpen(id);
  };
  const al = d.mats.filter(isLowMat);
  const use = usageCount(d.prods);
  const hits = d.mats.filter((m) => matchName(m.name, q));
  const groups = groupMats(hits, use);
  return (
    <>
      <div class="ph" style={{ marginBottom: "12px" }}>
        <h1>材料と在庫</h1>
        <div class="pic">
          <img src={boxImg} alt="" />
        </div>
      </div>
      <div class="msearch">
        <input
          type="search"
          placeholder="材料を検索(例: バター)"
          aria-label="材料を検索"
          value={q}
          onInput={(e) => {
            query = e.currentTarget.value;
            setQ(query);
          }}
        />
      </div>
      {!q && (
        <>
          <button
            class="pri"
            style={{ marginBottom: "12px" }}
            onClick={() => {
              const id = uid();
              store.apply([
                {
                  t: "add",
                  col: "mats",
                  first: true,
                  item: { id, name: "新しい材料", unit: "g", packQty: 1000, packPrice: 0, qty: 0, min: 0 },
                },
              ]);
              toggle(id);
            }}
          >
            材料を追加
          </button>
          {al.length > 0 && <div class="note">【発注】{al.map((m) => m.name).join("・")}が発注点以下です。そろそろ発注しましょう</div>}
        </>
      )}
      {q && !hits.length && <p class="mut">「{q}」に当てはまる材料はありません。</p>}
      {groups.map((g) => (
        <section key={g.cat} class="mgroup">
          <h2>
            {g.cat} <small>{g.mats.length}</small>
          </h2>
          <div class="card mlist">
            {g.mats.map((m) =>
              open === m.id ? (
                <MatCard key={m.id} m={m} onClose={() => toggle(null)} />
              ) : (
                <MatRow key={m.id} m={m} uses={use[m.id] ?? 0} onOpen={() => toggle(m.id)} />
              ),
            )}
          </div>
        </section>
      ))}
    </>
  );
}
