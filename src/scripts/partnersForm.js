// パートナーページの申請フォーム共通ロジック（ja/ko/zh 共有・リファクタ③）。
// 表示文言は各ページが MSG 配列で渡す。ロジックの修正は本ファイル1箇所で済む。
// 以前は3ページに同じ147行が複製され、コメント翻訳まで含めて三重管理だった。
export function initPartnersForm({ APPLY_ENDPOINT, AVAIL_ENDPOINT, MSG }) {
    // ── 日付ピッカー: 月・火・水のみ許可（選択時に検証） ──
    const CAPACITY = { kiyokawa: 7, takasago: 6, either: 7, both: 6 };
    const isMonToWed = (v) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
      if (!m) return false;
      const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
      return day >= 1 && day <= 3;
    };
    const today = new Date();
    const minDate = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10); // 受付は1ヶ月後から（カレンダー表示と整合）
    for (const id of ["pf-date1", "pf-date2"]) {
      const el = document.getElementById(id);
      el.min = minDate;
      el.addEventListener("change", () => {
        if (el.value && !isMonToWed(el.value)) {
          el.setCustomValidity(MSG[0]);
          el.reportValidity();
        } else {
          el.setCustomValidity("");
        }
      });
    }

    // 定員: 棟の選択に応じて人数の選択肢を制限
    const propSel = document.getElementById("pf-property");
    const guestSel = document.getElementById("pf-guests");
    const syncGuests = () => {
      const cap = CAPACITY[propSel.value] ?? 7;
      for (const opt of guestSel.options) opt.disabled = Number(opt.value) > cap;
      if (Number(guestSel.value) > cap) guestSel.value = String(cap);
    };
    propSel.addEventListener("change", syncGuests);
    syncGuests();

    // 送信
    const form = document.getElementById("partners-form");
    const status = document.getElementById("pf-status");
    const submitBtn = document.getElementById("pf-submit");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d1 = document.getElementById("pf-date1").value;
      const d2 = document.getElementById("pf-date2").value;
      if (!isMonToWed(d1) || !isMonToWed(d2)) {
        status.textContent = MSG[1];
        return;
      }
      if (!form.reportValidity()) return;
      submitBtn.disabled = true;
      status.textContent = MSG[2];
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.guests = Number(data.guests);
        const res = await fetch(APPLY_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.ok) {
          status.textContent = MSG[3];
          form.reset();
          syncGuests();
        } else {
          status.textContent = MSG[4];
        }
      } catch {
        status.textContent = MSG[5];
      } finally {
        submitBtn.disabled = false;
      }
    });

    // ── 空き状況カレンダー（月表示×2ヶ月・週末はグレー=提供対象外） ──
    (async () => {
      const fallback = document.getElementById("pt-cal-fallback");
      const calendars = document.getElementById("pt-calendars");
      const legend = document.getElementById("pt-cal-legend");
      const DOW = [MSG[6], MSG[7], MSG[8], MSG[9], MSG[10], MSG[11], MSG[12]];
      const renderMonth = (year, month, dates) => {
        const first = new Date(Date.UTC(year, month, 1));
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDow = first.getUTCDay();
        let cells = "";
        for (let i = 0; i < startDow; i++) cells += '<span class="cal-cell cal-empty"></span>';
        const todayKey = new Date().toISOString().slice(0, 10);
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dow = new Date(Date.UTC(year, month, d)).getUTCDay();
          const checkinDay = dow >= 1 && dow <= 3; // チェックイン可能=月・火・水のみ
          const past = key < todayKey;
          let cls;
          if (!checkinDay || past) cls = "cal-closed";
          else if (dates === null) cls = "cal-unknown"; // API未接続: 月火水は中立表示
          else cls = dates[key] === true ? "cal-open" : "cal-closed";
          cells += `<span class="cal-cell ${cls}">${d}</span>`;
        }
        const head = DOW.map((w) => `<span class="cal-dow">${w}</span>`).join("");
        return `<div class="cal-month"><p class="cal-titleMSG[13]cal-grid">${head}${cells}</div></div>`;
      };
      const draw = (datesByProp) => {
        const now = new Date();
        for (const prop of ["kiyokawa", "takasago"]) {
          const el = document.querySelector(`[data-cal="${prop}"]`);
          let html = "";
          for (let i = 1; i <= 2; i++) { // 表示は1ヶ月後から2ヶ月分（直近は準備期間のため対象外）
            const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
            html += renderMonth(m.getFullYear(), m.getMonth(), datesByProp ? datesByProp[prop] : null);
          }
          el.innerHTML = html;
        }
      };
      try {
        const results = await Promise.all(
          ["kiyokawa", "takasago"].map(async (prop) => {
            const r = await fetch(`${AVAIL_ENDPOINT}?prop=${prop}`);
            if (!r.ok) throw new Error("avail fetch failed");
            const j = await r.json();
            if (!j.ok) throw new Error("avail not ok");
            return [prop, j.dates || {}];
          })
        );
        draw(Object.fromEntries(results));
        legend.hidden = false;
      } catch {
        // API未接続・障害時: カレンダーは常時表示（週末・過去のみグレーの曜日カレンダー）
        draw(null);
        fallback.hidden = false;
      }
    })();

    // ── UTMコピー ──
    const utmBtn = document.getElementById("utm-copy");
    const utmOut = document.getElementById("utm-out");
    utmBtn.addEventListener("click", async () => {
      const name = (document.getElementById("utm-name").value || "partner-generic")
        .trim().toLowerCase().replace(/\s+/g, "-MSG[14]").slice(0, 60) || "partner-generic";
      const prop = document.getElementById("utm-prop").value;
      const url = `https://yah.homes/ja/properties/${prop}/?utm_source=partner&utm_medium=referral&utm_campaign=${encodeURIComponent(name)}`;
      try {
        await navigator.clipboard.writeText(url);
        utmOut.textContent = `コピーしました: ${url}`;
      } catch {
        utmOut.textContent = url;
      }
    });
}
