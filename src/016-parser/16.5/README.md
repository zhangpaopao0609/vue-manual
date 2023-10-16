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
  const element = parseTag();
  // 这里递归地调用 parseChildren 函数进行 <div> 标签子节点的解析
  element.children = parseChildren();
  parseEndTag();
  return element;
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

## 16.4 解析标签节点

```js
function parseTag(context, type='start') {
  const { advanceBy, advanceSpaces } = context;

  // 处理开始标签和结束标签的正则表达式不同
  const match = type === 'start'
    // 匹配开始标签 
    ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
    // 匹配结束标签
    : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source)
  // 匹配成功后，正则表达式的第一个捕获组的值就是标签名称
  const tag = match[1];
  // 消费正则表达式匹配的全部内容，例如 '<div' 这段内容
  advanceBy(match[0].length);
  // 消费标签中无用的空白字符
  advanceSpaces();
  // 在消费匹配的内容后，如果字符串以 '/>' 开头，则说明这是一个自闭合标签
  const isSelfClosing = context.source.startsWith('/>')
  // 如果是自闭合标签，则消费 '/>'， 否则消费 '>'
  advanceBy(isSelfClosing ? 2 : 1);

  return {
    type: TAT.Element,
    tag,
    props: [],
    children: [],
    isSelfClosing,
  }
}

function parseElement(context, ancestors) {
  // 解析开始标签
  const element = parseTag(context);
  if(element.isSelfClosing) return element;
  
  // 切换到正确的文本模式
  if (element.tag === 'textarea' || element.tag === 'title') {
    // 如果由 parseTag 解析得到的标签是 <textarea> 或 <title>，则切换到 RCDATA 模式
    context.mode = TextModes.RCDATA
  } else if(/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    // 如果由 parseTag 解析得到的标签是：
    // <style>、<xmp>、<iframe>、<noembed>、<noframes>、<noscript>
    // 则切换到 RAWTEXT 模式
    context.mode = TextModes.RAWTEXT
  } else {
    // 否则切换到 DATA 模式
    context.mode = TextModes.DATA
  }
}
```

## 16.5 解析属性