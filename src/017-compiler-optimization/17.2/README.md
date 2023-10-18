# 17 编译优化
编译优化指的是在编译时（将模板编译成渲染函数）尽可能多地提取关键信息，并以此指导生成最优代码的过程。

既然是要提供关键信息，那这些信息就是要有助于运行时（渲染器）。

虽然不同框架编译优化策略不同，但优化的基本方向都是：尽可能地区分动态和静态内容，并针对不同的内容采用不同的优化策略。

既然编译优化是为运行时提供优化的，那么编译优化就要强依赖与渲染器。
我这句话好像是废话耶，因为编译的结果就是给渲染器用的，本来两个就是强依赖的。

## 17.1 动态节点收集与补丁收集

### 17.1.1 传统 diff 算法的问题

```html
<div id="foo">
  <p class="bar">{{ text }}</p>
</div>
```

如上述模板，在 09,10,11 三节中讲述的 diff 算法均需要一层层地比对才能完成更新。
- 比对 div 和它的属性
- 比对 p 和它的属性
- 比较 text 是否发生变化，如果变化了，更新，如果没有，则无反应。

其实可以看到，模板中仅仅有 text 是动态的，其它全是静态的，如果能够知道这个信息，那么 patch 的时候将会减少很多的开销。但可惜的是，目前的 diff 均无法得知这个信息。

那么 **传统 Diff 算法无法避免新旧虚拟 DOM 树间无用的比较操作**。

## 17.1.2 Block 与 PatchFlags
之所以传统 diff 算法无法避免新旧虚拟 DOM 树之间无用的比较操作，是因为 diff 算法在运行时得不到足够的信息，运行时无法知道哪些是静态的，哪些是动态的，所以自然 diff 算法就只能一层一层地进行比较了。

但如果在渲染时知道这些信息呢？那是不是就可以了呢？

我们来看看：
```html
<div>
  <div>foo</div>
  <p>{{ bar }}</p>
</div>
```

可以看到，只有 `{{ bar }}` 是动态的，因此，我们可以给它打一个 patchFlag：

```js
const vnode = {
  type: 'div',
  children: [
    { type: 'div', children: 'foo' },
    { type: 'p', children: ctx.bar, patchFlag: 1 }, // 这是动态节点
  ]
}
```

这个 patchFlag 有两个作用
- 标明这个节点是一个动态节点，没有这个标识的，说明是一个纯静态节点
- 通过 二进制 来标明节点上具体哪一个是动态的
  数字1：代表节点上有动态的 textContent
  数字2：代表元素有动态的 class
  数字4：代表有动态的 style 绑定
  ...
  > 这样，假设 patchFlag 为 5，说明节点上仅有文本和 style 是动态的，其它的属性都不需要检查了，这样就可以做到**靶向更新**了。

这样，我们可以在 vnode 创建阶段（也就是 render 函数执行的时候），把 vnode 的动态子节点提取出来了，并且将其存储在 vnode 的 dynamicChildren 数组内：

```js
const vnode = {
  type: 'div',
  children: [
    { type: 'div', children: 'foo' },
    { type: 'p', children: ctx.bar, patchFlag: PatchFlags.Text }, // 这是动态节点
  ],
  // 将 children 中的动态节点提取到 dynamicChildren 数组中
  dynamicChildren: [
    // p 标签具有 patchFlag 属性，因此它是动态节点
    { type: 'p', children: ctx.bar, patchFlag: PatchFlags.Text }, 
  ]
}
```

将带有 dynamicChildren 属性的 vnode 称为 ”块“，即 Block。一个 Block 不仅能够收集直接子节点，还能收集所有的动态子节点。因为有了 Block，所以渲染器的更新操作就将以 Block 为维度。也就是说，在更新时，渲染器不再以 vnode 的 children 了，而是使用 vnode 的 dynamicChildren，这样可以避免很多无谓的的比较，因为这样实现了跳过静态内容，仅更新动态内容。同时因为动态节点都有 PatchFlag 标识，所以更新的时候可以做到靶向更新。

那么哪些节点上要挂载 dynamicChildren 呢？换句话说，哪一层级作为 Block 呢？
- 所有的根节点
- 带有 v-for、v-if/v-else-if/v-else 的节点

这种均需要作为一个 Block。

### 17.1.3 收集动态节点
假设如下模板：
```html
<div id="foo">
  <p class="bar">{{ text }}</p>
</div>
```
首先，编译器会将其编译成 

```js
render() {
  return createVNode('div', { id: 'foo' }, [
    createVNode('p', { class: 'bar' }, text)
  ])
} 
```
第一个要明确的是：`createVNode` 并不是一个什么神奇的东西，它就是用于辅助生成 vnode 的一个函数。
> 自己写 vnode 比较麻烦。当然， createVNode 不仅仅只有这一个作用哈，它还是可以用于生成 dynamicChilren。
最终希望的 vnode 是这样的：

```js
render() {
  return {
    type: 'div',
    props: {
      id: 'foo',
    },
    children: [
      {
        type: 'p',
        props: {
          class: 'bar',
        },
        children: [
          { type: Text, children: text }
        ]
      }
    ]
  }
} 
```

所以 大概我们能知道， `createVNode` 是这样的：

```js
function createVNode(type, props, children) {
  const key = props && props.key;
  props && delete props.key;

  return {
    type,
    props,
    children,
    key
  }
}
```

编译器在编译时会将提取的关键信息添加到 `createVNode` 参数上，如上述 vnode，编译器优化后，会生成带有补丁标志（patch flag）的渲染函数

```js
render() {
  return createVNode('div', { id: 'foo' }, [
    createVNode('p', { class: 'bar' }, text, PatchFlags.TEXT)
  ])
} 
```

我们就可以利用这个标识来收集该 Block 的 dynamicChildren 了。

我么来看看，render 函数执行时，createVNode 函数是怎么执行的，是由内向外执行，也就是说，内部的 createVNode 会先执行完成，然后 外层的 createVNode 才会执行。

```js
// 动态节点栈
const dynamicChildrenStack = [];

let currentDynamicChildren = [];

function openBlock() {
  dynamicChildrenStack.push(currentDynamicChildren = [])
}

function closeBlock() {
  // 为什么这么设计，因是因为树形，就是一个 block 下可能会有层级的 block
  currentDynamicChildren = dynamicChildrenStack.pop()
}

function createVNode(tag, props, children, flags) {
  const key = props && props.key
  props && delete props.key

  const vnode = {
    tag,
    props,
    children,
    key,
    patchFlags: flags
  }

  if (typeof flags !== 'undefined' && currentDynamicChildren) {
    // 动态节点，将其添加到当前动态节点集合中
    currentDynamicChildren.push(vnode)
  }
}

function createBlock(type, props, children) {
  // block 本质上也是一个 vnode
  const block = createVNode(type, props, children);
  // 将当前动态集合作为 block.dynamicChildren
  block.dynamicChildren = currentDynamicChildren;

  // 关闭 block
  closeBlock();
  // 返回
  return block;
}

function render() {
  // 1. 使用 createBlock 代替 createVNode 来创建 block
  // 2. 每当调用 createBlock 之前，先调用 openBlock
  // ! 我这里就有个问题了，为啥不把 openBlock 直接放到 createBlock 中
  return (openBlock(), createBlock('div', { id: 'foo' }, [
    createVNode('p', { class: 'bar' }, text, PatchFlags.TEXT)
  ]))
};
```

### 17.1.4 渲染器的运行时支持

运行时现在能够获取到 dynamicChildren 以及节点的 patchFlag 了，当 patch 时，可以仅需要 patch dynamicChildren 里面的节点了（即动态节点），同时，还可以根据 patchFlag 实现靶向更新。

```js
/**
 * 更新 block
 * @param {*} n1 
 * @param {*} n2 
 */
function patchBlockChildren(n1, n2) {
  for (let i = 0; i < n2.dynamicChildren.length; i++) {
    patchElement(n1.dynamicChildren[i], n2.dynamicChildren[i])
  }
}
/**
 * 更新元素，走到这里，说明新旧 vnode 类型是一致的，即是同一种节点元素或组件
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 */
function patchElement(n1, n2) {
  const el = n2.el = n1.el;
  // 先更新属性
  const oldProps = n1.props || {};
  const newProps = n2.props || {};

  if (n2.patchFlag) { // ! 书上写的是 patchFlags，感觉又写错了
    // 利用 patchFlags 实现动态节点的靶向更新属性
    const { patchFlag } = n2
    if (patchFlag & 1) {
      // 说明文本是动态的，先不处理
    }
    if (patchFlag & 2) {
      // 说明 class 是动态的，处理 calss 即可
    }
    if (patchFlag & 4) {
      // 说明 class 是动态的，处理 style 即可
    }
    // ... 继续，靶向处理完所有的类型
  } else {
    // 如果没有 patchFlag，那么全量处理

    // 挂载属性，如果新旧属性值一致，就不用动了，否者更新
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, null, newProps[key])
      }
    }

    // 卸载旧属性，如果属性在旧中有，但新的没有，那么便卸载掉属性
    for (const key in oldProps) {
      if(!(key in newProps)) {
        patchProps(el, key, null, null)
      }
    }
  }

  // 处理完属性后，继续处理 children
  if(n2.dynamicChildren) {
    // 调用 patchBlockChildren 函数这样只会更新动态节点
    patchBlockChildren(n1, n2);
  } else {
    // 更新子节点
    patchChildren(n1, n2, el);
  }
}
```

## 17.2 Block 树

目前，我们仅设定了组件模板根节点为 Block 角色，但仅仅这样是不足以满足需要的。

### 17.2.1 带有 v-if 指令的节点

如下模板

```html
<div>
  <section v-if="foo">
    <p>{{ a }}</p>
  </section>
  <div v-else>
    <p>{{ a }}</p>
  </div>
</div>
```

假设目前只有模板根节点是 Block 的话
- foo 为 true 时，收集到的 dynamicChildren 会是
  ```js
  const vnode = {
    type: 'div',
    children: [
      // ...
    ],
    dynamicChildren: [
      { type: 'p', children: ctx.a, patchFlag: PatchFlags.TEXT }
    ]  
  }
  ```
- foo 为 false 时，收集到的 dynamicChildren 会是
  ```js
  const vnode = {
    type: 'div',
    children: [
      // ...
    ],
    dynamicChildren: [
      { type: 'p', children: ctx.a, patchFlag: PatchFlags.TEXT }
    ]  
  } 
  ```

可以看到，不论 foo 为何，dynamicChildren 都是一样的，渲染器将只会 patch 这一部分。但实际上， 它的父级元素是发生变化了的。

上述问题的根本原因在于，dynamicChildren 数组收集的动态节点是忽略了 vdom 树层级的。换句话说，结构化指令会导致更新前后模板的结构发生变化，即结构不稳定，但 dynamicChildren 是不会收集到这个信息的。那么如何解决呢？很简单，只需要让带有 v-if/v-else-if/v-else 等结构化指令的节点也作为 Block 角色即可。

```js
  const vnode = {
  type: 'div',
  children: [
    // ...
  ],
  dynamicChildren: [
    { 
      type: 'section', 
      children: [/** ... */],
      dynamicChildren: [
        { type: 'p', children: ctx.a, patchFlag: PatchFlags.TEXT }
      ] 
    },
    { 
      type: 'div', 
      children: [/** ... */],
      dynamicChildren: [
        { type: 'p', children: ctx.a, patchFlag: PatchFlags.TEXT }
      ] 
    }
  ]  
} 
```

这样，当 v-if 条件为真时，父级 Block 的 dynamicChildren 数组中包含的是 Block（section v-if）；反之 为 Block（div v-else）。这样，在 diff 时，渲染器能够根据 type 和 key 的不同来区分，这样就解决了。

### 17.2.2 带有 v-for 指令的节点

v-if 会让 vdom 树不稳定，v-for 同样也会。如下模板：

```html
<div>
  <p v-for="item in list">{{ item }}</p>
  <i>{{ foo }}</i>
  <i>{{ bar }}</i>
</div>
```

在更新过程中，list 由 [1, 2] 变成了 [1]，按照之前的思路，只有根目录是 block，那么会更新前后的 block 树是：

```js
// 更新前
const prevBlock = {
  type: 'div',
  dynamicChildren: [
    { type: 'p', children: 1, 1 /* TEXT */ },
    { type: 'p', children: 2, 1 /* TEXT */ },
    { type: 'i', children: ctx.foo, 1 /* TEXT */ },
    { type: 'i', children: ctx.bar, 1 /* TEXT */ },
  ]
}
```

```js
// 更新后
const nextBlock = {
  type: 'div',
  dynamicChildren: [
    { type: 'p', children: 1, 1 /* TEXT */ },
    { type: 'i', children: ctx.foo, 1 /* TEXT */ },
    { type: 'i', children: ctx.bar, 1 /* TEXT */ },
  ]
}
```

此时直接使用 dynamicChildren 进行 diff 就已经不可行了，结构都已经发生变化了。

那么如何处理呢？非常简单，让 v-for 的节点也作为 block 就好了。

```js
// 更新后
const block = {
  type: 'div',
  dynamicChildren: [
    { 
      type: Fragment, 
      dynamicChildren: [
        { type: 'p', children: 1, 1 /* TEXT */ },
      ] 
    },
    { type: 'i', children: ctx.foo, 1 /* TEXT */ },
    { type: 'i', children: ctx.bar, 1 /* TEXT */ },
  ]
}
```