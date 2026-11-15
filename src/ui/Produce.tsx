// 「作成を記録」(SPEC.md 5章)。ルセットのカードと、予定タブの製造予定から使う。
import { useState } from "preact/hooks";
import { bakeOps, undoBakeOps } from "../data/bakes";
import { store, useData } from "../data/store";
import { matLookup } from "../lib/calc";
import { n1, num, today, uid } from "../lib/format";
import { produce, produceNeeds } from "../lib/stock";
import type { Bake, BakeUse, Product } from "../lib/types";
import { DelButton, toast } from "./parts";

export const USE_LABEL: Record<BakeUse, string> = { event: "出店用", whole: "卸し" };

/** 出店用 / 卸し の切りかえ */
export function UseToggle({ value, onChange }: { value: BakeUse; onChange: (v: BakeUse) => void }) {
  return (
    <div class="seg" role="radiogroup" aria-label="作る目的">
      {(["event", "whole"] as const).map((u) => (
        <button key={u} role="radio" aria-checked={value === u} class={value === u ? "on" : ""} onClick={() => onChange(u)}>
          {USE_LABEL[u]}
        </button>
      ))}
    </div>
  );
}

/** 作る数・目的(タブを移っても覚えておく。保存はしない) */
const memo: Record<string, { n: number; use: BakeUse }> = {};

/** 作る数を入れて記録する。材料と包装資材の必要量がその場で出る */
export function ProduceForm({
  p,
  date,
  plan,
  qty,
  onDone,
}: {
  p: Product;
  /** 記録する日(省略で今日) */
  date?: string;
  /** 予定から記録するとき、その予定のid */
  plan?: string;
  /** 作る数の初期値 */
  qty?: number;
  onDone?: () => void;
}) {
  const d = useData();
  const mat = matLookup(d.mats);
  const key = plan ?? p.id;
  const [st, setSt] = useState(memo[key] ?? { n: qty || p.yield, use: "event" as BakeUse });
  const set = (v: Partial<typeof st>) => {
    memo[key] = { ...st, ...v };
    setSt(memo[key]);
  };
  const needs = produceNeeds(p, st.n, st.use, mat);
  const rec = needs.filter((x) => x.kind === "recipe");
  const pk = needs.filter((x) => x.kind === "pack");
  const packs = (st.use === "whole" ? p.wpacks : p.packs) ?? [];
  const row = (x: (typeof needs)[number], k: number) => (
    <div class="rl" key={k}>
      <span>{x.mat.name}</span>
      {x.short && <em>在庫不足</em>}
      <b>
        {n1(x.need)}
        {x.mat.unit}
      </b>
    </div>
  );
  return (
    <div class="produce">
      <UseToggle value={st.use} onChange={(use) => set({ use })} />
      <label class="mut">
        作る数
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="any"
          value={st.n}
          style={{ fontSize: "20px" }}
          onInput={(e) => set({ n: num(e.currentTarget.value) })}
        />
      </label>
      <div>{rec.map(row)}</div>
      <div class="rl-h">包装資材({USE_LABEL[st.use]})</div>
      {pk.length ? (
        <div>{pk.map(row)}</div>
      ) : (
        <p class="mut" style={{ margin: "4px 0" }}>
          {packs.length ? "" : `${USE_LABEL[st.use]}の包装資材は未登録です(商品の詳細で登録できます)。`}
        </p>
      )}
      <button
        class="pri"
        style={{ marginTop: "10px" }}
        onClick={() => {
          const r = produce(p, st.n, st.use, mat);
          if (!r.ok) {
            if (r.reason === "no-count") return toast("作る数を入力してください");
            return toast("在庫が足りません: " + r.shortages.join("、"));
          }
          const b: Bake = {
            id: uid(),
            date: date ?? today(),
            prod: p.id,
            name: p.name,
            qty: st.n,
            use: st.use,
            used: r.used,
            stockAdd: r.stockAdd,
            ...(plan ? { plan } : {}),
          };
          store.apply(bakeOps(b));
          delete memo[key];
          toast(
            st.use === "event"
              ? `${p.name} ${n1(st.n)}個を記録し、在庫を増やしました`
              : `${p.name} ${n1(st.n)}個(卸し)を記録しました。在庫は増やしていません`,
          );
          onDone?.();
        }}
      >
        作成を記録
      </button>
    </div>
  );
}

/** 製造記録の一覧。取り消すと、減らした材料・包装資材と足した在庫を戻す */
export function BakeList({ bakes, showDate = true }: { bakes: Bake[]; showDate?: boolean }) {
  const d = useData();
  if (!bakes.length) return null;
  const exists = { mats: new Set(d.mats.map((m) => m.id)), prods: new Set(d.prods.map((p) => p.id)) };
  return (
    <div class="bakes">
      {bakes.map((b) => (
        <div class="bk-row" key={b.id}>
          <i class={"tag " + b.use}>{USE_LABEL[b.use]}</i>
          <span>
            <b>
              {b.name} {n1(b.qty)}個
            </b>
            {showDate && <small>{b.date.slice(5).replace("-", "/")} に作成</small>}
          </span>
          <DelButton
            label="取り消す"
            armedLabel="もう一度で戻す"
            onConfirm={() => {
              store.apply(undoBakeOps(b, exists));
              toast("記録を取り消し、材料と在庫を戻しました");
            }}
          />
        </div>
      ))}
    </div>
  );
}
