// 売上(月別の表、利益率カード、BASEの記録、設定)
import { useState } from "preact/hooks";
import { signOut } from "../data/cloud";
import { store, useData, useStore } from "../data/store";
import { baseFee, monthly, period, targetProfitRate } from "../lib/calc";
import { n1, num, today, uid, yen } from "../lib/format";
import type { Config, Targets } from "../lib/types";
import { DelButton, NumField, toast } from "../ui/parts";
import { BackupCard } from "./Backup";

/** 表示中の年と月(0は年間)。タブを移っても覚えておく */
let YR = new Date().getFullYear();
let PM = 0;

function CfgField({ k, label }: { k: keyof Omit<Config, "tg">; label: string }) {
  const cfg = useData().cfg;
  return <NumField label={label} value={cfg[k] as number} onCommit={(v) => store.apply([{ t: "cfg", patch: { [k]: v } }])} />;
}

function TgField({ k, label }: { k: keyof Targets; label: string }) {
  const tg = useData().cfg.tg;
  return <NumField label={label} value={tg[k]} onCommit={(v) => store.apply([{ t: "tg", patch: { [k]: v } }])} />;
}

const COLORS = { cost: "#C8451F", fee: "#E2A03A", ev: "#6B8E5A", rent: "#6B7FA3", fixed: "#9A86AE", profit: "#2F8F6B" };

function ProfitCard({ year }: { year: number }) {
  const d = useData();
  const [pm, setPm] = useState(PM);
  const p = period(year, pm, d.events, d.base, d.cfg, new Date());
  const t = d.cfg.tg;
  const tp = targetProfitRate(d.cfg);
  const pp = (v: number) => (p.sales ? (v / p.sales) * 100 : 0);
  const rows: [string, number, number, string][] = [
    ["原価(材料・包装)", p.cost, t.cost, COLORS.cost],
    ["手数料(決済・BASE)", p.fee, t.fee, COLORS.fee],
    ["出店料・交通費", p.ev, t.event, COLORS.ev],
    ["キッチンレンタル(光熱費込み)", p.rent, t.rent, COLORS.rent],
    ["その他の固定費", p.fixed, t.fixed, COLORS.fixed],
    ["利益", p.profit, tp, COLORS.profit],
  ];
  const bar = (f: (r: (typeof rows)[number]) => number) => (
    <div class="bar">
      {rows.map((r) => (
        <i key={r[0]} style={{ flex: Math.max(0, f(r)), background: r[3] }} />
      ))}
    </div>
  );
  const ap = pp(p.profit);
  return (
    <div class="card">
      <h2>利益率(希望と実際)</h2>
      <label class="mut">
        期間
        <select
          value={pm}
          onChange={(e) => {
            PM = +e.currentTarget.value;
            setPm(PM);
          }}
        >
          <option value="0">年間</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}月
            </option>
          ))}
        </select>
      </label>
      <div class="res">
        <div>
          <span>売上</span>
          <b>{yen(p.sales)}</b>
        </div>
        <div>
          <span>希望の利益率</span>
          <b>{n1(tp)}%</b>
        </div>
        <div class={p.sales && ap < tp ? "neg" : ""}>
          <span>実際の利益率</span>
          <b>{p.sales ? n1(ap) + "%" : "-"}</b>
        </div>
      </div>
      <p class="mut" style={{ margin: "10px 0 0" }}>
        希望の配分
      </p>
      {bar((r) => r[2])}
      <p class="mut" style={{ margin: 0 }}>
        実際の配分
      </p>
      {bar((r) => pp(r[1]))}
      <div class="pt h">
        <span>項目(売上を100%として)</span>
        <span>希望</span>
        <span>実際</span>
        <span>金額</span>
      </div>
      {rows.map((r) => {
        const a = pp(r[1]);
        const isProfit = r[0] === "利益";
        const bad = p.sales && (isProfit ? a < r[2] : a > r[2]);
        return (
          <div class="pt" key={r[0]}>
            <span>
              <i class="sw" style={{ background: r[3] }} />
              {r[0]}
            </span>
            <span>{n1(r[2])}%</span>
            <span class={bad ? "neg" : ""}>
              <b>{p.sales ? n1(a) + "%" : "-"}</b>
            </span>
            <span>{yen(r[1])}</span>
          </div>
        );
      })}
      <p class="mut">
        BASEの原価は、イベントの原価率から推計しています。キッチン代とその他の固定費は、月額×月数で計算します(年間は今月までの月数)。
      </p>
      <details>
        <summary>希望の配分と固定費を設定</summary>
        <div class="grid">
          <TgField k="cost" label="希望: 原価(%)" />
          <TgField k="fee" label="希望: 手数料(%)" />
          <TgField k="event" label="希望: 出店料・交通費(%)" />
          <TgField k="rent" label="希望: キッチン(%)" />
          <TgField k="fixed" label="希望: その他固定費(%)" />
          <label>
            希望の利益率(自動)
            <input value={n1(tp) + "%"} disabled />
          </label>
          <CfgField k="rent" label="キッチンレンタル月額(円)" />
          <CfgField k="fixed" label="その他の固定費 月額(円)" />
        </div>
        <p class="mut">原価の希望は、商品の推奨価格の計算にも使われます。</p>
      </details>
    </div>
  );
}

function BaseForm() {
  const d = useData();
  const [mo, setMo] = useState(today().slice(0, 7));
  const [sales, setSales] = useState("");
  const [orders, setOrders] = useState("");
  return (
    <div class="card">
      <h2>BASEの売上を記録</h2>
      <div class="grid">
        <label>
          月
          <input type="month" value={mo} onInput={(e) => setMo(e.currentTarget.value)} />
        </label>
        <label>
          売上(円)
          <input type="number" inputMode="decimal" min="0" value={sales} onInput={(e) => setSales(e.currentTarget.value)} />
        </label>
        <label>
          注文数
          <input type="number" inputMode="numeric" min="0" value={orders} onInput={(e) => setOrders(e.currentTarget.value)} />
        </label>
        <div style={{ alignSelf: "end" }}>
          <button
            class="pri"
            style={{ width: "100%" }}
            onClick={() => {
              const s = num(sales);
              if (!mo || !s) return toast("月と売上を入力してください");
              store.apply([{ t: "add", col: "base", item: { id: uid(), month: mo, sales: s, orders: num(orders) } }]);
              setSales("");
              setOrders("");
            }}
          >
            記録する
          </button>
        </div>
      </div>
      {d.base
        .slice()
        .sort((a, b) => (a.month < b.month ? 1 : -1))
        .map((b) => {
          const f = baseFee(b, d.cfg);
          return (
            <div class="row" key={b.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
              <span>
                {b.month}
                <br />
                <small>
                  {yen(b.sales)}・{n1(b.orders)}件
                </small>
              </span>
              <span class="right" style={{ textAlign: "right" }}>
                手数料 {yen(f)}
                <br />
                <small>手残り {yen(b.sales - f)}</small>
              </span>
              <DelButton armedLabel="確認" onConfirm={() => store.apply([{ t: "del", col: "base", id: b.id }])} />
            </div>
          );
        })}
      <p>
        <a class="btn" href="https://admin.thebase.in/" target="_blank" rel="noopener">
          BASE管理画面を開く
        </a>
      </p>
    </div>
  );
}

function Account() {
  const st = useStore();
  if (st.mode !== "cloud") return null;
  return (
    <div class="card">
      <h2>アカウント</h2>
      <div class="row">
        <span class="mut">ログイン中: {st.email}</span>
        <DelButton cls="right" label="ログアウト" armedLabel="もう一度押すとログアウト" onConfirm={() => signOut()} />
      </div>
    </div>
  );
}

export function Sales() {
  const d = useData();
  const [yr, setYr] = useState(YR);
  const m = monthly(yr, d.events, d.base, d.cfg);
  const t = m.reduce((a, x) => ({ mk: a.mk + x.mk, base: a.base + x.base, sq: a.sq + x.sq, bf: a.bf + x.bf }), { mk: 0, base: 0, sq: 0, bf: 0 });
  return (
    <>
      <h1>売上</h1>
      <div class="card">
        <NumField
          label="年"
          cls="mut"
          inputMode="numeric"
          value={yr}
          onCommit={(v) => {
            YR = Math.round(v) || YR;
            setYr(YR);
          }}
        />
        <div class="t h">
          <span>月</span>
          <span>イベント</span>
          <span>BASE</span>
          <span>合計</span>
        </div>
        {m.map((x, i) => (
          <div class="t" key={i}>
            <span>{i + 1}月</span>
            <span>{yen(x.mk)}</span>
            <span>{yen(x.base)}</span>
            <span>{yen(x.mk + x.base)}</span>
          </div>
        ))}
        <div class="t s">
          <span>年計</span>
          <span>{yen(t.mk)}</span>
          <span>{yen(t.base)}</span>
          <span>{yen(t.mk + t.base)}</span>
        </div>
        <p class="mut">
          手数料: Square {yen(t.sq)} / BASE {yen(t.bf)}
        </p>
      </div>
      <ProfitCard year={yr} />
      <BaseForm />
      <div class="card">
        <h2>設定</h2>
        <p class="mut">手数料率は契約内容に合わせて変えてください(初期値は目安です)。</p>
        <div class="grid">
          <CfgField k="cash" label="Square 現金(%)" />
          <CfgField k="card" label="Square カード(%)" />
          <CfgField k="emoney" label="Square 電子マネー(%)" />
          <CfgField k="qr" label="Square QR(%)" />
          <CfgField k="baseRate" label="BASE 手数料率(%)" />
          <CfgField k="baseFix" label="BASE 1注文あたり(円)" />
          <CfgField k="whole" label="卸の掛け率(%)" />
        </div>
      </div>
      <BackupCard />
      <Account />
    </>
  );
}
