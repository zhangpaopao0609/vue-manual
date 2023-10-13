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

const AstType = {
  Root: 'Root',
  Element: 'Element',
  Text: 'Text',
}

// 一个辅助函数，用于判断是否是字母
function isAlpha(char) {
  return char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z'
}

/**
 * 接收模板字符串作为参数，并将模板切割为 Token 返回
 * @param {*} str 
 * @returns 
 */
function tokenize(str) {
  // 状态机的当前状态：初始状态
  let currentState = TokenState.initial;
  // 用于缓存字符
  const chars = [];
  // 生成的 Token 会存储到 tokens 数组中，并作为函数的返回值返回
  const tokens = [];
  // record token
  const record = (value) => tokens.push(value);

  while (str) {
    // 查看第一个字符，注意，这里只是查看，没有消费该字符
    const char = str[0];

    switch (currentState) {
      case TokenState.initial:
        // 初始状态
        if (char === '<') {
          currentState = TokenState.tagOpen;
        } else if (isAlpha(char)) {
          currentState = TokenState.text;
          chars.push(char)
        }
        str = str.slice(1);
        break;
      case TokenState.tagOpen:
        // 标签开始状态
        if (isAlpha(char)) {
          currentState = TokenState.tagOpenName;
          chars.push(char)
        } else if (char === '/') {
          currentState = TokenState.tagEnd;
        }
        str = str.slice(1);
        break;
      case TokenState.tagOpenName:
        // 标签名称状态
        if (isAlpha(char)) {
          chars.push(char)
        } else if (char === '>') {
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
        if (char === '<') {
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
        if (isAlpha(char)) {
          currentState = TokenState.tagEndName;
          chars.push(char)
        }
        str = str.slice(1);
        break;
      case TokenState.tagEndName:
        if (isAlpha(char)) {
          chars.push(char)
        } else if (char === '>') {
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
    type: AstType.Root,
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

const str = "<div><p>Vue</p><p>Template</p></div>";
const templateAST = parser(str);

// console.log(JSON.stringify(parser(str), null, 2));

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

dump(templateAST)