# 7 渲染器的设计

## 7.1 渲染器与响应系统的结合

渲染器是用来执行渲染任务的。在浏览器平台，就是用来渲染真实 dom 的。渲染器不仅能够渲染真实 DOM，它还是跨框架平台讷讷管理的关键。

先暂时将渲染器限定在 DOM 平台上。下面这个函数就是一个合格的渲染器：
```js
function renderer(domString, container) {
  container.innerHTML = domString;
}
```

我们结合响应式，就可以实现一个简单的渲染过程了

```js
import { effect, ref } from "../reactivity/index.js";

function renderer(domString, container) {
  container.innerHTML = domString;
}

const count = ref(1)

effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.body)
});

setTimeout(() => {
  count.value = 2;
}, 1000);
```

