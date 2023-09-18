# 9 简单 diff 算法

## 9.1 减少 DOM 操作的性能开销

新旧子节点均为数组时，可以进行比对，先用最小的那个数组长度来循环，然后如果新的更短，那么说明旧子节点要卸载，如果旧的更短，那么说明新子节点要挂载

```js
// 旧子节点为数组
// 简单 diff 算法
const oldLen = oldChildren.length;
const newLen = newChildren.length;
const commonLen = Math.min(oldLen, newLen);
// 先 diff 共同的长度
for (let i = 0; i < commonLen; i++) {
  patch(oldChildren[i], newChildren[i], container)
}

if(oldLen < newLen) {
  // 新子节点更多，那么直接挂载
  for (let i = commonLen; i < newLen; i++) {
    patch(null, newChildren[i], container)
  }
} else if(newLen < oldLen){
  // 旧子节点更多，那么直接卸载
  for (let i = commonLen; i < oldLen; i++) {
    unmountElement(oldChildren[i])
  }
}
```

## 9.2 DOM 复用与 key 的作用

直接按照上面的比对，其实还有很大的优化空间。

```js
const oldVNode = {
  type: "div",
  children: [
    { type: 'div', children: '1' },
    { type: 'p', children: '2' },
    { type: 'span', children: '3' },
  ]
}

const newVNode = {
  type: "div",
  children: [
    { type: 'span', children: '3' },
    { type: 'div', children: '1' },
    { type: 'p', children: '2' },
  ]
}
```

可以看到，子节点其实只是发生了移动，如果按照上述的更新，那么会进行 6 次 DOM 的操作，3 次卸载 3 次挂载。
但我们知道，这仅仅只发生了移动，所以我们可以试着比对一下是否有相同的元素，如果有，直接移动就好了。
那么怎么比对呢？单单用 type 肯定是不行的，因为 type 并不是唯一值，那么用什么呢？就需要用一个唯一标识符了，也就是 key

```js
const oldVNode = {
  type: "div",
  children: [
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '2', key: 2 },
    { type: 'p', children: '3', key: 3 },
  ]
}

const newVNode = {
  type: "div",
  children: [
    { type: 'p', children: '3', key: 3 },
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '2', key: 2 },
  ]
}
```

## 9.3 找到需要移动的元素

通过 key 我们能够找到哪些是可复用的节点了，节点对应的真实 DOM 元素都更新完毕了。但真实 DOM 仍然保持旧的一组子节点的顺序，所以我们需要找出哪些节点是需要移动的。

怎么找呢？其实很简单，旧子节点 key 的顺序为 0，1，2，新的子节点的顺序变成了 2，0，1，可以看到，顺序不再是递增的了，这说明，0，1 对应的节点之前是在 2 前面的，现在都排在了 2 的后面，所以它们两个都需要移动。

那么思路就来了，循环新节点，在旧节点中查找可复用的节点时，记录一个相对顺序的最大值，如果查找的节点的顺序小于了最大值，那么这个节点就是需要移动的，否者不需要移动，并且更新最大值。

```js
let lastIndex = 0;
for (let i = 0; i < newLen; i++) {
  const newChild = newChildren[i];

  for (let j = 0; j < oldLen; j++) {
    const oldChild = oldChildren[j];
    if(newChild.key === oldChild.key) {
      patch(oldChild, newChild, container)
      if(lastIndex > j) {
        // 如果当前找到的节点在旧 children 中的索引小于最大索引值 lastIndex
        // 说明该节点对应的真实 DOM 需要移动
      } else {
        // 如果当前找到的节点在旧 children 中的索引不小于最大索引值 lastIndex
        // 不需要移动，更新 lastIndex
        lastIndex = j
      }
      break
    }
  }
}
```

## 9.4 如何移动元素

在这之前，我们先捋一下思路：

- 新 vnode 的顺序就是真实 DOM 的顺序
- 如果新旧 node 的 key 一致，也就是可以复用，那么真实 DOM 就在 node.el 上
- 移动就是插入的如果，container.insertBefore(el, anchor)

所以这就很简单了：
- 第一次循环，会找到 lastIndex，并且可以将它对应的 el 作为 anchor
- 第二次循环，如果小于 lastIndex，那么说明它需要移动，只需要 container.insertBefore(el, anchor.nextSibling)，el 怎么来，就是 vnode 上有呀，此时，更新一下 anchor
- 第三次循环，如果小于 lastIndex，那么说明它需要移动，只需要 container.insertBefore(el, anchor.nextSibling)，el 怎么来，就是 vnode 上有呀，此时，更新一下 anchor

```js
let lastIndex = 0;
let anchor;
for (let i = 0; i < newLen; i++) {
  const newChild = newChildren[i];

  for (let j = 0; j < oldLen; j++) {
    const oldChild = oldChildren[j];
    if(newChild.key === oldChild.key) {
      patch(oldChild, newChild, container);
      const el = oldChild.el;
      if(lastIndex > j) {
        // 如果当前找到的节点在旧 children 中的索引小于最大索引值 lastIndex
        // 说明该节点对应的真实 DOM 需要移动
        insert(el, container, anchor.nextSibling)
      } else {
        // 如果当前找到的节点在旧 children 中的索引不小于最大索引值 lastIndex
        // 不需要移动，更新 lastIndex
        lastIndex = j;
      }
      anchor = el;
      break
    }
  }
}
```

当然，书 232 页给出了另一种写法，我们可以一起来看看

```js
let lastIndex = 0;
for (let i = 0; i < newLen; i++) {
  const newChild = newChildren[i];

  for (let j = 0; j < oldLen; j++) {
    const oldChild = oldChildren[j];
    if(newChild.key === oldChild.key) {
      patch(oldChild, newChild, container);
      const el = oldChild.el;
      if(lastIndex > j) {
        // 代码运行到这里，说你 newVNode 对应的真实 DOM 需要移动
        // 先获取 newVNode 的前一个 vnode，即 preVNode
        const preVNode = newChildren[i-1];
        // 如果 preVNode 不存在，则说明当前 newVNode 是第一个节点，它不需要移动（其实不需要哈，这种情况不会发生的）
        if(preVNode) {
          // 由于我们要将 newVNode 对应的真实 DOM 移动到 preVNode 所对应的真实 DOM 的后面
          // 所以我们需要获取 preVNode 所对应的真实 DOM 的下一个兄弟节点，它并将其作为锚点
          const anchor = preVNode.el.nextSibling;
          // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点元素前面
          // 也就是 preVNode 所对应的真实 DOM 的后面
          insert(el, container, anchor)
        }
      } else {
        // 如果当前找到的节点在旧 children 中的索引不小于最大索引值 lastIndex
        // 不需要移动，更新 lastIndex
        lastIndex = j;
      }
      anchor = el;
      break
    }
  }
}
```

## 9.5 添加新元素

新元素，即在旧节点中找不同相同的节点。
那么怎么处理呢？直接挂载即可。

```js
let find = false;

for (let j = 0; j < oldLen; j++) {
  const oldChild = oldChildren[j];
  if(newChild.key === oldChild.key) {
    find = true
    patch(oldChild, newChild, container);
    const el = oldChild.el;
    if(lastIndex > j) {
      // 如果当前找到的节点在旧 children 中的索引小于最大索引值 lastIndex
      // 说明该节点对应的真实 DOM 需要移动
      insert(el, container, anchor.nextSibling)
    } else {
      // 如果当前找到的节点在旧 children 中的索引不小于最大索引值 lastIndex
      // 不需要移动，更新 lastIndex
      lastIndex = j;
    }
    anchor = el;
    break
  }
}

if(!find) {
  patch(null, newChild, container, anchor ? anchor.nextSibling : container.firstChild);
  anchor = newChild.el;
}
```

只是要注意一点，如果当前没有锚点元素，那么它需要挂载到 container 的第一个位置，即相对于 container.firstChild 挂载。

