# Hanzi Dictation Project

本文件以目前**最新完整專案包**的實際內容為基準整理；本次已把題庫索引調整為「`quiz-index.json` 一教材一筆 + `lessonPattern` / `lessonRange` + `packs/` 每課單檔」的 v1.5 最小變更方案。

## 專案定位

這是一個可直接部署到 GitHub Pages 的中文聽寫練習專案，主程式為單一 `index.html`，搭配外部 `quiz-index.json`、`packs/*.json`、`config/schema-config.json` 與 `schema/*.json`。

## 目前正式功能

- 遠端載入：讀取目前網站的 `quiz-index.json` 與 `packs/*.json`
- `quiz-index.json` 以**一教材一筆**維護，必要時可用 `lessonPattern` / `lessonRange` 展開多課檔
- 本機資料夾匯入：使用 `<input type="file" webkitdirectory>` 讀取本機 JSON
- 內建 fallback 題庫：遠端 / 本機失敗時可退回
- 本機匯入結果摘要：成功 pack id、失敗 pack 與原因、是否 fallback、schema-config 套用狀態
- 結構化篩選：年份、出版社、年級、學期、考試範圍
- 多 pack 勾選與合併出題
- HanziWriter 書寫、語音播放、重寫、下一題、自動下一題
- 作答頁統計列上移，底部保留固定空白避免操作列遮擋
- 返回首頁按鈕置於書寫區內右上角的低干擾位置

## 目前正式目錄

```text
hanzi_project_fixed_with_updated_docs/
├─ index.html
├─ README.md
├─ quiz-index.json
├─ config/
│  └─ schema-config.json
├─ schema/
│  ├─ pack.schema.json
│  └─ quiz-index.schema.json
├─ packs/
│  ├─ 2026南一小二上-03.json
│  └─ 2025翰林小二下-04.json
└─ docs/
   ├─ 00-project-overview.md
   ├─ 01-system-architecture.md
   ├─ 02-pack-schema-v1.md
   ├─ 03-state-machine-v1.md
   ├─ 04-ui-views-and-interactions.md
   ├─ 05-ai-implementation-contract.md
   ├─ 06-coding-standards-and-environment.md
   ├─ 07-acceptance-checklist.md
   ├─ 08-implementation-spec-v1.md
   └─ 09-project-config-standard.md
```

## 目前資料策略

- `quiz-index.json` 每個教材只保留一筆
- `dataUrl` 仍保留為單一字串，用於舊相容入口或單檔 fallback
- `lessonPattern` 以 `{LL}` 代表兩位數課次，例如 `packs/2026南一小二上-{LL}.json`
- `lessonRange` 代表展開範圍，例如 `[1, 20]`
- 實際存在的 lesson 檔才會被合併進同一個 pack；不存在的課檔會自動略過

## 注意

- `pack.id` 仍維持 8 碼教材層級
- `question.id` 仍維持 12 碼，後四碼保留 `LLQQ`
- `config/schema-config.json` 這次**沒有改動結構**
- 本次只調整索引 schema、載入程式與對應文件；書寫與 UI 其他功能不變
