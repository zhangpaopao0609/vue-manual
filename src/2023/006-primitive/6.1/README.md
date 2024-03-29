# 6 原始值的响应式方法

## 6.1 引入 ref 的概念
因为 Proxy 代理的目标必须是非原始值，所以我们没有任何手段可以拦截原始值，那怎么办呢？很简单，把原始值包装成非原始值就好了呀。

```js
function ref(val) {
  const wrapper = {
    value: val,
  }

  // 属性默认不可写，不可枚举，用它来判读对象是否是 ref
  Object.defineProperty(wrapper, REF_INNER_KEY, {
    value: true,
  });

  return reactive(wrapper);
}
```