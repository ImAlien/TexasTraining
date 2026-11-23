# 公开范围数据与适用边界

## 本次接入

署名：**[HoldemMath (holdemmath.com)](https://holdemmath.com/)**。
数据采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；
[上游授权文件](https://github.com/Julian-cloud-max/holdemmath-data/blob/7c72b1261f08c63cf8366120dc531631935c21cd/LICENSE-DATA)。

- [原始数据](https://github.com/Julian-cloud-max/holdemmath-data/blob/7c72b1261f08c63cf8366120dc531631935c21cd/pushfold/pushfold_charts.json)
- [模型和精度说明](https://github.com/Julian-cloud-max/holdemmath-data/blob/7c72b1261f08c63cf8366120dc531631935c21cd/README.md)
- 固定上游提交：`7c72b1261f08c63cf8366120dc531631935c21cd`
- 获取日期：2026-11-23
- 原始完整 JSON 的 SHA-256：`00bc184e6b514888d23a8c2d8e9c3c83af2ac960b441310ba594c06b6cba9bec`
- 本地提取快照：`src/data/holdemmath-hu.json`，浏览器模块：同目录 `holdemmath-hu.js`。

## 适用参数

| 参数 | 值 |
|---|---|
| 玩家数 | 2，等起始筹码，含已投入盲注 |
| 有效筹码 | 4 / 6 / 8 / 10 / 12 / 15 / 20 BB |
| 盲注 | SB 0.5BB，BB 1BB |
| Ante / 抽水 | 0 / 0 |
| 优化目标 | chipEV；没有 ICM |
| 动作树 | SB 全下或弃牌；BB 面对 SB 全下跟注或弃牌 |
| 求解方法 | 发布者的 fictitious-play solver |
| 精度 | 发布者声明 HU 最佳响应偏差 ε ≤ 0.05BB；本项目未独立复算 |
| 输出形式 | 169 类手牌的离散入选列表和行动 EV；**不是完整混合频率** |

源 README 说明使用 Monte Carlo 权益工具。它是限定博弈模型的数值近似 Nash 图表，不是精确解，更不是完整无限注德州 GTO。作者的 ε 声明不应扩展为对实际完整扑克博弈的保证。

## 转换与判分

仅提取 `data.hu` 无前注子集；保留原始手牌顺序、七档深度、列表、覆盖率及 EV 数组。
排除 `dataAnte10` 和所有多人数据，不插值、扩展或生成缺失范围。
训练引擎将列表内行动编码为 100、弃牌为 0（列表外相反），只用于匹配图表。
界面以“图表行动”展示，明确这不是来源提供的精确 0% / 100% 频率。
导出携带 provenance 和 binary-chart 表示；用户再次导入时标记来源未验证。
源 EV 以弃牌为零，但本次不将其用作评分或宣称精确 EV 损失。

错题的范围 ID 含上游提交和筹码深度，复习时仍使用原版本。
旧 `teaching-v1` 保留，明确标为 100BB 教学（非 GTO）；不改写旧错题答案。

## 尚未覆盖

单挑、6 人桌、9 人桌的 100BB 完整翻前 GTO 数据仍未接入。
公开推弃库选择 6 / 9 人桌时显示无覆盖，不自动套用 HU 答案。
HoldemMath 多人范围采用独立子博弈、单跟注者近似，未作为真实多人 GTO 使用。
免费浏览不等于可再分发：未复制未授权的商业求解数据库。

## 复核

`npm test` 检查 14 个公开场景 × 169 类手牌与原列表逐项相同，
图表组合覆盖率、动作合法性、筹码/底池、错题版本隔离及旧记录兼容。
这些检查验证导入与应用逻辑，不证明发布者的求解收敛。

## BB 对抗 SB limp 原文对照

新增单挑 10BB、20BB 原图对照与自评训练，不属于上面的推弃数据集。来源为 GTO Wizard 公开教学文章；按用户要求，52 张原图已下载到本地，保留原始图例、来源和文件哈希，不从图片估算精确频率。训练时直接显示对应的 BB 原图，支持放大及 SB 图切换。用户对照图片自评，错题单独保存；MTT 资料目前仅提供参考入口。图片仅用于本地学习，本次未发布到线上。完整说明与精确频率导入格式见 [LIMP-DATA.md](LIMP-DATA.md)。
