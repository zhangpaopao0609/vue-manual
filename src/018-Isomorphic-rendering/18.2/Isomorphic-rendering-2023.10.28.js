const VOID_TAGS = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'.split(',');

function renderElementVNode(vnode) {
  let ret = '';
  // 取出标签名称 tag 和标签属性 props，以及标签的子节点
  const { type, props, children } = vnode;
  // 开始标签的头部
  ret += `<${vnode.type}`;
  // 处理标签属性
  if(props) {
    for (const key in props) {
      // 以 key="value" 的形式拼接字符串
      ret += ` ${key}="${props[key]}"`
    }
  }

  const isVoidElement = VOID_TAGS.includes(type)

  // 开始标签的闭合
  ret += isVoidElement ? `/>` : '>';

  if(isVoidElement) {
    return ret;
  }

  // 处理子节点
  // 如果子节点的类型是字符串，则是文本内容，直接拼接
  if(typeof children === 'string') {
    ret += children
  } else if(Array.isArray(children)) {
    // 如果子节点的类型是数组，则递归地调用 renderElementVNode 完成渲染
    children.forEach(child => {
      ret += renderElementVNode(child)
    })
  }
  // 结束标签
  ret += `</${type}>`;

  // 返回拼接好的 HTML 字符串
  return ret;
}

const ElementVNode = {
  type: 'div',
  props: {
    id: 'foo',
  },
  children: [
    { type: 'p', children: 'hello' }
  ]
};

console.log(renderElementVNode(ElementVNode));