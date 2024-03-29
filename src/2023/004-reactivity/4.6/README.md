4.6 避免无限递归循环
场景如下，
```js
const data = { a: 1 };
const p = reactive(data);

effect(() => {
  p.a++
});
```

运行上面这段代码会发现，会栈溢出，为什么呢？

我们来看一看哈。

1. effect 执行，此时 acctiveEffectFn 为 fn，fn 执行，即 p.a++ 执行，p.a++ 的本质是 p.a = p.a + 1;
2. p.a + 1 会读取 a，此时会触发 track 函数，bucket => data => a => fn；这没什么问题。
3. p.a = p.a + 1，此时，设置 p.a，会触发 trigger 函数，从 bucket => data => a => fn 中取出 fn 执行，fn 再次执行

那么，第 1 2 3 步骤就会无限轮回。

如何避免这个问题呢？我们发现，无限轮回的问题在于， track 和 trigger 函数同时触发，并且 track 收集和 trigger 触发的副作用函数是同一个，所以 trigger 会无限次执行下去，那么只需要在 trigger 触发副作用函数时判断一下，如果触发的函数与收集的函数是同一个，就不需要再执行了。

```js
function trigger(target, key, val) {
  const targetMap = bucket.get(target);
  if (!targetMap) return;
  const keySet = targetMap.get(key);
  if (!keySet) return;
  const keySetToRun = new Set();
  keySet.forEach(fn => {
    if(fn !== activeEffectFn) {
      keySetToRun.add(fn)
    }
  })
  keySetToRun.forEach(fn => fn())
}
```