# Hanzi Dictation Project

這是一個可直接部署到 GitHub Pages 的中文聽寫練習專案骨架。

## 快速開始

將下列檔案放到同一個靜態網站根目錄：

- `index.html`
- `quiz-index.json`
- `config/schema-config.json`
- `packs/*.json`
- `schema/*.json`
- `docs/*.md`

即可執行。

## 目前功能

- GitHub / 同結構網站遠端載入
- 本機資料夾匯入
- 內建 fallback 預設題庫
- 多版本 pack 勾選
- 結構化進階篩選（年份 / 出版社 / 年級 / 學期 / 範圍）
- HanziWriter 書寫
- 聽整句 / 提示 / 重寫 / 下一題 / 自動下一題
- 穩定 writer id 與 stable question id

## 目錄

- `docs/`：設計文件
- `schema/`：JSON Schema
- `config/schema-config.json`：代碼表
- `quiz-index.json`：遠端 pack 索引
- `packs/*.json`：題庫檔
- `index.html`：主程式
