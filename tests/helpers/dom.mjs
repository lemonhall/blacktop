/**
 * 一块"假画布"的全局环境：在 Node 里跑需要 `document` 的绘制代码。
 *
 * 为什么要单独一个文件：`backdrop()`（天）、`road.mjs`（沥青颗粒）、`propImage()`
 * （道具贴图）三处都要"临时把 document 装上、跑完再摘掉"，而且**每一张画布要有
 * 自己的记账上下文**——共用一份的话，第二次取上下文拿到的还是第一次那本账，
 * "换一条路要重画"这种断言就永远为真，测试等于白写。
 *
 * 用法：`withDom(() => { ...里面可以随便 createElement("canvas")... })`。
 * 不管里面抛不抛异常，`document` 都会被还原成原样。
 *
 * 想检查"到底画了什么"的时候，从画布上取那本账：`canvas.__spy.ops`。这是**测试
 * 专用的旁路**，真浏览器里没有这个东西——所以业务代码永远不许读它。
 */

import { spyCtx } from "./spy-ctx.mjs";

/** 一块记账画布。`__spy` 是它那本账（真浏览器里不存在这个字段）。 */
export function fakeCanvas() {
  const spy = spyCtx();
  return { width: 0, height: 0, getContext: () => spy.ctx, __spy: spy };
}

export function withDom(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}
