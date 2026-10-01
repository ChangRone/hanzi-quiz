# Zhuyin Slot Layout PoC

Status: USER_VALIDATION_REQUIRED

本 PoC 先驗證「完整位置永遠顯示」與「空位也要納入判分」，不先做正式手寫辨識。

## Layout rule

- 1 個注音符號：中位；上、下位呈現但應留白。
- 2 個注音符號：上、下位；中位呈現但應留白。
- 3 個注音符號：上、中、下三位。
- 二／三／四聲：調號放在最後一個符號的右上方。
- 一聲：調號位置仍存在，但正確答案是空白。
- 輕聲：獨立的上方輕聲位；一般右側調號位應留白。

## Scoring model

每個可寫位置都有固定 slot id：

- s0 / s1 / s2
- neutral
- tone

判定不是只比較「有哪些符號」，而是比較「符號 + slot」：

- required symbol missing -> missing
- wrong symbol in required slot -> wrong_symbol
- any mark in expected-empty slot -> extra_mark_wrong_slot
- correct tone mark in wrong tone zone -> tone_position_error

## Examples

- 貓 ㄇㄠ -> s0=ㄇ, s1=empty, s2=ㄠ, tone=empty
- 巷 ㄒㄧㄤˋ -> s0=ㄒ, s1=ㄧ, s2=ㄤ, tone=ˋ
- 一 ㄧ -> s0=empty, s1=ㄧ, s2=empty, tone=empty
- 叔 ㄕㄨˊ -> s0=ㄕ, s1=empty, s2=ㄨ, tone=ˊ
- 叔（輕聲）ㄕㄨ˙ -> s0=ㄕ, s1=empty, s2=ㄨ, neutral=˙, tone=empty

手寫 matcher 等位置模型經使用者驗證後再接。