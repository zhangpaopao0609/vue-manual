# 5.4 合理地触发响应

1. 仅当值真正发生变化的时候才触发响应

```js
set(target, key, newVal, receiver) {
  const oldVal = target[key];
  // 如果属性不存在，则说明是添加新属性，否则是设置已有属性
  const type = 
    Object.prototype.hasOwnProperty.call(target, key)
      ? TriggerType.SET 
      : TriggerType.ADD;
  const res = Reflect.set(target, key, newVal, receiver);
  // 当值真正发生变化并且都不是 NaN 的时候；NaN === NaN false
  if(oldVal === newVal && (oldVal === oldVal || newVal === newVal)) {
    trigger(target, key, type);
  }
  return res;
}
```

2. 因为涉及到原型链，每次修改可能会触发多次响应

```js
const foo = { a: 1 };
const bar = {};
const child = reactive(bar);
const parent = reactive(foo);

Object.setPrototypeof(child, parent);

effect(() => {
  console.log(child.a)
})

child.a = 2;
```