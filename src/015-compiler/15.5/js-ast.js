function render() {
  return h('div', [
    h('p', 'Vue'),
    h('p', 'Template')
  ])
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

const FunctionDeclNode = {
  type: JAT.FunctionDecl, // 代表该节点是函数声明
  // 函数的名称是一个标识符，标识符本身也是一个节点
  id: {
    type: JAT.Identifier,
    name: 'render', // name 用来存储标识符的名称，在这里它就是渲染函数的名称 render
  },
  params: [], // 参数
  body: [
    {
      type: JAT.ReturnStatement,
      return: {
        type: JAT.CallExpression,
        // 被调用函数的名称，它是一个标识符
        callee: {
          type: JAT.Identifier,
          name: 'h'
        },
        arguments: [
          {
            type: JAT.StringLiteral,
            value: 'div',
          },
          {
            type: JAT.ArrayExpression,
            elements: [
              {
                type: JAT.CallExpression,
                callee: {
                  type: JAT.Identifier,
                  name: 'h'
                },
                arguments: [
                  {
                    type: JAT.StringLiteral,
                    value: 'p',
                  },
                  {
                    type: JAT.StringLiteral,
                    value: 'Vue',
                  },
                ]
              },
              {
                type: JAT.CallExpression,
                callee: {
                  type: JAT.Identifier,
                  name: 'h'
                },
                arguments: [
                  {
                    type: JAT.StringLiteral,
                    value: 'p',
                  },
                  {
                    type: JAT.StringLiteral,
                    value: 'Template',
                  },
                ]
              },
            ]
          }
        ]
      }
    }
  ]
}

const ast = {
  "type": "Root",
  "children": [
    {
      "type": "Element",
      "tag": "div",
      "children": [
        {
          "type": "Element",
          "tag": "p",
          "children": [
            {
              "type": "Text",
              "content": "Vue"
            }
          ]
        },
        {
          "type": "Element",
          "tag": "p",
          "children": [
            {
              "type": "Text",
              "content": "Template"
            }
          ]
        }
      ]
    }
  ]
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

function createCallExpression(callee, arguments) {
  return {
    type: JAT.CallExpression,
    callee: createIdentifier(callee),
    arguments
  }
}
