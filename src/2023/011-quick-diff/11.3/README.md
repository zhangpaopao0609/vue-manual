# 11 快速 Diff 算法

## 11.1 相同的前置和后置元素

先查看是否有相同的前置和后置元素。

```js
function patchKeyedChildren(n1, n2, container) {
  const oldChildren = n1.children;
  const newChildren = n2.children;

  let j = 0;
  let oldVNode = oldChildren[j];
  let newVNode = newChildren[j];

  // 相同的前置节点
  while(oldVNode.key === newVNode.key) {
    patch(oldVNode, newVNode, container)
    j++;
    oldVNode = oldChildren[j];
    newVNode = newChildren[j];
  }

  let oldEndIdx = oldChildren.length - 1;
  let newEndIdx = newChildren.length - 1;
  oldVNode = oldChildren[oldEndIdx];
  newVNode = newChildren[newEndIdx];

  // 相同的后置节点
  while(oldVNode.key === newVNode.key) {
    patch(oldVNode, newVNode, container)
    oldEndIdx--;
    newEndIdx--;
    oldVNode = oldChildren[oldEndIdx];
    newVNode = newChildren[newEndIdx];
  }

  if(j > newEndIdx && j <= oldEndIdx) {
    // 说明新结点已经 patch 完了，但还有遗留的旧节点，那么卸载掉
    while(j <= newEndIdx) {
      unmountElement(oldChildren[j++]);
    }
  } else if (j > oldEndIdx && j <= newEndIdx) {
    // 说明旧结点已经 patch 完了，但还有遗留的新节点，那么挂载上
    const anchor = oldChildren[newEndIdx+1] ? oldChildren[newEndIdx+1].el : null;
    while(j <= newEndIdx) {
      patch(null, newChildren[j++], anchor);
    }
  } else if(j <= oldEndIdx && j <= newEndIdx){
    // 说明新旧都有遗留
  }
}
```

## 11.2 判断是否需要进行 DOM 移动操作

无论是简单 diff，还是双端 diff，还是说快速 diff，都遵循着同样的处理规则。
- 判断是否有节点需要移动、以及应该如何移动
- 找出哪些需要被添加或移除的节点

这里判断跟简单 diff 类似，循环新的，在旧的中查找，同时记录一个最大值，如果小于最大值，说明是需要需要移动的，否者更新最大值。

当然，这里不能单纯地这么做了，这里用一个 source 数组来记录新结点在旧节点中的索引位置，然后利用这个 source 计算出一个最长递增子序列实现最小的移动。

```js
const count = newEndIdx - j + 1;
// 用于记录新结点在旧子节点中的索引
const source = new Array(count).fill(-1);
const keyIndex = {};
for (let i = j; i <= newEndIdx; i++) {
  keyIndex[newChildren[i].key] = i;
};

let lastIndex = j;
let move = false;
let patched = 0;
for (let i = j; i <= oldEndIdx; i++) {
  const oldVNode = oldChildren[i];
  if(patched < count) {
    const res = keyIndex[oldVNode.key];
    if(res !== undefined) {
      // 说明有
      const newVNode = newChildren[res]
      patch(oldVNode, newVNode, container);
      source[res-j] = i;
      if(i < lastIndex) {
        move = true;
      } else {
        lastIndex = i;
      }
    } else {
      // 说明没有，卸载
      unmountElement(oldVNode)
    }
  } else {
    unmountElement(oldVNode)
  }
}
```
## 11.3 如何移动元素
前面我们已经实现了两个目标
- 判断是否需要进行 DOM 移动，用 moved 变量来记录的
- 构建 source 数组。该数组的长度等于新的一组子节点 去掉相同前置和后置节点后，剩余未处理节点的数量。存储着新子节点中的节点在旧子节点中的位置信息，后面会根据这个数组计算出一个**最长递增子序列**，用于 DOM 移动操作。
  
- 最长递增子序列
这个有两个做法，都要看看，然后自己写出来

- 移动

```js
if(moved) {
  const seq = LIS(sources);
  // s 指向最长递增子序列的最后一个元素
  let s = seq.length - 1;
  // i 指向新的一组子节点的最后一个元素
  let i = count - 1;
  for(i; i>= 0; i--) {
    if(seq[s] === -1) {
      // 说明索引为 i 的节点是全新的节点，应该将其挂载
      // 该节点在新 children 中的真实位置索引
      const pos = i + j;
      const newVNode = newChildren[pos];
      // 该节点的下一个节点的位置索引
      const nextPos = pos + 1;
      // 锚点
      const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
      // 挂载
      patch(null, newVNode, container, anchor);
    } else if(i !== seq[s]) {
      // 如果节点的索引 i 不等于 seq[s] 的值，说明节点需要移动
      // 该节点在新 children 中的真实位置索引
      const pos = i + j;
      const newVNode = newChildren[pos];
      // 该节点的下一个节点的位置索引
      const nextPos = pos + 1;
      // 锚点
      const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
      // 挂载
      insert(newVNode.el, container, anchor);
    } else {
      // 当 i === seq[s] 时，说明该位置的节点不需要移动
      // 只需要让 s 指向下一个位置
      s--;
    }
  }
}
```