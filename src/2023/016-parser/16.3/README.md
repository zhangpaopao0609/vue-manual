# 16 解析器

我的天呀，解析器是真的，无敌好吧。

## 16.2 梯度下降算法构造模板 AST

```js
/** 定义文本模式，作为一个状态表 */
const TextModes = {
  DATA: 'DATA',
  RCDATA: 'RCDATA',
  RAWTEXT: 'RAWTEXT',
  CDATA: 'CDATA'
}

function parseElement() {
  // 解析开始标签
  const element = parseTag()
  // 这里递归地调用 parseChildren 函数进行 <div> 标签子节点的解析
  element.children = parseChildren()
  parseEndTag()
  return element
}

function parseChildren(context, ancestors) {
  let nodes = [];
  const { mode, source } = context;
  // 开启 while 循环，只要满足条件就会一直对字符串进行解析
  while(!isEnd(context, ancestors)) {
    let node;
    // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
    if(mode === TextModes.DATA || mode === TextModes.RCDATA) {
      if(mode === TextModes.DATA && source[0] === '<') {
        if(source[1] === '!') {
          if(source.startsWith('<!--')) {
            node = parseComment(context);
          } else if(source.startsWith('<![CDATA[')) {
            node = parseCDATA(context, ancestors)
          }
        } else if(source[1] === '/') {
          // 结束标签，这里需要抛出错误
        } else if(/[a-z]/i.test(source[1])) {
          // 标签
          node = parseElement(context, ancestors)
        }
      } else if(source.startsWith('{{')) {
        node = parseInterpolation(context)
      }
    }
    // node 不存在，说明处于其他模式，即非 DATA 模式且非 RCDATA 模式
    // 这时一切内容都作为文本处理
    if(!node) {
      node = parseText(context);
    }

    nodes.push(node)
  }

  return nodes;
}

/**
 * 解析器函数，接收模板作为参数
 * @param {*} str 
 * @returns 
 */
function parse(str) {
  const context = {
    source: str,
    mode: TextModes.DATA
  }

  const nodes = parseChildren(context, []);

  return {
    type: 'Root',
    children: nodes,
  }
}
```

## 16.3 状态机的开启与停止

解析器会在何时开启新的状态机，以及状态机会在何时停止。
结论是：**当解析器遇到开始标签时，会将该标签压入父级节点栈，同时开启新的状态机。当解析器遇到结束标签，并且父级节点栈中存在与该标签同名的开始标签节点时，会停止当前正在运行的状态机。**

```js
function isEnd(context, ancestors) {
  if(!context.source) return true;

  // 与父级节点栈内所有节点做比较
  for (let i = ancestors.length - 1; i >= 0; i--) {
    // 只要栈中存在与当前结束标签同名的节点，就停止状态机
    if(context.source.startsWith(`</${ancestors[i].tag}`)) {
      return true
    }
  }
}
```
