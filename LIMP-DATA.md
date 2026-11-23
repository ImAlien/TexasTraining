# BB 面对 SB limp

在顶部打开「Limp 专项」，选择范围并作答，对应深度的 BB 原图会直接显示在训练器内。可提前看图、切换 SB 范围、放大 2 倍、保存图片。原图已经下载，查看不需要联网；文章出处链接保留为可选参考。

## 内置原文对照

来源：[GTO Wizard — Isolating Limpers in Short Stack HU](https://blog.gtowizard.com/isolating_limpers_in_short_stack_hu/)，Sibbeh，2025-09-26；参数核查于 2026-11-23。

| 场景 | 前注 | BB 的行动（加注至） | 对照位置 |
| --- | --- | --- | --- |
| 单挑 20BB，SB limp 至 1BB | 无 | 过牌 / 3BB / 6BB / 全下 20BB | Baseline Strategies: 20bb 中的 BB isolation strategy |
| 单挑 10BB，SB limp 至 1BB | 无 | 过牌 / 2.5BB / 4BB / 全下 10BB | 10bb and Below 中的 BB isolation strategy |

这是 HU 场景，SB 同时为按钮，BB 翻后无位置。使用原文的基准 GTO 图，不能用 SB 开池图或后文针对特定对手的 Exploitative / nodelock 图代替。文章未单列抽水参数或求解误差，不补造这些参数。

按用户要求，本地缓存该文章 52 张 PNG 原图（约 20MB），原始字节未修改，保存在 `src/data/gtowizard-hu-images/`。`src/data/gtowizard-hu-images.js` 记录每张图的来源 URL、尺寸、字节数及 SHA-256，获取日期为 2026-11-23。版权归 GTO Wizard，未声明开放再分发许可；本次仅用于用户的本地学习，没有发布到线上。

训练用的 10BB / 20BB 图按 BB 面对 limp 与 SB 率先入池区分，并保留原始行动图例。颜色宽度表示行动频率，范围格中的数值为权益 EQ。完整图册包含 16BB 基准及后续剥削示例；补充图明确提示不能自动当作当前训练答案。

没有从图片估算 169 种手牌的精确混合频率。用户对照本地原图，点「符合原图」或「需要复习」，统计仍为自评。三次成功复习表示用户三次自评通过，并非独立的 GTO 测评。

多人桌参考：[GTO Wizard — Playing Limped Pots as the BB in MTTs](https://blog.gtowizard.com/playing-limped-pots-as-the-bb-in-mtts/)，Andrew Brokos，2023-06-19，包含 10 / 25 / 60 / 100BB 示例。由于未完整核实原始频率、桌型和前注参数，目前只提供阅读入口，不生成这些深度的内置答案。多人桌弃牌至 SB 时，BB 翻后有位置，不能直接套用 HU 图。

## 导入精确频率

左侧「下载空白频率模板」导出 `preflop-lab-limp-v1` JSON。模板所有频率为 `null`，不是教学范围；填完才能通过验证。只支持该 JSON 格式，不直接支持截图、UPI 或商业产品专用导出文件。

- `name` / `source` / 可选 `sourceUrl`：范围名称、求解器或来源与版本、http/https 来源链接。
- `table`：2、6 或 9；场景固定为其他人弃牌，SB limp 至 1BB，BB 行动。
- `stack`：扣除前注后、含盲注的有效筹码，单位 BB。若原求解定义不同，需要先换算；不能直接换一个数字而继续使用原频率。
- `anteTotal`：已经进入底池的全部前注，单位 BB；初始底池为 `2 + anteTotal`。
- `rake` / `objective` / `assumptions`：抽水规则、chipEV 或 ICM、SB 范围与求解树等假设；ICM 还须说明相关筹码分布和奖金结构。
- `actions`：2–5 个行动，恰好一个 `{ "id": "check", "kind": "check" }`。其余行动为 `{ "id": "small", "kind": "raise", "to": 3 }`；`to` 是本轮投入总额，最少 2BB，等于有效筹码时显示为全下。各尺度不能重复。
- `ranges`：全部 169 种手牌，每个行动频率均须填写 0–100 的数字，各手牌合计 100%（允许 0.01 的舍入误差）。例如 `"AA": { "check": 50, "small": 50, "large": 0, "shove": 0 }` 只是格式示例，不是 GTO 建议。

导入后按所选行动频率是否大于 0 判分，并显示完整矩阵、单手频率及按 1326 个组合计算的行动占比。这里只验证格式和行动合法性，不验证求解来源、均衡质量或 EV。每次导入生成独立版本 ID，避免新范围改变旧错题答案。

## 记录与验证

Limp 进度、导入范围与错题保存在 `preflop-lab:limp:v1`，原训练记录保留在原来的存储键。参考图自评与导入频率判分分开标注；错题按范围版本与手牌合并，连续三次复习通过后标记已掌握。导出全量记录时包含 Limp 数据，也可从 Limp 错题区域单独导出。检测到记录损坏或浏览器存储不可用时暂停写入并提示备份，不覆盖原数据。

`npm test` 覆盖原图模式不自动判断、导入校验、行动合法性、筹码版本隔离、错题合并与三次复习、存储兼容以及查看答案不计分。测试用合成频率仅用于测试，不随应用作为训练范围提供。
