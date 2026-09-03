-- 金額の別名VIEW（自動生成: node functions/money-view.mjs）
-- 手で編集しない。定義は functions/catalog-def.mjs が正本。
--
-- 金額のフィールド名が15通りあるので、名前を知らなくても横断で足せるようにする。
-- 元の列名は変えていない（カードが読んでいるため）。
--
--   SELECT src, SUM(yen) FROM `yah-homes.agency.v_money` GROUP BY src ORDER BY 2 DESC
--   SELECT prop, SUM(yen) FROM `yah-homes.agency.v_money` WHERE src='items' AND kind='acquisition' GROUP BY prop
--
-- ⚠️ 足し算の意味はコレクションごとに違う。単純に全部足さないこと——
--    items は支出、finance は借入の元本、landComps は㎡単価、cash は残高。
--    src で必ず切る。
CREATE OR REPLACE VIEW `yah-homes.agency.v_money` AS
SELECT 'items' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.items`
UNION ALL
SELECT 'depreciation' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(cost AS INT64), CAST(SAFE_CAST(cost AS FLOAT64) AS INT64)) AS yen, 'cost' AS field
  FROM `yah-homes.agency.depreciation`
UNION ALL
SELECT 'bsAdjustments' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.bsAdjustments`
UNION ALL
SELECT 'finance' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(principal AS INT64), CAST(SAFE_CAST(principal AS FLOAT64) AS INT64)) AS yen, 'principal' AS field
  FROM `yah-homes.agency.finance`
UNION ALL
SELECT 'properties' AS src, __key__.name AS id, CAST(NULL AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(listPrice AS INT64), CAST(SAFE_CAST(listPrice AS FLOAT64) AS INT64)) AS yen, 'listPrice' AS field
  FROM `yah-homes.agency.properties`
UNION ALL
SELECT 'landComps' AS src, __key__.name AS id, CAST(NULL AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(year AS STRING) AS asof, COALESCE(SAFE_CAST(unitPrice AS INT64), CAST(SAFE_CAST(unitPrice AS FLOAT64) AS INT64)) AS yen, 'unitPrice' AS field
  FROM `yah-homes.agency.landComps`
UNION ALL
SELECT 'personalDistributions' AS src, __key__.name AS id, CAST(owner AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(year AS STRING) AS asof, COALESCE(SAFE_CAST(annual AS INT64), CAST(SAFE_CAST(annual AS FLOAT64) AS INT64)) AS yen, 'annual' AS field
  FROM `yah-homes.agency.personalDistributions`
UNION ALL
SELECT 'revenue' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(month AS STRING) AS asof, COALESCE(SAFE_CAST(payout AS INT64), CAST(SAFE_CAST(payout AS FLOAT64) AS INT64)) AS yen, 'payout' AS field
  FROM `yah-homes.agency.revenue`
UNION ALL
SELECT 'utilities' AS src, __key__.name AS id, CAST(place AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.utilities`
UNION ALL
SELECT 'utilityBills' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.utilityBills`
UNION ALL
SELECT 'buildPayments' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.buildPayments`
UNION ALL
SELECT 'construction' AS src, __key__.name AS id, CAST(site AS STRING) AS prop, CAST(category AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(contractTotal AS INT64), CAST(SAFE_CAST(contractTotal AS FLOAT64) AS INT64)) AS yen, 'contractTotal' AS field
  FROM `yah-homes.agency.construction`
UNION ALL
SELECT 'reserves' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(amountPerYear AS INT64), CAST(SAFE_CAST(amountPerYear AS FLOAT64) AS INT64)) AS yen, 'amountPerYear' AS field
  FROM `yah-homes.agency.reserves`
UNION ALL
SELECT 'taxes' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(year AS STRING) AS asof, COALESCE(SAFE_CAST(amountPerYear AS INT64), CAST(SAFE_CAST(amountPerYear AS FLOAT64) AS INT64)) AS yen, 'amountPerYear' AS field
  FROM `yah-homes.agency.taxes`
UNION ALL
SELECT 'insurance' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(premiumPerYear AS INT64), CAST(SAFE_CAST(premiumPerYear AS FLOAT64) AS INT64)) AS yen, 'premiumPerYear' AS field
  FROM `yah-homes.agency.insurance`
UNION ALL
SELECT 'personalAssets' AS src, __key__.name AS id, CAST(owner AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(value AS INT64), CAST(SAFE_CAST(value AS FLOAT64) AS INT64)) AS yen, 'value' AS field
  FROM `yah-homes.agency.personalAssets`
UNION ALL
SELECT 'equipment' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.equipment`
UNION ALL
SELECT 'contracts' AS src, __key__.name AS id, CAST(prop AS STRING) AS prop, CAST(category AS STRING) AS kind, CAST(NULL AS STRING) AS asof, COALESCE(SAFE_CAST(amount AS INT64), CAST(SAFE_CAST(amount AS FLOAT64) AS INT64)) AS yen, 'amount' AS field
  FROM `yah-homes.agency.contracts`
UNION ALL
SELECT 'cash' AS src, __key__.name AS id, CAST(NULL AS STRING) AS prop, CAST(NULL AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(total AS INT64), CAST(SAFE_CAST(total AS FLOAT64) AS INT64)) AS yen, 'total' AS field
  FROM `yah-homes.agency.cash`
UNION ALL
SELECT 'bankBalances' AS src, __key__.name AS id, CAST(NULL AS STRING) AS prop, CAST(kind AS STRING) AS kind, CAST(date AS STRING) AS asof, COALESCE(SAFE_CAST(balance AS INT64), CAST(SAFE_CAST(balance AS FLOAT64) AS INT64)) AS yen, 'balance' AS field
  FROM `yah-homes.agency.bankBalances`;
