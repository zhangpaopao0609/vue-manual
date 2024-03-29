# 15 编译器

## 15.1 模板 SDL 的编译器

GPL - 通用用途语言（general purpose language）
DSL - 领域特定语言（domain-specific language）

语言 A -> 语言 B：编译
源代码翻译成目标代码的过程叫做编译

完整的编译过程通常包含词法分析、语法分析、语义分析、中间代码生成、优化、目标代码生成等

模板 --parser--> 模板 AST --transform--> JS AST --generate--> JS。

对于 vue 来说，vue 模板编译器的目标代码其实就是渲染函数。

```html
<div>
  <h1 :id="dynamicId">Vue Template</h1>
</div>
```

最终要编译的结果是：
```js
function render() {
  return h('div', [
    h('h1', { id: dynamicId }, 'Vue Template')
  ])
}
```

vue 目标编译器会首先对模板进行词法分析和语法分析，得到模板 AST。接着，将模板 AST 转换(transform)成 JS AST，最后通过 JS AST 生成 JS 代码，即渲染函数代码。

## 15.2 parser 的实现原理与状态机

```html
<p>Vue</p>
```
 
tokenize 解析成 token，有限状态自动机。
1. 初始状态
2. 标签开始状态
3. 标签名称状态
4. 文本状态
5. 结束标签状态
6. 结束标签名称状态

上面 p 的整个解析状态切换为 
1 -> 2 -> 3 -> 1 -> 4 -> 2 -> 5 -> 6 -> 1

这样，最终能够得到一个 token 数组

```js
const tokens = [
  { type: 'tag', name: 'p' },
  { type: 'text', content: 'Vue' },
  { type: 'tagEnd', name: 'p' },
]
```

思路有了，然后我们就可以来实现一下 tokenize 函数。

实现的过程就是有限状态自动机。

```js
const TokenState = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagOpenName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 结束标签状态
  tagEndName: 6 // 结束标签名称状态
}

const TokenType = {
  tagOpen: 'tagOpen',
  text: 'text',
  tagEnd: 'tagEnd',
}

// 一个辅助函数，用于判断是否是字母
function isAlpha(char) {
  return char >= 'a' && char <= 'z' || char >= 'A' && char <='Z'
}

// 接收模板字符串作为参数，并将模板切割为 Token 返回
function tokenize(str) {
  // 状态机的当前状态：初始状态
  let currentState = TokenState.initial;
  // 用于缓存字符
  const chars = [];
  // 生成的 Token 会存储到 tokens 数组中，并作为函数的返回值返回
  const tokens = [];
  // record token
  const record = (value) => tokens.push(value);

  while(str) {
    // 查看第一个字符，注意，这里只是查看，没有消费该字符
    const char = str[0];
    
    switch (currentState) {
      case TokenState.initial:
        // 初始状态
        if(char === '<') {
          currentState = TokenState.tagOpen;
        } else if(isAlpha(char)) {
          currentState = TokenState.text;
          chars.push(char)
        }
        str = str.slice(1);
        break;
      case TokenState.tagOpen:
        // 标签开始状态
        if(isAlpha(char)) {
          currentState = TokenState.tagOpenName;
          chars.push(char)
        } else if(char === '/') {
          currentState = TokenState.tagEnd;
        }
        str = str.slice(1);
        break;
      case TokenState.tagOpenName:
        // 标签名称状态
        if(isAlpha(char)) {
          chars.push(char)
        } else if(char === '>') {
          record({
            type: TokenType.tagOpen,
            name: chars.join('')
          });
          chars.length = 0;
          currentState = TokenState.initial;
        }
        str = str.slice(1);
        break;
      case TokenState.text:
        if(char === '<') {
          record({
            type: TokenType.text,
            content: chars.join('')
          });
          chars.length = 0;
          currentState = TokenState.tagOpen;
        } else {
          chars.push(char)
        }
        str = str.slice(1);
        break;
      case TokenState.tagEnd:
        if(isAlpha(char)) {
          currentState = TokenState.tagEndName;
          chars.push(char)
        }
        str = str.slice(1);
        break;
      case TokenState.tagEndName:
        if(isAlpha(char)) {
          chars.push(char)
        } else if(char === '>') {
          record({
            type: TokenType.tagEnd,
            name: chars.join('')
          });
          chars.length = 0;
          currentState = TokenState.initial;
        }
        str = str.slice(1);
        break;
      default:
        break;
    }
  }

  return tokens;
}

// const str = "<p>vue</p>";
// const res = tokenize(str);
// console.log(res);

const str = "<div><p>vue1</p><p>vue2</p></div>";
const res = tokenize(str);
console.log(res);
```

## 15.3 构造 AST

DSL 和 GPL 最大的区别在于
- GPL 图灵完备的
- DSL 不要求图灵完备的

vue 模板构造 AST 相对简单，因为 HTML 标签元素之间天然嵌套，形成属性结构，这与 AST 非常类似。

假设有如下模板：

```html
<div><p>Vue</p><p>Template</p></div>
```

我们将这段模板对应的 AST 设计为：

```js
const ast = {
  type: 'Root',
  children: [
    {
      type: 'Element',
      tag: 'div',
      children: [
        {
          type: 'Element',
          tag: 'p',
          children: [
            {
              type: 'Text',
              content: 'Vue',
            }
          ]
        },
        {
          type: 'Element',
          tag: 'p',
          children: [
            {
              type: 'Text',
              content: 'Template',
            }
          ]
        }
      ]
    }
  ]
}
```

可以看到，AST 在结构上与模板是“同构”的。

怎么实现呢？

1. 我们通过 tokenize 获得了模板对应的 token。

```js
[
  { type: 'tagOpen', name: 'div' },
  { type: 'tagOpen', name: 'p' },
  { type: 'text', content: 'Vue' },
  { type: 'tagEnd', name: 'p' },
  { type: 'tagOpen', name: 'p' },
  { type: 'text', content: 'Template' },
  { type: 'tagEnd', name: 'p' },
  { type: 'tagEnd', name: 'div' }
]
```

2. 然后再利用栈将它 parser 成 ast

```js
const AstType = {
  Element: 'Element',
  Text: 'Text',
}

/**
 * parser
 * @param {*} str 接收模板作为参数
 * @returns 模板 ast
 */
function parser(str) {
  // 对模板进行标记化，得到 tokens
  const tokens = tokenize(str);
  // 创建 Root 根节点
  const root = {
    type: 'Root',
    children: []
  };
  // 创建 elementStack 栈，起初只有 Root 根节点
  const elementStack = [root];

  // 只要还有 token，就循环下去
  while (tokens.length) {
    // 当前的父节点
    const parent = elementStack[elementStack.length - 1];
    // 当前的 token
    const nt = tokens[0];
    switch (nt.type) {
      case TokenType.tagOpen:
        // 标签开始
        // 创建标签
        const elementNode = {
          type: AstType.Element,
          tag: nt.name,
          children: []
        }
        parent.children.push(elementNode);
        elementStack.push(elementNode)
        break;
      case TokenType.text:
        // 文本
        // 创建标签
        const textNode = {
          type: AstType.Text,
          content: nt.content,
        }
        parent.children.push(textNode);
        break;
      case TokenType.tagEnd:
          // 标签结束
          elementStack.pop()
          break;
      default:
        break;
    }
    tokens.shift();
  }

  return root
}
```

## 15.4 AST 的转化与插件化架构

AST 转化 ----> 模板 AST 转化为 JS AST

### 15.4.1 节点的访问
要实现对 AST 的转化，那么就要访问 AST 上的每一个节点，这样才能有机会对特定的节点进行修改、替换、删除等操作。因为是树形，所以直接 DFS 即可。

```js
/**
 * 查看并打印所有节点
 * @param {*} node ast
 * @param {*} indent 层级
 */
function dump(node, indent = 0) {
  const type = node.type;
  const desc =
    node.type === AstType.Root
      ? ''
      : type === AstType.Element
        ? node.tag
        : node.content
  console.log(`${'-'.repeat(indent)}${type}: ${desc}`);
  if (node.children) {
    node.children.forEach(chid => dump(chid, indent + 2));
  }
}

/**
 * 遍历 ast 中的所有节点
 * @param {*} ast 
 */
function traverseNode(ast) {
  // 当前节点，ast 本身就是 Root 节点
  const currentNode = ast;
  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      traverseNode(children[i])
    }
  }
}
```

### 15.4.2 转换上下文与节点操作
上下文包括：
- 当前节点
- 父节点
- 当前节点在父节点的位置信息
- 对节点的操作

```js
/**
 * 遍历 ast 中的所有节点
 * @param {*} ast
 * @param {*} context 上下文信息
 */
function traverseNode(ast, context) {
  // 设置当前节点
  context.currentNode = ast;

  // 执行节点转换
  const transforms = context.nodeTransforms;
  for (let i = 0; i < transforms.length; i++) {
    transforms[i](context.currentNode, context);
  }

  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      // 递归地调用 traverseNode 转换子节点之前，将当前节点设置为父节点
      context.parent = context.currentNode;
      // 设置位置索引
      context.childIndex = i;
      traverseNode(children[i], context)
    }
  }
}

function transform(ast) {
  const context = {
    // 当前节点
    currentNode: null,
    // 父节点
    parentNode: null,
    /// 当前节点在父节点 children 中的位置索引
    childIndex: 0,
    // 节点处理
    nodeTransforms: []
  }

  traverseNode(ast, context);
  dump(ast)
}
```

在有了上下文之后，我们还可以额外提供一些通用处理函数
- 节点替换函数 replaceNode
- 节点删除函数 removeNode

```js
/**
 * 模板 ast 转换为 js ast
 * @param {*} ast 
 */
function transform(ast) {
  const context = {
    // 当前节点
    currentNode: null,
    // 父节点
    parentNode: null,
    /// 当前节点在父节点 children 中的位置索引
    childIndex: 0,
    // 节点处理
    nodeTransforms: [],
    // 替换节点
    replaceNode(node) {
      // 为了替换节点，我们需要修改 ast
      // 找到当前节点的父节点和在父节点中的位置
      const { parent, childIndex } = context;
      // 替换
      parent.children[childIndex] = node;
      // 设置当前 node
      context.currentNode = node;
    },
    // 移除节点
    removeNode() {
      const { parent, childIndex } = context
      if(parent) {
        // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
        parent.children.splice(childIndex, 1, 0);
        // 置空当前节点
        context.currentNode = null;
      }
    }
  }

  traverseNode(ast, context);
  dump(ast)
}
```

### 15.4.3 进入与退出
在转换 AST 的过程中，往往需要根据子节点的情况来决定如何对当前节点进行转换，这就要求父节点转换必须等待子节点全部转换完毕再执行。

但现在的 dfs 处理是在进入节点时触发的，所以我们需要修改一下处理的时机。

实现方式：将 transforms 函数存起来，然后在退出阶段执行

```js
/**
 * 遍历 ast 中的所有节点
 * @param {*} ast
 * @param {*} context 上下文信息
 */
function traverseNode(ast, context) {
  // 设置当前节点
  context.currentNode = ast;
  // 增加退出阶段的回调函数数组
  const exitFns = [];
  // 执行节点转换
  const transforms = context.nodeTransforms;
  for (let i = 0; i < transforms.length; i++) {
    // 转换函数可以返回另一个函数，该函数即作为退出阶段的回调函数
    const onExit = transforms[i](context.currentNode, context);
    if (onExit) {
      // 将退出阶段的回调函数添加到 exitFns 数组中
      exitFns.push(onExit)
    }
    // 处理后，如果节点不存在了，那么 return
    if (!context.currentNode) return;
  }

  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = context.currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      // 递归地调用 traverseNode 转换子节点之前，将当前节点设置为父节点
      context.parent = context.currentNode;
      // 设置位置索引
      context.childIndex = i;
      traverseNode(children[i], context)
    }
  }

  // 在节点处理的最后阶段中执行缓存到 exitFns 中的回调函数
  // 注意，这里我们要反序执行
  let i = exitFns.length;
  while (i--) {
    exitFns[i]()
  }
}

/**
 * 模板 ast 转换为 js ast
 * @param {*} ast 
 */
function transform(ast) {
  function transformText (node, context) {
   return () => {
    if(node.type === AstType.Text) {
      console.log(node.content);
    }
   }
  }

  function transformElement (node, context) {
    return () => {
      if(node.type === AstType.Element) {
        console.log(node.tag);
      }
     }
  }

  const context = {
    // 当前节点
    currentNode: null,
    // 父节点
    parentNode: null,
    /// 当前节点在父节点 children 中的位置索引
    childIndex: 0,
    // 节点处理
    nodeTransforms: [
      transformText,
      transformElement,
    ],
    // 替换节点
    replaceNode(node) {
      // 为了替换节点，我们需要修改 ast
      // 找到当前节点的父节点和在父节点中的位置
      const { parent, childIndex } = context;
      // 替换
      parent.children[childIndex] = node;
      // 设置当前 node
      context.currentNode = node;
    },
    // 移除节点
    removeNode() {
      const { parent, childIndex } = context
      if (parent) {
        // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
        parent.children.splice(childIndex, 1, 0);
        // 置空当前节点
        context.currentNode = null;
      }
    }
  }

  traverseNode(ast, context);
  dump(ast)
}
```