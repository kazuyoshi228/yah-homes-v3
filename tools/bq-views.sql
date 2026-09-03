-- agency の導出値を VIEW にする（2026-09-02／2026-09-03 実データに合わせて修正）
--
-- 式の正本は functions/src/agency/derive.ts。ここはその写しである。
-- 片方だけ直すと画面と分析で数字が食い違う——2026-09-02に実際に起きた
-- （NOIが4か所で違う数字を指していた）。変えるときは必ず両方直すこと。
-- 「なぜその式か」は Firestore の assumptions/noi-definition が正本。
--
-- 注意: 注釈は必ず行頭に置く。文の途中に -- を書くと、
-- 1行に連結したとき以降が全部コメントになる（2026-09-03 実際に起きた）。
-- 数値は SAFE_CAST で明示的に直す。Datastore backup 経由だと型が揺れるため。

CREATE OR REPLACE VIEW `yah-homes.agency.v_property_noi` AS
WITH rev AS (
  SELECT prop,
         COUNT(*) AS months,
         ROUND(SUM(SAFE_CAST(payout AS FLOAT64)) / COUNT(*) * 12) AS stay_payout_y
  FROM `yah-homes.agency.revenue`
  WHERE kind = 'monthly'
  GROUP BY prop
),
own AS (
  SELECT __key__.name AS prop,
         label,
         SAFE_CAST(landArea AS FLOAT64) AS land_area,
         COALESCE(SAFE_CAST(acquisitionPrice AS FLOAT64),
                  SAFE_CAST(purchasePrice AS FLOAT64)) AS price,
         COALESCE(SAFE_CAST(otherIncomePerMonth AS FLOAT64), 0) * 12 AS other_income_y
  FROM `yah-homes.agency.properties`
  WHERE kind = 'property'
),
tax AS (
  SELECT prop, SUM(SAFE_CAST(amountPerYear AS FLOAT64)) AS tax_y
  FROM `yah-homes.agency.taxes` GROUP BY prop
),
ins AS (
  SELECT prop, SUM(SAFE_CAST(premiumPerYear AS FLOAT64)) AS ins_y
  FROM `yah-homes.agency.insurance` GROUP BY prop
),
res AS (
  SELECT prop, SUM(SAFE_CAST(amountPerYear AS FLOAT64)) AS reserve_y
  FROM `yah-homes.agency.reserves` GROUP BY prop
)
SELECT
  own.prop,
  own.label,
  rev.months,
  rev.stay_payout_y,
  own.other_income_y,
  COALESCE(tax.tax_y, 0) AS tax_y,
  COALESCE(ins.ins_y, 0) AS ins_y,
  COALESCE(res.reserve_y, 0) AS reserve_y,
  own.price,
  ROUND(rev.stay_payout_y + own.other_income_y
        - COALESCE(tax.tax_y, 0) - COALESCE(ins.ins_y, 0)) AS noi,
  ROUND(rev.stay_payout_y + own.other_income_y
        - COALESCE(tax.tax_y, 0) - COALESCE(ins.ins_y, 0)
        - COALESCE(res.reserve_y, 0)) AS noi_after_reserve,
  ROUND(SAFE_DIVIDE(rev.stay_payout_y + own.other_income_y
        - COALESCE(tax.tax_y, 0) - COALESCE(ins.ins_y, 0), own.price) * 100, 2) AS net_yield_pct
FROM own
JOIN rev ON rev.prop = own.prop
LEFT JOIN tax ON tax.prop = own.prop
LEFT JOIN ins ON ins.prop = own.prop
LEFT JOIN res ON res.prop = own.prop;

CREATE OR REPLACE VIEW `yah-homes.agency.v_land_comps_by_year` AS
SELECT
  source,
  district,
  SAFE_CAST(year AS INT64) AS year,
  COUNT(*) AS n,
  APPROX_QUANTILES(SAFE_CAST(unitPrice AS INT64), 2)[OFFSET(1)] AS median_unit_price,
  ROUND(AVG(SAFE_CAST(unitPrice AS FLOAT64))) AS avg_unit_price,
  MIN(SAFE_CAST(unitPrice AS INT64)) AS min_unit_price,
  MAX(SAFE_CAST(unitPrice AS INT64)) AS max_unit_price
FROM `yah-homes.agency.landComps`
WHERE unitPrice IS NOT NULL
GROUP BY source, district, year;

CREATE OR REPLACE VIEW `yah-homes.agency.v_own_vs_market` AS
WITH own AS (
  SELECT __key__.name AS prop, label,
         SAFE_CAST(landArea AS FLOAT64) AS land_area,
         SAFE_CAST(purchasePrice AS FLOAT64) AS purchase_price
  FROM `yah-homes.agency.properties`
  WHERE kind = 'property'
    AND SAFE_CAST(landArea AS FLOAT64) > 0
    AND SAFE_CAST(purchasePrice AS FLOAT64) > 0
)
SELECT
  own.prop, own.label, own.land_area, own.purchase_price,
  ROUND(SAFE_DIVIDE(own.purchase_price, own.land_area)) AS own_unit_price,
  COUNT(c.unitPrice) AS comps_n,
  APPROX_QUANTILES(SAFE_CAST(c.unitPrice AS INT64), 2)[OFFSET(1)] AS market_median,
  ROUND(SAFE_DIVIDE(APPROX_QUANTILES(SAFE_CAST(c.unitPrice AS INT64), 2)[OFFSET(1)],
        SAFE_DIVIDE(own.purchase_price, own.land_area)), 2) AS ratio
FROM own
LEFT JOIN `yah-homes.agency.landComps` c
  ON c.source = 'mlit'
 AND c.nearProp = own.prop
 AND SAFE_CAST(c.areaSqm AS FLOAT64) BETWEEN own.land_area * 0.5 AND own.land_area * 2
GROUP BY own.prop, own.label, own.land_area, own.purchase_price;
