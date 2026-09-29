/**
 * 天上的每一层**怎么画**——这张表只是个汇总，四张分表按"离眼睛多远"分层：
 *
 *   `skyair.mjs`         天本身：星星、太阳、辉光、热浪、云、卷云
 *   `skyrelief.mjs`      地势：楼群剪影、山脊、尖峰、雪山、沙丘、海面、浪
 *   `skysilhouette.mjs`  地平线上的剪影与天气：光柱、树干、树冠、雾、雪、吊车、霓虹
 *
 * 分开的理由和 `grounds.mjs` / `roadwear.mjs` 一样：改一朵云的形状不该需要
 * 先翻过二十种山。任何一张分表里加一层，只要键不重名，这里不用动。
 *
 * `sky.mjs` 只管"什么时候画、画几张、缓不缓存"；画法全在这里。
 * 画法的签名统一是 `(p, ctx, w, h)`：`p` 是这一种天的数值表（`skies.mjs`），
 * `ctx` 是一张**一次性**的离屏画布——天空一局只画一次，所以这里可以画得奢侈。
 */

import { AIR } from "./skyair.mjs";
import { RELIEF } from "./skyrelief.mjs";
import { SILHOUETTE } from "./skysilhouette.mjs";

export { AIR, RELIEF, SILHOUETTE };

export const PAINT = { ...AIR, ...RELIEF, ...SILHOUETTE };
