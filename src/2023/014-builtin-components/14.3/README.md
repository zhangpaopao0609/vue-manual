# 14 内建组件和模块

## 14.1 KeepAlive 组件的实现原理

KeepAlive 借鉴于 HTTP 协议，HTTP 中的 KeepAlive 可以避免连接频繁地销毁/创建，与之类似，Vue 中 KeepAlive 组件可以避免组件被频繁地销毁/创建。

```vue
<template>
  <Tab v-if="currentTab === 1">...</Tab>
  <Tab v-if="currentTab === 2">...</Tab>
  <Tab v-if="currentTab === 3">...</Tab>
</template>
```

单纯地这样写，每次切换的时候组件都会被销毁和创建，因此可以用 KeepAlive 组件来解决这个问题：

```vue
<template>
  <KeepAlive>
    <Tab v-if="currentTab === 1">...</Tab>
    <Tab v-if="currentTab === 2">...</Tab>
    <Tab v-if="currentTab === 3">...</Tab>
  </KeepAlive>
</template>
```

KeepAlive 的本质是缓存管理，再加上特殊的挂载/卸载逻辑。
- 缓存管理：将组件实例缓存起来
- 挂载：如果没有缓存，那么直接挂载并缓存起来；如果已经缓存过了，那么使用缓存的组件实例来挂载，挂载也不是实际真正的挂载，而是从一个虚拟的节点下移动到要挂载的节点下
- 卸载：并不是真正地执行卸载，而是将组件实例从当前父节点下移动到一个虚拟节点下，这样，下次挂载就是从这个虚拟节点获取了

可以看到，KeepAlive 组件的实现是需要渲染器层面的支持。这是因为被 KeepAlive 的组件在卸载时，并不是真的将其卸载，否则就无法维持组件的当前状态了。正确的做法是，将被 KeepAlive 的组件从原容器搬
运到另外一个隐藏的容器中，实现“假卸载”。当被搬运到隐藏容器中的组件需要再次被“挂载”时，也不是执行真正的挂载逻辑，而是把该组件从隐藏容器中再搬运到原容器。这个过程对应到组件的生
命周期，其实就是 activated 和 deactivated（激活和失效）。

![Alt text](./images/activated-deactivated.png)

```js
/** KeepAlive 组件 */
const KeepAlive = {
  name: 'KeepAlive',
  // KeepAlive 组件独有的属性，用作标识
  _isKeepAlive: true,
  setup(props, { slots }) {
    // 缓存，用于缓存组件 vnode
    const cache = new Map();
    // 当前 KeepAlive 组件的实例
    const instance = currentInstance;
    // 对于 KeepAlive 组件组件来说，它的实例上存在特殊的 keepAliveCtx 对象，该对象由渲染器注入
    // 该对象会暴露渲染器的一些内容方法，其中 move 函数用来将一段 DOM 移动到另一个容器中
    const { move, createElement } = instance.keepAliveCtx;
    // 创建隐藏容器
    const storageContainer = createElement('div');

    // KeepAlive 组件的实例上会被添加两个内部函数，分别是 _deActivate 和 _activate
    // 这两个函数会在渲染器中被调用
    instance._deActivate = (vnode) => {
      move(vnode, storageContainer);
    }
    instance._activate = (vnode, container, anchor) => {
      move(vnode, container, anchor);
    }

    return () => {
      // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
      let rawVNode = slots.default();
      // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
      if(!isObject(rawVNode.type)) {
        return rawVNode;
      }

      // 在挂载时先获取缓存的组件 vnode
      const cachedVNode = cache.get(rawVNode.type);
      if(cachedVNode) {
        // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
        // 继承组件实例
        rawVNode.component = rawComp.component;
        // 在 vnode 上添加 keptAlive 属性，标记为 true，避免渲染器重新挂载它
        rawVNode.keptAlive = true;
      } else {
        // 如果没有缓存，则将其添加到缓存中，这样下次激活组件时就不会执行新的挂载动作了
        cache.set(rawVNode.type, rawVNode)
      }
      // 在组件 vnode 上添加 shouldKeepAlive 属性，并标记为 true，避免渲染器真的将组件卸载
      rawVNode.shouldKeepAlive = true;
      // 将 KeepAlive 组件的示例也添加到 vnode 上，以便在渲染器中访问
      rawVNode.keepAliveInstance = instance;

      // 渲染组件 vnode
      return rawVNode;
    }
  }
}
```

实现过程非常有意思，值得一看。

然后是渲染器的支持：

```js
/**
 * 卸载操作
 * @param {*} vnode 
 */
function unmountElement(vnode) {
  // 卸载时，如果卸载的 vnode 类型是 Fragment，那么需要卸载的是它的所有子节点
  if (vnode.type === Fragment) {
    vnode.children.forEach(child => unmountElement(child))
    return
  } else if(isObject(vnode.type)) {
    if(vnode.shouldKeepAlive) {
      // 对于需要被 KeepAlive 的组件，我们不应该真的卸载它，而是应该调用该组件的父组件
      // 即 KeepAlive 组件的 _deActivate 函数使起失活
      vnode.keepAliveInstance._deActivate(vnode)
    } else {
      // 对于组件的卸载，本质上是要卸载组件所渲染的内容，即 subTree
      unmountElement(vnode.component.subTree)
    }
  }
  // ...
}
```

```js
/**
 * 打补丁函数
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 * @param {*} container 容器
 */
function patch(n1, n2, container, anchor) {
  // ...
  else if(isObject(type) || isFunction(type)) {
    // 如果 n2.type 的值的类型是对象，则描述的是有状态组件
    // 如果 n2.type 的值的类型是对象，则描述的是函数式组件
    if(!n1) {
      if(n2.keptAlive) {
        // 如果该组件已经被 KeepAlive，则不会重新挂载它，而是会调用 _activate 来激活它
        n2.keepAliveInstance._activate(n2, container, anchor);
      } else {
        mountComponent(n2, container, anchor)
      }
    } else {
      patchComponent(n1, n2, anchor);
    }
  }
}
```

```js
/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // ...
  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 组件自身的状态数据，即 data
    state,
    // 将解析出的 props 数据包装为 shallowReactive 并定义到组件的实例上
    props: shallowReactive(props),
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树
    subTree: null,
    slots,
    mounted: [],
    // 只有 KeepAlive 组件的实例下会有 keepAliveCtx 属性
    keepAliveCtx: null,
  };

  // 检查当前组件是否是 KeepAlive 组件
  const isKeepAlive = vnode.type._isKeepAlive;
  if(isKeepAlive) {
    // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
    instance.keepAliveCtx = {
      // move 函数用来移动一段 vnode
      move(vnode, container, anchor){
        // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
        insert(vnode.component.subTree.el, container, anchor)
      },
      createElement,
    }
  }
  // ...
}
```

### 14.1.2 include 和 exclude
默认情况下会缓存所有的的“内部组件”。但有时候期望只缓存特定组件。所以需要支持 include 和 exclude。

为了简化问题，这里设定 include 和 exclude 仅支持正则类型的值。

```js
/** KeepAlive 组件 */
const KeepAlive = {
  name: 'KeepAlive',
  // KeepAlive 组件独有的属性，用作标识
  _isKeepAlive: true,
  props: {
    include: RegExp,
    exclude: RegExp,
  },
  setup(props, { slots }) {
    // ...

    return () => {
      // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
      let rawVNode = slots.default();
      // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
      if(!isObject(rawVNode.type)) {
        return rawVNode;
      }
      // 获取“内部组件”的 name
      const name = rawVNode.type.name;
      if(
        name &&
        (
          // 如果 name 无法被 include 匹配
          (props.include && !props.include.test(name)) ||
          // 或者被 exclude 匹配，说明不希望被缓存
          (props.exclude && props.exclude.test(name))
        )
      ) {
        // 则直接渲染 “内部组件”
        return rawVNode;
      }

      // ...
    }
  }
}
```

这里简化了问题哈，仅仅只是支持了正则类型的 include 和 exclude。实际上可以支持任意的匹配能力。另外，在匹配时，也可以不限于 “内部组件” 的名称，甚至可以让用户自行指定匹配要素。

### 14.1.3 缓存管理

> 最多缓存多少呢？

在 KeepAlive 组件中，使用 Map 来存储了组件 vnode 对象。如果无限制地缓存下去的话，可能会内存溢出，所以需要管理缓存——即当超出某个阈值时，应该对缓存进行修剪，但应该如何修剪呢？

vue 当前采用的修剪策略是“最新一次访问”。举例如下，假设设定 KeepAlive 组件的最大缓存容量为 2，现在有三个组件 Comp1、Comp2、Comp3：
- 初始渲染了 Comp1 并缓存起来，[Comp1]
- 切换 Comp2，[Comp1, Comp2]
- 切换 Comp3，此时最新一次访问的是 Comp2，所以 Comp2 是安全的，修剪 Comp1，[Comp2, Comp3]

另一种
- 初始渲染了 Comp1 并缓存起来，[Comp1]
- 切换 Comp2，[Comp1, Comp2]
- 切换 Comp1，[Comp1, Comp2]
- 切换 Comp3，此时最新一次访问的是 Comp1，所以 Comp1 是安全的，修剪 Comp2，[Comp1, Comp3]

至于策略如何实现，这就是一个算法问题了，后续来补充一下。

当然也可以开放接口给用户让用户自定义缓存策略。

## 14.2 Teleport 组件的实现原理

### 14.2.1 Teleport 要解决的问题
默认情况下，组件或者元素会按照模板中书写的模式和层级来进行渲染。但有时候我们希望某个标签能够渲染到 body 或者某个指定的标签下，比如遮罩层，这时候改如何处理呢？

在 vue2 中就是手动地用 DOM 方法来移动，但这样或多或少会造成一些问题，因此， vue3 提供了这个内置组件。

### 14.2.2 实现 Teleport 组件

通 KeepAlive 组件一样，Teleport 组件也需要渲染器的支持，在实现之前，先要有一个意识，就是要将 Teleport 组件的渲染逻辑从渲染器中分离出来，这样做的好处是：
- 可以避免渲染器逻辑代码 “膨胀”
- 可以 TreeShaking

```js
/**
 * 打补丁函数
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 * @param {*} container 容器
 */
function patch(n1, n2, container, anchor) {
  // ...
  else if(isObject(type) && type.__isTeleport) {
    // 组件选项中如果存在 __isTeleport 标识，则它是 Teleport 组件，
    // 调用 Teleport 组件渲染中的 process 函数将控制权交出去
    // 传递给 process 函数的第五个参数是渲染器的内部方法
    type.process(n1, n2, container, anchor, {
      patch,
      patchChildren,
      unmount,
      move(vnode, container, anchor) {
        insert(
          vnode.component  // 是否为组件
            ? vnode.component.subTree.el  // 是，则移动组件的 el
            : vnode.el, // 普通元素
          container, 
          anchor,
        )
      }
    })
  }
}
```

通过 __isTeleport 标识来判断该组件是否为 Teleport 组件，如果是，则交出控制权，这样就实现了渲染逻辑分离。

在用户看来，Teleport 是一个内置组件，但实际上， Teleport 是否拥有组件的性质是框架本身决定的。通常一个组件的子节点会被渲染成插槽，但对于 Teleport 组件来说，直接将其子节点编译为一个数据即可。

```js
<Teleport to="body">
  <h1>Title</h1>
  <p>content</p>
</Teleport>
```

这会编译成：

```js
function render() {
  return {
    type: Teleport,
    props: {
      to: 'body',
    },
    children: [
      { type: 'h1', children: 'Title' },
      { type: 'p', children: 'content' },
    ]
  }
}
```

这样设计后，就可以来实现 Teleport 组件了。

```js
/** Teleport 组件 */
const Teleport = {
  __isTeleport: true,
  process(n1, n2, container, anchor, internals) {
    // 通过 internals 可以获取渲染器的内部方法
    const {
      patch,
      patchChildren,
      move,
    } = internals;

    const { to } = n2.props
    const target = isString(to) ?  document.querySelector(to) : to;

    if(!n1) {
      n2.forEach(child => patch(null, child, target, anchor))
    } else {
      // 更新
      patchChildren(n1, n2, container);
      const { to: n1_to } = n1.props
      if(to !== n1_to) {
        // 即 to 发生了变化，那么应当 move
        n2.forEach(child => move(child, target))
      }
    }
  } 
}
```

## 14.3 Transition 组件的实现原理
### 14.3.1 原生 DOM 的过渡

话不多数，直接来看好吧。

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>14.3.1 原生 DOM 的过渡</title>
  <style>
    .box {
      width: 100px;
      height: 100px;
      background-color: skyblue;
    }

    .enter-from {
      margin-left: 200px;
    }

    .enter-to {
      margin-left: 0px;
    }

    .enter-active {
      transition: all 2s linear;
    }

    .leave-from {
      margin-top: 0px;
    }

    .leave-to {
      margin-top: 200px;
    }

    .leave-active {
      transition: all 2s linear;
    }
  </style>
</head>
<body>
  <script>
    // 创建
    const el = document.createElement('div');
    el.classList.add('box');

    // *******************进入********************************
    // 在 DOM 元素被添加到页面之前，将初始状态和运动过程定义到元素上
    el.classList.add('enter-from');
    el.classList.add('enter-active');

    // 将元素添加到页面
    document.body.appendChild(el)

    // 在下一帧切换元素的状态
    requestAnimationFrame(() => {
      // 移除
      el.classList.remove('enter-from');
      // 添加
      el.classList.add('enter-to');

      // 动画结束后移除元素状态和运动过程
      el.addEventListener('transitionend', () => {
        el.classList.remove('enter-to')
        el.classList.remove('enter-active')
      })
    });

    // *******************离开********************************
    el.addEventListener('click', () => {
      // 添加初始状态和运动过程定义
      el.classList.add('leave-from');
      el.classList.add('leave-active');

      // 在下一帧切换元素的状态
      requestAnimationFrame(() => {
        // 移除
        el.classList.remove('leave-from');
        // 添加
        el.classList.add('leave-to');

        // 动画结束后移除元素状态和运动过程
        el.addEventListener('transitionend', () => {
          el.classList.remove('leave-to');
          el.classList.remove('leave-active');
          // 当过渡完成后，将 DOM 元素移除
          el.parentNode.removeChild(el)
        })
      });
    })
  </script>
</body>
</html>
```

进入动画实现的整个过程可以分为三个阶段：
- beforeEnter：在这个阶段添加进入初始状态 enter-from 和动作过程 enter-active
- enter：在这个阶段（其实就是下一帧）移除掉初始状态并且添加最终状态 enter-to
- 动效结束：在这个阶段移除掉最终转态 enter-to 和动作过程 enter-active

离开动画实现的整个过程与之如出一辙：
- beforeLeave：在这个阶段添加进入初始状态 leave-from 和动作过程 leave-active
- enter：在这个阶段（其实就是下一帧）移除掉初始状态并且添加最终状态 leave-to
- 动效结束：在这个阶段移除掉最终转态 leave-to 和动作过程 leave-active

##  14.3.2 实现 Transition 组件

如下使用 Transition 组件：

```vue
<template>
  <Transition>
    <div>我是需要过渡的元素</div>
  </Transition>
</template>
```

对应的 VDOM 设计为：

```js
function render() {
  return {
    type: Transition,
    children: {
      default() {
        return { type: 'div', children: '我是需要过渡的元素' }
      }
    }
  }
}
```

如此，实现一个 Transition 组件，同时需要渲染器的内部支持：

- 进入时调用 transition 的进入钩子

```js
/**
 * 挂载操作
 * @param {*} vnode 
 * @param {*} container 
 */
function mountElement(vnode, container, anchor) {
  // ...

  // 判断一个 vnode 是否需要过渡
  const needTransition = vnode.transition;
  if(needTransition) {
    // 调用 transition.beforeEnter 钩子
    vnode.transition.beforeEnter(el)
  };
  insert(el, container, anchor);
  if(needTransition) {
    // 调用 transition.enter 钩子
    vnode.transition.enter(el)
  };
}
```

- 卸载时调用 transition 的离开钩子

```js
/**
 * 卸载操作
 * @param {*} vnode 
 */
function unmountElement(vnode) {
  // ...
  // 根据 vnode 获取要卸载的真实 DOM 元素
  const el = vnode.el;
  // 获取真实 DOM 的父元素
  const parent = el.parentNode;
  if(parent)  {
    const performRemove = () => unmount(el, parent)
    if(vnode.transition) {
      vnode.transition.leave(el, performRemove)
    } else {
      performRemove();
    }
  }
}
```

- Transition 组件

```js
/** Transition */
const Transition = {
  name: 'Transition',
  setup(props, { slots }) {
    const innerVNode = slots.default();

    innerVNode.transition = {
      beforeEnter(el) {
        // 设置初始状态：添加 enter-form 和 enter-active 类
        el.classList.add('enter-from');
        el.classList.add('enter-active');
      },
      enter(el) {
        // 在下一帧切换到结束状态
        nextFrame(() => {
          // 移除
          el.classList.remove('enter-from');
          // 添加
          el.classList.add('enter-to');

          // 动画结束后移除元素状态和运动过程
          el.addEventListener('transitionend', () => {
            el.classList.remove('enter-to')
            el.classList.remove('enter-active')
          })
        });
      },
      leave(el, performRemove) {
        // 设置离场过渡的初始状态：添加 leave-from 和 leave-active
        el.classList.add('leave-from');
        el.classList.add('leave-active');

        // 在下一帧切换元素的状态
        nextFrame(() => {
          // 移除
          el.classList.remove('leave-from');
          // 添加
          el.classList.add('leave-to');

          // 动画结束后移除元素状态和运动过程
          el.addEventListener('transitionend', () => {
            el.classList.remove('leave-to');
            el.classList.remove('leave-active');
            // 当过渡完成后，将 DOM 元素移除
            performRemove();
          })
        });
      }
    }

    return innerVNode;
  }
}
```

这里类名都直接硬编码了，完全可以使用 props 来进行设置。