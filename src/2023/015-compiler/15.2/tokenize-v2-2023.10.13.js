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