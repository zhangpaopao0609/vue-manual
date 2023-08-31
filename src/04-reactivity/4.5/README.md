4.5 嵌套的 effect

```html
  <script>
    const data = { fn1: '我是 fn1 的文本', fn2: '我是 fn2 的文本' };
    const p = reactive(data);

    effect(() => {
      console.log('fn1 执行');

      effect(() => {
        console.log('fn2 执行');
        p.fn2
      });

      p.fn1
    });

    setTimeout(() => {
      p.fn1 = 'fn 1 变化';
    }, 2000);
  </script>
```

运行时，控制台打印如下
-fn1 执行
-fn2 执行

2 秒后，控制台打印的结果会是
-fn2 执行

这是不对的，因为我变化的是 fn1，但却仅仅只执行了 fn2，这显然不符合预期；为什么会出现这个问题呢？

我们来捋一下 effect 的执行过程：
- 外层 effect 执行，fn1 会立即执行，此时 activeEffectFn 赋值为 fn1，同时打印 console.log('fn1 执行');
- 然后执行到内层 effect，此时 activeEffectFn 重新赋值为 fn2，同时打印 console.log('fn2 执行');
- 执行 p.fn2，此时会触发 track，将 activeEffectFn 收集到 bucket => data => fn2 => activeEffectFn 中，然后内层执行完成
- 外层 effect 继续执行
- 执行 p.fn1，此时会触发 track，将 activeEffectFn 收集到 bucket => data => fn1 => activeEffectFn 中，然后内层执行完成（这一步就出现问题了，fn1 收集到的 activeEffectFn 是 fn2，实际上是要收集 fn1 的）
- 2 秒后，执行定时器，设置 p.fn1，此时会触发 trigger，找到 bucket => data => fn1 => activeEffectFn，因为收集到的 activeEffectFn，因为收集到的是 fn2，所以自然执行了 console.log('fn2 执行');


那么怎么修复呢？问题出在 p.fn1 收集时收集到了 fn2，因为 内层 effect 在执行时将 activeEffectFn 重新赋值为了 fn2。所以很简单，利用一个栈将 activeEffectFn 存起来

```js
let activeEffectFn;
const effectFnStack = [];

function effect(fn) {
  function effectFn() {
    activeEffectFn = effectFn;
    effectFnStack.push(effectFn);
    effectFn.deps.forEach(dep => dep.delete(effectFn));
    fn();
    effectFnStack.pop();
    activeEffectFn = effectFnStack[effectFnStack.length-1]
  }

  effectFn.deps = new Set();
  effectFn();
}
```
