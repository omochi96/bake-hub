// 材料と在庫
import boxImg from "../assets/box.jpg";
import { store, useData } from "../data/store";
import { unitCost } from "../lib/calc";
import { n1, uid, y2 } from "../lib/format";
import { isLowMat, packIn } from "../lib/stock";
import type { Material } from "../lib/types";
import { DelButton, NumField, TextField, toast } from "../ui/parts";

function patch(id: string, p: Partial<Material>) {
  store.apply([{ t: "patch", col: "mats", id, patch: p }]);
}

function MatCard({ m }: { m: Material }) {
  const low = isLowMat(m);
  return (
    <div class={"card" + (low ? " low" : "")}>
      <div class="grid">
        <TextField label="品名" cls="full" value={m.name} onCommit={(v) => patch(m.id, { name: v })} />
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
          <span class="neg">
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

export function Mats() {
  const d = useData();
  const al = d.mats.filter(isLowMat);
  return (
    <>
      <div class="ph" style={{ marginBottom: "12px" }}>
        <h1>材料と在庫</h1>
        <div class="pic">
          <img src={boxImg} alt="" />
        </div>
      </div>
      <button
        class="pri"
        style={{ marginBottom: "12px" }}
        onClick={() =>
          store.apply([
            {
              t: "add",
              col: "mats",
              first: true,
              item: { id: uid(), name: "新しい材料", unit: "g", packQty: 1000, packPrice: 0, qty: 0, min: 0 },
            },
          ])
        }
      >
        材料を追加
      </button>
      {al.length > 0 && <div class="note">【発注】{al.map((m) => m.name).join("・")}が発注点以下です。そろそろ発注しましょう</div>}
      {d.mats.map((m) => (
        <MatCard key={m.id} m={m} />
      ))}
    </>
  );
}
