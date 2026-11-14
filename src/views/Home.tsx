// ホーム
import logoMark from "../assets/logo-mark.jpg";
import sheepImg from "../assets/sheep.jpg";
import { useData } from "../data/store";
import { monthly } from "../lib/calc";
import { daysUntil, n1, today, yen } from "../lib/format";
import { isLowMat, isLowProd } from "../lib/stock";
import { go } from "../ui/router";
import { schedTime, upcoming } from "./Events";

export function Home() {
  const d = useData();
  const td = today();
  const up = upcoming(d.sched, td).slice(0, 3);
  const lm = d.mats.some(isLowMat);
  const lp = d.prods.filter(isLowProd);
  const now = new Date();
  const m = monthly(now.getFullYear(), d.events, d.base, d.cfg);
  const cur = m[now.getMonth()];
  const ys = m.reduce((a, x) => a + x.mk + x.base, 0);
  return (
    <>
      <div class="hero">
        <img src={logoMark} alt="" />
      </div>
      <h1>ホーム</h1>
      {up.length ? (
        <>
          {(() => {
            const x = up[0];
            const dd = daysUntil(x.date, td);
            return (
              <button class="card next evb" onClick={() => go.event(x.id)}>
                <small>次回のイベント{dd === 0 ? "(今日)" : `(あと${dd}日)`}</small>
                <div class="nm">{x.name}</div>
                <div>{schedTime(x, false)}</div>
                <div>{x.place}</div>
              </button>
            );
          })()}
          {up.slice(1).map((y) => (
            <button key={y.id} class="card sm evb" onClick={() => go.event(y.id)}>
              <b>{y.name}</b>
              <br />
              <small>
                {schedTime(y, false)}・{y.place}
              </small>
            </button>
          ))}
        </>
      ) : (
        <div class="card">
          <small>出店予定はまだありません。イベントのタブで登録できます。</small>
        </div>
      )}
      {lm && (
        <button class="note" onClick={() => go.tab("mats")}>
          発注が必要な材料があります。
        </button>
      )}
      {lp.map((p) => (
        <button key={p.id} class="note" onClick={() => go.tab("prods")}>
          【在庫】{p.name}の残りが{n1(p.stock)}。そろそろ作りましょう
        </button>
      ))}
      {!lm && !lp.length && (
        <div class="card ph">
          <div class="pic" style={{ width: "88px", height: "88px" }}>
            <img src={sheepImg} alt="" />
          </div>
          <div>
            <b>いまのところ問題なし</b>
            <br />
            <span class="mut">発注・在庫のお知らせはありません。</span>
          </div>
        </div>
      )}
      <div class="card">
        <h2>売上</h2>
        <div class="res">
          <div>
            <span>今月</span>
            <b>{yen(cur.mk + cur.base)}</b>
          </div>
          <div>
            <span>今年</span>
            <b>{yen(ys)}</b>
          </div>
          <div>
            <span>イベント回数</span>
            <b>{d.events.length}</b>
          </div>
        </div>
      </div>
      <a class="btn" href="https://admin.thebase.in/" target="_blank" rel="noopener">
        BASE管理画面を開く
      </a>
    </>
  );
}
