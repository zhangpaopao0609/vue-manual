# 第 18 章 同构渲染

vue 可以用于构建客户端应用程序，组件代码在浏览器环境中运行，最终输出 DOM 元素。除此之外，vue 还可以在 node 中运行，它将组件渲染为字符串然后发送给浏览器。

第一种对应的就是：CSR —— Client-Side Rendering，即客户端渲染
第二种对应的就是：SSR —— Server-Side Rendering，即服务端渲染

另外， vue 还提供了另外一种方式，就是将 CSR 和 SSR 两者结合起来，形成同构渲染（isomorphic rendering）

## 18.1 CSR/SSR/同构

1. SSR

  在 web2.0 之前，几乎所有的应用都是采用的 SSR，就是服务端把 模板 + 数据 然后生成 html 字符串返回给浏览器。

  > 好像那时候叫混合开发，还用模板引擎 ejs 吧

  当用户再次通过超链接进行页面跳转时，会重新进行 模板 + 数据 的渲染过程，这样每一次操作都是页面重新刷新。

  **优势：**

  - 浏览器无白屏
  - SEO 友好

  **劣势：**

  - 用户体验不好，每次触发动态内容都会完全重刷
  - 占用服务端资源多

2. CSR

   以 AJAX 为代表，催生了 WEB2.0。这个阶段 SPA 也就诞生了。

   浏览器初始请求时获取到的是一个空的 html，几乎没有内容，大致如下：

   ```html
    <!DOCTYPE html>
   
   <html>
     <head>
       
     </head>
     <body>
       <div id='app'></div>
       
       <script src="/dist/app.js"></script>
     </body>
   </html>
   ```

   浏览器通过 script 标签请求 js 包后渲染 DOM。

   **优势：**

   - 用户体验好
   - 占用服务端资源少

   **劣势：**

   - SEO 不友好
   - 首次白屏

  |                | SSR  | CSR    |
  | -------------- | ---- | ------ |
  | SEO            | 友好 | 不友好 |
  | 白屏问题       | 无   | 有     |
  | 占用服务端资源 | 多   | 少     |
  | 用户体验       | 差   | 好     |



这两种方式都不是 **“银弹”**，那么是否能够融合 SSR 与 CSR 两者的优点于一身呢？答案是可以的，那就是同构渲染。



3. 同构渲染

   同构渲染分为首次渲染（即首次访问或刷新页面）以及非首次渲染。

   - 首次渲染

     流程与 SSR 一致。访问或者刷新页面时，整个页面的内容是在服务端完成渲染的。**浏览器得到的结果是渲染好的 HTML 字符串（HTML 页面），但整个页面是纯静态的**，这意味着用户还不能与页面进行任何的角度，因为**整个应用的脚本还没有加载和执行，只有纯 HTML 字符串**。

     > HTML 页面中会包含 link script 等标签。

   - 非首次渲染

     浏览器获取到初次渲染的 HMTL 页面后，便会解析 HTML，在解析时，发现代码中存在 link 和 script 标签，于是进行获取资源，这就与 CSR 很类似了。当 JS 获取完成后，就会进行激活操作，这里的激活就是 vue 中常说的 水合（hydration）,激活包含两部分

     - vue 在当前页面已经渲染的 DOM 元素以及 Vue 组件的 vnode 之间建立联系
     - vue 从 HTML 页面中提取由服务端序列化后发送过来的数据，用以初始化整个 vue 应用

   **同构渲染的“同构”一词，同样一套代码既可以在服务端运行，也可以在客户端运行。**

   > 其实我自己不这么认为：我倒觉得，所谓的同构渲染时指，水合过程中，HMTL 的结构和 VDOM 是一致的。

## 18.2 将虚拟 DOM 渲染为 HTML 字符串

如何将 VNODE 渲染为 HTML 字符串呢？
> 这里为什么直接讨论将 VNODE 渲染为 HTML 字符串了，因为将模板编译成渲染函数的过程是一模一样的。

```js
const ElementVNode = {
  type: 'div',
  props: {
    id: 'foo',
  },
  children: [
    { type: 'p', children: 'hello' }
  ]
};
```

其实整个过程还是非常简单的，就是字符串的拼接过程，我们来看一个简单版的

```js
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

  // 开始标签的闭合
  ret += `>`;

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
```

这实现了一个简单版本，但还存在几点缺陷：
- 自闭合类型的标签
- 属性处理，属性名称是否合法以及对属性值进行 HTML 转义
- 子节点类型：Fragment/Comment/TEXT/组件 等
- 标签的文本子节点也需要 HTML 转义

这些问题都需要边界条件，逐个处理即可

1. 自闭合类型标签
   这个简单，自闭合类型的标签是固定的，只需要特殊处理即可。自闭合标签术语叫做 void element，它的完整列表如下，这个列表在 WHATWG 中有列出
   ```js
   const VOID_TAGS ='area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr';
  ``` 

2. HTML 属性
- boolean attribute 处理
  例如 checked/disabled 这样的属性，只要给了值且值不为 false，那么最终都应该直接给属性名就好了
- vue 的特殊属性
  key/ref 应该忽略，除此之外，因为同构渲染不需要绑定事件，所以事件也应该忽略

```js
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
```

> 转义非常有用，可以有效地预防 XSS 攻击。HTML 转义也非常简单，就是将特殊字符转换为对应的 HTML 实体。