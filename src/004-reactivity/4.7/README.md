4.6 调度执行

场景如下：

```js
const data = { a: 1 };
const p = reactive(data);

effect(() => {
  console.log(p.a)
});

p.a++;
p.a++;
```

会打印出：
1
2
3

这个看起来是没啥毛病的，打印也是正确的。但其实吧，有点浪费，p.a++ 会执行一遍 fn，p.a++ 又会执行一遍 fn，完全可以直接打印一次 3 就好了呀，那怎么能够做到这个效果呢？

就是调度器，就是把当前宏任务期间的所有 effectFn 都收集起来，放到微任务里面执行，这样如果是相同的 fn，就可以只执行一次了。

```js
function effect(fn, options = {}) {
  const effectFn = function() {
    // 执行副作用函数之前，在收集过它的依赖集合中删除它
    effectFn.deps.forEach(dep => dep.delete(effectFn));
    activeEffectFn = effectFn;
    effectFnStack.push(effectFn);
    fn();
    effectFnStack.pop();
    activeEffectFn = effectFnStack[effectFnStack.length-1]
  }
  
  effectFn.deps = new Set();
  effectFn.options = options;
  effectFn();
}
```

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
  keySetToRun.forEach(fn => {
    if(fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}
```

```js
const data = { a: 1 };
const p = reactive(data);

const jobs = new Set();
let isFlush = false;
const p = Promise.resolve();

effect(() => {
  console.log(p.a)
}, {
  scheduler(fn) {
    jobs.add(fn);
    if (!isFlush) {
      isFlush = true;
      p.then(
        jobs.forEach(job => job)
      ).finally(
        () => {
          isFlush = false
        }
      )
    }
  }
});

p.a++;
p.a++;
```