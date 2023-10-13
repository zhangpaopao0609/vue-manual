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

