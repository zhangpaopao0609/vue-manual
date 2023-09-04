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
const p = reactive([0, 1, 2, 3]);

effect(() => {
  console.log('3->', p[3]);
})

effect(() => {
  console.log('length->', p.length);
})

setTimeout(() => {
  p[3] = 1;  // 此处不应该触发 length 收集的副作用函数，触发的应该是 bucket => [0,1,2,3] => 3 对应收集的副作用函数
}, 1000);

setTimeout(() => {
  p[4] = 4; // 此处应该触发 length 收集的副作用函数
}, 2000);
```

这里讲一下当设置的 index 大于当前数组长度时，怎么实现。
- 首先桶里收集了 bucket => [0,1,2,3] => length 对应收集的副作用函数
- 当通过索引值设置数组时，target 是数组，key 是设置的索引值
  - 如果设置的索引值小于当前数组长度时，比如这里的 3，那么就是普通的修改，正常触发 bucket => [0,1,2,3] => 3 对应收集的副作用函数
  - 如果设置的索引值大于或等于当前数组长度时，比如这里的 4，那么这里背后其实会触发数组的 length 读取，所以，需要触发 bucket => [0,1,2,3] => length 对应收集的副作用函数

```js
// trigger 
const type = 
  Array.isArray(target)
    ? Number(key) < target.length
      ? TriggerType.SET
      : TriggerType.ADD
    : Object.prototype.hasOwnProperty.call(target, key)
      ? TriggerType.SET 
      : TriggerType.ADD;

...

// 当代理的对象为数组时，并且在增加元素时
if(Array.isArray(target) && type === TriggerType.ADD) {
  const lengthEffects = targetMap.get('length');
  lengthEffects && lengthEffects.forEach(fn => {
    if (fn !== activeEffectFn) {
      keySetToRun.add(fn)
    }
  });
}
```

然后还有就是，设置 length 的值也是有可能更改数组元素值的，比如本身长度为4，设置length 变成 1，那么索引 1 2 3 对应的值都应该更新为 undefined，如果有收集副作用函数，那么自然需要触发
所以这里需要实现。即如果 target 是数组，设置的虽然是 length，除了执行 length 自己的副作用函数，还需要额外执行索引收集的副作用函数（当然，仅需要执行索引大于等于新 length 的那些）

```js
const p = reactive([0, 1, 2, 3]);

effect(() => {
  // 这里会收集 0 1 2 3 及其副作用函数
  console.log('0,1,2,3->', p[0], p[1], p[2], p[3]);
})

setTimeout(() => {
  p.length = 1; // 此处应该触发 元素索引 对应收集的副作用函数
}, 2000);
```

实现思路如下：
- 首先桶里收集了 bucket => [0,1,2,3] => 0, 1, 2, 3 对应收集的副作用函数 [0=>fn, 1=>fn, 2=>fn, 3=>fn]
- length 修改，将桶中索引值大于等于 length 值副作用函数拿出来执行

```js
function trigger(target, key, type, newVal) {
...
  // 当代理的对象为数组时，并且并且修改的键为 length 时
  if(Array.isArray(target) && key === 'length') {
    targetMap.forEach((effects, key) => {
      if(key >= newVal) {
        effects.forEach(fn => {
          if (fn !== activeEffectFn) {
            keySetToRun.add(fn);
          }
        });
      }
    })
  }
...
}
```