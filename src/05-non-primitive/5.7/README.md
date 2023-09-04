# 5.7 代理数组

数组也是对象，只是不过是异质对象，只是 `DefineOwnProperty` 不一样，其它都一样

```js
const p = reactive([0]);

effect(() => {
  console.log(p[0]);
})

setTimeout(() => {
  p[0] = 2;
}, 1000);
```

这是能正常响应的。

## 5.7.1 数组的索引与 length

```js
const p = reactive([0]);

effect(() => {
  console.log(p);
})

setTimeout(() => {
  p[1] = 2;
}, 1000);
```

当 index 大于 oldLen 时，会调用数组 length 属性，所以可以收集数组的 length 属性，这样就可以触发了

`