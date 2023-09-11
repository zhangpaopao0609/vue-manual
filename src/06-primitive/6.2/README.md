# 6 原始值的响应式方法

## 6.1 引入 ref 的概念
因为 Proxy 代理的目标必须是非原始值，所以我们没有任何手段可以拦截原始值，那怎么办呢？很简单，把原始值包装成非原始值就好了呀。

```js
function ref(val) {
  const wrapper = {
    value: val,
  }

  // 属性默认不可写，不可枚举，用它来判读对象是否是 ref
  Object.defineProperty(wrapper, REF_INNER_KEY, {
    value: true,
  });

  return reactive(wrapper);
}
```

## 6.2 响应式丢失问题

什么是响应式丢失哈，来看一个示例
```vue
<template>
  <p>{{ foo }} / {{ bar }}</p>
</template>

<script>
export default {
  setup() {
    const obj = reactive({ foo: 1, bar: 2 });

    setTimeout(() => {
      obj.foo = 2;
    })

    return {
      ...obj
    }
  }
}
</script>
```

这就会丢失响应式，这是因为三点运算符的缘故：
```js
return {
  ...obj
}
```
就相当于是 
```js
return {
  foo: 1,
  bar: 2
}
```

这能有响应式吗？当然是不会有的。

我们举一个更通用的例子来说明响应式丢失的问题哈：

```js
const obj = reactive({ foo: 1, bar: 2 });

const newObj = {
  ...obj,
}

effect(() => {
  console.log(newObj.foo);
})

setTimeout(() => {
  obj.foo = 2;
}, 1000);
```

这肯定是不会触发副作用函数再次执行的，因为 `console.log(newObj.foo);` 根本就不会收集，这就是所谓的响应式丢失。

那么有没有什么办法可以让它变成有响应式的呢？可以，来，我们来看

```js
const newObj = {
  foo: {
    get value() {
      return obj.foo
    },
  },
  bar: {
    get value() {
      return obj.bar
    },
  }
}

effect(() => {
  console.log(newObj.foo.value);
})

setTimeout(() => {
  obj.foo = 2;
}, 1000);
```

让 newObj 和 obj 建立了联系，在读取 newObj.foo.value 时，就会触发副作用函数收集的过程。

因为结构相同，所以抽离出来成为 toRef 函数

```js
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key]
    },
  }

  return wrapper;
}

const newObj = {
  foo: toRef(obj, 'foo'),
  bar: toRef(obj, 'bar'),
}
```

`toRef` 能实现，那同样可以实现 `toRefs` 以便于使用

```js
function toRefs(obj) {
  const res = {};

  for (const key of obj) {
    res[key] = toRef(obj, key)
  }

  return res;
}
```

这样就能快速解决响应式丢失问题了

```js
const newObj = {
  ...toRefs(obj)
}
```

> 这个对象仍然是普通对象，只是这个对象的属性值都是响应式数据了。

响应式丢失的问题得到了解决，解决问题的思路是：将响应式数据转换成为类似于 ref 结构的数据。但为了概念上的统一，我们将 toRef 和 toRefs 转换后得到的结果均视为真正的 ref 数据，因为，需要在 toRef 函数中增加一段代码（即添加一个识别属性）

```js
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key]
    },
  }

  Object.defineProperty(wrapper, REF_INNER_KEY, {
    value: true,
  });

  return wrapper;
} 
```

但是目前通过 toRef 得到的数据是一个只读的数据，还没有设置 set。

```js
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key]
    },
    set value(newVal) {
      obj[key] = newVal;
    },
  }

  Object.defineProperty(wrapper, REF_INNER_KEY, {
    value: true,
  });

  return wrapper;
} 
```
如此，当设置 value 属性时，也能够正确地触发对应的副作用函数，因为设置的是响应式数据。