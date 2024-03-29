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

## 12.2 组件状态与自更新
组件的状态要怎么获取到呢？

约定，用户必须使用 data 函数来定义组件自身的状态，同时可以在渲染函数中通过 this 访问由 data 函数返回的状态数据。

这里就能够很好地回答上面遗留的问题了，就是为什么 render 必须是一个函数而不是对象啥的，因为函数才能指定 this，而对象不行。 render 函数可以通过 this 获取到 data 里面的状态（因为是函数，所以可以使用 bind call 来指定）

```js
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data } = componentOptions;
  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());
  const queueJob = getQueueJob();
  // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
  // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
  const subTree = render.call(state, state);
  // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
  patch(null, subTree, container, anchor)
}
```

除了获取状态以外，当状态发生变化时，需要进行相应的更新操作，那么怎么做呢？很简单，直接将更新放到 effect 中，这样，当组件树中的状态发生变化时，能自动地出发更新操作。

只是，需要注意的是，因为触发变化和更新的操作是同步的，也就意味着，多次修改响应式数据的值，将会导致渲染函数执行多次，这实际上是没有必要的。所以可以实现一个调度器来将任务缓存起来，放到微任务里面执行。
> 其实之前就实现过，就是一个调度器的视线

```js
/**
 * 获取调度器
 * @returns 
 */
function getQueueJob() {
  let isFlusing = false;
  const p = Promise.resolve();
  const queue = new Set();
  function queueJob(job) {
    queue.add(job);
    if(!isFlusing) {
      isFlusing = true
      p.then(() => {
        queue.forEach(fn => fn())
      }).finally(() => {
        queue.clear();
        isFlusing = false
      })
    }
  }

  return queueJob;
}

/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data } = componentOptions;
  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());
  const queueJob = getQueueJob();
  // 将组件的 render 函数调用包装到  effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
    // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
    const subTree = render.call(state, state);
    // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
    patch(null, subTree, container, anchor)
  }, {
    scheduler(job) {
      queueJob(job)
    }
  })
}
```
但这样还是有些许缺陷的，因为每次 patch 的时候都是 null，相当于说每次都是新的挂载，而不是打补丁，这是不正确的。正确的做法是，每次更新时，都拿新的 subTree 与上一次组件所渲染的 subTree 进行打补丁。为此，我们需要实现组件实例，用它来维护组件的整个生命周期的状态，这行渲染器才能够在正确的时机执行合适的操作。