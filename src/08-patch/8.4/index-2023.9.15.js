function isString(str) {
  return typeof str === 'string';
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

function createRenderer(options) {
  const { createElement, insert, setElementText, patchProps } = options;
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container) {
    const el = createElement(vnode.type);
    const props = vnode.props;
    if(props && isObject(props)) {
      for (const key in props) {
        patchProps(el, key, null, props[key])
      }
    }
    const children = vnode.children;
    // 如果子节点是字符串，代表元素具有文本节点
    if (typeof children === 'string') {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, children)
    } else if (isArray(children)) {
      children.forEach(child => {
        patch(null, child, el)
      });
    }
    insert(el, container)
  }
  /**
   * 打补丁函数
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
    if (n1) {
      // 更新操作
    } else {
      // 挂载操作
      mountElement(n2, container)
    }
  }
  /**
   * 渲染函数
   * @param {*} vnode 要渲染的 vnode
   * @param {*} container 容器
   */
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与就 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载 （unmount） 操作
        container.innerHTML = ''
      }
    }
    // 把 vnode 存在 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  return {
    render
  }
}

// 用 in 操作符判断 key 是否存在对应的 DOM Properties
function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if(key === 'form' && el.tagName === 'INPUT') return false;
  // 兜底
  return key in el
}

function normalizeClass(value) {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}

const renderer = createRenderer({
  /**
   * 浏览器平台用于创建元素
   * @param {*} tag 标签
   * @returns 返回元素
   */
  createElement(tag) {
    return document.createElement(tag)
  },
  /**
   * 设置元素的文本节点
   * @param {*} el 元素
   * @param {*} text 文本
   */
  setElementText(el, text) {
    el.textContent = text
  },
  /**
   * 在给定的 parent 下添加指定元素
   * @param {*} el 
   * @param {*} parent 
   * @param {*} anchor 
   */
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  /**
   * 为元素设置属性
   * @param {*} el 
   * @param {*} key 
   * @param {*} value 
   */
  patchProps(el, key, prevValue, nextValue) {
    if(key === 'class') {
      el.className = nextValue || '';
    } else if (shouldSetAsProps(el, key, nextValue)) {
      // 如果为布尔类型并且 nextValue 为空字符时，矫正为 true
      if(typeof el[key] === 'boolean' && nextValue === '') {
        el[key] = true;
      } else {
        el[key] = nextValue
      }
    } else {
      // 如果要被设置的属性没有对应的 DOM Properties，则使用 setAttribute 函数设置属性
      el.setAttribute(key, nextValue);
    }
  }
});

const vnode = {
  type: 'div',
  props: {
    class: normalizeClass(['foo', { bar: true }]),
  },
  children: 'hello',
}

renderer.render(vnode, document.querySelector('#app'));