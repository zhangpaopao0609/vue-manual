/** TEMPLATE_AST_TYPE 模板 AST 类型 */
const TAT = {
  Root: 'Root',
  Element: 'Element',
  Text: 'Text',
}

/** 定义文本模式，作为一个状态表 */
const TextModes = {
  DATA: 'DATA',
  RCDATA: 'RCDATA',
  RAWTEXT: 'RAWTEXT',
  CDATA: 'CDATA'
}

/**
 * 解析标签节点
 * @param {*} context 
 * @param {*} type start or end
 * @returns node
 */
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

/**
 * 解析节点
 * @param {*} context 
 * @param {*} ancestors 
 * @returns 
 */
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

  ancestors.push(element);
  // 这里递归地调用 parseChildren 函数进行 <div> 标签子节点的解析
  element.children = parseChildren(context, ancestors);
  ancestors.pop();
  if(context.source.startsWith(`</${element.tag}`)) {
    parseTag(context, 'end')
  } else {
    console.error(`${element.tag} 标签缺少闭合标签`)
  };

  return element
}

/**
 * 状态机是否停止
 * @param {*} context 
 * @param {*} ancestors 
 * @returns boolean
 */
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

/**
 * 解析子节点
 * @param {*} context 
 * @param {*} ancestors 
 * @returns 
 */
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
          // 状态机遭遇了闭合标签，此时应该抛出错误，因为它缺少与之对应的开始标签
          console.error('无效的结束标签')
          continue
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
    mode: TextModes.DATA,
    // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
    advanceBy(num) {
      // 根据给定字符数 num，截取位置 num 后的模板内容，并替换当前模板内
      context.source = context.source.slice(num);
    },
    advanceSpaces(){
      // 匹配空白字符
      const match = /^[\t\r\n\f ]+/.exec(context.source);
      if(match) {
        // 调用 advanceBy 函数消费空白字符
        context.advanceBy(match[0].length)
      }
    }
  }

  const nodes = parseChildren(context, []);

  return {
    type: 'Root',
    children: nodes,
  }
}