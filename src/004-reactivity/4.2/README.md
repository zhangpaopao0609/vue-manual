1. 副作用函数
  会产生副作用的函数。
  比如修改了全局变量，修改了某个对象的值，这种会产生副作用的函数就是副作用函数。
2. 响应式数据的基本实现
  比如，想要实现的是：
  ```js
  const obj = { a: 1 };
  
  function effect() {
    document.body.innerHTML = obj.a
  }

  effect()

  setTimeout(() => {
    obj.a = 2
  }, 1000)
  ```

  1 秒过后，页面能自动更新

  实现思路：

  读取 obj.a 时，用一个全局桶来记录副作用函数。
  当设置 obj.a 时，把全局桶里面的副作用函数拿出来，执行一遍即可实现。


  ```js
  const obj = { a: 1 };
    
    // 用于存储副作用函数
    const bucket = new Set();

    const p = new Proxy(obj, {
      get(target, key){
        bucket.add(effect)
        return target[key]
      },
      set(target, key, val){
        target[key] = val;
        bucket.forEach(fn => fn());
        return val
      }
    })

    function effect() {
      document.body.innerHTML = p.a
    }

    effect();
    setTimeout(() => {
      p.a = 2
    }, 1000)
    ```