# 5.8 代理 Set 和 Map

Set:
- size
- add(value)
- clear()
- delete(value)
- has(value)
- keys()
- values()
  keys is always the same as value
- forEach(cb(value, key, set) => void[, thisArg])
  key is always the same as value

Map
- size
- clear()
- delete(key)
- has(key)
- get(key)
- set(key, value)
- keys()
- values()
- entries()
- forEach(cb(value, key, map) => void[, thisArg])


## 5.8.1 如何代理 Set 和 Map

```js
const s = new Set([1, 2, 3]);
const p = reactive(s);

console.log(p.size);
```

因为代理 size 是一个访问器属性，根据规范可以知道，size 内部会调取一个内部插槽 this.[[SetData]]，因此此时 this 指向的是 p，但 p 是代理对象，p 没有这个内部插槽，那怎么办呢？
很简单，我们把它的 this 指向指向到 target 就好了哇

```js
const res = Reflect.get(target, key, receiver);
```

这是之前的，因为要将 this 指向到 receiver。
> 为什么之前要将 this 指向 receiver 呢？因为防止对象中 this 指向到 target 导致未能成功收集的情况
> ```js
> const obj = {
>   a: 1, 
>   get b(){
>    return this.a,
>   }
> }
> const p = reactive(obj)
> 
> effect(() => console.log(p.b))
> 
> setTimeout(() => p.a = 2, 1000）
> ```

好，那么现在怎么修改呢？当 target 为 map 并且访问的 key 是 size 时，将 this 指向 target 本身

```js
if(isSet(target) && key === SIZE_KEY) {
  return Reflect.get(target, key, target);
};
```

> 那这里的 this 指向改成 target 本身会有问题吗？
>
> 答案是肯定的，不会！因为这里限定了 size 属性，size 属性是一个内部的属性，它不会受到用户的影响，所以上面那种因为 this 指向了对象的一个值而未被成功收集的情况是不会发生的。

size 解决了，我们再来看看 delete。

```js
const s = new Set([1, 2, 3]);
const p = reactive(s);

p.delete(1);
```

按照 size 的思路，是不是会想到，我修改 `return Reflect.get(target, key, target);` 就可以了呀，不行的，为什么呢？因为 p.delete() 函数执行时，因为 this 隐式绑定的规则，所以delete 方法在执行时，它的 this 永远执行的都是 p，也就是代理对象，很显然，代理对象上肯定是没有 delete 方法的，那么我们怎么做呢？很简单，我们拦截 delete 方法，然后手动指定 this 就可以了。

```js
if(isSet(target) || isMap(target)) {
  if(key === SIZE_KEY) {
    return Reflect.get(target, key, target);
  }
  return target[key].bind(target)
};
```

这样写不会出问题吗？不会的，因为 map 和 set 除了 size，其它全部都是方法，所以不用担心。

## 5.8.2 建立响应联系

```js
const s = new Set([1, 2, 3]);
const p = reactive(s);

effect(() => {
  console.log(p.size);
})

setTimeout(() => {
  p.delete(1)
}, 1000);

setTimeout(() => {
  p.add(1)
}, 2000);
```

在触发 size 的时候，应该主动收集起来，当触发 delete 和 add 时，应该主动触发 size 收集的副作用函数。

```js
const mutableInstrumentations = {
  add(val) {
    // 函数调用时，this 指向的是原始数据对象（因为 bind 了）
    // 先判断是否有这个值
    const hasVal = this.has(val);
    // 原始数据对象上执行方法
    const res = this.add(val);
    // 如果没有这个值，才触发副作用函数
    if(!hasVal) {
      trigger(this, val, TriggerType.ADD)
    }
    return res;
  },
  delete(val) {
    const hasVal = this.has(val);
    const res = this.delete(val);
    if(hasVal) {
      trigger(this, val, TriggerType.DELETE)
    }
    return res;
  },
}

function creatReactive(obj) {
  return new Proxy(obj, {
    get(targe, key, receiver) {
      ...
      if(isSet(target) || isMap(target)) {
        if(key === SIZE_KEY) {
          track(target, ITERATE_KEY);
          return Reflect.get(target, key, target);
        }
        return mutableInstrumentations[key].bind(target);
      };
      ...
    }
  })
}
```

## 5.3 避免污染原始数据

这个例子清晰地讲了什么是污染原始数据。

```js
// 原始数据对象
const m = new Map();
// 代理对象
const p1 = reactive(m);
// 代理对象
const p2 = reactive(new Map());
// 设置
p1.set('p2', p2);

effect(() => {
  console.log(m.get('p2').size);
});

setTimeout(() => {
  m.get('p2').set('foo', 1)
}, 1000);
```

> 其实需要好好想想，为什么原始数据上不能存在响应式数据。因为如果原始数据上存在响应式数据了，那么岂不是混乱了吗？响应式可以响应，非响应式也可以响应。