# 双端 Diff 算法

## 10. 双端比较的原理

```js
function patchKeyedChildren(n1, n2, container) {
  const oldChildren = n1.children;
  const newChildren = n2.children;
  // 四个索引值
  let oldStartIdx = 0;
  let oldEndIdx = oldChildren.length - 1;
  let newStartIdx = 0;
  let newEndIdx = newChildren.length - 1;

  // 四个 vnode
  let oldStartVNode = oldChildren[oldStartIdx];
  let oldEndVNode = oldChildren[oldEndIdx];
  let newStartVNode = newChildren[newStartIdx];
  let newEndVNode = newChildren[newEndIdx];

  // 开始双端 diff
  while(oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if(oldStartVNode.key === newStartVNode.key) {
      // 如果 旧首结点 和 新首结点 相同，那么直接 oldStartIdx++ 并且 newStartIdx++，同时更新对应的 vnode
      patch(oldStartVNode, newStartVNode, container);
      oldStartVNode = oldChildren[++oldStartIdx]
      newStartVNode = newChildren[++newStartIdx]
    } else if(oldEndVNode.key === newEndVNode.key) {
      // 如果 旧尾结点 和 新尾结点 相同，那么直接 oldEndIdx-- 并且 newEndIdx--
      patch(oldEndVNode, newEndVNode, container);
      oldEndVNode = oldChildren[--oldEndIdx]
      newEndVNode = newChildren[--newEndIdx]
    } else if(oldStartVNode.key === newEndVNode.key) {
      // 如果 旧首结点 和 新尾结点 相同，那么说明 旧真实 DOM 移动到了 新真实 DOM 列表的最后，
      // 那么，将 DOM 进行移动，并且 oldStartIdx++ 并且 newEndIdx--，同时更新对应的 vnode
      patch(oldStartVNode, newEndVNode, container);
      insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
      oldStartVNode = oldChildren[++oldStartIdx]
      newEndVNode = newChildren[--newEndIdx]
    } else if(oldEndVNode.key === newStartVNode.key) {
      // 如果 旧尾结点 和 新首结点 相同，那么说明 旧真实 DOM 移动到了 新真实 DOM 列表的前面，
      // 那么，将 DOM 进行移动，并且 oldEndIdx-- 并且 newStartIdx++，同时更新对应的 vnode
      patch(oldEndVNode, newStartVNode, container);
      insert(oldEndVNode.el, container, oldStartVNode.el);
      oldEndVNode = oldChildren[--oldEndIdx]
      newStartVNode = newChildren[++newStartIdx]
    } else {
      
    }
  }
}
```

- 旧首节点 和 新首节点
- 旧尾节点 和 新尾节点
- 旧首节点 和 新尾节点
- 旧尾节点 和 新首节点

这就是双端 diff

不同的端不同的处理方式

- 旧首节点 和 新首节点：说明新旧节点首部一致，那么 patch 后直接索引 ++
- 旧尾节点 和 新尾节点：说明新旧节点尾部一致，那么 patch 后直接索引 --
- 旧首节点 和 新尾节点：说明 旧首节点 和 新尾节点 一致，同时，说明，节点从首部移动到了尾部，那么 patch 后，直接 dom 移动就好，dom 从首部移动到尾部即可，insert(oldStartVNode.el, conatiner, oldEndVNode.el.nextSibling)
- 旧尾节点 和 新首节点：说明 旧尾节点 和 新首节点 一致，同时，说明，节点从尾部移动到了首部，那么 patch 后，直接 dom 移动就好，dom 从尾部移动到首部即可，insert(oldEndVNode.el, conatiner, oldStartVNode.el)

这就是双端 diff 的原理了。

## 10.3 非理想状态的处理方式

并不是所有情况都是非常理想的，那么该如何处理呢？

很简单，如果双端都没找到，那么直接在就子节点里面找，如果找到了，将节点进行移动，如果没有，直接 挂载。

```js
// 开始双端 diff
while(oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
  // 增加两个判断分支，如果头尾部节点为 undefined，则说明该节点已经被处理过了，直接跳到下一个位置。
  if(!oldStartVNode) {
    oldStartVNode = oldChildren[++oldStartIdx]
  } else if(!oldEndVNode) {
    oldEndVNode = oldChildren[--oldEndIdx]
  } else if(oldStartVNode.key === newStartVNode.key) {
    // 如果 旧首结点 和 新首结点 相同，那么直接 oldStartIdx++ 并且 newStartIdx++，同时更新对应的 vnode
    patch(oldStartVNode, newStartVNode, container);
    oldStartVNode = oldChildren[++oldStartIdx]
    newStartVNode = newChildren[++newStartIdx]
  } else if(oldEndVNode.key === newEndVNode.key) {
    // 如果 旧尾结点 和 新尾结点 相同，那么直接 oldEndIdx-- 并且 newEndIdx--
    patch(oldEndVNode, newEndVNode, container);
    oldEndVNode = oldChildren[--oldEndIdx]
    newEndVNode = newChildren[--newEndIdx]
  } else if(oldStartVNode.key === newEndVNode.key) {
    // 如果 旧首结点 和 新尾结点 相同，那么说明 旧真实 DOM 移动到了 新真实 DOM 列表的最后，
    // 那么，将 DOM 进行移动，并且 oldStartIdx++ 并且 newEndIdx--，同时更新对应的 vnode
    patch(oldStartVNode, newEndVNode, container);
    insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
    oldStartVNode = oldChildren[++oldStartIdx]
    newEndVNode = newChildren[--newEndIdx]
  } else if(oldEndVNode.key === newStartVNode.key) {
    // 如果 旧尾结点 和 新首结点 相同，那么说明 旧真实 DOM 移动到了 新真实 DOM 列表的前面，
    // 那么，将 DOM 进行移动，并且 oldEndIdx-- 并且 newStartIdx++，同时更新对应的 vnode
    patch(oldEndVNode, newStartVNode, container);
    insert(oldEndVNode.el, container, oldStartVNode.el);
    oldEndVNode = oldChildren[--oldEndIdx]
    newStartVNode = newChildren[++newStartIdx]
  } else {
    // 遍历旧 children，试图寻找与 newStartVNode 拥有相同 key 值的元素
    const idxInOld = oldChildren.findIndex(child => child.key === newStartVNode.key);
    // idxInOld 大于 0，说明找到了可复用的节点，并且需要将其对应的真实 DOM 移到头部
    if(idxInOld > 0) {
      const vnodeToMove = oldChildren[idxInOld]
      // 打补丁
      patch(vnodeToMove, newStartVNode, container);
      // 将 vnodeToMove.el 移动到 oldStartVNode.el 前面
      insert(vnodeToMove.el, container, oldStartVNode.el);
      // 更新 newStartIdx 到下一个位置
      newStartVNode = newChildren[++newStartIdx];
      // 由于位置 idxInOld 处的节点所对应的真实 DOM 已经移动到了别处，因此将其设置为 undefined
      oldChildren[idxInOld] = undefined;
    }
  }
}
```

## 10.4 添加新元素和移除不存在的元素

这个就相对比较简单了，新的子节点没循环完的话，就直接添加（只是要注意位置），旧的子节点没循环完的话，直接卸载

```js
while(oldStartIdx <= oldEndIdx){
  // 多余的元素，卸载掉
  unmountElement(oldStartVNode);
  oldStartVNode = oldChildren[++oldStartIdx]
}

while(newStartIdx <= newEndIdx){
  // 新元素，添加上
  // patch(null, newStartVNode, container, newChildren[newStartIdx-1] ? newChildren[newStartIdx-1].el.nextSibling : container.firstChild );
  patch(null, newStartVNode, container, newChildren[newEndIdx+1] ? newChildren[newEndIdx+1].el : null );
  newStartVNode = newChildren[++newStartIdx];
}
```