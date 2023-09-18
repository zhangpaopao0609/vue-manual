# 5.5 浅响应和深响应

```js
const obj = {
  a: {
    b: 1
  }
}

const p = reactive(obj)

effect(() => {
  console.log(obj.a.b)
})

setTimeout(() => {
  obj.a.b = 2
})
```

解决办法，就是在 get 拦截函数处判定，下一个值是否是 对象，如果是，那么继续将其转换为 reactive