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

function tokenize(str) {
  // 记录结果
  const token = [];
  // 创建 token
  const create = (value) => token.push(value)
  // 用来记录
  const char = [];
  // 当前状态
  let currentState = TokenState.initial;
  // 当前字符为字母
  const isAlpha = (w) => /[a-zA-Z]/.test(w);

  // 只要 str 还有，就一直循环
  while (str) {
    const ns = str[0];

    if (ns === '<') {
      // 如果当前字符为开始标签，此时就应当判断当前状态是什么了
      if (currentState === TokenState.text) {
        // 如果当前状态是 文本 状态，那么创建文本
        create({
          type: TokenType.text,
          content: char.join(''),
        })
        char.length = 0;
      }
      // 那么将状态设置为 标签开始状态
      currentState = TokenState.tagOpen;
      // 并且消费此字符
      str = str.slice(1);
    } else if (isAlpha(ns)) {
      // 如果当前字符为文本，此时就应当判断当前状态是什么了
      if (currentState === TokenState.initial) {
        // 如果当前状态是 初始状态，那么状态设置为 文本状态
        currentState = TokenState.text;
      } else if (currentState === TokenState.tagOpen) {
        // 如果当前状态是 标签开始状态，那么应当把状态设置为 标签名称状态
        currentState = TokenState.tagOpenName;
      } else if (currentState === TokenState.tagOpenName) {
        // 如果当前状态是 标签名称状态，那么状态不变
      } else if (currentState === TokenState.text) {
        // 如果当前状态是 文本状态，那么状态不变
      } else if (currentState === TokenState.tagEnd) {
        // 如果当前状态是 结束标签状态，那么状态设置为 结束标签名称状态
        currentState = TokenState.tagEndName;
      } else {
        // 如果当前状态是 结束标签名称状态，那么状态不变
      }
      // 并且将此字符存入 char
      char.push(ns);
      // 并且消费此字符
      str = str.slice(1);
    } else if (ns === '>') {
      // 如果当前字符为结束标签，那么应当判断当前状态是什么了
      if (currentState === TokenState.tagOpenName) {
        // 如果当前状态是 标签名称状态，那么创建开始标签
        create({
          type: TokenType.tagOpen,
          name: char.join(''),
        })
        char.length = 0;
      } else if (currentState === TokenState.tagEndName) {
        // 如果当前状态是 标签名称状态，那么创建结束标签
        create({
          type: TokenType.tagEnd,
          name: char.join(''),
        })
        char.length = 0;
      }

      // 那么将状态设置为 初始状态
      currentState = TokenState.initial;
      // 并且消费此字符
      str = str.slice(1);
    } else if (ns === '/') {
      // 如果当前字符为 /
      currentState = TokenState.tagEndName;
      // 并且消费此字符
      str = str.slice(1);
    } else {

    }
  }

  return token;
}

const str = "<p>vue</p>";
const res = tokenize(str);
console.log(res);