// データの書き出し・読み込み(売上タブの下)
import { useState } from "preact/hooks";
import { makeBackup, parseBackup, summary, type Parsed } from "../data/backup";
import { store, useData } from "../data/store";
import { today } from "../lib/format";
import { DelButton, toast } from "../ui/parts";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function BackupCard() {
  const d = useData();
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const read = (text: string) => {
    setErr("");
    setParsed(null);
    try {
      setParsed(parseBackup(text));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div class="card">
      <h2>データの書き出し・読み込み</h2>
      <p class="mut">書き出しは、データ全部をJSON(文字のファイル)にして保存します。控えや、ほかのアプリへの移し替えに使えます。</p>
      <button
        onClick={() => {
          download(`bakehub-${today()}.json`, JSON.stringify(makeBackup(d, store.photos), null, 1));
          toast("書き出しました");
        }}
      >
        JSONで書き出し
      </button>

      <details style={{ marginTop: "12px" }}>
        <summary>JSONを読み込む(いまのデータと置き換え)</summary>
        <p class="mut">書き出したファイルか、旧アプリで書き出した内容を読み込めます。</p>
        <div class="photo-actions" style={{ margin: "8px 0" }}>
          <label class="btnlike">
            ファイルを選ぶ
            <input
              type="file"
              accept="application/json,.json,text/plain"
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) read(await f.text());
              }}
            />
          </label>
        </div>
        <label class="mut" style={{ display: "block" }}>
          または、ここに貼り付け
          <textarea value={paste} onInput={(e) => setPaste(e.currentTarget.value)} placeholder='{"cfg":…' />
        </label>
        <button style={{ marginTop: "6px" }} disabled={!paste.trim()} onClick={() => read(paste)}>
          貼り付けた内容を確かめる
        </button>
        {err && (
          <p class="note" style={{ marginTop: "10px" }}>
            {err}
          </p>
        )}
        {parsed && (
          <div class="card low" style={{ marginTop: "10px" }}>
            <b>{parsed.kind === "legacy" ? "旧アプリのデータです。" : "BAKE HUBのデータです。"}</b>
            <p style={{ margin: "6px 0" }}>{summary(parsed.data)}</p>
            <p class="mut">読み込むと、いまのデータ({summary(d)})は消えて、この内容に置き換わります。</p>
            <div class="row">
              <DelButton
                cls="pri"
                label={busy ? "読み込み中…" : "読み込む"}
                armedLabel="もう一度押すと置き換え"
                onConfirm={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    await store.replace(parsed.data, parsed.photos);
                    setParsed(null);
                    setPaste("");
                    toast("読み込みました");
                  } catch {
                    setErr("読み込みの途中で失敗しました。電波の状態を確かめて、もう一度お試しください。");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <button onClick={() => setParsed(null)}>やめる</button>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}
