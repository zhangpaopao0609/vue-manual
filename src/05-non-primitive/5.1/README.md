# 5.1 Proxy 和 Reflect

Proxy 和 Reflect 是一对；
Proxy 上有的方法（拦截器方法）Reflect 中都有同名的函数，这不是偶然，这是有用的，那么它的用处是什么呢？其实一点儿都不神秘。拿 Reflect.get 函数来说，它的功能就是挺好了一个访问对象属性的默认行为，例如，下面这两个操作是等价的：

```js
const obj = { foo: 1 }

// 直接读取
obj.foo

// 使用 Reflect.get 获取
Reflect.get(obj, 'foo')
```

既然是等价的，那么它存在的意义是什么呢？实际上 Reflect.get 函数还接收第三个参数，即指定接受者 receiver，可以简单理解为函数调用过程中的 this，例如

```js
const obj = {
  get foo() {
    return this.foo
  }
}

Reflect.get(obj, 'foo', { foo: 2 })
```

那么它与我们的响应式数据有什么关联呢？
这里还是用一个例子来聊聊哈
