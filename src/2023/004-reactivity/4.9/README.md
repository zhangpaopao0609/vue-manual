4.9 watch 的本质

watch 是当依赖项发生变化时，执行回调函数，那就是依赖收集的过程，

```js
watch(obj, (newValue, oldValue) => {
  console.log('obj 发生变化了')
})

obj.foo++
```

当 obj.foo 发生变化时，触发回调，那么说明，bucket => data => obj => cb 说明桶里面对应收集了依赖。

```js
function watch(source, cb) {
  let getter = null;

  function travrse(obj) {
    // 读取所有的字段
    if(!obj || typeof obj !== 'object') return;
    for(let key in obj) {
      obj[key]
    }
  }

  if(typeof source === 'function') {
    getter = source;
  } else {
    getter = travrse(source);
  }
  effect(getter, { 
    scheduler() {
      cb()
    } 
  })
}
```