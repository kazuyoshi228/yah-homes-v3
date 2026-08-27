/* ビルド識別子。CI がデプロイ直前に GITHUB_SHA で上書きし、デプロイ後に ?action=version で照合する
   （「配ったつもりで配れていない」事故の検出・QA②・2026-08-27）。手元ビルドでは "dev" のまま */
export const BUILD = "dev";
