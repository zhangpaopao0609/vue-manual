4.8 实现 computed

computed 的入参是一个 getter，返回 getter 的结果，当 getter 中的依赖项变化时，结果也能相应的变化，同时， computed 能缓存值，还有 computed 不会立即执行 getter

既然 computed 要实现，当依赖项变化时，它的返回值也能变化，那么，它就依赖 effect 函数，首先改造 effect 函数

```js
function effect(fn, options = {}) {
  const effectFn = function () {
    // 执行副作用函数之前，在收集过它的依赖集合中删除它
    effectFn.deps.forEach(dep => dep.delete(effectFn));
    activeEffectFn = effectFn;
    effectFnStack.push(effectFn);
    const res = fn();
    effectFnStack.pop();
    activeEffectFn = effectFnStack[effectFnStack.length - 1];
    return res;
  }

  effectFn.deps = new Set();
  effectFn.options = options;
  if(!options.lazy) {
    effectFn();
  }
  return effectFn;
}
```
- 支持 lazy 
- 将 effectFn 返回
- 将 fn 的结果返回

```js
function computed(getter) {
  let dirty = true;
  let value = null;
  
  const effectFn = effect(getter, 
    { 
      lazy: true, 
      scheduler() {
        dirty = true;
      } 
    }
  );

  const obj = {
    get value() {
      if(!dirty) return value;
      value = effectFn();
      dirty = true;
      return value;
    }
  }

  return obj;
}
```

到这一步，我们实现了 computed 的缓存，以及，当依赖项改变时，再次获取时能获取到最新的值，但还有一个缺陷，那就是

```js
const sum = computed(() => obj.a + obj.b)

effect(() => {
  console.log('sum')
  sum.value;
})
```

当 computed 嵌套在一个 effect 中时，sum 发生变化不会触发 fn 执行，因为 sum.value 没有收集过；所以解决办法很简单，那就是读取 computed 的 value 时收集，当 computed 的依赖项发生变化时，触发 value 收集到的副作用函数

```js
function computed(getter) {
  let dirty = true;
  let value = null;
  
  const effectFn = effect(getter, 
    { 
      lazy: true, 
      scheduler() {
        dirty = true;
        trigger(obj, 'value')
      } 
    }
  );

  const obj = {
    get value() {
      if(!dirty) return value;
      value = effectFn();
      dirty = true;
      track(obj, 'value')
      return value;
    }
  }

  return obj;
}
```