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