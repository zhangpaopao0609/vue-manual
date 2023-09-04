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

## 5.7.2 数组的遍历

1. for in 遍历（当然，不推荐 for in 遍历数组哈，for in 主要用于对象的遍历）

跟对象一样，forin 使用 ownkeys 拦截，只是，这里不再使用 `ITERATE_KEY` 作为收集的 key 了，而是使用 `length`，因为对于普通对象来说，删除或者增加属性值才就会影响到对象的 forin 遍历，而对于数组而言，

```js
p[100] = 100
p.length = 1
```

其实，无论是为数组添加新元素，还是直接修改数组的长度，本质都是因为修改了数组的 length 属性。一旦数组的 length 属性改变，那么 forin 循环就会发生变化，


2. for of 遍历

> for of 是用来遍历可迭代对象的，可迭代对象都存在一个迭代方法 Symbol.iterator  @@iterator
> @@iterator 返回一个名为 next 的函数，next 函数返回一个包含 value 和 done 的对象，value 是本次迭代展示的值，done 是指迭代是否结束

for of 会读取数组的 length 属性以及各元素本身，所以目前的做法就可以实现响应了。

3. symbol

for of 除了会读取数组的 length 属性以及各元素本身外，还会读取 Symbol.iterator 属性，这个属性就是迭代器方法，所以在 bucket 中可以看到（收集了） symbol 对应的副作用函数

```js
Map(1) {
  [ 0, 1, 2, 3 ] => Map(6) {
    Symbol(Symbol.iterator) => Set(1) { [Function] },
    'length' => Set(1) { [Function] },
    '0' => Set(1) { [Function] },
    '1' => Set(1) { [Function] },
    '2' => Set(1) { [Function] },
    '3' => Set(1) { [Function] }
  }
}
```

这可能引发错误，而且也没必要收集。

错误：当修改了数组 length 时，为了那些索引值大于或等于修改的数组 length 的副作用函数能够执行，需要进行判断 if(key >= newVal) 就要执行，这里当 key 为 Symbol 时就会出错。

当然，也完全没有必要收集 Symbol

所以，可以在收集的时候拦截一下

```js
if(!isReadonly && typeof key !== SYMBOL_TYPE) {
  track(target, key);
}
```