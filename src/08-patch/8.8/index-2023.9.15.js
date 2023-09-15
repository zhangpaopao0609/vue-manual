import { effect, ref } from "../reactivity.js";

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
  const { createElement, insert, setElementText, patchProps, unmount } = options;
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container) {
    // 让 vnode 引用真实 dom 元素
    const el = vnode.el = createElement(vnode.type);
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
   * 卸载操作
   * @param {*} vnode 
   */
  function unmountElement(vnode) {
    // 根据 vnode 获取要卸载的真实 DOM 元素
    const el = vnode.el;
    // 获取真实 DOM 的父元素
    const parent = el.parentNode;
    if(parent) unmount(el, parent)
  }
  /**
   * 打补丁函数
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
    // 旧节点存在，同时旧节点类型和新结点类型不一致，说明内容不同
    if(n1 && n1.type !== n2.type) {
      unmountElement(n1);
      n1 = null;
    }

    if(!n1) {
      mountElement(n2, container)
    } else {
      // 能走到这里，说明 n1 和 n2 的类型相同，如果不相同， n1 就为 null 了
      // 通过 n2 的类型来决定如何渲染
      const { type } = n2;
      if(typeof type === 'string') {
        // 说明是普通标签元素
          patchElement(n1, n2)
      } else if(isObject(type)) {
        // 如果 n2.type 的值的类型是对象，则描述的是组件
      } else if(type === 'xxx') {
        // 处理其它类型
      }
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
        // 根据 vnode 获取要卸载的真实 DOM 元素
        unmountElement(container._vnode)
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
    if(/^on/.test(key)) {
      // 事件名
      const name = key.slice(2).toLowerCase();
      // 事件对象 结构为 name -> handler
      const invokers = el._vei || (el._vei = {});
      // 当前事件对应的 handler
      let invoker = invokers[name];
      // 如果还有事件
      if(nextValue) {
        // 如果之前没有绑定过事件
        if(!invoker) {
          // 如果没有，那么创建
          // 这里面就比较巧妙了，invoker 作为外层事件用于绑定，内层真正执行的是用户绑定的事件函数，这个事件函数用 invoker value 属性来记录，
          // 这样的好处时，当用户绑定的事件函数变化时，不需要重新绑定了，只需要更新 invoker value 属性就可以了，简直不要太巧妙
          invoker = el._vei[name] = (e) => {
            if(isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e))
            } else {
              invoker.value(e)
            }
          };
          invoker.value = nextValue;
          // 记录抽时间你处理函数被绑定的时间
          invoker.attached = Date.now();
          el.addEventListener(name, (e) => {
            if(!e._vts) {
              // 事件触发的时间
              e._vts = Date.now();
            } else if (e._vts <= invoker.attached) {
              // 如果事件触发的时间早于时间绑定的时间，也即是说，事件触发在前，绑定在后，那么便不执行
              return
            }
            invoker(e)
          });
        } else {
          // 如果已经有，那么更新值即可
          invoker.value = nextValue; 
        }
      } else if(invoker){
        // 没有，此时应该移除事件
        el.removeEvenetListener(name, invoker)
      }
    } else if(key === 'class') {
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
  },
  unmount(el, parent) {
    parent.removeChild(el)
  }
});

const toggle = ref(false)

const vnode = {
  type: 'div',
  props: toggle.value ? {
    onClick: [
      () => {
        console.log('点击了 div');
      }
    ]
  } : {},
  children: [
    {
      type: 'button',
      props:  {
        onClick: [
          () => {
            toggle.value = true;
            console.log('点击了 button');
          }
        ]
      },
      children: 'hello'
    }
  ],
}


effect(() => {
  renderer.render(vnode, document.querySelector('#app'));
})