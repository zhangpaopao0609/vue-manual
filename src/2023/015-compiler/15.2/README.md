# 15 编译器

## 15.1 模板 SDL 的编译器。

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