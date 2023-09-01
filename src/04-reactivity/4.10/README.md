4.10 过期的副作用

举个例子：

```js
let finalData;

watch(obj, async () => {
  const res = await fetch('/path/to/request');
  finalData = res;
})

obj.a = 1;

setTimeout(() => {
  obj.a = 2;
}, 200)
```
首先， obj.a = 1; 会触发 fn，fn 会发起一个请求
200 ms 后，obj 再次修改，再次触发 fn，fn 又会发起一个请求

试想一下，如果 第一次请求很慢，需要 1000ms 才返回，而第二次请求很快，100ms 就返回了，这时候，finalData 得到的结果会是第一次请求的，显然，这不符合预期，既然发起了第二次请求，那么 finalData 也应该是第二次的结果才对。

那么怎么解决呢？就是让第一次的 fn 失效。看现在的 vuejs 是怎么解决这个问题的哈

```js
watch(obj, async (newValue, oldValue, onInvalidate) => {
  // 定义一个标识，代表当前副作用函数是否过期，默认为 false，代表没有过期
  let expired = false;

  // 调用 onInvalidate 函数注册一个过期回调
  onInvalidate(() => {
    expired = true;
  })

  const res = await fetch('/path/to/request');

  if(!expired) {
    finalData = res;
  }
})
```

那么内部是如何实现的呢？
当下一次调用 cb 时，调用记录的上一个 onInvalidate 即可。
思路如下：
- 定义一个 cleanup 变量用于记录 cb 的 onInvalidate 的回调函数
  ```js
    let cleanup;

    const onInvalidate = (cb) => {
      cleanup = cb;
    }
  ```
- cb 调用时，先调用一下 cleanup，发现为 null，继续往下，将 onInvalidate 作为第三个参数传给 cb
- cb 内部执行，调用 onInvalidate 函数并将设置过期的操作函数传进去
  此时，onInvalidate 执行，那么 watch 内部的 cleanup 就收集了当前 cb 的过期操作
- 200 ms 后，cb 再次调用，此时的 cleanup 记录了前一个 cb 的过期操作，执行 cleanup，继续往下，将 onInvalidate 作为第三个参数传给 cb


```js
function watch(source, cb, options = {}) {
  let getter;
  function traverse(value, seen=new Set()) {
    if(typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    for(const k in value) {
      traverse(value[k], seen)
    }

    return value
  }

  if(typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  let cleanup;
  let oldValue;
  let newValue;

  const onInvalidate = (cb) => {
    cleanup = cb;
  }

  const job = () => {
    if(cleanup) cleanup();
    newValue = effectFn();
    cb(newValue, oldValue, onInvalidate);
    oldValue = newValue
  }

  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if(options.post === 'flush') {
        Pormise.resolve().then(job)
      } else {
        job()
      }
    }
  });

  if (options.immediate) {
    job()
  } else {
    oldValue = effectFn()
  }
}
```