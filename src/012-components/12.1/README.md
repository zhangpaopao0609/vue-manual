# 12 组件的实现原理

## 12.1 渲染组件

在 patch 函数中，我们处理了多种方式
- type 类型为 string，那么处理方式为普通元素节点
- type 为 Text，那么处理方式为文本
- type 为 Comment，那么处理方式为注释
- type 为 Fragment，那么处理方式为片段

同样的，当

- type 类型为 Object 时，那么处理方式为组件

首先，我们的 vnode 如下

```js
const MyComponent = {
  name: 'MyComponent',
  render() {
    return {
      type: 'div',
      children: '我是文本内容',
    }
  }
}

const vnode = {
  type: "div",
  children: [
    { type: 'p', children: '我是 p ', key: 1 },
    { type: MyComponent, key: 'MyComponent' }
  ]
}
```

在 patch 时进行不同的处理：

```js
} else if(isObject(type)) {
  // 如果 n2.type 的值的类型是对象，则描述的是组件
  if(!n1) {
    mountComponent(n2, container, anchor)
  } else {
    patchComponent(n1, n2, anchor)
  }
```

然后进行渲染。

> 看到这里，不知道你是否会有什么疑问哈。
> 我有一个很大的疑问？为什么组件 vnode 要绕这个打一个圈子用 render 函数返回呢？直接用一个属性返回不好吗？如下
>
> ```js
> const MyComponent = {
>   name: 'MyComponent',
>   vnode: {
>     type: 'div',
>     children: '我是文本内容',
>   }
> }
> ```
>
> 这样岂不是直接就可以用 vnode 这个属性就可以拿到组件的 vnode 了吗？为啥要绕一个大圈子呢？先买个关子在这里哈，后面就知道为啥了。

```js
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render } = componentOptions;
  // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode
  const subTree = render();
  // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
  patch(null, subTree, container, anchor)
}
```
