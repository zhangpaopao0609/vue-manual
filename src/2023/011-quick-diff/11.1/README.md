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