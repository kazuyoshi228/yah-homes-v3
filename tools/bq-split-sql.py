"""bq-views.sql を文ごとに分ける。
   シェルの tr で切ると、注釈や改行の扱いで文が途中で切れる（2026-09-03 実際に起きた）。"""
import sys, re
sql = open(sys.argv[1], encoding="utf-8").read()
sql = re.sub(r"--[^\n]*", "", sql)          # 行内も含めて注釈を落とす
for st in (x.strip() for x in sql.split(";")):
    if st.upper().startswith("CREATE"):
        print(re.sub(r"\s+", " ", st))
