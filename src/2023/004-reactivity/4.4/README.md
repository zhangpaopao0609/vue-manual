4.4 分支切换
避免浪费

比如
```js
const data = { ok: true, text: '我是 data.text' };
const p = reactive(data);

effect(() => {
  const a = document.getElementById('a')
  a.innerHTML = p.ok ? p.text : 'data 的 ok 变成了 false 了'
})
```

 effect 执行时，会将 fn 收集到 bucket 中：
 - bucket => data => ok => fn
 - bucket => data => text => fn

当修改 p.ok = false 时，此时会发生 fn 会执行一次，这没什么问题。
当修改 p.text = "我是 data.text， 我发生变化了"，因为桶里面有对应的副作用函数，所以， fn 又会执行一次。
看起来似乎没问题，但是其实第二次 fn 的执行是没有任何意义的，浪费了的，因为此时的 fn 与 data.text 的变化毫无关系。

所以，如果能在每次 fn 执行之前，把收集过它的那些依赖集合中的它给删除掉，然后重新收集，就能获取到最新的收集结果了。

那么，谁收集过这个 fn 就需要记录一下了，在 fn 上挂一个数组，这个数组用来收集谁收集它，然后在 fn 执行前，把这里面的 fn 给删掉，再重新收集