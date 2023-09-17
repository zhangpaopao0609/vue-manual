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