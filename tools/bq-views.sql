-- agency の導出値を VIEW にする（2026-09-02）
--
-- ★ 式の正本は functions/src/agency/derive.ts。ここはその写しである。
--   片方だけ直すと、画面と分析で数字が食い違う——2026-09-02に実際に起きた
--   （NOIが4か所で違う数字を指していた）。変えるときは必ず両方直すこと。
--   「なぜその式か」は Firestore の assumptions/noi-definition が正本。
--
-- 前提: tools/bq-export.sh で agency データセットにテーブルが載っていること。
-- BigQuery は【読み取り専用の分析面】。正本は Firestore のまま。

-- ── 棟別NOI ────────────────────────────────────────────
-- 宿泊の手取り ＋ 宿泊以外の収入 − 光熱費 − 固定資産税 − 保険
-- 修繕積立は【引かない】（2026-09-02 発注者決定）。会社維持経費は棟に紐づかないので入れない。
CREATE OR REPLACE VIEW `yah-homes.agency.v_property_noi` AS
WITH rev AS (         -- 実績の月数で割ってから12倍する。10ヶ月の棟を12ヶ月として扱わない
  SELECT prop,
         COUNT(*) AS months,
         ROUND(SUM(payout) / COUNT(*) * 12) AS stay_payout_y
  FROM `yah-homes.agency.revenue`
  WHERE kind = 'monthly'
  GROUP BY prop
),
cost AS (
  SELECT p.__key__.name AS prop,
         COALESCE(p.otherIncomePerMonth, 0) * 12 AS other_income_y,
         (SELECT COALESCE(SUM(amountPerYear), 0) FROM `yah-homes.agency.taxes` t
            WHERE t.prop = p.__key__.name) AS tax_y,
         (SELECT COALESCE(SUM(premiumPerYear), 0) FROM `yah-homes.agency.insurance` i
            WHERE i.prop = p.__key__.name) AS ins_y,
         (SELECT COALESCE(SUM(amountPerYear), 0) FROM `yah-homes.agency.reserves` r
            WHERE r.prop = p.__key__.name) AS reserve_y
  FROM `yah-homes.agency.properties` p
  WHERE p.kind = 'property'
)
SELECT
  p.__key__.name                                   AS prop,
  p.label,
  rev.months,
  rev.stay_payout_y,
  cost.other_income_y,
  cost.tax_y, cost.ins_y, cost.reserve_y,
  -- derive.ts: propertyNoi()
  rev.stay_payout_y + cost.other_income_y - cost.tax_y - cost.ins_y AS noi,
  -- derive.ts: noiAfterReserve() ── 銀行が返済余力を見るとき用
  rev.stay_payout_y + cost.other_income_y - cost.tax_y - cost.ins_y - cost.reserve_y AS noi_after_reserve,
  COALESCE(p.investmentTotal, p.acquisitionPrice)  AS price,
  -- derive.ts: netYield()
  SAFE_DIVIDE(rev.stay_payout_y + cost.other_income_y - cost.tax_y - cost.ins_y,
              COALESCE(p.investmentTotal, p.acquisitionPrice)) * 100 AS net_yield_pct
FROM `yah-homes.agency.properties` p
JOIN rev  ON rev.prop  = p.__key__.name
JOIN cost ON cost.prop = p.__key__.name
WHERE p.kind = 'property';

-- ── 相場（landComps）────────────────────────────────
-- 種類を必ず分ける。売出は成約の2〜3倍、公示すら成約の1.6倍だった（2026-09-02 高砂で実測）。
-- 代表値は中央値。平均だと大口1件に引きずられる。
CREATE OR REPLACE VIEW `yah-homes.agency.v_land_comps_by_year` AS
SELECT
  source,                        -- mlit=成約 / kouji=公示 / freins=売出
  district,
  year,
  COUNT(*)                                                   AS n,
  APPROX_QUANTILES(unitPrice, 2)[OFFSET(1)]                  AS median_unit_price,
  ROUND(AVG(unitPrice))                                      AS avg_unit_price,
  MIN(unitPrice) AS min_unit_price, MAX(unitPrice) AS max_unit_price
FROM `yah-homes.agency.landComps`
GROUP BY source, district, year;

-- ── 取得価格と相場の比較 ──────────────────────────
-- 同じ駅・徒歩差3分以内・面積0.5〜2倍だけを当てる
-- ——徒歩5分と10分で単価が3倍違うため、距離を揃えないと比較にならない（2026-09-02 実測）
CREATE OR REPLACE VIEW `yah-homes.agency.v_own_vs_market` AS
SELECT
  p.__key__.name AS prop, p.label,
  p.landArea, p.purchasePrice,
  SAFE_DIVIDE(p.purchasePrice, p.landArea)                   AS own_unit_price,
  COUNT(c.unitPrice)                                         AS comps_n,
  APPROX_QUANTILES(c.unitPrice, 2)[OFFSET(1)]                AS market_median,
  SAFE_DIVIDE(APPROX_QUANTILES(c.unitPrice, 2)[OFFSET(1)],
              SAFE_DIVIDE(p.purchasePrice, p.landArea))      AS ratio
FROM `yah-homes.agency.properties` p
LEFT JOIN `yah-homes.agency.landComps` c
  ON c.source = 'mlit'
 AND c.nearProp = p.__key__.name
 AND c.areaSqm BETWEEN p.landArea * 0.5 AND p.landArea * 2
WHERE p.kind = 'property' AND p.landArea > 0
GROUP BY prop, p.label, p.landArea, p.purchasePrice;

-- ── 使い方の例 ────────────────────────────────────
-- 棟ごとのNOIと利回り:
--   SELECT label, noi, ROUND(net_yield_pct,2) FROM `yah-homes.agency.v_property_noi`;
-- 高砂の成約の推移:
--   SELECT year, n, median_unit_price FROM `yah-homes.agency.v_land_comps_by_year`
--   WHERE source='mlit' AND district='高砂' ORDER BY year;
