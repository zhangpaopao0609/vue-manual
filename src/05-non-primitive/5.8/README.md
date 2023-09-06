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