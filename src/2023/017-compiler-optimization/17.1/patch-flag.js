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
  closeBlock()
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
