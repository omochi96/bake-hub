// 「作成を記録」(SPEC.md 5章)。ルセットのカードと、予定タブの製造予定から使う。
import { useState } from "preact/hooks";
import { bakeOps, undoBakeOps } from "../data/bakes";
import { store, useData } from "../data/store";
import { lotSize, matLookup, productCost } from "../lib/calc";
import { n1, num, today, uid } from "../lib/format";
import { produce, produceNeeds, producePieces } from "../lib/stock";
import type { Bake, BakeUse, Product, WholeSale } from "../lib/types";
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
const memo: Record<string, { n: number; use: BakeUse; tops: string[]; client: string; lots: number; sell: boolean }> = {};

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
  const mat = matLookup(d.mats, d.prods);
  const key = plan ?? p.id;
  const [st, setSt] = useState(
    memo[key] ?? { n: qty || p.yield, use: "event" as BakeUse, tops: [] as string[], client: "", lots: 1, sell: true },
  );
  const set = (v: Partial<typeof st>) => {
    memo[key] = { ...st, ...v };
    setSt(memo[key]);
  };
  const tops = (p.secs ?? []).filter((x) => x.opt);
  const on = new Set(st.tops.filter((t) => tops.some((x) => x.id === t)));
  // 卸し: 卸先のロット枚数 × ロット数 = 作る枚数
  const whole = st.use === "whole";
  const clients = d.clients ?? [];
  const client = clients.find((c) => c.id === st.client);
  const lot = lotSize(p, client);
  const cnt = whole ? st.lots * lot : st.n;
  const needs = produceNeeds(p, cnt, st.use, mat, on, whole ? st.lots : undefined);
  const pieces = producePieces(p, cnt, mat, on);
  const rec = needs.filter((x) => x.kind === "recipe");
  // 見出しごとにまとめる(本体 → 枠・生地の順)
  const groups = [...new Set(rec.map((x) => x.group))];
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
      {whole ? (
        <div class="grid" style={{ marginTop: 0 }}>
          <label class="full">
            卸先
            <select value={st.client} onChange={(e) => set({ client: e.currentTarget.value })}>
              <option value="">指定なし</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ロット数
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="any"
              value={st.lots}
              style={{ fontSize: "20px" }}
              onInput={(e) => set({ lots: num(e.currentTarget.value) })}
            />
          </label>
          <div class="lot-calc">
            <small>1ロット {n1(lot)}枚</small>
            <b>{n1(cnt)}枚を作る</b>
          </div>
          {client && (
            <label class="full sell">
              <input type="checkbox" checked={st.sell} onChange={(e) => set({ sell: e.currentTarget.checked })} />
              {client.name}への納品(売上)としても記録する
            </label>
          )}
          {!clients.length && <p class="mut full" style={{ margin: 0 }}>卸先は「売上」タブの「卸し」で登録できます。</p>}
        </div>
      ) : (
        <label class="mut">
          {p.box ? "作る箱数" : "作る数"}
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
      )}
      {tops.length > 0 && (
        <div class="tops">
          <span class="mut">トッピング</span>
          {tops.map((t) => (
            <label key={t.id} class={"chipbtn" + (on.has(t.id) ? " on" : "")}>
              <input
                type="checkbox"
                checked={on.has(t.id)}
                onChange={(e) => set({ tops: e.currentTarget.checked ? [...st.tops, t.id] : st.tops.filter((x) => x !== t.id) })}
              />
              {t.name}
            </label>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g}>
          {g && <div class="rl-h">{g}</div>}
          {rec.filter((x) => x.group === g).map(row)}
        </div>
      ))}
      {pieces.length > 0 && (
        <>
          <div class="rl-h">入れるお菓子</div>
          {pieces.map((x) => (
            <div class="rl" key={x.prod.id}>
              <span>{x.prod.name}</span>
              {x.short && <em>在庫不足(残り{n1(x.prod.stock)})</em>}
              <b>{n1(x.need)}枚</b>
            </div>
          ))}
        </>
      )}
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
          const r = produce(p, cnt, st.use, mat, on, whole ? st.lots : undefined);
          if (!r.ok) {
            if (r.reason === "no-count") return toast("作る数を入力してください");
            return toast("在庫が足りません: " + r.shortages.join("、"));
          }
          const b: Bake = {
            id: uid(),
            date: date ?? today(),
            prod: p.id,
            name: p.name,
            qty: cnt,
            use: st.use,
            used: r.used,
            ...(Object.keys(r.pused).length ? { pused: r.pused } : {}),
            ...(on.size ? { tops: [...on] } : {}),
            stockAdd: r.stockAdd,
            ...(plan ? { plan } : {}),
            ...(whole ? { lots: st.lots, ...(client ? { client: client.id } : {}) } : {}),
          };
          const ops = bakeOps(b);
          // 卸先への納品(売上)も記録する。製造記録を取り消すと、この納品も消える
          const sell = whole && client && st.sell;
          if (sell) {
            const ws: WholeSale = {
              id: uid(),
              date: b.date,
              client: client.id,
              cname: client.name,
              bake: b.id,
              items: [{ prod: p.id, name: p.name, lots: st.lots, lot, qty: cnt, price: p.whole, cost: productCost(p, mat, lot).wtot }],
            };
            ops.push({ t: "add", col: "wsales", item: ws, first: true });
          }
          store.apply(ops);
          delete memo[key];
          toast(
            !whole
              ? `${p.name} ${n1(cnt)}個を記録し、在庫を増やしました`
              : `${p.name} ${n1(cnt)}枚(卸し${client ? "・" + client.name : ""})を記録しました${sell ? "。納品(売上)も記録しました" : ""}`,
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
              {b.name} {n1(b.qty)}
              {b.use === "whole" ? "枚" : "個"}
              {b.lots ? `(${n1(b.lots)}ロット)` : ""}
            </b>
            {showDate && <small>{b.date.slice(5).replace("-", "/")} に作成</small>}
          </span>
          <DelButton
            label="取り消す"
            armedLabel="もう一度で戻す"
            onConfirm={() => {
              const linked = (d.wsales ?? []).filter((w) => w.bake === b.id);
              store.apply([...undoBakeOps(b, exists), ...linked.map((w) => ({ t: "del" as const, col: "wsales" as const, id: w.id }))]);
              toast(linked.length ? "記録を取り消し、材料と在庫を戻しました(納品の記録も消しました)" : "記録を取り消し、材料と在庫を戻しました");
            }}
          />
        </div>
      ))}
    </div>
  );
}
