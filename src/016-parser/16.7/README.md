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

```js
function parseAttributes(context) {
  const props = [];

  while(
    !context.source.startsWith('>') &&
    !context.source.startsWith('/>')
  ) {
    // 匹配属性名称
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
    // 属性名
    const name = match[0];
    // 消费属性名
    advanceBy(name.length);
    // 消费空白字符
    advanceSpaces();
    // 消费 =
    advanceBy(1)
    advanceSpaces()

    // 记录属性值
    let value = '';
    // 获取当前模板内容的第一个字符
    const quote = context.source[0];
    // 是否被引号引用
    const isQuoted = quote === '"' || quote === "'";
    if(isQuoted) {
      // 消费引号
      advanceBy(1)
      // 获取下一个引号的索引
      const endQuoteIndex = context.source.indexOf(quote);
      // 能找到
      if(endQuoteIndex > -1) {
        // 属性值
        value = context.source.slice(0, endQuoteIndex);
        advanceBy(value.length);
        advanceBy(1)
      } else {
        // 没找到
        console.error('缺少引号')
      }
    } else {
      // 没有被引号
      // ! 这里与书本不一致，我觉得这里应该要再添加一个 /，因为自闭合标签的属性
      const match = /^[^\t\r\n\f />]+/.exec(context.source);
      value = match[0];
      advanceBy(value.length);
    }
    advanceSpaces();
    props.push({
      type: TAT.Attribute,
      name,
      value
    })
  }

  return props;
}
```

## 16.6 解析文本与解码 HTML 实体

### 16.6.1 解析文本

```js
/**
 * 解析文本
 * @param {*} context 
 * @returns 
 */
function parseText(context) {
  let endIndex = context.source.length;
  const ltIndex = context.source.indexOf('<');
  const delimiterIndex = context.source.indexOf('{{');

  if(ltIndex > -1 && ltIndex < endIndex) {
    endIndex = ltIndex;
  }

  if(delimiterIndex > -1 && delimiterIndex < endIndex) {
    endIndex = delimiterIndex;
  }

  const content = context.source.slice(0, endIndex);

  context.advanceBy(endIndex);

  return {
    type: TAT.Text,
    content,
  }
}
```

### 16.6.2 解码命名字符引用

HTML 实体是一段以字符 & 开始的文本内容。实体用来描述 HTML 中的保留字符和一些难以通过键盘输入的字符。比如 `&lt`，我们不能直接写 `<`，因为这会导致解析错误。

HTML 实体有两类
- 命名字符引用（（named character reference），也叫命名实体，这类实体具有特定的名称，例如 `&lt`
- 数字字符引用（numeric character reference），它是以 `&#` 开头的，例如 `&#60`，它实际上与 `&lt` 相同，除了使用十进制，还可以使用十六进制，`&#x3c`

因为直接使用 el.textContent = '&lt;' 并不会解析，而是会直接展示，所以在编译的时候就要将其解析完整。
> 这个解析是有一个完整的映射表的，WHATWG 规范

规范要求字符引用规范的最后一个字符为分号(;)，这样才能明确得匹配 `&lt;ccc`，如果没有 `$ltccc` 可以看到，就很不便于匹配。
但由于历史原因，浏览器仍然能够解析它。在这种情况下，浏览器的解析规则是：最短原则。其中“最短”指的是命名字符引用的名称最短。举个例子，假设文本内容为：

```js
a&ltcc;
```
这会正确地解析: 'a⪦'

但如果去掉分号

```js
a&ltcc
```

这时候会解析成 `a<cc`。

```js
/**
 * 解码命名字符引用(说句老实话，这里我完全没看，^_^)
 * @param {*} rawText 
 * @param {*} asAttr 是否作为属性，因为用作属性值的文本会有不同的解析规则
 * @returns 
 */
function decodeHtml(rawText, asAttr = false) {
  let offset = 0;
  const end = rawText.length;
  let decodedText = '';
  let maxCRNameLength = 0;

  function advance(length) {
    offset += length;
    rawText = rawText.slice(length)
  }

  while (offset < end) {
    const head = /&(?:#x?)?/i.exec(rawText);
    if (!head) {
      const remaining = end - offset;
      decodedText += rawText.slice(0, remaining);
      advance(remaining)
      break;
    }

    decodeHtml += rawText.slice(0, head.index);

    advance(head.index);

    if (head[0] === '&') {
      let name = '';
      let value;
      if (/[0-9a-z]/i.test(rawText[1])) {
        if (!maxCRNameLength) {
          maxCRNameLength = Object.keys(namedCharacterReferences).reduce(
            (max, name) => Math.max(max, name.length),
            0
          )
        }

        for (let length = maxCRNameLength; !value && length > 0; --length) {
          name = rawText.substr(1, length)
          value = (namedCharacterReferences)[name]
        }

        if (value) {
          const semi = name.endsWith(';')

          if (
            asAttr &&
            !semi &&
            /[=a-z0-9]/i.test(rawText[name.length + 1] || '')
          ) {
            decodedText += '&' + name;
            advance(1 + name.length)
          } else {
            decodedText += value;
            advance(1 + name, length)
          }
        } else {
          decodedText += '&'
          advance(1)
        }
      }
    } else {
      const hex = head[0] === '&#x';
      const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/;

      const body = pattern.exec(rawText);

      if (body) {
        // ! 这里书上错误了哈，书上写的居然是 const
        let cp = Number.parseInt(body[1], hex ? 16 : 10);

        if (cp === 0) {
          cp = 0xfffd;
        } else if (cp > 0x10ffff) {
          cp = 0xfffd
        } else if (cp >= 0xd800 && cp <= 0xdfff) {
          cp = 0xfffd
        } else if (
          (cp >= 0xfdd0 && cp <= 0xfdef) ||
          (cp & 0xfffe) === 0xfffe
        ) {

        } else if (
          // 控制字符集的范围是：[0x01, 0x1f] 加上 [0x7f, 0x9f]
          // 去掉 ASICC 空白符：0x09(TAB)、0x0A(LF)、0x0C(FF)
          // 0x0D(CR) 虽然也是 ASICC 空白符，但需要包含
          (cp >= 0x01 && cp <= 0x08) ||
          cp === 0x0b ||
          (cp >= 0x0d && cp <= 0x1f) ||
          (cp >= 0x7f && cp <= 0x9f)
        ) {
          // 在 CCR_REPLACEMENTS 表中查找替换码点，如果找不到，则使用原码点
          cp = CCR_REPLACEMENTS[cp] || cp
        }
        // 解码后追加到 decodedText 上
        decodedText += String.fromCodePoint(cp)
        advance(body[0].length)
      } else {
        decodedText += head[0];
        advance(head[0].length)
      }
    }
  }
  return decodedText;
}
```

## 16.7 解析插值与注释
插值，即 `{{ count }}`。

默认情况下，以 `{{` 开头，`}}` 结尾，通常称这两个字符串为定界符。中间可以是任意合法的 js 表达式。

```js
/**
 * 解析注释
 * @param {*} context 
 */
function parseComment(context) {
  const { advanceBy, advanceSpaces } = context;
  // 消费开始界符
  advanceBy('<!--'.length);
  // 找到结束定界符的位置索引
  let closeIndex = context.source.indexOf('-->');

  if(closeIndex < 0) {
    console.error('差值缺少结束定界符')
  }

  const content = context.source.slice(0, closeIndex);

  advanceBy(content.length);
  advanceBy('-->'.length)

  return {
    type: TAT.Comment,
    content
  }
}

/**
 * 解析插值
 * @param {*} context 
 */
function parseInterpolation(context) {
  const { advanceBy, advanceSpaces } = context;
  // 消费开始界符
  advanceBy(2);
  // 找到结束定界符的位置索引
  let closeIndex = context.source.indexOf('}}');

  if(closeIndex < 0) {
    console.error('差值缺少结束定界符')
  }

  const content = context.source.slice(0, closeIndex);

  advanceBy(content.length);
  advanceBy(2)

  return {
    type: TAT.Interpolation,
    content: {
      type: TAT.Expression,
      content: decodeHtml(content),
    }
  }
}
```