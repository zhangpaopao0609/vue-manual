/** Token 状态 */
const TokenState = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagOpenName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 结束标签状态
  tagEndName: 6 // 结束标签名称状态
}

/** Token 类型 */
const TokenType = {
  tagOpen: 'tagOpen',
  text: 'text',
  tagEnd: 'tagEnd',
}

/** TEMPLATE_AST_TYPE 模板 AST 类型 */
const TAT = {
  Root: 'Root',
  Element: 'Element',
  Text: 'Text',
}

/** JS_AST_TYPE */
const JAT = {
  FunctionDecl: 'FunctionDecl',
  Identifier: 'Identifier',
  ReturnStatement: 'ReturnStatement',
  CallExpression: 'CallExpression',
  StringLiteral: 'StringLiteral',
  ArrayExpression: 'ArrayExpression',
}

// -----------------------------parser----------------------------------------

/**
 * 一个辅助函数，用于判断是否是字母
 * @param {*} char 字符
 * @returns 真假
 */
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
    type: TAT.Root,
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
          type: TAT.Element,
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
          type: TAT.Text,
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

// -----------------------------transform----------------------------------------

/**
 * 查看并打印所有节点
 * @param {*} node ast
 * @param {*} indent 层级
 */
function dump(node, indent = 0) {
  const type = node.type;
  const desc =
    node.type === TAT.Root
      ? ''
      : type === TAT.Element
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

function createStringLiteral(value) {
  return {
    type: JAT.StringLiteral,
    value,
  }
}

function createIdentifier(name) {
  return {
    type: JAT.Identifier,
    name,
  }
}

function createArrayExpression(elements) {
  return {
    type: JAT.ArrayExpression,
    elements,
  }
}

function createCallExpression(callee, args) {
  return {
    type: JAT.CallExpression,
    callee: createIdentifier(callee),
    arguments: args
  }
}

/**
 * 模板 ast 转换为 js ast
 * @param {*} ast 
 */
function transform(ast) {
  function transformText(node, context) {
    return () => {
      if (node.type === TAT.Text) {
        node.jsNode = createStringLiteral(node.content)
      }
    }
  }

  function transformElement(node, context) {
    return () => {
      if (node.type === TAT.Element) {
        const childrenArgs = node.children.length === 1
          ? node.children[0].jsNode
          : createArrayExpression(node.children.map(c => c.jsNode));
        node.jsNode = createCallExpression('h', [
          createStringLiteral(node.tag), childrenArgs
        ]);
      }
    }
  }

  function transformRoot(node, context) {
    return () => {
      if (node.type === TAT.Root) {
        node.jsNode = {
          type: JAT.FunctionDecl, // 代表该节点是函数声明
          // 函数的名称是一个标识符，标识符本身也是一个节点
          id: createIdentifier('render'),
          params: [], // 参数
          body: [
            {
              type: JAT.ReturnStatement,
              return: node.children[0].jsNode,
            }
          ]
        }
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
      transformRoot,
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
  // dump(ast)
}

// -----------------------------generate----------------------------------------

function generateIdentifier(node, context) {
  const { push } = context;
  push(node.name);
}

function generateNodeList(nodeList, context) {
  const { push } = context;
  const len = nodeList.length;
  for (let i = 0; i < len; i++) {
    generateNode(nodeList[i], context);
    if(i < len -1) {
      push(', ');
    }
  };
}

function generateFunctionDecl(node, context) {
  // 从 context 对象中取出工具函数
  const { push, indent, deIndent } = context;
  push('function ');
  generateIdentifier(node.id, context);
  push('(');
  // 调用 generateNodeList 为函数的参数生成代码
  generateNodeList(node.params, context)
  push(') ');
  push('{');
  // 缩进
  indent();
  // 为函数体生成代码，这里递归地调用了 generateNode 函数
  node.body.forEach(n => generateNode(n, context));
  // 取消缩进
  deIndent();
  push('}');
};


function generateReturnStatement(node, context) {
  const { push } = context;
  push('return ')
  generateNode(node.return, context)
}

function generateCallExpression(node, context) {
  const { push } = context;
  generateIdentifier(node.callee, context);
  push('(');
  generateNodeList(node.arguments, context);
  push(')');
}

function generateStringLiteral(node, context) {
  const { push } = context;
  push(`'${node.value}'`)
}

function generateArrayExpression(node, context) {
  const { push, indent, deIndent } = context;
  push('[')
  indent();
  generateNodeList(node.elements, context);
  deIndent();
  push(']');
}

function generateNode(ast, context) {
  switch (ast.type) {
    case JAT.FunctionDecl:
      generateFunctionDecl(ast, context)
      break;
    case JAT.Identifier:
      generateIdentifier(ast, context)
      break;
    case JAT.ReturnStatement:
      generateReturnStatement(ast, context)
      break;
    case JAT.CallExpression:
      generateCallExpression(ast, context)
      break;
    case JAT.StringLiteral:
      generateStringLiteral(ast, context)
      break;  
    case JAT.ArrayExpression:
      generateArrayExpression(ast, context)
      break;  
    default:
      break;
  }
}

function generate(ast) {
  const context = {
    code: '',
    push(code) {
      context.code += code;
    },
    currentIndent: 0,
    nextline() {
      context.push('\n');
      context.push('  '.repeat(context.currentIndent))
    },
    indent() {
      context.currentIndent++;
      context.nextline();
    },
    deIndent() {
      context.currentIndent--;
      context.nextline();
    }
  };
  generateNode(ast, context);
  return context.code;
}

const str = "<div><p>Vue</p><p>Template</p></div>";
const ast = parser(str);
transform(ast);
const code = generate(ast.jsNode);

console.log(code);