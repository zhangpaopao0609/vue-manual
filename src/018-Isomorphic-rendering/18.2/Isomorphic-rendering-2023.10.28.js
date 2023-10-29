const VOID_TAGS = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'.split(',');
const shouldIgnoreProp = ['key', 'ref'];
const BOOLEAN_ATTRS = `
  itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly,async,autofocus,
  autoplay,controls,default,defer,disabled,hidden,loop,open,required,reversed,scoped,seamless,
  checked,muted,multiple,selected
`.split(',');


function escapeHtml(str) {
  const innerStr = '' + str;
  const escapeRE = /["'&<>]/;
  const match = escapeRE.exec(innerStr);

  if(!match) {
    return innerStr;
  }

  let html = '';
  let escaped;
  let index;
  let lastIndex = 0;
  for (index = match.index; index < innerStr.length; index++) {
    switch (innerStr.charCodeAt(index)) {
      case 34:  // "
        escaped = '&quot;'
        break;
      case 38:  // &
        escaped = '&amp;'
        break;
      case 39:  // '
        escaped = '&#39;'
        break;
      case 60:  // <
        escaped = '&lt;'
        break;
      case 62:  // >
        escaped = '&gt;'
        break;
      default:
        continue;
    }

    if(lastIndex !== index) {
      html += innerStr.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escaped;
  }

  return lastIndex !== index ? html + innerStr.substring(lastIndex, index) : html;
}

function renderDynamicAttr(key, value) {
  const isBooleanAttr = BOOLEAN_ATTRS.includes(key);
  if(isBooleanAttr) {
    return value === false ? '' : ` ${key}`
  } else if (isSSRSafeAttrName(key)) {
    // 对于其他安全的属性，执行完整的渲染
    // 注意：对于属性值，我们需要对它执行 HTML 转义操作 防御 xss 攻击。
    return value === '' ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`
  } else {
    // 跳过不安全的属性，并打印警告信息
    console.warn(`Skipped rendering unsafe attribute name: ${key}`)
    return '';
  }
}


function renderAttrs(props) {
  let ret = '';
  for (const key in props) {
    if(
      shouldIgnoreProp.includes(key) || 
      // 事件
      /^on[^a-z]/.test(key)
    ) {
      continue;
    }
    const value = props[key];

    ret += renderDynamicAttr(key, value);
  }

  return ret;
}

function renderElementVNode(vnode) {
  let ret = '';
  // 取出标签名称 tag 和标签属性 props，以及标签的子节点
  const { type, props, children } = vnode;
  // 开始标签的头部
  ret += `<${vnode.type}`;
  // 处理标签属性
  if(props) {
    // 调用 renderAttrs 函数对 props 进行严谨处理
    ret += renderAttrs(props)
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