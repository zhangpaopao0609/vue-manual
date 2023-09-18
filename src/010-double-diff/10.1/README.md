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