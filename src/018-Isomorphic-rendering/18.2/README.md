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