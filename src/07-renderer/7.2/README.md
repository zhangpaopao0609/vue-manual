# 7 渲染器的设计

## 7.1 渲染器与响应系统的结合

渲染器是用来执行渲染任务的。在浏览器平台，就是用来渲染真实 dom 的。渲染器不仅能够渲染真实 DOM，它还是跨框架平台讷讷管理的关键。

先暂时将渲染器限定在 DOM 平台上。下面这个函数就是一个合格的渲染器：
```js
function renderer(domString, container) {
  container.innerHTML = domString;
}
```

我们结合响应式，就可以实现一个简单的渲染过程了

```js
import { effect, ref } from "../reactivity/index.js";

function renderer(domString, container) {
  container.innerHTML = domString;
}

const count = ref(1)

effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.body)
});

setTimeout(() => {
  count.value = 2;
}, 1000);
```

## 7.2 渲染器的基本概念

- 渲染：渲染是动词
- 渲染器：渲染器包含渲染，渲染器的作用是把 vdom 渲染为特定平台上的真实元素。比如浏览器平台，渲染器会把 vdom 渲染成真实的 dom 元素。
- vdom 和 vnode：vdom 是由一个个节点组成的树形结构，vdom 上的任何一个节点 vnode 都可以是一棵树，所以 vnode 和 vdom 可以替换使用
- 挂载：渲染器将 vdom 渲染成真实 dom 的过程，英文是 mount，所以在 mounted 函数中能够获取到真实 dom
- patch：打补丁，挂载和更新都可以称作 patch，只是挂载时，旧的 vnode 为空

```js
function createRenderer() {
  /**
   * 渲染函数
   * @param {*} vnode 要渲染的 vnode
   * @param {*} container 容器
   */
  function render(vnode, container) {
    if(vnode) {
      // 新 vnode 存在，将其与就 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container)
    } else {
      if(container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载 （unmount） 操作
        container.innerHTML = ''
      }
    }
    // 把 vnode 存在 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  return {
    render
  }
}
```

你可能会问，为什么要把 render 函数放到 createRenderer 函数里面而不是直接创建一个 renderer 函数呢？因为渲染器不仅仅包含渲染过程，还有很多其它的，比如服务端的水合过程（hydrate）。

## 7.3 自定义渲染器
渲染器是指将 vnode 渲染为特定平台的真实元素。那么也就是说，不仅仅局限于浏览器平台，那么怎么实现呢？

我们通过将 vnode 渲染到浏览器平台来看看

假设有下面这个 vnode 我们要渲染到浏览器

```js
const vnode = {
  type: 'h1',
  children: 'hello'
}
```

那么我们可以怎么实现呢？很简单，直接利用原生 js 的方法来创建元素就好了。

```js
function createRenderer() {
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container) {
    const el = document.createElement(vnode.type);
    const ch = vnode.children;
    // 如果子节点是字符串，代表元素具有文本节点
    if (typeof ch === 'string') {
      // 因此只需要设置元素的 textContent 属性即可
      el.textContent = ch;
    };
    container.appendChild(el)
  }
  /**
   * 打补丁函数
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
    if (n1) {
      // 更新操作
    } else {
      // 挂载操作
      mountElement(n2, container)
    }
  }
  /**
   * 渲染函数
   * @param {*} vnode 要渲染的 vnode
   * @param {*} container 容器
   */
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与就 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载 （unmount） 操作
        container.innerHTML = ''
      }
    }
    // 把 vnode 存在 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  return {
    render
  }
}

const vnode = {
  type: 'h1',
  children: 'hello'
}

const renderer = createRenderer();
renderer.render(vnode, document.querySelector('#app'));
```

但从上述代码就能看到，在 mountElement 函数里面，我们硬编码了很多只有浏览器才支持的 api
-  `createElement`：创建元素
-  `appendChild`：在给定的容器下添加元素
-  `container.innerHTML`：设置元素的文本内容

这些 api 都是浏览器特定的，那么是不是把它们抽离出来就可以实现通用了呀

```js
function createRenderer(options) {
  const { createElement, insert, setElementText } = options;
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container) {
    const el = createElement(vnode.type);
    const ch = vnode.children;
    // 如果子节点是字符串，代表元素具有文本节点
    if (typeof ch === 'string') {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, ch)
    };
    insert(el, container)
  }
  /**
   * 打补丁函数
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
    if (n1) {
      // 更新操作
    } else {
      // 挂载操作
      mountElement(n2, container)
    }
  }
  /**
   * 渲染函数
   * @param {*} vnode 要渲染的 vnode
   * @param {*} container 容器
   */
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与就 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载 （unmount） 操作
        container.innerHTML = ''
      }
    }
    // 把 vnode 存在 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  return {
    render
  }
}

const vnode = {
  type: 'h1',
  children: 'hello'
}

const renderer = createRenderer({
  /**
   * 浏览器平台用于创建元素
   * @param {*} tag 标签
   * @returns 返回元素
   */
  createElement(tag) {
    return document.createElement(tag)
  },
  /**
   * 设置元素的文本节点
   * @param {*} el 元素
   * @param {*} text 文本
   */
  setElementText(el, text) {
    el.textContent = text
  },
  /**
   * 在给定的 parent 下添加指定元素
   * @param {*} el 
   * @param {*} parent 
   * @param {*} anchor 
   */
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  }
});
renderer.render(vnode, document.querySelector('#app'));
```